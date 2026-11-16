export { rankLeads, explainLead, historyOf, targetsOf, RANKED_LEADS_MAX, type RankedLead } from './service';
export { auditGaps, employeeCount } from './audit';
export { scoreLead, categoryKey, WEIGHTS, FACTORS, type FitReason, type FitScore, type ScoreLead, type ScoreTargets, type CategoryHistory } from './rules';
export { explainInput, parseExplanation, EXPLAIN_RULES, type LeadExplanation } from './explain';
export { leadScoreRouter } from './router';
