import type { Prisma } from '@prisma/client';

export interface LeadExtractionData {
  huntSessionId: string;
  userId: string;
  sources: string[];
  companyName?: string;
  filters?: any;
}

export interface MappedLead {
  domain: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  phoneNumbers: string[];
  department: string | null;
  confidence: number | null;
  industry: string | null;
}

export interface SourceStats {
  leads: number;
  errors: number;
  rateLimited: boolean;
}

export interface ExtractionResult {
  totalLeads: number;
  successfulLeads: number;
  failedLeads: number;
  sourceStats: Record<string, SourceStats>;
}
