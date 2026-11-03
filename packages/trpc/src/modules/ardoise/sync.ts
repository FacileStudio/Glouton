import type { Company, Person, Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { QueueManager } from '@repo/jobs';
import type { Access } from '../contact/access';
import { findCompany, findPerson, logActivity, normalizeEmail, normalizeSiret, type SyncHooks } from '../contact/service';
import {
  ArdoiseError,
  ardoiseConfigFromEnv,
  createArdoiseClient,
  type ArdoiseApi,
  type ArdoiseConfig,
  type ArdoiseEnv,
  type OutboundClientPayload,
  type RemoteClient,
} from './client';
import { ARDOISE_ACTOR, applyBillingPerson, companyFieldsFrom } from './mapping';

export const ARDOISE_QUEUE = 'ardoise-sync';
export const PUSH_DEBOUNCE_MS = 10_000;

export interface SyncLogger {
  debug: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export type ArdoiseJobs = Pick<QueueManager, 'addJob'>;

export interface ArdoiseDeps {
  prisma: PrismaClient;
  config: ArdoiseConfig | null;
  api: ArdoiseApi | null;
  log: SyncLogger;
  hooks: SyncHooks;
}

let warnedOff = false;

/** Logs once per process that the Ardoise sync is off. */
export function warnArdoiseOff(log: SyncLogger) {
  if (warnedOff) return;
  warnedOff = true;
  log.info({ type: 'ardoise-sync' }, 'Ardoise sync is off: ARDOISE_* is not set');
}

/** Hooks that queue a debounced push or an unlink; inert when Ardoise is not configured. */
export function ardoiseHooks(config: ArdoiseConfig | null, jobs: ArdoiseJobs | null, log: SyncLogger): SyncHooks {
  if (!config || !jobs) {
    return { companyChanged: () => warnArdoiseOff(log), clientDropped: () => warnArdoiseOff(log) };
  }
  return {
    companyChanged: async (companyId) => {
      await jobs.addJob(ARDOISE_QUEUE, 'push', { companyId }, {
        delay: PUSH_DEBOUNCE_MS,
        deduplication: { id: `ardoise-push:${companyId}`, ttl: PUSH_DEBOUNCE_MS, extend: true, replace: true },
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    },
    clientDropped: async (ardoiseClientId) => {
      await jobs.addJob(ARDOISE_QUEUE, 'unlink', { ardoiseClientId }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    },
  };
}

/** Builds the dependencies from the server env, so the router, the worker and the webhook share one setup. */
export function ardoiseDeps(
  prisma: PrismaClient,
  env: ArdoiseEnv,
  jobs: ArdoiseJobs | null,
  log: SyncLogger,
  fetchImpl?: typeof fetch
): ArdoiseDeps {
  const config = ardoiseConfigFromEnv(env);
  return {
    prisma,
    config,
    api: config ? createArdoiseClient(config, fetchImpl) : null,
    log,
    hooks: ardoiseHooks(config, jobs, log),
  };
}

function latest(...dates: Array<Date | null | undefined>): Date {
  return new Date(Math.max(...dates.map((d) => d?.getTime() ?? 0)));
}

async function registreSpaceOf(prisma: PrismaClient | Prisma.TransactionClient, teamId: string | null) {
  if (!teamId) return null;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { registreSpaceId: true } });
  return team?.registreSpaceId ?? null;
}

async function billingPerson(prisma: PrismaClient, companyId: string) {
  return prisma.person.findFirst({
    where: { companyId, deletedAt: null, isBillingContact: true },
    orderBy: { updatedAt: 'desc' },
  });
}

/** The Ardoise payload for a company and its billing person, or the reason one cannot be built. */
export function clientPayload(
  company: Company,
  person: Pick<Person, 'firstName' | 'lastName' | 'email' | 'updatedAt'> | null,
  registreSpaceId: string | null,
  updatedAt: Date,
  actorEmail?: string
): OutboundClientPayload | { problem: string } {
  const firstName = person?.firstName?.trim();
  const lastName = person?.lastName?.trim();
  if (!person) return { problem: 'The company has no billing contact' };
  if (!firstName || !lastName) return { problem: 'Ardoise needs the billing contact’s first and last name' };
  return {
    gloutonCompanyId: company.id,
    registreSpaceId,
    companyName: company.name,
    contactFirstName: firstName,
    contactLastName: lastName,
    contactEmail: normalizeEmail(person.email),
    billingAddress: company.addressLine,
    billingCity: company.city,
    billingPostalCode: company.postalCode,
    billingCountry: company.country,
    siret: company.siret,
    tvaIntracom: company.vatNumber,
    updatedAt: updatedAt.toISOString(),
    ...(actorEmail ? { actorEmail } : {}),
  };
}

function systemAccess(company: Pick<Company, 'userId' | 'teamId'>): Access {
  return {
    userId: company.userId,
    actor: ARDOISE_ACTOR,
    teamIds: company.teamId ? [company.teamId] : [],
    personal: !company.teamId,
  };
}

async function recordFailure(deps: ArdoiseDeps, company: Company, code: string, message: string) {
  deps.log.error({ type: 'ardoise-sync', companyId: company.id, code }, `Ardoise sync failed: ${message}`);
  await logActivity(deps.prisma, systemAccess(company), {
    teamId: company.teamId,
    companyId: company.id,
    kind: 'ardoise.sync_failed',
    summary: `Ardoise sync failed: ${message}`,
    payload: { code },
  });
}

function unknownSpaceMessage(registreSpaceId: string | null) {
  return `Ardoise has no space for this team (registreSpaceId ${registreSpaceId}). Create or sync the space in Ardoise, then try again.`;
}

/**
 * Applies an Ardoise client to its linked company when it is newer than the
 * version both sides last agreed on (`ardoiseUpdatedAt`).
 */
export async function applyRemoteToLinked(prisma: PrismaClient, company: Company, client: RemoteClient) {
  const remoteAt = new Date(client.updatedAt);
  if (company.ardoiseUpdatedAt && remoteAt <= company.ardoiseUpdatedAt) return 'skipped' as const;
  await prisma.$transaction(async (tx) => {
    const holder = await tx.company.findFirst({
      where: { ardoiseClientId: client.id, id: { not: company.id } },
      select: { id: true },
    });
    if (holder) await tx.company.update({ where: { id: holder.id }, data: { ardoiseClientId: null } });
    const updated = await tx.company.update({
      where: { id: company.id },
      data: {
        ...companyFieldsFrom(client, 'replace', company),
        ardoiseClientId: client.id,
        ardoiseUpdatedAt: remoteAt,
        ardoiseSyncedAt: new Date(),
      },
    });
    await applyBillingPerson(tx, updated, client);
    if (company.ardoiseClientId !== client.id) {
      await logActivity(tx, systemAccess(company), {
        teamId: company.teamId,
        companyId: company.id,
        kind: 'ardoise.client.linked',
        summary: `Linked to Ardoise client ${client.companyName}`,
        payload: { ardoiseClientId: client.id, reason: 'ardoise' },
      });
    }
  });
  return 'updated' as const;
}

async function unlinkLocally(prisma: PrismaClient, company: Company, access: Access, summary: string) {
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: company.id },
      data: { ardoiseClientId: null, ardoiseUpdatedAt: null, ardoiseSyncedAt: null },
    });
    await logActivity(tx, access, {
      teamId: company.teamId,
      companyId: company.id,
      kind: 'ardoise.client.unlinked',
      summary,
      payload: { ardoiseClientId: company.ardoiseClientId },
    });
  });
}

export type PushOutcome = 'disabled' | 'unlinked' | 'pushed' | 'pulled' | 'failed';

/**
 * The debounced job body: PUTs the company's current state to Ardoise. When
 * Ardoise holds a newer version it answers `skipped`, and Glouton pulls it.
 */
export async function pushCompany(deps: ArdoiseDeps, companyId: string): Promise<PushOutcome> {
  if (!deps.api) {
    warnArdoiseOff(deps.log);
    return 'disabled';
  }
  const company = await deps.prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.ardoiseClientId || company.deletedAt) return 'unlinked';
  const person = await billingPerson(deps.prisma, company.id);
  const registreSpaceId = await registreSpaceOf(deps.prisma, company.teamId);
  const payload = clientPayload(company, person, registreSpaceId, latest(company.updatedAt, person?.updatedAt));
  if ('problem' in payload) {
    await recordFailure(deps, company, 'invalid_payload', payload.problem);
    return 'failed';
  }
  try {
    const result = await deps.api.update(company.ardoiseClientId, payload);
    if (result.skipped) {
      const remote = await deps.api.get(company.ardoiseClientId);
      await applyRemoteToLinked(deps.prisma, company, remote);
      deps.log.info({ type: 'ardoise-sync', companyId }, 'Ardoise had a newer version; pulled it');
      return 'pulled';
    }
    await deps.prisma.company.update({
      where: { id: company.id },
      data: { ardoiseUpdatedAt: new Date(result.updatedAt), ardoiseSyncedAt: new Date() },
    });
    return 'pushed';
  } catch (error) {
    if (!(error instanceof ArdoiseError)) throw error;
    if (error.code === 'unknown_space') {
      await recordFailure(deps, company, error.code, unknownSpaceMessage(registreSpaceId));
      return 'failed';
    }
    if (error.status === 404) {
      await unlinkLocally(deps.prisma, company, systemAccess(company), 'Unlinked: the client no longer exists in Ardoise');
      return 'unlinked';
    }
    if (error.status === 429 || error.status >= 500) throw error;
    await recordFailure(deps, company, error.code, error.message);
    return 'failed';
  }
}

/** The unlink job body: tells Ardoise to forget this Glouton company. A missing client is fine. */
export async function unlinkRemote(deps: ArdoiseDeps, ardoiseClientId: string) {
  if (!deps.api) {
    warnArdoiseOff(deps.log);
    return 'disabled' as const;
  }
  try {
    await deps.api.unlink(ardoiseClientId);
  } catch (error) {
    if (error instanceof ArdoiseError && error.status === 404) return 'missing' as const;
    throw error;
  }
  return 'unlinked' as const;
}

export interface BillingFields {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface TurnIntoClientInput {
  companyId: string;
  billingPersonId: string;
  fill?: BillingFields;
}

function filled(value: string | null | undefined, current: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : current;
}

function remoteFailure(error: unknown, registreSpaceId: string | null): TRPCError {
  if (error instanceof ArdoiseError) {
    if (error.code === 'unknown_space') return new TRPCError({ code: 'BAD_REQUEST', message: unknownSpaceMessage(registreSpaceId) });
    if (error.status >= 400 && error.status < 500) {
      return new TRPCError({ code: 'BAD_REQUEST', message: `Ardoise refused the client: ${error.message}` });
    }
  }
  return new TRPCError({ code: 'BAD_GATEWAY', message: 'Ardoise is unreachable; try again in a moment' });
}

/**
 * A person's "Turn into client": fills missing billing fields, marks the
 * billing contact, creates or updates the Ardoise client, then links it.
 */
export async function turnIntoClient(deps: ArdoiseDeps, access: Access, input: TurnIntoClientInput, actorEmail?: string) {
  if (access.actor) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a person can turn a contact into a client' });
  if (!deps.api) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Ardoise is not connected to Glouton' });
  }
  const company = await findCompany(deps.prisma, access, input.companyId);
  const person = await findPerson(deps.prisma, access, input.billingPersonId);
  if (person.companyId !== company.id) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This person does not belong to this company' });
  }
  const fill = input.fill ?? {};
  const nextPerson = {
    firstName: filled(fill.firstName, person.firstName),
    lastName: filled(fill.lastName, person.lastName),
    email: normalizeEmail(filled(fill.email, person.email)),
  };
  const nextCompany = {
    siret: normalizeSiret(filled(fill.siret, company.siret)),
    vatNumber: filled(fill.vatNumber, company.vatNumber),
    addressLine: filled(fill.addressLine, company.addressLine),
    postalCode: filled(fill.postalCode, company.postalCode),
    city: filled(fill.city, company.city),
    country: filled(fill.country, company.country),
  };
  const registreSpaceId = await registreSpaceOf(deps.prisma, company.teamId);
  const payload = clientPayload(
    { ...company, ...nextCompany },
    { ...person, ...nextPerson },
    registreSpaceId,
    new Date(),
    actorEmail
  );
  if ('problem' in payload) throw new TRPCError({ code: 'BAD_REQUEST', message: payload.problem });

  let result;
  try {
    result = company.ardoiseClientId
      ? await deps.api.update(company.ardoiseClientId, payload)
      : await deps.api.upsert(payload);
  } catch (error) {
    const failure = remoteFailure(error, registreSpaceId);
    await recordFailure(deps, company, error instanceof ArdoiseError ? error.code : 'unreachable', failure.message);
    throw failure;
  }

  return deps.prisma.$transaction(async (tx) => {
    const holder = await tx.company.findFirst({
      where: { ardoiseClientId: result.id, id: { not: company.id } },
      select: { id: true, deletedAt: true },
    });
    if (holder && !holder.deletedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: 'This Ardoise client is already linked to another company' });
    }
    if (holder) await tx.company.update({ where: { id: holder.id }, data: { ardoiseClientId: null } });
    await tx.person.updateMany({
      where: { companyId: company.id, isBillingContact: true, id: { not: person.id } },
      data: { isBillingContact: false },
    });
    await tx.person.update({
      where: { id: person.id },
      data: {
        ...nextPerson,
        isBillingContact: true,
        ...(nextPerson.email !== person.email ? { emailVerified: null } : {}),
      },
    });
    const linked = await tx.company.update({
      where: { id: company.id },
      data: {
        ...nextCompany,
        stage: 'CLIENT',
        ardoiseClientId: result.id,
        ardoiseUpdatedAt: new Date(result.updatedAt),
        ardoiseSyncedAt: new Date(),
      },
    });
    if (company.stage !== 'CLIENT') {
      await logActivity(tx, access, {
        teamId: company.teamId,
        companyId: company.id,
        kind: 'stage.changed',
        summary: `Stage changed from ${company.stage} to CLIENT`,
        payload: { from: company.stage, to: 'CLIENT' },
      });
    }
    if (company.ardoiseClientId !== result.id) {
      await logActivity(tx, access, {
        teamId: company.teamId,
        companyId: company.id,
        personId: person.id,
        kind: 'ardoise.client.linked',
        summary: 'Turned into an Ardoise client',
        payload: { ardoiseClientId: result.id, reason: 'turned_into_client' },
      });
    }
    return linked;
  });
}

/** A person's Unlink: Ardoise forgets the company, Glouton forgets the client; nothing is deleted. */
export async function unlinkCompany(deps: ArdoiseDeps, access: Access, companyId: string) {
  if (access.actor) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a person can unlink a client' });
  const company = await findCompany(deps.prisma, access, companyId);
  if (!company.ardoiseClientId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This company is not linked to Ardoise' });
  if (deps.api) {
    try {
      await unlinkRemote(deps, company.ardoiseClientId);
    } catch (error) {
      deps.log.error({ type: 'ardoise-sync', companyId, error }, 'Ardoise unlink failed');
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Ardoise is unreachable; try again in a moment' });
    }
  } else {
    warnArdoiseOff(deps.log);
  }
  await unlinkLocally(deps.prisma, company, access, 'Unlinked from Ardoise');
  return deps.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
}
