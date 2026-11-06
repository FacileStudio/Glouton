import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

/**
 * v0.7.1 review fixes: the quiet paywall link, account and membership
 * housekeeping without a plan, the SSO failure redirect, skipped sessions,
 * unlinked-team reporting, serialised applies and the personal sub choice.
 * The database tests need TEST_DATABASE_URL and skip without it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { observable } = await import('@trpc/server/observable');
const { paywallLink, QUIET } = await import('@repo/trpc-client');
const { forfait } = await import('@repo/trpc');
const { ssoFailureUrl, UnverifiedAccountError } = await import('./oidc');
const { scopeGuarded, markSkipped, SKIPPED_REASON } = await import('./register-workers');

const verdict = (allowed: boolean) => ({ allowed, enforced: true, upgradeUrl: 'https://sso.test/spaces' });
const nobody = {
  team: async () => verdict(false),
  personal: async () => verdict(false),
  entitledScopes: async () => ({ personal: false, teamIds: [] }),
};

/** Runs one operation through the paywall link against a downstream that fails with `code`. */
async function throughLink(code: string, context: Record<string, unknown> | undefined) {
  let redirects = 0;
  const link = paywallLink(() => void redirects++)({} as never);
  const op = { id: 1, type: 'query', path: 'x', input: undefined, context: context ?? {}, signal: null } as never;
  await new Promise<void>((resolve) => {
    link({
      op,
      next: () => observable((observer) => observer.error({ data: { code } } as never)),
    } as never).subscribe({ error: () => resolve(), complete: () => resolve() });
  });
  return redirects;
}

describe('paywall routing', () => {
  test('a primary query that gets 402 goes to the paywall; a quiet widget does not', async () => {
    expect(await throughLink('PAYMENT_REQUIRED', undefined)).toBe(1);
    expect(await throughLink('PAYMENT_REQUIRED', QUIET)).toBe(0);
    expect(await throughLink('FORBIDDEN', undefined)).toBe(0);
  });

  test('settings, password, SMTP, account deletion, leaving and deleting a team need no plan', async () => {
    for (const path of [
      'user.updateProfile',
      'user.changePassword',
      'user.getSmtpConfig',
      'user.updateSmtpConfig',
      'user.testSmtpConfig',
      'user.deleteOwnAccount',
      'team.leave',
      'team.delete',
    ]) {
      const call = { path, userId: 'u', input: { teamId: 't' }, idKeys: [], meta: undefined, loadRow: async () => null };
      await expect(forfait.authorize(nobody, call)).resolves.toBe('paid');
    }
  });
});

describe('SSO failures', () => {
  test('redirect to the login page with a code, not raw JSON', () => {
    expect(ssoFailureUrl(new UnverifiedAccountError(), 'https://g.test/login')).toBe(
      'https://g.test/login?sso_error=unverified_account'
    );
    expect(ssoFailureUrl(new Error('token endpoint down'), 'https://g.test/login')).toBe(
      'https://g.test/login?sso_error=sso_failed'
    );
  });
});

describe.skipIf(!databaseUrl)('review fixes against the database', () => {
  let db: PrismaClient;
  let spaces: typeof import('./registre-spaces');
  const issuer = 'https://sso.test';
  const silent = { warn: () => {}, info: () => {}, error: () => {} };
  const tag = crypto.randomUUID();
  let userId = '';

  beforeAll(async () => {
    db = (await import('@repo/database')).prisma;
    spaces = await import('./registre-spaces');
    await db.$executeRawUnsafe('DELETE FROM "ForfaitState"');
    await db.$executeRawUnsafe('DELETE FROM "PersonEntitlement"');
    userId = (await db.user.create({ data: { email: `${tag}@x.test`, firstName: 'R', lastName: 'R', password: 'x' } })).id;
  }, 60_000);

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: `${tag}@x.test` } });
    await db.$executeRawUnsafe('DELETE FROM "ForfaitState"');
    await db.$executeRawUnsafe('DELETE FROM "PersonEntitlement"');
  }, 60_000);

  test('a skipped hunt or audit job marks its session cancelled with the reason', async () => {
    const hunt = await db.huntSession.create({ data: { userId, sources: [], status: 'PENDING' } });
    const audit = await db.auditSession.create({ data: { userId, status: 'PROCESSING' } });
    let ran = 0;
    const guarded = scopeGuarded({ name: 'demo', processor: async () => void ran++ }, async () => false, markSkipped(db));
    await guarded.processor({ id: '1', data: { userId, teamId: null, huntSessionId: hunt.id } } as never);
    await guarded.processor({ id: '2', data: { userId, teamId: null, auditSessionId: audit.id } } as never);
    expect(ran).toBe(0);
    const [h, a] = await Promise.all([
      db.huntSession.findUniqueOrThrow({ where: { id: hunt.id } }),
      db.auditSession.findUniqueOrThrow({ where: { id: audit.id } }),
    ]);
    expect([h.status, h.error, a.status, a.error]).toEqual(['CANCELLED', SKIPPED_REASON, 'CANCELLED', SKIPPED_REASON]);
  });

  test('teams not linked to Registre are counted at boot', async () => {
    const team = await db.team.create({ data: { name: `unlinked-${tag}` } });
    try {
      expect(await forfait.reportUnlinkedTeams(db)).toBeGreaterThanOrEqual(1);
    } finally {
      await db.team.delete({ where: { id: team.id } });
    }
  });

  test('concurrent first applies are serialised instead of racing on the state row', async () => {
    const deps = { db, issuer, hashPassword: async (p: string) => `hashed:${p}`, logger: silent };
    const snapshot = { version: 10, entitlements_revision: 3, spaces: [], people: [] };
    await Promise.all([1, 2, 3].map(() => spaces.applySnapshot(deps, snapshot)));
    const state = await db.forfaitState.findUniqueOrThrow({ where: { id: 1 } });
    expect([state.version, state.revision]).toEqual([10n, 3n]);
  }, 60_000);

  test('the personal sub is chosen deterministically: the oldest account', async () => {
    await db.account.create({ data: { userId, providerId: issuer, accountId: `old-${tag}`, createdAt: new Date('2025-01-01') } });
    await db.account.create({ data: { userId, providerId: issuer, accountId: `new-${tag}`, createdAt: new Date('2026-01-01') } });
    await db.personEntitlement.createMany({
      data: [
        { sub: `old-${tag}`, entitlements: { 'glouton.access': true } },
        { sub: `new-${tag}`, entitlements: { 'glouton.access': false } },
      ],
    });
    const reader = forfait.dbForfait(db, issuer);
    for (let i = 0; i < 3; i++) expect((await reader.personal(userId)).allowed).toBe(true);
  });
});
