export interface LeadAuditJobData {
  auditSessionId: string;
  userId: string;
  teamId?: string | null;
}

export interface Lead {
  id: string;
  domain: string;
  email: string | null;
  additionalEmails: string[];
}

export interface ProcessResult {
  success: boolean;
  lead: Lead;
  auditData?: any;
  error?: Error;
}

export interface AuditStats {
  processedCount: number;
  updatedLeads: number;
  failedLeads: number;
}
