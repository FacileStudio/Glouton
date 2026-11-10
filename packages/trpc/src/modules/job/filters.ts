/** Contract types a job search filters on, whatever the trade or the country. */
export const JOB_CONTRACTS = ['permanent', 'fixed_term', 'freelance', 'part_time', 'internship', 'apprenticeship'] as const;
export type JobContract = (typeof JOB_CONTRACTS)[number];

/** What a job search looks for. Every field is optional except the role or at least one skill. */
export interface JobFilters {
  role: string;
  skills: string[];
  location: string | null;
  remote: boolean;
  contracts: JobContract[];
  salaryMin: number | null;
}

/** A posting before it is stored: from a job board, or from a web search result. */
export interface Posting {
  source: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  contractText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryText: string | null;
  description: string;
  skills: string[];
  postedAt: Date | null;
}

/** What the filters made of a posting. */
export interface Match {
  keep: boolean;
  score: number;
  contract: JobContract | null;
}

const CONTRACT_PATTERNS: ReadonlyArray<[JobContract, RegExp]> = [
  ['internship', /\b(stage|stagiaire|intern|internship|praktikum|practicas)\b/],
  ['apprenticeship', /\b(alternance|alternant|apprenti|apprentissage|apprentice|apprenticeship|ausbildung|work study)\b/],
  ['fixed_term', /\b(cdd|fixed term|temporary|temporaire|interim|befristet|temporal)\b/],
  ['freelance', /\b(freelance|freelancer|contract|contractor|independant|auto entrepreneur)\b/],
  ['part_time', /\b(part time|temps partiel|teilzeit|media jornada|mi temps)\b/],
  ['permanent', /\b(cdi|permanent|full time|temps plein|vollzeit|unbefristet|indefinido|jornada completa)\b/],
];

const REMOTE = /\b(remote|teletravail|full remote|a distance|homeoffice|home office|remoto|anywhere)\b/;

const STOPWORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'au', 'aux', 'pour', 'sur',
  'the', 'of', 'and', 'for', 'in', 'an', 'to', 'at', 'with',
  'el', 'los', 'las', 'del', 'y', 'con', 'por',
  'der', 'die', 'das', 'und', 'fur', 'mit', 'im',
  'h', 'f', 'm', 'w', 'x', 'd', 'hf', 'fh', 'mw', 'mwd',
]);

/** A posting this many points or more scores counts as a strong match. */
export const STRONG_SCORE = 60;

/** Lower case, no accents, words separated by single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The words of a text that carry meaning, for matching. */
export function tokens(text: string): string[] {
  return Array.from(new Set(normalize(text).split(' ').filter((word) => word.length > 1 && !STOPWORDS.has(word))));
}

function stem(word: string): string {
  return word.length <= 5 ? word : word.slice(0, Math.max(5, word.length - 2));
}

/** True when one of the words starts like the token, so plurals and gendered forms still match. */
function hasToken(words: string[], token: string): boolean {
  const root = stem(token);
  return words.some((word) => word === token || word.startsWith(root));
}

/** Every contract a free-text contract or posting text mentions, most specific first. */
export function contractsOf(text: string | null | undefined): JobContract[] {
  if (!text) return [];
  const clean = ` ${normalize(text)} `;
  return CONTRACT_PATTERNS.filter(([, pattern]) => pattern.test(clean)).map(([contract]) => contract);
}

/** True when the text says the job can be done remotely. */
export function mentionsRemote(text: string): boolean {
  return REMOTE.test(` ${normalize(text)} `);
}

function roleScore(role: string[], title: string[], body: string[]): number | null {
  if (role.length === 0) return 0;
  const inTitle = role.filter((token) => hasToken(title, token)).length;
  if (inTitle === role.length) return 50;
  const everywhere = role.every((token) => hasToken(title, token) || hasToken(body, token));
  if (inTitle * 2 >= role.length && everywhere) return 30;
  return null;
}

function salaryTooLow(posting: Posting, salaryMin: number | null): boolean {
  if (!salaryMin) return false;
  const best = posting.salaryMax ?? posting.salaryMin;
  if (best === null || best < 1000) return false;
  return best < salaryMin;
}

/**
 * Applies a search's filters to one posting. The role must be in the title
 * (all its words, or half of them with the rest in the text); with no role,
 * one skill must appear. A location keeps postings in that place, plus
 * remote ones when remote is on; remote alone keeps remote postings only.
 * Contracts and the salary floor only drop postings that state something
 * else: an unknown contract or salary stays. The score ranks what stays.
 */
export function matchOffer(posting: Posting, filters: JobFilters): Match {
  const title = tokens(posting.title);
  const text = `${posting.description} ${posting.skills.join(' ')}`;
  const body = tokens(text);
  const contracts = contractsOf(`${posting.contractText ?? ''} ${posting.title}`);
  const contract = contracts[0] ?? null;
  const refuse = { keep: false, score: 0, contract };

  const role = roleScore(tokens(filters.role), title, body);
  if (role === null) return refuse;
  const skillHits = filters.skills.filter((skill) => tokens(skill).every((token) => hasToken(title, token) || hasToken(body, token))).length;
  if (filters.role.trim() === '' && filters.skills.length > 0 && skillHits === 0) return refuse;

  const remote = posting.remote || mentionsRemote(`${posting.title} ${posting.location ?? ''}`);
  const place = tokens(filters.location ?? '');
  const where = tokens(`${posting.location ?? posting.description} ${posting.title}`);
  const inPlace = place.length > 0 && place.some((token) => hasToken(where, token));
  if (place.length > 0 && !inPlace && !(filters.remote && remote)) return refuse;
  if (place.length === 0 && filters.remote && !remote) return refuse;

  const contractOk = filters.contracts.length === 0 || contracts.length === 0 || contracts.some((entry) => filters.contracts.includes(entry));
  if (!contractOk || salaryTooLow(posting, filters.salaryMin)) return refuse;

  const score =
    role +
    Math.min(skillHits, 3) * 8 +
    (inPlace ? 12 : 0) +
    (filters.remote && remote ? 6 : 0) +
    (filters.contracts.length > 0 && contracts.length > 0 ? 8 : 0);
  return { keep: true, score: Math.min(100, score), contract };
}

/** The address an offer is known by: no fragment and no tracking parameters. */
export function offerKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  parsed.hash = '';
  for (const name of Array.from(parsed.searchParams.keys())) {
    if (/^(utm_|ref$|source$|fbclid$|gclid$)/i.test(name)) parsed.searchParams.delete(name);
  }
  return parsed.toString();
}

const BOARD_HOSTS = /(indeed|linkedin|welcometothejungle|hellowork|apec|francetravail|pole-emploi|monster|glassdoor|jobteaser|meteojob|cadremploi|regionsjob|stepstone|infojobs|xing|jobijoba|talent)\./;

/** The web search queries of a job search: the role in the place, the role on career pages, and remote. */
export function webQueries(filters: JobFilters): string[] {
  const what = filters.role.trim() || filters.skills.slice(0, 2).join(' ');
  if (!what) return [];
  const where = filters.location?.trim() ?? '';
  const queries = [`"${what}" ${where} offre d'emploi`.replace(/\s+/g, ' ').trim(), `"${what}" ${where} job careers`.replace(/\s+/g, ' ').trim()];
  if (filters.remote) queries.push(`"${what}" remote job`);
  return queries;
}

/**
 * A web search result read as a posting: its title, snippet and page. The
 * company is the site's name, except on job boards where it is unknown.
 * Search pages and site homepages are skipped.
 */
export function webPosting(result: { title: string; snippet: string; url: string }): Posting | null {
  const url = offerKey(result.url);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.pathname === '/' || /\/(search|recherche|jobs\/?$|emploi\/?$)/i.test(parsed.pathname)) return null;
  const host = parsed.hostname.replace(/^www\./, '');
  const company = BOARD_HOSTS.test(`${host}.`) ? null : host.split('.').slice(-2, -1)[0] ?? null;
  const text = `${result.title} ${result.snippet}`;
  return {
    source: 'web',
    url,
    title: result.title.split(/\s[|–]\s/)[0]!.trim().slice(0, 300),
    company,
    location: null,
    remote: mentionsRemote(text),
    contractText: text,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryText: null,
    description: result.snippet.slice(0, 2000),
    skills: [],
    postedAt: null,
  };
}
