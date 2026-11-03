import type { ContactOrigin, ContactStage, Lead, LeadSource, Prisma, PrismaClient } from '@prisma/client';

export interface MirrorResult {
  scanned: number;
  companies: number;
  people: number;
}

export interface MirrorOptions {
  dryRun?: boolean;
  batchSize?: number;
}

type MirrorClient = Pick<PrismaClient, 'lead' | 'company' | 'person' | '$transaction'>;

const ORIGIN_BY_SOURCE: Partial<Record<LeadSource, ContactOrigin>> = {
  CSV_IMPORT: 'CSV',
  MANUAL: 'MANUAL',
};

/** Maps a legacy lead source onto the contact origin it stands for. */
export function originForSource(source: LeadSource): ContactOrigin {
  return ORIGIN_BY_SOURCE[source] ?? 'HUNT';
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === 'string' && v.trim() !== '')));
}

function companyName(lead: Lead): string {
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  return lead.businessName || lead.domain || person || lead.email || 'Unnamed company';
}

function hasPerson(lead: Lead): boolean {
  return Boolean(lead.firstName || lead.lastName || lead.email);
}

/** Builds the Company and optional Person rows that stand for one legacy lead. */
export function contactRowsForLead(lead: Lead): {
  company: Prisma.CompanyCreateManyInput;
  person: Prisma.PersonCreateManyInput | null;
} {
  const companyId = crypto.randomUUID();
  const origin = originForSource(lead.source);
  const stage: ContactStage = lead.contacted ? 'CONTACTED' : 'PROSPECT';
  const company: Prisma.CompanyCreateManyInput = {
    id: companyId,
    userId: lead.userId,
    teamId: lead.teamId,
    name: companyName(lead),
    domain: lead.domain,
    addressLine: lead.physicalAddresses[0] ?? null,
    city: lead.city,
    country: lead.country,
    category: lead.category,
    phones: unique(lead.phoneNumbers),
    emails: unique([lead.email, ...lead.additionalEmails]),
    socialProfiles: lead.socialProfiles ?? undefined,
    websiteAudit: lead.websiteAudit ?? undefined,
    technologies: lead.technologies,
    temperature: lead.status,
    score: lead.score,
    stage,
    origin,
    legacyLeadId: lead.id,
    createdAt: lead.createdAt,
  };
  const person: Prisma.PersonCreateManyInput | null = hasPerson(lead)
    ? {
        userId: lead.userId,
        teamId: lead.teamId,
        companyId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        emails: unique(lead.additionalEmails),
        phones: [],
        role: lead.position,
        stage,
        origin,
        emailVerified: lead.emailVerified,
        legacyLeadId: lead.id,
        createdAt: lead.createdAt,
      }
    : null;
  return { company, person };
}

/**
 * Creates a Company, plus a Person when the lead names one, for every lead
 * matching `where` that has no Company yet. Idempotent through
 * `Company.legacyLeadId`, so hunts, imports and the backfill can all call it.
 */
export async function mirrorLeadsToContacts(
  client: MirrorClient,
  where: Prisma.LeadWhereInput,
  options: MirrorOptions = {}
): Promise<MirrorResult> {
  const batchSize = options.batchSize ?? 500;
  const result: MirrorResult = { scanned: 0, companies: 0, people: 0 };
  let cursor: string | undefined;

  for (;;) {
    const leads = await client.lead.findMany({
      where,
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (leads.length === 0) break;
    cursor = leads[leads.length - 1]!.id;
    result.scanned += leads.length;

    const mirrored = await client.company.findMany({
      where: { legacyLeadId: { in: leads.map((l) => l.id) } },
      select: { legacyLeadId: true },
    });
    const done = new Set(mirrored.map((c) => c.legacyLeadId));
    const rows = leads.filter((l) => !done.has(l.id)).map(contactRowsForLead);
    const companies = rows.map((r) => r.company);
    const people = rows.flatMap((r) => (r.person ? [r.person] : []));

    if (!options.dryRun && companies.length > 0) {
      await client.$transaction([
        client.company.createMany({ data: companies }),
        client.person.createMany({ data: people }),
      ]);
    }
    result.companies += companies.length;
    result.people += people.length;
    if (leads.length < batchSize) break;
  }

  return result;
}

/** Points legacy outreach rows at the Company and Person mirrored from their lead. */
export async function linkOutreachToContacts(
  client: Pick<PrismaClient, '$executeRaw' | '$queryRaw'>,
  options: MirrorOptions = {}
): Promise<{ companies: number; people: number }> {
  if (options.dryRun) {
    const [row] = await client.$queryRaw<Array<{ companies: bigint; people: bigint }>>`
      SELECT
        (SELECT count(*) FROM "EmailOutreach" eo JOIN "Lead" l ON l.id = eo."leadId"
          WHERE eo."companyId" IS NULL) AS companies,
        (SELECT count(*) FROM "EmailOutreach" eo JOIN "Lead" l ON l.id = eo."leadId"
          WHERE eo."personId" IS NULL AND (l.email IS NOT NULL OR l."firstName" IS NOT NULL OR l."lastName" IS NOT NULL)) AS people
    `;
    return { companies: Number(row?.companies ?? 0), people: Number(row?.people ?? 0) };
  }
  const companies = await client.$executeRaw`
    UPDATE "EmailOutreach" eo SET "companyId" = c.id
    FROM "Company" c
    WHERE c."legacyLeadId" = eo."leadId" AND eo."companyId" IS NULL
  `;
  const people = await client.$executeRaw`
    UPDATE "EmailOutreach" eo SET "personId" = p.id
    FROM "Person" p
    WHERE p."legacyLeadId" = eo."leadId" AND p."companyId" = eo."companyId" AND eo."personId" IS NULL
  `;
  return { companies, people };
}
