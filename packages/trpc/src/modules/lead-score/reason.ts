export const FACTORS = ['target', 'area', 'audit', 'reach', 'activity', 'history', 'size'] as const;
export type Factor = (typeof FACTORS)[number];

/** The most each factor adds; they sum to 100. */
export const WEIGHTS: Record<Factor, number> = { target: 25, area: 5, audit: 20, reach: 15, activity: 15, history: 15, size: 5 };

/** One line of the score: a factor, what it gave out of its weight, a stable code for the web app to label, and raw detail. */
export interface FitReason {
  factor: Factor;
  code: string;
  points: number;
  max: number;
  detail: string | null;
}

export interface FitScore {
  score: number;
  reasons: FitReason[];
}

export function reason(factor: Factor, code: string, points: number, detail: string | null = null): FitReason {
  return { factor, code, points: Math.max(0, Math.min(WEIGHTS[factor], Math.round(points))), max: WEIGHTS[factor], detail };
}
