import { z } from 'zod';
import { dataBlock, draftSchema, strictParse, type BattlecardDraft } from './prompt';
import { untrustedRule } from './untrusted';

const text = (max: number) => z.string().trim().min(1).max(max);

const patchSchema = draftSchema.partial();

const recommendationSchema = z
  .object({
    what_changed: text(600),
    meaning: text(800),
    options: z
      .array(z.object({ title: text(120), action: text(400), trade_off: text(400) }).strict())
      .min(2)
      .max(3),
    talking_points: z.array(text(300)).min(1).max(6),
    battlecard_patch: patchSchema,
  })
  .strict();

/** What Bulle advises after a competitor's prices moved. The battlecard patch is a proposal; nothing is written. */
export interface Recommendation {
  whatChanged: string;
  meaning: string;
  options: Array<{ title: string; action: string; tradeOff: string }>;
  talkingPoints: string[];
  battlecardPatch: Partial<BattlecardDraft>;
}

export const RECOMMEND_ORIGIN = "a competitor's website, or numbers an AI read from it";

export const RECOMMEND_RULES = [
  'In Glouton you advise a small sales team after a competitor changed its prices.',
  'Use only the facts given: the competitor prices and price events, the page excerpts, "Our offer", "Our prices" and "Win and loss record".',
  'Never invent a price, a plan or a client. When a fact is missing, say it is unknown.',
  'Answer with strict JSON only:',
  '{"what_changed": string, "meaning": string,',
  '"options": [{"title": string, "action": string, "trade_off": string}],',
  '"talking_points": string[],',
  '"battlecard_patch": {"overview"?: string|null, "whyWeWin"?: string[], "whyWeLose"?: string[],',
  '"objections"?: [{"objection": string, "response": string, "proof": string}], "landmines"?: string[], "pricing"?: string|null, "proofPoints"?: string[]}}.',
  '"what_changed" is one or two sentences with the plans and the amounts. "meaning" is what it changes for us in a sale.',
  '"options" has two or three different responses, each with its trade-off (what we give up or risk).',
  '"talking_points" are short lines a salesperson can reuse in an email to a prospect who compares us with this competitor.',
  '"battlecard_patch" holds only the battlecard fields worth changing. A list you include replaces the current list, so give the whole list, at most 6 items.',
  'Use {} when the battlecard needs no change.',
].join('\n');

export interface PriceLine {
  name: string;
  price: number | null;
  currency: string | null;
  unit: string | null;
  period: string | null;
}

export interface EventLine {
  kind: string;
  plan: string;
  oldPrice: number | null;
  newPrice: number | null;
  percent: number | null;
  currency: string | null;
  at: string;
}

export interface RecommendFacts {
  competitor: { name: string; website: string | null };
  current: { at: string; prices: PriceLine[] };
  previous: { at: string; prices: PriceLine[] } | null;
  events: EventLine[];
  own: { offer: string | null; pricing: string | null };
  record: { won: number; lost: number; lossReasons: Record<string, number> };
  battlecard: Partial<BattlecardDraft>;
  pages: Array<{ url: string; text: string }>;
}

function money(line: { price: number | null; currency: string | null }): string {
  return line.price === null ? 'on quote' : `${line.price} ${line.currency ?? ''}`.trim();
}

function priceText(prices: PriceLine[]): string {
  if (prices.length === 0) return 'No prices.';
  return prices.map((line) => [line.name, money(line), line.unit, line.period].filter(Boolean).join(' | ')).join('\n');
}

function eventText(events: EventLine[]): string {
  if (events.length === 0) return 'No price event recorded.';
  return events
    .map((event) => {
      const move = event.oldPrice !== null || event.newPrice !== null ? ` ${event.oldPrice ?? '?'} -> ${event.newPrice ?? '?'}${event.percent === null ? '' : ` (${event.percent}%)`}` : '';
      return `${event.at.slice(0, 10)} ${event.kind} ${event.plan}${move}`;
    })
    .join('\n');
}

function recordText(record: RecommendFacts['record']): string {
  const list = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([reason, count]) => `${reason}: ${count}`)
      .join(', ') || 'none';
  return [
    `Won against them: ${record.won}. Lost to them: ${record.lost}.`,
    `Why we lost: ${list(record.lossReasons)}.`,
  ].join('\n');
}

/**
 * The material for a recommendation. Everything that came from the
 * competitor's site, the prices read from it included, sits in a data
 * block; the space's own offer and record are plain context.
 */
export function recommendInput(facts: RecommendFacts): string {
  const name = facts.competitor.name;
  return [
    `# Competitor\nName: ${name}${facts.competitor.website ? `\nWebsite: ${facts.competitor.website}` : ''}`,
    `# Current prices (${facts.current.at.slice(0, 10)})\n${dataBlock('current prices', priceText(facts.current.prices), 6000)}`,
    `# Previous prices${facts.previous ? ` (${facts.previous.at.slice(0, 10)})` : ''}\n${facts.previous ? dataBlock('previous prices', priceText(facts.previous.prices), 6000) : 'None recorded.'}`,
    `# Price events\n${dataBlock('price events', eventText(facts.events), 4000)}`,
    `# Our offer\n${facts.own.offer || 'Not described.'}`,
    `# Our prices\n${facts.own.pricing || 'Not described.'}`,
    `# Win and loss record\n${recordText(facts.record)}`,
    `# Current battlecard\n${dataBlock('current battlecard', JSON.stringify(facts.battlecard), 8000)}`,
    '# Competitor pages',
    ...facts.pages.map((page) => dataBlock(page.url, page.text, 4000)),
  ].join('\n\n');
}

export const recommendSystemRule = untrustedRule(RECOMMEND_ORIGIN);

/** Reads a recommendation, or throws AiOutputError when any part breaks the schema. */
export function parseRecommendation(raw: string): Recommendation {
  const parsed = strictParse(raw, recommendationSchema);
  return {
    whatChanged: parsed.what_changed,
    meaning: parsed.meaning,
    options: parsed.options.map((option) => ({ title: option.title, action: option.action, tradeOff: option.trade_off })),
    talkingPoints: parsed.talking_points,
    battlecardPatch: parsed.battlecard_patch,
  };
}
