import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

const CLEANUP_INTERVAL = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const store of stores.values()) {
      for (const [key, entry] of store) {
        if (now >= entry.resetAt) store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function rateLimiter(name: string, config: RateLimitConfig) {
  const store = getStore(name);
  startCleanup();

  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    const remaining = Math.max(0, config.maxRequests - entry.count);
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    c.res.headers.set('X-RateLimit-Limit', String(config.maxRequests));
    c.res.headers.set('X-RateLimit-Remaining', String(remaining));
    c.res.headers.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > config.maxRequests) {
      return c.json(
        { error: 'Too many requests, please try again later' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    await next();
  };
}

export const loginLimiter = rateLimiter('login', {
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

export const registerLimiter = rateLimiter('register', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
});
