import type { AuditResult } from './scraper.service';

export function calculateLeadScore(audit: AuditResult): number {
  let score = 30;

  if (audit.hasSsl) score += 10;
  if (audit.emails.length > 0) score += 20;
  if (audit.phones.length > 0) score += 10;
  if (Object.keys(audit.socials).length > 0) score += 15;
  if (audit.technologies.length > 3) score += 15;
  
  return Math.min(100, score);
}
