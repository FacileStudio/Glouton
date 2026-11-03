import type { ContactOrigin, ContactStage, Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { actorLabel, ownedWhere, targetTeam, type Access } from './access';
import type {
  CompanyCreateInput,
  CompanyUpdateInput,
  DuplicateCheckInput,
  ListFilters,
  PersonCreateInput,
  PersonInput,
  PersonUpdateInput,
} from './schemas';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ActivityInput {
  teamId: string | null;
  companyId?: string | null;
  personId?: string | null;
  kind: string;
  summary: string;
  payload?: Prisma.InputJsonValue;
}

/** Lowercases a domain and strips scheme, `www.` and path, so `https://www.Acme.io/x` matches `acme.io`. */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
  return host || null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

export function normalizeSiret(value: string | null | undefined): string | null {
  const digits = value?.replace(/\s+/g, '');
  return digits ? digits : null;
}

function personName(p: { firstName: string | null; lastName: string | null; email: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unnamed person';
}

/** Keeps the flat, readable part of a stored website audit for list and agent views. */
export function auditSummary(audit: Prisma.JsonValue | null): Record<string, string | number | boolean> | null {
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return null;
  const summary: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(audit)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value;
    } else if (Array.isArray(value)) {
      summary[`${key}Count`] = value.length;
    }
  }
  return summary;
}

export async function logActivity(db: Db, access: Access, input: ActivityInput) {
  return db.activity.create({
    data: {
      userId: access.userId,
      teamId: input.teamId,
      companyId: input.companyId ?? null,
      personId: input.personId ?? null,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload,
      actor: actorLabel(access),
    },
  });
}

function notFound(what: string): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: `${what} not found` });
}

export async function findCompany(db: Db, access: Access, id: string) {
  const company = await db.company.findFirst({ where: { id, deletedAt: null, ...ownedWhere(access) } });
  return company ?? notFound('Company');
}

export async function findPerson(db: Db, access: Access, id: string) {
  const person = await db.person.findFirst({ where: { id, deletedAt: null, ...ownedWhere(access) } });
  return person ?? notFound('Person');
}

function companyWhere(access: Access, filters: Partial<ListFilters>): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = { deletedAt: null, ...ownedWhere(access) };
  if (filters.stage) where.stage = filters.stage;
  if (filters.temperature) where.temperature = filters.temperature;
  if (filters.origin) where.origin = filters.origin;
  if (filters.q) {
    const q = filters.q;
    where.AND = [
      {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { domain: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { emails: { has: q.toLowerCase() } },
        ],
      },
    ];
  }
  return where;
}

function personWhere(access: Access, filters: Partial<ListFilters>): Prisma.PersonWhereInput {
  const where: Prisma.PersonWhereInput = { deletedAt: null, ...ownedWhere(access) };
  if (filters.stage) where.stage = filters.stage;
  if (filters.origin) where.origin = filters.origin;
  if (filters.temperature) where.company = { temperature: filters.temperature };
  if (filters.q) {
    const q = filters.q;
    where.AND = [
      {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { company: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
    ];
  }
  return where;
}

async function lastContactedBy(
  db: Db,
  field: 'companyId' | 'personId',
  ids: string[]
): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await db.emailOutreach.groupBy({
    by: [field],
    where: { [field]: { in: ids }, sentAt: { not: null } },
    _max: { sentAt: true },
  });
  const map = new Map<string, Date>();
  for (const row of rows) {
    const id = row[field];
    if (id && row._max.sentAt) map.set(id, row._max.sentAt);
  }
  return map;
}

export async function listCompanies(db: Db, access: Access, filters: ListFilters) {
  const where = companyWhere(access, filters);
  const [items, total] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: filters.limit,
      skip: filters.offset,
      select: {
        id: true,
        teamId: true,
        name: true,
        domain: true,
        city: true,
        country: true,
        category: true,
        emails: true,
        stage: true,
        temperature: true,
        score: true,
        origin: true,
        ardoiseClientId: true,
        updatedAt: true,
        _count: { select: { people: { where: { deletedAt: null } } } },
      },
    }),
    db.company.count({ where }),
  ]);
  const contacted = await lastContactedBy(db, 'companyId', items.map((c) => c.id));
  return {
    total,
    items: items.map(({ _count, ...c }) => ({
      ...c,
      peopleCount: _count.people,
      lastContactedAt: contacted.get(c.id) ?? null,
    })),
  };
}

export async function listPeople(db: Db, access: Access, filters: ListFilters) {
  const where = personWhere(access, filters);
  const [items, total] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: filters.limit,
      skip: filters.offset,
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        stage: true,
        origin: true,
        updatedAt: true,
        company: { select: { id: true, name: true, temperature: true, score: true, city: true } },
      },
    }),
    db.person.count({ where }),
  ]);
  const contacted = await lastContactedBy(db, 'personId', items.map((p) => p.id));
  return {
    total,
    items: items.map((p) => ({ ...p, lastContactedAt: contacted.get(p.id) ?? null })),
  };
}

export interface ContactRow {
  type: 'company' | 'person';
  id: string;
  name: string;
  email?: string | null;
  companyName?: string | null;
  stage: ContactStage;
  temperature?: string | null;
  score?: number | null;
  city?: string | null;
  lastContactedAt?: Date | null;
}

/** One list of companies and people, newest first, as the agent API returns it. */
export async function searchContacts(db: Db, access: Access, filters: ListFilters): Promise<ContactRow[]> {
  const window = { ...filters, offset: 0 };
  const [companies, people] = await Promise.all([
    listCompanies(db, access, window),
    listPeople(db, access, window),
  ]);
  const rows: Array<ContactRow & { updatedAt: Date }> = [
    ...companies.items.map((c) => ({
      type: 'company' as const,
      id: c.id,
      name: c.name,
      email: c.emails[0] ?? null,
      stage: c.stage,
      temperature: c.temperature,
      score: c.score,
      city: c.city,
      lastContactedAt: c.lastContactedAt,
      updatedAt: c.updatedAt,
    })),
    ...people.items.map((p) => ({
      type: 'person' as const,
      id: p.id,
      name: personName(p),
      email: p.email,
      companyName: p.company?.name ?? null,
      stage: p.stage,
      temperature: p.company?.temperature ?? null,
      score: p.company?.score ?? null,
      city: p.company?.city ?? null,
      lastContactedAt: p.lastContactedAt,
      updatedAt: p.updatedAt,
    })),
  ];
  return rows
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, filters.limit)
    .map(({ updatedAt: _updatedAt, ...row }) => row);
}

const outreachSelect = {
  id: true,
  status: true,
  subject: true,
  textBody: true,
  htmlBody: true,
  origin: true,
  rationale: true,
  personId: true,
  companyId: true,
  sentAt: true,
  repliedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getCompany(db: Db, access: Access, id: string) {
  const company = await findCompany(db, access, id);
  const [people, activities, suggestions, outreach] = await Promise.all([
    db.person.findMany({ where: { companyId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    db.activity.findMany({ where: { companyId: id }, orderBy: { occurredAt: 'desc' }, take: 50 }),
    db.suggestion.findMany({ where: { companyId: id, status: 'OPEN' }, orderBy: { createdAt: 'desc' } }),
    db.emailOutreach.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: outreachSelect,
    }),
  ]);
  return { ...company, auditSummary: auditSummary(company.websiteAudit), people, activities, suggestions, outreach };
}

export async function getPerson(db: Db, access: Access, id: string) {
  const person = await findPerson(db, access, id);
  const [company, activities, suggestions, outreach] = await Promise.all([
    person.companyId
      ? db.company.findFirst({
          where: { id: person.companyId, deletedAt: null },
          select: { id: true, name: true, domain: true, stage: true, temperature: true, score: true, city: true },
        })
      : null,
    db.activity.findMany({ where: { personId: id }, orderBy: { occurredAt: 'desc' }, take: 50 }),
    db.suggestion.findMany({ where: { personId: id, status: 'OPEN' }, orderBy: { createdAt: 'desc' } }),
    db.emailOutreach.findMany({
      where: { personId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: outreachSelect,
    }),
  ]);
  return { ...person, company, activities, suggestions, outreach };
}

export async function listOutreach(
  db: Db,
  access: Access,
  filter: { companyId?: string; personId?: string },
  limit = 50
) {
  return db.emailOutreach.findMany({
    where: {
      ...ownedWhere(access),
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
      ...(filter.personId ? { personId: filter.personId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: outreachSelect,
  });
}

function personData(input: PersonInput) {
  return {
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    email: normalizeEmail(input.email),
    role: input.role ?? null,
    phones: input.phones ?? [],
    notes: input.notes ?? null,
    stage: input.stage,
    isBillingContact: input.isBillingContact ?? false,
  };
}

function companyFields(input: CompanyUpdateInput) {
  const data: Prisma.CompanyUncheckedUpdateInput = {};
  const keys = [
    'name',
    'legalName',
    'website',
    'vatNumber',
    'addressLine',
    'postalCode',
    'city',
    'country',
    'category',
    'stage',
    'temperature',
    'score',
    'notes',
  ] as const;
  for (const key of keys) {
    if (input[key] !== undefined) Object.assign(data, { [key]: input[key] });
  }
  if (input.domain !== undefined) data.domain = normalizeDomain(input.domain);
  if (input.siret !== undefined) data.siret = normalizeSiret(input.siret);
  return data;
}

export async function createCompany(
  prisma: PrismaClient,
  access: Access,
  input: CompanyCreateInput,
  origin: ContactOrigin
) {
  const teamId = targetTeam(access, input.teamId);
  const { people = [], ...rest } = input;
  const email = people.map((p) => normalizeEmail(p.email)).find(Boolean);
  return prisma.company.create({
    data: {
      ...(companyFields(rest) as Prisma.CompanyUncheckedCreateInput),
      name: rest.name,
      userId: access.userId,
      teamId,
      origin,
      emails: email ? [email] : [],
      phones: [],
      technologies: [],
      people: {
        create: people.map((p) => ({ ...personData(p), userId: access.userId, teamId, origin })),
      },
    },
    include: { people: true },
  });
}

export async function updateCompany(prisma: PrismaClient, access: Access, id: string, input: CompanyUpdateInput) {
  const before = await findCompany(prisma, access, id);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id }, data: companyFields(input) });
    if (input.stage && input.stage !== before.stage) {
      await logActivity(tx, access, {
        teamId: company.teamId,
        companyId: id,
        kind: 'stage.changed',
        summary: `Stage changed from ${before.stage} to ${input.stage}`,
        payload: { from: before.stage, to: input.stage },
      });
    }
    return company;
  });
}

export async function createPerson(
  prisma: PrismaClient,
  access: Access,
  input: PersonCreateInput,
  origin: ContactOrigin
) {
  let teamId = targetTeam(access, input.teamId);
  if (input.companyId) {
    const company = await findCompany(prisma, access, input.companyId);
    teamId = company.teamId;
  }
  return prisma.person.create({
    data: {
      ...personData(input),
      userId: access.userId,
      teamId,
      companyId: input.companyId ?? null,
      origin,
      emails: [],
    },
  });
}

export async function updatePerson(prisma: PrismaClient, access: Access, id: string, input: PersonUpdateInput) {
  const before = await findPerson(prisma, access, id);
  if (input.companyId) await findCompany(prisma, access, input.companyId);
  const data: Prisma.PersonUncheckedUpdateInput = {};
  const keys = ['firstName', 'lastName', 'role', 'phones', 'notes', 'stage', 'isBillingContact', 'companyId'] as const;
  for (const key of keys) {
    if (input[key] !== undefined) Object.assign(data, { [key]: input[key] });
  }
  if (input.email !== undefined) {
    data.email = normalizeEmail(input.email);
    if (data.email !== before.email) data.emailVerified = null;
  }
  return prisma.$transaction(async (tx) => {
    const person = await tx.person.update({ where: { id }, data });
    if (input.stage && input.stage !== before.stage) {
      await logActivity(tx, access, {
        teamId: person.teamId,
        companyId: person.companyId,
        personId: id,
        kind: 'stage.changed',
        summary: `Stage changed from ${before.stage} to ${input.stage}`,
        payload: { from: before.stage, to: input.stage },
      });
    }
    return person;
  });
}

export async function changeStage(
  prisma: PrismaClient,
  access: Access,
  target: { companyId?: string; personId?: string },
  stage: ContactStage
) {
  if (target.companyId) return updateCompany(prisma, access, target.companyId, { stage });
  if (target.personId) return updatePerson(prisma, access, target.personId, { stage });
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Give a company or a person' });
}

export async function addNote(
  prisma: PrismaClient,
  access: Access,
  target: { companyId?: string; personId?: string },
  text: string
) {
  if (target.personId) {
    const person = await findPerson(prisma, access, target.personId);
    return logActivity(prisma, access, {
      teamId: person.teamId,
      companyId: person.companyId,
      personId: person.id,
      kind: 'note',
      summary: text,
    });
  }
  if (target.companyId) {
    const company = await findCompany(prisma, access, target.companyId);
    return logActivity(prisma, access, { teamId: company.teamId, companyId: company.id, kind: 'note', summary: text });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Give a company or a person' });
}

export async function findDuplicates(db: Db, access: Access, input: DuplicateCheckInput) {
  const email = normalizeEmail(input.email);
  const domain = normalizeDomain(input.domain ?? (email ? email.split('@')[1] : undefined));
  const siret = normalizeSiret(input.siret);
  const companyOr: Prisma.CompanyWhereInput[] = [];
  if (domain) companyOr.push({ domain });
  if (siret) companyOr.push({ siret });
  if (email) companyOr.push({ emails: { has: email } });
  const [companies, people] = await Promise.all([
    companyOr.length
      ? db.company.findMany({
          where: { deletedAt: null, ...ownedWhere(access), AND: [{ OR: companyOr }] },
          select: { id: true, name: true, domain: true, siret: true, stage: true },
          take: 20,
        })
      : [],
    email
      ? db.person.findMany({
          where: { deletedAt: null, ...ownedWhere(access), email: { equals: email, mode: 'insensitive' } },
          select: { id: true, firstName: true, lastName: true, email: true, companyId: true },
          take: 20,
        })
      : [],
  ]);
  return { companies, people };
}

function union(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

/** Folds `sourceId` into `targetId`: moves people, timeline, suggestions and outreach, then hides the source. */
export async function mergeCompanies(prisma: PrismaClient, access: Access, targetId: string, sourceId: string) {
  if (targetId === sourceId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a company into itself' });
  const [target, source] = await Promise.all([
    findCompany(prisma, access, targetId),
    findCompany(prisma, access, sourceId),
  ]);
  return prisma.$transaction(async (tx) => {
    const moved = { companyId: targetId };
    await tx.person.updateMany({ where: { companyId: sourceId }, data: moved });
    await tx.activity.updateMany({ where: { companyId: sourceId }, data: moved });
    await tx.suggestion.updateMany({ where: { companyId: sourceId }, data: moved });
    await tx.emailOutreach.updateMany({ where: { companyId: sourceId }, data: moved });
    const ardoise = !target.ardoiseClientId && source.ardoiseClientId ? source.ardoiseClientId : null;
    await tx.company.update({
      where: { id: sourceId },
      data: { deletedAt: new Date(), ...(ardoise ? { ardoiseClientId: null } : {}) },
    });
    const merged = await tx.company.update({
      where: { id: targetId },
      data: {
        legalName: target.legalName ?? source.legalName,
        domain: target.domain ?? source.domain,
        website: target.website ?? source.website,
        siret: target.siret ?? source.siret,
        vatNumber: target.vatNumber ?? source.vatNumber,
        addressLine: target.addressLine ?? source.addressLine,
        postalCode: target.postalCode ?? source.postalCode,
        city: target.city ?? source.city,
        country: target.country ?? source.country,
        category: target.category ?? source.category,
        phones: union(target.phones, source.phones),
        emails: union(target.emails, source.emails),
        technologies: union(target.technologies, source.technologies),
        score: Math.max(target.score, source.score),
        notes: [target.notes, source.notes].filter(Boolean).join('\n\n') || null,
        ...(ardoise ? { ardoiseClientId: ardoise, ardoiseSyncedAt: source.ardoiseSyncedAt, ardoiseUpdatedAt: source.ardoiseUpdatedAt } : {}),
      },
    });
    await logActivity(tx, access, {
      teamId: merged.teamId,
      companyId: targetId,
      kind: 'contact.merged',
      summary: `Merged ${source.name} into ${target.name}`,
      payload: { sourceId, targetId },
    });
    return merged;
  });
}

export async function mergePeople(prisma: PrismaClient, access: Access, targetId: string, sourceId: string) {
  if (targetId === sourceId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a person into themselves' });
  const [target, source] = await Promise.all([
    findPerson(prisma, access, targetId),
    findPerson(prisma, access, sourceId),
  ]);
  return prisma.$transaction(async (tx) => {
    const moved = { personId: targetId };
    await tx.activity.updateMany({ where: { personId: sourceId }, data: moved });
    await tx.suggestion.updateMany({ where: { personId: sourceId }, data: moved });
    await tx.emailOutreach.updateMany({ where: { personId: sourceId }, data: moved });
    await tx.person.update({ where: { id: sourceId }, data: { deletedAt: new Date() } });
    const merged = await tx.person.update({
      where: { id: targetId },
      data: {
        companyId: target.companyId ?? source.companyId,
        firstName: target.firstName ?? source.firstName,
        lastName: target.lastName ?? source.lastName,
        email: target.email ?? source.email,
        emails: union(target.emails, [...source.emails, ...(source.email ? [source.email] : [])]).filter(
          (e) => e !== (target.email ?? source.email)
        ),
        phones: union(target.phones, source.phones),
        role: target.role ?? source.role,
        notes: [target.notes, source.notes].filter(Boolean).join('\n\n') || null,
        isBillingContact: target.isBillingContact || source.isBillingContact,
      },
    });
    await logActivity(tx, access, {
      teamId: merged.teamId,
      companyId: merged.companyId,
      personId: targetId,
      kind: 'contact.merged',
      summary: `Merged ${personName(source)} into ${personName(target)}`,
      payload: { sourceId, targetId },
    });
    return merged;
  });
}

/** Hides a company and its people; rows stay in the database and links in other apps are untouched. */
export async function deleteCompany(prisma: PrismaClient, access: Access, id: string) {
  await findCompany(prisma, access, id);
  const now = new Date();
  await prisma.$transaction([
    prisma.person.updateMany({ where: { companyId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.company.update({ where: { id }, data: { deletedAt: now } }),
  ]);
  return { id, deleted: true };
}

export async function deletePerson(prisma: PrismaClient, access: Access, id: string) {
  await findPerson(prisma, access, id);
  await prisma.person.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}
