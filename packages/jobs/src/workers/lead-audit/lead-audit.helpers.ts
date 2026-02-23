import { prisma } from '@repo/database';
import { calculateLeadScore } from '../../services/scoring.utils';
import { verifyEmail } from '../../services/email-verifier';
import type { Lead, ProcessResult } from './lead-audit.types';
import type { AuditResult } from '../../services/scraper.service';

export class LeadAuditHelpers {
  async fetchLeads(userId: string, teamId?: string | null): Promise<Lead[]> {
    const whereClause: any = {
      domain: { not: null },
    };

    if (teamId) {
      whereClause.teamId = teamId;
    } else {
      whereClause.userId = userId;
      whereClause.teamId = null;
    }

    return prisma.lead.findMany({
      where: whereClause,
      select: {
        id: true,
        domain: true,
        email: true,
        additionalEmails: true,
      },
    }) as Promise<Lead[]>;
  }

  async updateLeadWithAudit(lead: Lead, auditData: AuditResult): Promise<void> {
    const primaryEmail = lead.email || auditData.emails?.[0] || null;
    const existingExtras = Array.isArray(lead.additionalEmails) ? lead.additionalEmails : [];
    const discoveredEmails = Array.isArray(auditData.emails) ? auditData.emails : [];
    const newExtras = discoveredEmails.filter((e: string) => e !== primaryEmail);
    const mergedExtras = Array.from(new Set([...existingExtras, ...newExtras]));
    const calculatedScore = calculateLeadScore(auditData);

    const now = new Date();
    const updateData: any = {
      websiteAudit: auditData as any,
      email: primaryEmail,
      additionalEmails: mergedExtras,
      score: calculatedScore,
      auditedAt: now,
      updatedAt: now,
    };

    if (primaryEmail && !lead.email) {
      console.log(`[LeadAudit] New email discovered: ${primaryEmail}, verifying...`);
      try {
        const verification = await verifyEmail(primaryEmail);
        updateData.emailVerified = verification.valid;
        updateData.emailVerifiedAt = verification.checkedAt;
        updateData.emailVerificationMethod = verification.reason;
        console.log(`[LeadAudit] Email verification result: ${verification.reason} (valid: ${verification.valid})`);
      } catch (error) {
        console.error(`[LeadAudit] Email verification failed for ${primaryEmail}:`, error);
      }
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: updateData,
    });
  }

  categorizeResult(result: PromiseSettledResult<ProcessResult>): 'success' | 'failed' {
    if (result.status === 'fulfilled' && result.value.success) {
      return 'success';
    }

    if (result.status === 'fulfilled' && !result.value.success) {
      if (result.value.error) {
        console.error(
          `[LeadAudit] Lead audit failed for ${result.value.lead.domain}: ${result.value.error.message}`
        );
      }
      return 'failed';
    }

    if (result.status === 'rejected') {
      console.error('[LeadAudit] Unexpected batch processing error:', result.reason);
      return 'failed';
    }

    return 'failed';
  }
}
