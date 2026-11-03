import type { PrismaClient } from '@prisma/client';
import type { CourrierAccount, CourrierClient } from '@repo/courrier';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { checkTeamMembership, checkTeamPermission, TeamRole } from '../team/permissions';
import { courrierFailure } from './transport';

export type MailTransportChoice = 'COURRIER' | 'SMTP';

export const setMailTransportSchema = z.object({
  teamId: z.string().uuid().optional(),
  transport: z.enum(['COURRIER', 'SMTP']),
  courrierAccountId: z.number().int().positive().nullable().optional(),
});

export interface MailTransportView {
  courrierEnabled: boolean;
  transport: MailTransportChoice | null;
  courrierAccountId: number | null;
}

const settingSelect = { mailTransport: true, courrierAccountId: true } as const;

function view(courrier: CourrierClient | null, row: { mailTransport: string | null; courrierAccountId: number | null } | null): MailTransportView {
  const transport = row?.mailTransport === 'COURRIER' || row?.mailTransport === 'SMTP' ? row.mailTransport : null;
  return { courrierEnabled: Boolean(courrier), transport, courrierAccountId: row?.courrierAccountId ?? null };
}

/** The saved transport for the user, or for a team the user belongs to. */
export async function getMailTransport(
  prisma: PrismaClient,
  courrier: CourrierClient | null,
  userId: string,
  teamId?: string
): Promise<MailTransportView> {
  if (teamId) {
    await checkTeamMembership(userId, teamId);
    return view(courrier, await prisma.team.findUnique({ where: { id: teamId }, select: settingSelect }));
  }
  return view(courrier, await prisma.user.findUnique({ where: { id: userId }, select: settingSelect }));
}

function requireCourrier(courrier: CourrierClient | null): CourrierClient {
  if (!courrier) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Courrier is not configured on this Glouton' });
  }
  return courrier;
}

async function teamSpace(prisma: PrismaClient, teamId: string): Promise<string | null> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { registreSpaceId: true } });
  return team?.registreSpaceId ?? null;
}

/** The Courrier accounts the user may send from; for a team, those of the team's Registre space. */
export async function listCourrierAccounts(
  prisma: PrismaClient,
  courrier: CourrierClient | null,
  userId: string,
  teamId?: string
): Promise<CourrierAccount[]> {
  const client = requireCourrier(courrier);
  if (teamId) await checkTeamMembership(userId, teamId);
  const spaceId = teamId ? await teamSpace(prisma, teamId) : null;
  return client.listAccounts(userId, spaceId).catch(courrierFailure);
}

/**
 * Saves the transport for the user or, for a team admin, for the team. A
 * Courrier choice must name an account Courrier lists for that caller.
 */
export async function setMailTransport(
  prisma: PrismaClient,
  courrier: CourrierClient | null,
  userId: string,
  input: z.infer<typeof setMailTransportSchema>
): Promise<MailTransportView> {
  if (input.teamId) await checkTeamPermission(userId, input.teamId, TeamRole.ADMIN);
  let courrierAccountId: number | null = null;
  if (input.transport === 'COURRIER') {
    if (input.courrierAccountId == null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick a Courrier account' });
    }
    const accounts = await listCourrierAccounts(prisma, courrier, userId, input.teamId);
    if (!accounts.some((a) => a.id === input.courrierAccountId)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This Courrier account is not available to you' });
    }
    courrierAccountId = input.courrierAccountId;
  }
  const data = { mailTransport: input.transport, courrierAccountId };
  const row = input.teamId
    ? await prisma.team.update({ where: { id: input.teamId }, data, select: settingSelect })
    : await prisma.user.update({ where: { id: userId }, data, select: settingSelect });
  return view(courrier, row);
}
