import { SQL, sql } from 'bun';
import { SMTPService, renderTemplate, type EmailTemplate } from '@repo/smtp';

export class EmailService {
  /**
   * constructor
   */
  constructor(
    private db: SQL,
    private smtp: SMTPService,
  ) {}

  /**
   * sendEmail
   */
  async sendEmail(params: {
    leadId: string;
    userId: string;
    templateId: string;
    variables: Record<string, string>;
  }) {
    const [lead] = await this.db`
      SELECT id, email
      FROM "Lead"
      WHERE id = ${params.leadId}
    ` as Promise<any[]>;

    /**
     * if
     */
    if (!lead || !lead.email) {
      throw new Error('Lead not found or has no email');
    }

    const rendered = renderTemplate(params.templateId, params.variables);
    /**
     * if
     */
    if (!rendered) {
      throw new Error('Template not found');
    }

    const [outreach] = await this.db`
      INSERT INTO "EmailOutreach" (
        id, "leadId", "userId", "templateId", subject, "htmlBody", "textBody", variables, status, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${params.leadId},
        ${params.userId},
        ${params.templateId},
        ${rendered.subject},
        ${rendered.html},
        ${rendered.text},
        ${JSON.stringify(params.variables)}::jsonb,
        'PENDING',
        ${new Date()},
        ${new Date()}
      )
      RETURNING id
    ` as Promise<any[]>;

    try {
      await this.smtp.sendEmail({
        to: lead.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await this.db`
        UPDATE "EmailOutreach"
        SET status = 'SENT',
            "sentAt" = ${new Date()}
        WHERE id = ${outreach.id}
      `;

      await this.db`
        UPDATE "Lead"
        SET contacted = TRUE,
            "lastContactedAt" = ${new Date()},
            "emailsSentCount" = "emailsSentCount" + 1
        WHERE id = ${params.leadId}
      `;

      return { success: true, outreachId: outreach.id };
    } catch (error) {
      await this.db`
        UPDATE "EmailOutreach"
        SET status = 'FAILED',
            error = ${error instanceof Error ? error.message : 'Unknown error'}
        WHERE id = ${outreach.id}
      `;

      throw error;
    }
  }

  /**
   * getLeadOutreach
   */
  async getLeadOutreach(leadId: string, userId: string) {
    return this.db`
      SELECT id, "leadId", "userId", "templateId", subject, "htmlBody", "textBody", variables, status, "createdAt", "sentAt"
      FROM "EmailOutreach"
      WHERE "leadId" = ${leadId} AND "userId" = ${userId}
      ORDER BY "createdAt" DESC
    ` as Promise<any[]>;
  }

  /**
   * getOutreachStats
   */
  async getOutreachStats(userId: string) {
    const FOLLOW_UP_DAYS = 5;

    const [totalRows, sentRows, openedRows, repliedRows] = await Promise.all([
      this.db`SELECT COUNT(*)::int as count FROM "EmailOutreach" WHERE "userId" = ${userId}` as Promise<[{count: number}]>,
      this.db`SELECT COUNT(*)::int as count FROM "EmailOutreach" WHERE "userId" = ${userId} AND status = 'SENT'` as Promise<[{count: number}]>,
      this.db`SELECT COUNT(*)::int as count FROM "EmailOutreach" WHERE "userId" = ${userId} AND status = 'OPENED'` as Promise<[{count: number}]>,
      this.db`SELECT COUNT(*)::int as count FROM "EmailOutreach" WHERE "userId" = ${userId} AND status = 'REPLIED'` as Promise<[{count: number}]>,
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    const sent = Number(sentRows[0]?.count ?? 0);
    const opened = Number(openedRows[0]?.count ?? 0);
    const replied = Number(repliedRows[0]?.count ?? 0);

    const contactedLeads = Number((await this.db`
      SELECT COUNT(*)::int as count
      FROM "Lead"
      WHERE "userId" = ${userId} AND contacted = TRUE
    ` as Promise<[{count: number}]>)[0]?.count ?? 0);

    const needsFollowUp = Number((await this.db`
      SELECT COUNT(DISTINCT latest."leadId")::int as count
      FROM (
        SELECT DISTINCT ON ("leadId") "leadId", status, "sentAt", "createdAt"
        FROM "EmailOutreach"
        WHERE "userId" = ${userId}
        ORDER BY "leadId", "createdAt" DESC
      ) latest
      WHERE latest.status NOT IN ('REPLIED', 'BOUNCED', 'FAILED')
        AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 >= ${FOLLOW_UP_DAYS}
    ` as Promise<[{count: number}]>)[0]?.count ?? 0);

    return {
      totalEmails: total,
      sentEmails: sent,
      openedEmails: opened,
      repliedEmails: replied,
      contactedLeads,
      needsFollowUp,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  }

  /**
   * getAllOutreach
   */
  async getAllOutreach(userId: string) {
    const FOLLOW_UP_DAYS = 5;

    const rows = await this.db`
      SELECT
        l.id as "leadId",
        l."firstName",
        l."lastName",
        l.domain,
        l."businessName",
        l.email,
        l.score,
        l.status,
        l."emailsSentCount",
        l."lastContactedAt",
        latest.id as "lastEmailId",
        latest.subject as "lastEmailSubject",
        latest.status as "lastEmailStatus",
        latest."sentAt" as "lastEmailSentAt",
        latest."createdAt" as "lastEmailCreatedAt",
        EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 as "daysSinceLastContact",
        CASE
          WHEN latest.status NOT IN ('REPLIED', 'BOUNCED', 'FAILED')
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 >= ${FOLLOW_UP_DAYS}
          THEN true
          ELSE false
        END as "needsFollowUp"
      FROM "Lead" l
      INNER JOIN (
        SELECT DISTINCT ON ("leadId") id, "leadId", subject, status, "sentAt", "createdAt"
        FROM "EmailOutreach"
        WHERE "userId" = ${userId}
        ORDER BY "leadId", "createdAt" DESC
      ) latest ON latest."leadId" = l.id
      WHERE l."userId" = ${userId}
      ORDER BY
        CASE
          WHEN latest.status NOT IN ('REPLIED', 'BOUNCED', 'FAILED')
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 >= ${FOLLOW_UP_DAYS}
          THEN 0
          WHEN latest.status = 'OPENED'
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 < ${FOLLOW_UP_DAYS}
          THEN 1
          WHEN latest.status = 'SENT'
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 < ${FOLLOW_UP_DAYS}
          THEN 2
          WHEN latest.status = 'REPLIED' THEN 3
          ELSE 4
        END ASC,
        CASE l.status WHEN 'HOT' THEN 0 WHEN 'WARM' THEN 1 ELSE 2 END ASC,
        l.score DESC
    ` as Promise<any[]>;

    return rows;
  }
}
