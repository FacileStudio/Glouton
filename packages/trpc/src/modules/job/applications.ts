import type { JobApplication, JobApplicationStatus, Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';

/** The statuses in pipeline order; REJECTED ends a pipeline at any step. */
export const APPLICATION_STATUSES = ['TO_APPLY', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'] as const satisfies readonly JobApplicationStatus[];

/**
 * Where an application may go from each status. Forward moves follow the
 * pipeline (an offer can come straight after applying), one step back
 * undoes a mistake, any open step can end as rejected, and a rejected
 * application can be reopened.
 */
export const TRANSITIONS: Readonly<Record<JobApplicationStatus, readonly JobApplicationStatus[]>> = {
  TO_APPLY: ['APPLIED', 'REJECTED'],
  APPLIED: ['INTERVIEW', 'OFFER', 'REJECTED', 'TO_APPLY'],
  INTERVIEW: ['OFFER', 'REJECTED', 'APPLIED'],
  OFFER: ['REJECTED', 'INTERVIEW'],
  REJECTED: ['TO_APPLY', 'APPLIED', 'INTERVIEW'],
};

type DateField = 'appliedAt' | 'interviewAt' | 'offerAt' | 'rejectedAt';

const DATE_OF: Partial<Record<JobApplicationStatus, DateField>> = {
  APPLIED: 'appliedAt',
  INTERVIEW: 'interviewAt',
  OFFER: 'offerAt',
  REJECTED: 'rejectedAt',
};

const RANK: Record<JobApplicationStatus, number> = { TO_APPLY: 0, APPLIED: 1, INTERVIEW: 2, OFFER: 3, REJECTED: 4 };

/** True when an application may move from one status to the other. */
export function canMove(from: JobApplicationStatus, to: JobApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The fields a move writes. Reaching a status stamps its date unless one is
 * set already (an interview date typed ahead stays). Going back clears the
 * dates of the steps undone; reopening a rejected application clears its
 * rejection date. Throws on a move the pipeline does not allow.
 */
export function transition(
  current: Pick<JobApplication, 'status' | DateField>,
  to: JobApplicationStatus,
  now: Date
): Partial<Record<DateField, Date | null>> & { status: JobApplicationStatus } {
  if (!canMove(current.status, to)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `An application cannot go from ${current.status} to ${to}` });
  }
  const data: Partial<Record<DateField, Date | null>> & { status: JobApplicationStatus } = { status: to };
  const field = DATE_OF[to];
  if (field && !current[field]) data[field] = now;
  if (current.status === 'REJECTED') data.rejectedAt = null;
  else if (to !== 'REJECTED' && RANK[to] < RANK[current.status]) {
    for (const [status, date] of Object.entries(DATE_OF) as Array<[JobApplicationStatus, DateField]>) {
      if (status !== 'REJECTED' && RANK[status] > RANK[to]) data[date] = null;
    }
  }
  return data;
}

/** The applications of one scope: a team's, or the person's own personal ones. */
export function applicationFilter(scope: Scope): Prisma.JobApplicationWhereInput {
  return scope.type === 'team' ? { teamId: scope.teamId } : { userId: scope.userId, teamId: null };
}

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });

/** The fields a person types on an application. Empty text clears a field. */
export interface ApplicationFields {
  title?: string;
  company?: string | null;
  url?: string | null;
  location?: string | null;
  description?: string | null;
  notes?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  links?: string[];
  appliedAt?: Date | null;
  interviewAt?: Date | null;
  offerAt?: Date | null;
  rejectedAt?: Date | null;
  remindAt?: Date | null;
}

function clean(fields: ApplicationFields): Prisma.JobApplicationUncheckedUpdateInput {
  const out: Prisma.JobApplicationUncheckedUpdateInput = {};
  const text = ['company', 'url', 'location', 'description', 'notes', 'contactName', 'contactEmail', 'contactPhone'] as const;
  for (const key of text) if (fields[key] !== undefined) out[key] = fields[key]?.trim() || null;
  if (fields.title !== undefined) out.title = fields.title.trim();
  if (fields.links !== undefined) out.links = Array.from(new Set(fields.links.map((link) => link.trim()).filter(Boolean)));
  for (const key of ['appliedAt', 'interviewAt', 'offerAt', 'rejectedAt'] as const) if (fields[key] !== undefined) out[key] = fields[key];
  if (fields.remindAt !== undefined) {
    out.remindAt = fields.remindAt;
    out.remindedAt = null;
  }
  return out;
}

/** An application with the statuses it may move to next, so clients never copy the pipeline. */
export function presentApplication(row: JobApplication) {
  return { ...row, next: [...TRANSITIONS[row.status]] };
}

export async function listApplications(prisma: PrismaClient, scope: Scope, status?: JobApplicationStatus) {
  const rows = await prisma.jobApplication.findMany({
    where: { ...applicationFilter(scope), ...(status ? { status } : {}) },
    orderBy: [{ updatedAt: 'desc' }],
    take: 500,
  });
  return rows.map(presentApplication);
}

export async function loadApplication(prisma: Prisma.TransactionClient | PrismaClient, scope: Scope, applicationId: string) {
  const row = await prisma.jobApplication.findFirst({ where: { id: applicationId, ...applicationFilter(scope) } });
  if (!row) throw notFound();
  return row;
}

/** An application typed by hand, for a job found elsewhere. */
export async function createApplication(prisma: PrismaClient, scope: Scope, fields: ApplicationFields & { title: string }) {
  const data = clean(fields) as Prisma.JobApplicationUncheckedCreateInput;
  return prisma.jobApplication.create({
    data: { ...data, title: fields.title.trim(), userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null },
  });
}

export async function updateApplication(prisma: PrismaClient, scope: Scope, applicationId: string, fields: ApplicationFields) {
  const row = await loadApplication(prisma, scope, applicationId);
  return prisma.jobApplication.update({ where: { id: row.id }, data: clean(fields) });
}

/**
 * Moves an application to another status. The write is conditioned on the
 * status read, so two people moving the same card at once cannot both win.
 */
export async function moveApplication(prisma: PrismaClient, scope: Scope, applicationId: string, to: JobApplicationStatus, now = new Date()) {
  const row = await loadApplication(prisma, scope, applicationId);
  const data = transition(row, to, now);
  const moved = await prisma.jobApplication.updateMany({ where: { id: row.id, status: row.status }, data });
  if (moved.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'The application changed meanwhile. Reload it.' });
  return prisma.jobApplication.findUniqueOrThrow({ where: { id: row.id } });
}

export async function deleteApplication(prisma: PrismaClient, scope: Scope, applicationId: string) {
  const row = await loadApplication(prisma, scope, applicationId);
  await prisma.jobApplication.delete({ where: { id: row.id } });
  return { applicationId: row.id };
}

/** How many applications of the scope sit in each status. */
export async function applicationCounts(prisma: PrismaClient, scope: Scope): Promise<Record<JobApplicationStatus, number>> {
  const groups = await prisma.jobApplication.groupBy({ by: ['status'], where: applicationFilter(scope), _count: { _all: true } });
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<JobApplicationStatus, number>;
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

/** A reminder that came due, as the owner's in-app notice carries it. */
export interface DueReminder {
  applicationId: string;
  userId: string;
  title: string;
  company: string | null;
  status: JobApplicationStatus;
}

/**
 * Claims every reminder that came due and returns them, once each: the
 * claim sets remindedAt only where it is still empty.
 */
export async function claimReminders(prisma: PrismaClient, now = new Date(), take = 100): Promise<DueReminder[]> {
  const due = await prisma.jobApplication.findMany({
    where: { remindAt: { lte: now }, remindedAt: null },
    orderBy: { remindAt: 'asc' },
    take,
    select: { id: true, userId: true, title: true, company: true, status: true },
  });
  const claimed: DueReminder[] = [];
  for (const row of due) {
    const result = await prisma.jobApplication.updateMany({ where: { id: row.id, remindedAt: null }, data: { remindedAt: now } });
    if (result.count === 1) claimed.push({ applicationId: row.id, userId: row.userId, title: row.title, company: row.company, status: row.status });
  }
  return claimed;
}
