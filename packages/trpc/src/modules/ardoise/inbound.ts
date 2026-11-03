import type { Company, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { normalizeEmail, normalizeSiret } from '../contact/service';
import type { RemoteClient } from './client';
import {
  ARDOISE_ACTOR,
  companyDomainOf,
  createCompanyFromClient,
  linkCompanyToClient,
  normalizeName,
  parseRemoteClient,
  placementWhere,
  similarNames,
  type Placement,
} from './mapping';
import { applyRemoteToLinked, type ArdoiseDeps } from './sync';

export const envelopeSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  occurredAt: z.string().optional(),
  data: z.unknown(),
});

export type ArdoiseEnvelope = z.infer<typeof envelopeSchema>;

export type InboundOutcome =
  | 'ignored'
  | 'invalid'
  | 'skipped'
  | 'updated'
  | 'linked'
  | 'suggested'
  | 'pending'
  | 'created'
  | 'no_owner'
  | 'unlinked'
  | 'recorded';

export type InboundNotify = (
  scope: { type: 'personal' | 'team'; userId: string; teamId?: string },
  type: string,
  data: Record<string, unknown>
) => void | Promise<void>;

export interface InboundDeps extends ArdoiseDeps {
  notify?: InboundNotify;
}

const deletedSchema = z.object({ id: z.string().min(1), gloutonCompanyId: z.string().nullish() });

const missionSchema = z.object({
  clientId: z.string().min(1),
  missionId: z.string().min(1),
  missionTitle: z.string().default(''),
  amountCents: z.number().int().optional(),
  currency: z.string().optional(),
  documentNumber: z.string().optional(),
  url: z.string().url().optional(),
});

type MissionData = z.infer<typeof missionSchema>;

const MISSION_EVENTS: Record<string, { kind: string; verb: (d: MissionData) => string }> = {
  'mission.quote_generated': { kind: 'ardoise.quote_generated', verb: (d) => `Quote ${d.documentNumber ?? ''} generated` },
  'mission.quote_accepted': { kind: 'ardoise.quote_accepted', verb: (d) => `Quote ${d.documentNumber ?? ''} accepted` },
  'mission.invoice_generated': { kind: 'ardoise.invoice_generated', verb: (d) => `Invoice ${d.documentNumber ?? ''} issued` },
  'mission.payment_created': { kind: 'ardoise.payment_created', verb: (d) => `Payment ${d.documentNumber ?? ''} received` },
};

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

function missionSummary(event: string, data: MissionData): string {
  const verb = MISSION_EVENTS[event]!.verb(data).replace(/\s+/g, ' ').trim();
  const mission = data.missionTitle ? ` for ${data.missionTitle}` : '';
  const amount = data.amountCents !== undefined ? ` (${formatAmount(data.amountCents, data.currency ?? 'EUR')})` : '';
  return `${verb}${mission}${amount}`;
}

function liveCompany(prisma: PrismaClient, where: Prisma.CompanyWhereInput) {
  return prisma.company.findFirst({ where: { deletedAt: null, ...where } });
}

async function findLinked(prisma: PrismaClient, client: RemoteClient): Promise<Company | null> {
  const byGlouton = client.gloutonCompanyId ? await liveCompany(prisma, { id: client.gloutonCompanyId }) : null;
  if (byGlouton && (!byGlouton.ardoiseClientId || byGlouton.ardoiseClientId === client.id)) return byGlouton;
  return liveCompany(prisma, { ardoiseClientId: client.id });
}

/** The team whose Registre space matches, else the personal scope of ARDOISE_DEFAULT_OWNER_EMAIL. */
export async function placementFor(deps: ArdoiseDeps, registreSpaceId: string | null): Promise<Placement | null> {
  const ownerEmail = deps.config?.defaultOwnerEmail;
  const owner = ownerEmail
    ? await deps.prisma.user.findFirst({ where: { email: { equals: ownerEmail, mode: 'insensitive' } }, select: { id: true } })
    : null;
  if (registreSpaceId) {
    const team = await deps.prisma.team.findUnique({
      where: { registreSpaceId },
      select: { id: true, members: { select: { userId: true, role: true }, orderBy: { joinedAt: 'asc' } } },
    });
    if (team) {
      const members = team.members;
      const ownerId =
        members.find((m) => m.userId === owner?.id)?.userId ??
        members.find((m) => m.role === 'OWNER')?.userId ??
        members[0]?.userId ??
        owner?.id;
      if (ownerId) return { teamId: team.id, ownerId };
    }
  }
  if (!owner) {
    deps.log.error(
      { type: 'ardoise-sync', ownerEmail, registreSpaceId },
      'No Glouton user matches ARDOISE_DEFAULT_OWNER_EMAIL; the Ardoise client was not imported'
    );
    return null;
  }
  return { teamId: null, ownerId: owner.id };
}

const unlinkedIn = (placement: Placement): Prisma.CompanyWhereInput => ({
  deletedAt: null,
  ardoiseClientId: null,
  ...placementWhere(placement),
});

/** Same SIRET, else same contact email: strong enough to link without asking. */
export async function findAutoMatch(prisma: PrismaClient, placement: Placement, client: RemoteClient) {
  const siret = normalizeSiret(client.siret);
  if (siret) {
    const company = await prisma.company.findFirst({ where: { ...unlinkedIn(placement), siret } });
    if (company) return { company, reason: 'same SIRET' };
  }
  const email = normalizeEmail(client.contactEmail);
  if (!email) return null;
  const person = await prisma.person.findFirst({
    where: { deletedAt: null, email, ...placementWhere(placement), company: unlinkedIn(placement) },
    include: { company: true },
  });
  if (person?.company) return { company: person.company, reason: 'same contact email' };
  const company = await prisma.company.findFirst({ where: { ...unlinkedIn(placement), emails: { has: email } } });
  return company ? { company, reason: 'same contact email' } : null;
}

/** Same email domain, else a very similar name: worth a question in the inbox. */
export async function findCandidate(prisma: PrismaClient, placement: Placement, client: RemoteClient) {
  const domain = companyDomainOf(client.contactEmail);
  if (domain) {
    const company = await prisma.company.findFirst({ where: { ...unlinkedIn(placement), domain } });
    if (company) return { company, reason: 'domain' as const };
  }
  const token = client.companyName
    .split(/\s+/)
    .map((word) => word.replace(/[^0-9A-Za-z\u00C0-\u017F]/g, ''))
    .find((word) => normalizeName(word).length >= 3);
  if (!token) return null;
  const candidates = await prisma.company.findMany({
    where: { ...unlinkedIn(placement), name: { contains: token, mode: 'insensitive' } },
    take: 50,
    orderBy: { updatedAt: 'desc' },
  });
  const company = candidates.find((c) => similarNames(c.name, client.companyName));
  return company ? { company, reason: 'name' as const } : null;
}

async function openMatchFor(prisma: PrismaClient, ardoiseClientId: string) {
  return prisma.suggestion.findFirst({
    where: { kind: 'MATCH', status: 'OPEN', payload: { path: ['ardoiseClientId'], equals: ardoiseClientId } },
  });
}

function scopeOf(placement: Placement) {
  return placement.teamId
    ? { type: 'team' as const, userId: placement.ownerId, teamId: placement.teamId }
    : { type: 'personal' as const, userId: placement.ownerId };
}

function clientJson(client: RemoteClient): Prisma.InputJsonObject {
  return { ...client };
}

async function importUnlinked(deps: InboundDeps, client: RemoteClient): Promise<InboundOutcome> {
  const { prisma } = deps;
  const pending = await openMatchFor(prisma, client.id);
  if (pending) {
    await prisma.suggestion.update({
      where: { id: pending.id },
      data: { payload: { source: 'ardoise', ardoiseClientId: client.id, client: clientJson(client) } },
    });
    return 'pending';
  }
  const unlinkedBefore = await prisma.activity.findFirst({
    where: { kind: 'ardoise.client.unlinked', payload: { path: ['ardoiseClientId'], equals: client.id } },
    select: { id: true },
  });
  if (unlinkedBefore) {
    deps.log.info({ type: 'ardoise-sync', ardoiseClientId: client.id }, 'Client was unlinked in Glouton; not re-imported');
    return 'ignored';
  }
  const placement = await placementFor(deps, client.registreSpaceId);
  if (!placement) return 'no_owner';

  const auto = await findAutoMatch(prisma, placement, client);
  if (auto) {
    const linked = await prisma.$transaction((tx) =>
      linkCompanyToClient(tx, auto.company, client, { reason: auto.reason, actor: ARDOISE_ACTOR, userId: auto.company.userId })
    );
    if (linked) {
      await deps.hooks.companyChanged?.(linked.id);
      return 'linked';
    }
  }

  const candidate = await findCandidate(prisma, placement, client);
  if (candidate) {
    const suggestion = await prisma.suggestion.create({
      data: {
        userId: candidate.company.userId,
        teamId: candidate.company.teamId,
        companyId: candidate.company.id,
        kind: 'MATCH',
        title: `Ardoise client ${client.companyName} may be ${candidate.company.name}`,
        body:
          'Accept to link this company to the Ardoise client. Dismiss to create a new client company from Ardoise instead.',
        rationale: candidate.reason === 'domain' ? 'Same email domain' : 'Very similar company name',
        payload: { source: 'ardoise', ardoiseClientId: client.id, client: clientJson(client) },
        createdBy: ARDOISE_ACTOR,
      },
    });
    await deps.notify?.(scopeOf(placement), 'suggestion:new', { id: suggestion.id, kind: suggestion.kind });
    return 'suggested';
  }

  const created = await prisma.$transaction((tx) => createCompanyFromClient(tx, placement, client));
  await deps.hooks.companyChanged?.(created.id);
  return 'created';
}

async function onClientChanged(deps: InboundDeps, data: unknown): Promise<InboundOutcome> {
  const client = parseRemoteClient(data);
  if (!client) return 'invalid';
  const linked = await findLinked(deps.prisma, client);
  if (linked) return applyRemoteToLinked(deps.prisma, linked, client);
  return importUnlinked(deps, client);
}

async function onClientDeleted(deps: InboundDeps, data: unknown): Promise<InboundOutcome> {
  const parsed = deletedSchema.safeParse(data);
  if (!parsed.success) return 'invalid';
  const { prisma } = deps;
  const ardoiseClientId = parsed.data.id;
  await prisma.suggestion.updateMany({
    where: { kind: 'MATCH', status: 'OPEN', payload: { path: ['ardoiseClientId'], equals: ardoiseClientId } },
    data: { status: 'DISMISSED', decidedAt: new Date() },
  });
  const company = await prisma.company.findFirst({ where: { ardoiseClientId } });
  if (!company) return 'ignored';
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: company.id },
      data: { ardoiseClientId: null, ardoiseUpdatedAt: null, ardoiseSyncedAt: null },
    });
    await tx.activity.create({
      data: {
        userId: company.userId,
        teamId: company.teamId,
        companyId: company.id,
        kind: 'ardoise.client.unlinked',
        summary: 'Unlinked: the client was deleted in Ardoise',
        payload: { ardoiseClientId },
        actor: ARDOISE_ACTOR,
      },
    });
  });
  return 'unlinked';
}

async function onMission(deps: InboundDeps, event: string, data: unknown): Promise<InboundOutcome> {
  const parsed = missionSchema.safeParse(data);
  if (!parsed.success) return 'invalid';
  const mission = parsed.data;
  const company = await deps.prisma.company.findFirst({ where: { ardoiseClientId: mission.clientId, deletedAt: null } });
  if (!company) {
    deps.log.debug({ type: 'ardoise-sync', event, clientId: mission.clientId }, 'Mission event for an unlinked client; ignored');
    return 'ignored';
  }
  const kind = MISSION_EVENTS[event]!.kind;
  await deps.prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: {
        userId: company.userId,
        teamId: company.teamId,
        companyId: company.id,
        kind,
        summary: missionSummary(event, mission),
        payload: { ...mission },
        actor: ARDOISE_ACTOR,
      },
    });
    if (event === 'mission.quote_accepted' && company.stage !== 'CLIENT') {
      await tx.company.update({ where: { id: company.id }, data: { stage: 'CLIENT' } });
      await tx.activity.create({
        data: {
          userId: company.userId,
          teamId: company.teamId,
          companyId: company.id,
          kind: 'stage.changed',
          summary: `Stage changed from ${company.stage} to CLIENT`,
          payload: { from: company.stage, to: 'CLIENT' },
          actor: ARDOISE_ACTOR,
        },
      });
    }
  });
  return 'recorded';
}

/** Applies one verified, de-duplicated Ardoise webhook. Unknown events are ignored. */
export async function handleArdoiseEvent(deps: InboundDeps, envelope: ArdoiseEnvelope): Promise<InboundOutcome> {
  const { event, data } = envelope;
  if (event === 'client.created' || event === 'client.updated') return onClientChanged(deps, data);
  if (event === 'client.deleted') return onClientDeleted(deps, data);
  if (event in MISSION_EVENTS) return onMission(deps, event, data);
  deps.log.info({ type: 'ardoise-sync', event }, 'Unknown Ardoise event; ignored');
  return 'ignored';
}

const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Records a delivery id; false when Ardoise already delivered it (a retry). */
export async function claimDelivery(prisma: PrismaClient, id: string, event: string): Promise<boolean> {
  const inserted = await prisma.ardoiseDelivery.createMany({ data: [{ id, event }], skipDuplicates: true });
  return inserted.count === 1;
}

export async function releaseDelivery(prisma: PrismaClient, id: string) {
  await prisma.ardoiseDelivery.deleteMany({ where: { id } });
}

/** Drops delivery ids older than 30 days. */
export async function pruneDeliveries(prisma: PrismaClient, now = new Date()) {
  const { count } = await prisma.ardoiseDelivery.deleteMany({
    where: { receivedAt: { lt: new Date(now.getTime() - DELIVERY_RETENTION_MS) } },
  });
  return count;
}
