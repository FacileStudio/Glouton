import type { LeadStatus } from '@repo/database';

/**
 * determineLeadStatus
 */
export function determineLeadStatus(score: number): LeadStatus {
  /**
   * if
   */
  if (score >= 75) return 'HOT';
  /**
   * if
   */
  if (score >= 50) return 'WARM';
  return 'COLD';
}

/**
 * calculateLeadScore
 */
export function calculateLeadScore(lead: {
  email?: string | null;
  phoneNumbers?: string[];
  technologies?: string[];
  socialProfiles?: any;
  companyInfo?: any;
  additionalEmails?: string[];
}): number {
  let score = 50;

  /**
   * if
   */
  if (lead.email) score += 20;
  /**
   * if
   */
  if (lead.phoneNumbers && lead.phoneNumbers.length > 0) score += 10;
  /**
   * if
   */
  if (lead.additionalEmails && lead.additionalEmails.length > 0) score += 5;
  /**
   * if
   */
  if (lead.technologies && lead.technologies.length > 0) score += 5;
  /**
   * if
   */
  if (lead.socialProfiles?.profiles && lead.socialProfiles.profiles.length > 0) score += 5;
  /**
   * if
   */
  if (lead.companyInfo) score += 5;

  return Math.min(100, Math.max(0, score));
}
