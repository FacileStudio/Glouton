import type { AuditResult } from './scraper.service';

export interface ScoreWeights {
  baseScore: number;
  sslScore: number;
  emailScore: number;
  phoneScore: number;
  socialScore: number;
  technologyScore: number;
  multiEmailBonus: number;
  multiSocialBonus: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  baseScore: 30,
  sslScore: 10,
  emailScore: 20,
  phoneScore: 10,
  socialScore: 15,
  technologyScore: 15,
  multiEmailBonus: 5,
  multiSocialBonus: 5,
};

export function calculateLeadScore(
  audit: AuditResult,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS
): number {
  let score = weights.baseScore;

  if (audit.hasSsl) score += weights.sslScore;

  if (audit.emails.length > 0) {
    score += weights.emailScore;
    if (audit.emails.length > 2) score += weights.multiEmailBonus;
  }

  if (audit.phones.length > 0) score += weights.phoneScore;

  const socialCount = Object.keys(audit.socials).length;
  if (socialCount > 0) {
    score += weights.socialScore;
    if (socialCount >= 3) score += weights.multiSocialBonus;
  }

  if (audit.technologies.length > 3) score += weights.technologyScore;

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getScoreBreakdown(audit: AuditResult): Record<string, boolean> {
  return {
    hasSsl: audit.hasSsl,
    hasEmails: audit.emails.length > 0,
    hasMultipleEmails: audit.emails.length > 2,
    hasPhones: audit.phones.length > 0,
    hasSocials: Object.keys(audit.socials).length > 0,
    hasMultipleSocials: Object.keys(audit.socials).length >= 3,
    hasAdvancedTech: audit.technologies.length > 3,
  };
}
