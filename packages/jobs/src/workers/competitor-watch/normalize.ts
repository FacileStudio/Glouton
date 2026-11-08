import { createHash } from 'node:crypto';

/** The longest normalized text kept for one page, so a snapshot stays bounded. */
export const MAX_TEXT_LENGTH = 100_000;

const MONTHS =
  'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|' +
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'janv|févr|fevr|avr|juil|sept|oct|nov|déc|dec|jan|feb|mar|apr|jun|jul|aug|sep';

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|_ga|_gl|yclid|igshid|ref|ref_src|spm|sessionid|sid|phpsessid|jsessionid)$/i;

const COOKIE_LINE =
  /\b(cookies?|consentement|consent|rgpd|gdpr|traceurs|tout accepter|tout refuser|accept all|reject all|manage preferences|gérer mes préférences|paramétrer les cookies)\b/i;

const RULES: ReadonlyArray<[RegExp, string]> = [
  [/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, '<date>'],
  [/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '<date>'],
  [new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\.?(?:\\s+\\d{4})?\\b`, 'giu'), '<date>'],
  [new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?(?:\\s+\\d{4})?\\b`, 'giu'), '<date>'],
  [/\b\d{1,2}[:h]\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\b/gi, '<time>'],
  [/\b(?:il y a|hace|vor)\s+\d+\s+[^\s\d]+/gi, '<ago>'],
  [/\b\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/gi, '<ago>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<token>'],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, '<token>'],
];

/** Drops tracking and session parameters from one absolute URL; anything unparsable is returned as is. */
export function stripTracking(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.toString();
}

/** Replaces markdown links and images by their visible text, and cleans the bare URLs left in the text. */
function stripMarkup(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]{1,500}>/g, ' ')
    .replace(/https?:\/\/[^\s)"'<>]+/g, stripTracking);
}

/** Normalizes one line: volatile values replaced by placeholders, whitespace collapsed. */
function normalizeLine(line: string): string {
  let text = line;
  for (const [pattern, placeholder] of RULES) text = text.replace(pattern, placeholder);
  return text.replace(/[*_`#>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Turns fetched page markdown into stable text for comparison: markup, dates,
 * times, relative ages, tokens, tracking parameters and short cookie banner
 * lines are removed, whitespace is collapsed, and empty lines are dropped.
 */
export function normalizeText(markdown: string): string {
  const lines = stripMarkup(markdown.normalize('NFC'))
    .split(/\r?\n/)
    .filter((line) => !(line.length < 300 && COOKIE_LINE.test(line)))
    .map(normalizeLine)
    .filter((line) => line.length > 0 && !/^<(date|time|ago|token)>$/.test(line));
  return lines.join('\n').slice(0, MAX_TEXT_LENGTH);
}

/** The sha256 hex digest of a normalized text. */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
