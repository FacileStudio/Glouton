import { z } from 'zod';
import { dataBlock, strictParse } from '../competitor-ai/prompt';
import { untrustedRule } from '../competitor-ai/untrusted';
import type { FitReason } from './rules';

const explanationSchema = z
  .object({
    explanation: z.string().trim().min(1).max(600),
    next_step: z.string().trim().min(1).max(300),
  })
  .strict();

/** Bulle's reading of one scored lead: two sentences on why it ranks where it does, and one action. */
export interface LeadExplanation {
  explanation: string;
  nextStep: string;
}

export const EXPLAIN_ORIGIN = "a prospect's website, the web, or notes and activity logged about the prospect";

export const EXPLAIN_RULES = [
  'In Glouton you help a salesperson decide what to do with one prospect. The fit score was computed from rules; you do not change it.',
  'Use only the score, its reasons and the data block. Never invent a fact about the prospect.',
  'Answer with strict JSON only: {"explanation": string, "next_step": string}.',
  '"explanation" is exactly two short sentences: why this prospect ranks where it does, naming the strongest reasons.',
  '"next_step" is one concrete action for this week, in one sentence.',
].join('\n');

export const explainSystemRule = untrustedRule(EXPLAIN_ORIGIN);

/** What the explanation reads about a lead. Everything scraped or typed by anyone but the system goes in `facts`. */
export interface ExplainFacts {
  score: number;
  reasons: FitReason[];
  facts: Array<{ label: string; value: string | null | undefined }>;
  notes: string[];
}

/**
 * The material for an explanation: the score and its reasons as plain
 * lines, then every fact about the lead (name, category, scraped audit
 * text, notes, activity) in one data block.
 */
export function explainInput(input: ExplainFacts): string {
  const reasons = input.reasons.map((entry) => `- ${entry.factor}: ${entry.code}${entry.detail ? ` (${entry.detail})` : ''}, ${entry.points}/${entry.max}`);
  const facts = input.facts
    .filter((fact) => fact.value && fact.value.trim())
    .map((fact) => `${fact.label}: ${fact.value!.trim()}`)
    .concat(input.notes.map((note) => `Note: ${note}`));
  return [`# Fit score\n${input.score}/100`, `# Reasons\n${reasons.join('\n')}`, `# Prospect\n${dataBlock('prospect', facts.join('\n') || 'No details.', 6000)}`].join('\n\n');
}

/** Reads Bulle's answer, or throws AiOutputError when it is not exactly the two fields. */
export function parseExplanation(raw: string): LeadExplanation {
  const parsed = strictParse(raw, explanationSchema);
  return { explanation: parsed.explanation, nextStep: parsed.next_step };
}
