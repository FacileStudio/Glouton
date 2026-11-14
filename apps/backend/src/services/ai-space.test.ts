import { describe, expect, test } from 'bun:test';
import { Client } from '@facile/tronc/bulle';
import { prospectSuggest } from '@repo/trpc';

type ForfaitReader = Parameters<typeof prospectSuggest.suggestTargets>[0]['forfait'];
type ScopeVerdict = Awaited<ReturnType<ForfaitReader['personal']>>;
const { suggestTargets } = prospectSuggest;

const UPGRADE = 'https://sso.test/spaces/upgrade';

function fakeBulle() {
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    if (new URL(String(input)).pathname !== '/api/ai/complete') return Response.json({ error: { message: 'not found' } }, { status: 404 });
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ text: '{"nafCodes":[],"osmTags":[],"keywords":["bakery"]}', model: 'm-1' });
  }) as typeof globalThis.fetch;
  return { client: new Client({ url: 'https://bulle.test/', fetch, token: async () => 'bulle-token' }), bodies };
}

function reader(own: boolean, team: { ai: boolean; spaceId?: string } | null): ForfaitReader {
  const verdict = (ai: boolean, spaceId?: string): ScopeVerdict => ({ allowed: true, enforced: true, upgradeUrl: UPGRADE, aiAccess: ai, spaceId });
  return {
    personal: async () => verdict(own),
    team: async () => (team ? verdict(team.ai, team.spaceId) : null),
    entitledScopes: async () => ({ personal: true, teamIds: [] }),
  };
}

const personal = { type: 'personal', userId: 'u1' } as const;
const team = { type: 'team', userId: 'u1', teamId: 't1' } as const;
const input = { usage: 'clients', language: 'en', offer: 'Bread' } as const;

describe('AI calls follow the personal or the space plan', () => {
  test('a personal call sends no space_id', async () => {
    const bulle = fakeBulle();
    await suggestTargets({ bulle: bulle.client, forfait: reader(true, null) }, personal, input);
    expect(bulle.bodies[0]).not.toHaveProperty('space_id');
  });

  test('a free member of a paid team space gets AI and Bulle is told the space', async () => {
    const bulle = fakeBulle();
    const result = await suggestTargets({ bulle: bulle.client, forfait: reader(false, { ai: true, spaceId: 'sp-1' }) }, team, input);
    expect(result.keywords).toEqual(['bakery']);
    expect(bulle.bodies[0]?.space_id).toBe('sp-1');
  });

  test('a paid person in a free team space still gets AI, with the space named', async () => {
    const bulle = fakeBulle();
    await suggestTargets({ bulle: bulle.client, forfait: reader(true, { ai: false, spaceId: 'sp-1' }) }, team, input);
    expect(bulle.bodies[0]?.space_id).toBe('sp-1');
  });

  test('a team with no Registre space sends no space_id', async () => {
    const bulle = fakeBulle();
    await suggestTargets({ bulle: bulle.client, forfait: reader(false, { ai: true }) }, team, input);
    expect(bulle.bodies[0]).not.toHaveProperty('space_id');
  });

  test('neither plan nor membership means plan_required before Bulle is called', async () => {
    for (const forfait of [reader(false, { ai: false, spaceId: 'sp-1' }), reader(true, null)]) {
      const bulle = fakeBulle();
      const error = await suggestTargets({ bulle: bulle.client, forfait }, team, input).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(bulle.bodies).toHaveLength(0);
    }
  });
});
