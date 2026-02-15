export enum AuditStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface AuditSession {
  id: string;
  userId: string;
  jobId: string | null;
  leadId: string | null;
  status: AuditStatus;
  progress: number;
  totalLeads: number;
  processedLeads: number;
  updatedLeads: number;
  failedLeads: number;
  currentDomain: string | null;
  lastProcessedIndex: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditSessionCreate = Omit<AuditSession, 'id' | 'createdAt' | 'updatedAt'>;
export type AuditSessionUpdate = Partial<AuditSessionCreate>;
