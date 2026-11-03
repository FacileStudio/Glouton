import type { Company, Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeEmail, normalizeSiret } from '../contact/service';
import type { RemoteClient } from './client';

type Tx = Prisma.TransactionClient;

export const ARDOISE_ACTOR = 'ardoise';

const nullableText = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : null));

export const remoteClientSchema = z.object({
  id: z.string().min(1),
  gloutonCompanyId: z.string().nullish().transform((v) => v || null),
  registreSpaceId: z.string().nullish().transform((v) => v || null),
  companyName: z.string().trim().min(1),
  contactFirstName: z.string().default(''),
  contactLastName: z.string().default(''),
  contactEmail: nullableText,
  billingAddress: nullableText,
  billingCity: nullableText,
  billingPostalCode: nullableText,
  billingCountry: nullableText,
  siret: nullableText,
  tvaIntracom: nullableText,
  updatedAt: z.string().datetime({ offset: true }),
});

/** Parses an Ardoise client from a webhook body or a stored suggestion payload. */
export function parseRemoteClient(value: unknown): RemoteClient | null {
  const parsed = remoteClientSchema.safeParse(value);
  return parsed.success ? (parsed.data as RemoteClient) : null;
}

/** Where a contact created from Ardoise lands: a team, or the personal scope of its owner. */
export interface Placement {
  teamId: string | null;
  ownerId: string;
}

export function placementWhere(placement: Placement) {
  return placement.teamId ? { teamId: placement.teamId } : { userId: placement.ownerId, teamId: null };
}

/**
 * The company fields Ardoise owns. `replace` takes Ardoise's values as they
 * are (a linked update); `fill` keeps Glouton's value where Ardoise has none.
 */
export function companyFieldsFrom(client: RemoteClient, mode: 'replace' | 'fill', current?: Company | null) {
  const pick = (incoming: string | null, existing: string | null | undefined) =>
    mode === 'replace' ? incoming : incoming ?? existing ?? null;
  return {
    name: client.companyName,
    siret: normalizeSiret(pick(client.siret, current?.siret)),
    vatNumber: pick(client.tvaIntracom, current?.vatNumber),
    addressLine: pick(client.billingAddress, current?.addressLine),
    postalCode: pick(client.billingPostalCode, current?.postalCode),
    city: pick(client.billingCity, current?.city),
    country: pick(client.billingCountry, current?.country),
  };
}

function clean(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/** Writes Ardoise's contact onto the company's billing person, creating one when there is none. */
export async function applyBillingPerson(tx: Tx, company: Company, client: RemoteClient) {
  const email = normalizeEmail(client.contactEmail);
  const firstName = clean(client.contactFirstName);
  const lastName = clean(client.contactLastName);
  const live = { companyId: company.id, deletedAt: null };
  const person =
    (await tx.person.findFirst({ where: { ...live, isBillingContact: true }, orderBy: { updatedAt: 'desc' } })) ??
    (email ? await tx.person.findFirst({ where: { ...live, email } }) : null);
  if (person) {
    const nextEmail = email ?? person.email;
    return tx.person.update({
      where: { id: person.id },
      data: {
        firstName: firstName ?? person.firstName,
        lastName: lastName ?? person.lastName,
        email: nextEmail,
        isBillingContact: true,
        ...(nextEmail !== person.email ? { emailVerified: null } : {}),
      },
    });
  }
  if (!firstName && !lastName && !email) return null;
  await tx.person.updateMany({ where: { companyId: company.id, isBillingContact: true }, data: { isBillingContact: false } });
  return tx.person.create({
    data: {
      userId: company.userId,
      teamId: company.teamId,
      companyId: company.id,
      firstName,
      lastName,
      email,
      emails: [],
      phones: [],
      stage: 'CLIENT',
      origin: 'ARDOISE',
      isBillingContact: true,
    },
  });
}

function emailDomain(email: string | null): string | null {
  return email?.split('@')[1] ?? null;
}

/** Creates a client company and its billing person from an Ardoise client, already linked. */
export async function createCompanyFromClient(tx: Tx, placement: Placement, client: RemoteClient) {
  const email = normalizeEmail(client.contactEmail);
  const company = await tx.company.create({
    data: {
      ...companyFieldsFrom(client, 'replace'),
      userId: placement.ownerId,
      teamId: placement.teamId,
      domain: companyDomainOf(email),
      emails: email ? [email] : [],
      phones: [],
      technologies: [],
      stage: 'CLIENT',
      origin: 'ARDOISE',
      ardoiseClientId: client.id,
      ardoiseUpdatedAt: new Date(client.updatedAt),
      ardoiseSyncedAt: new Date(),
    },
  });
  await applyBillingPerson(tx, company, client);
  await tx.activity.create({
    data: {
      userId: placement.ownerId,
      teamId: placement.teamId,
      companyId: company.id,
      kind: 'ardoise.client.linked',
      summary: `Created from Ardoise client ${client.companyName}`,
      payload: { ardoiseClientId: client.id, reason: 'created' },
      actor: ARDOISE_ACTOR,
    },
  });
  return company;
}

/**
 * Links an existing company to an Ardoise client and fills the fields
 * Glouton lacks. Throws when another company already holds that client.
 */
export async function linkCompanyToClient(
  tx: Tx,
  company: Company,
  client: RemoteClient,
  link: { reason: string; actor: string; userId: string; suggestionId?: string }
) {
  const holder = await tx.company.findFirst({
    where: { ardoiseClientId: client.id, id: { not: company.id } },
    select: { id: true, deletedAt: true },
  });
  if (holder && !holder.deletedAt) return null;
  if (holder) await tx.company.update({ where: { id: holder.id }, data: { ardoiseClientId: null } });
  const linked = await tx.company.update({
    where: { id: company.id },
    data: {
      ...companyFieldsFrom(client, 'fill', company),
      stage: 'CLIENT',
      ardoiseClientId: client.id,
      ardoiseUpdatedAt: new Date(client.updatedAt),
      ardoiseSyncedAt: new Date(),
    },
  });
  await applyBillingPerson(tx, linked, client);
  await tx.activity.create({
    data: {
      userId: link.userId,
      teamId: company.teamId,
      companyId: company.id,
      kind: 'ardoise.client.linked',
      summary: `Linked to Ardoise client ${client.companyName} (${link.reason})`,
      payload: {
        ardoiseClientId: client.id,
        reason: link.reason,
        ...(link.suggestionId ? { suggestionId: link.suggestionId } : {}),
      },
      actor: link.actor,
    },
  });
  return linked;
}

const LEGAL_FORMS = /\b(sas|sasu|sarl|eurl|sa|sci|snc|scop|eirl|ei|ltd|llc|inc|gmbh|bv|srl)\b/g;

/** Lowercases, strips accents, punctuation, spaces and legal forms, so `ACME S.A.S.` reads `acme`. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/\s+/g, '');
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** True when two company names are the same once normalized, or one typo apart on a long name. */
export function similarNames(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return Math.min(left.length, right.length) >= 6 && editDistance(left, right) <= 1;
}

const GENERIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'laposte.net',
  'bbox.fr',
  'gmx.fr',
  'gmx.com',
  'proton.me',
  'protonmail.com',
  'tuta.io',
  'tutanota.com',
]);

/** The company domain of a contact email, or null for webmail addresses that say nothing about the company. */
export function companyDomainOf(email: string | null | undefined): string | null {
  const domain = emailDomain(normalizeEmail(email));
  return domain && !GENERIC_DOMAINS.has(domain) ? domain : null;
}
