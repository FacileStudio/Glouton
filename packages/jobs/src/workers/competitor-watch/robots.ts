/** The product token Glouton matches in robots.txt groups, besides `*`. */
export const ROBOT_TOKEN = 'glouton';

const MAX_ROBOTS_BYTES = 500_000;
const ROBOTS_TIMEOUT_MS = 10_000;

interface Rule {
  allow: boolean;
  pattern: string;
}

/** What one site's robots.txt says for Glouton: its path rules and crawl delay. */
export interface RobotsPolicy {
  rules: Rule[];
  crawlDelaySeconds: number | null;
  /** True when the file could not be read for a server reason: nothing may be fetched (RFC 9309, 2.3.1.4). */
  unreachable: boolean;
}

export const ALLOW_ALL: RobotsPolicy = { rules: [], crawlDelaySeconds: null, unreachable: false };
const DISALLOW_ALL: RobotsPolicy = { rules: [], crawlDelaySeconds: null, unreachable: true };

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelay: number | null;
}

/** Splits a robots.txt into its user-agent groups. */
function groupsOf(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }
  return groups;
}

/** Reads a robots.txt body: the groups naming Glouton win, else the `*` groups, else everything is allowed. */
export function parseRobots(text: string): RobotsPolicy {
  const groups = groupsOf(text);
  const named = groups.filter((group) => group.agents.some((agent) => agent === ROBOT_TOKEN));
  const chosen = named.length > 0 ? named : groups.filter((group) => group.agents.includes('*'));
  const delays = chosen.map((group) => group.crawlDelay).filter((delay): delay is number => delay !== null);
  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelaySeconds: delays.length > 0 ? Math.max(...delays) : null,
    unreachable: false,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Compiles one robots path pattern, with `*` as any run of characters and a final `$` as the end. */
function matcher(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Says whether a URL path (with its query) may be fetched: the longest
 * matching rule wins, and an allow beats a disallow of the same length.
 */
export function isAllowed(policy: RobotsPolicy, pathAndQuery: string): boolean {
  if (policy.unreachable) return false;
  if (pathAndQuery === '/robots.txt') return true;
  let best: Rule | null = null;
  for (const rule of policy.rules) {
    if (!matcher(rule.pattern).test(pathAndQuery)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/**
 * Fetches and parses `<origin>/robots.txt` without following redirects off
 * the site. A 4xx means no rules; a 5xx, a timeout or a network error means
 * the site is treated as fully disallowed for this run.
 */
export async function loadRobots(origin: string, fetcher: typeof fetch = fetch): Promise<RobotsPolicy> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT_MS);
  try {
    let url = `${origin}/robots.txt`;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': `${ROBOT_TOKEN}-watch/1.0` } });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) return ALLOW_ALL;
        const target = new URL(next, url);
        if (target.hostname !== new URL(origin).hostname) return ALLOW_ALL;
        url = target.toString();
        continue;
      }
      if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
      if (!res.ok) return DISALLOW_ALL;
      const body = (await res.text()).slice(0, MAX_ROBOTS_BYTES);
      return parseRobots(body);
    }
    return ALLOW_ALL;
  } catch {
    return DISALLOW_ALL;
  } finally {
    clearTimeout(timer);
  }
}
