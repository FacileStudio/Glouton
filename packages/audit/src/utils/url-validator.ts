const BLOCKED_HOSTNAMES = new Set(['localhost']);

const PRIVATE_IP_RANGES = [
  { start: 0x7f000000, end: 0x7fffffff },
  { start: 0x0a000000, end: 0x0affffff },
  { start: 0xac100000, end: 0xac1fffff },
  { start: 0xc0a80000, end: 0xc0a8ffff },
  { start: 0xa9fe0000, end: 0xa9feffff },
  { start: 0x00000000, end: 0x00000000 },
];

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = Number.parseInt(part, 10);
    if (Number.isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0;
}

function isPrivateIp(hostname: string): boolean {
  const ip = ipToInt(hostname);
  if (ip === null) return false;

  for (const range of PRIVATE_IP_RANGES) {
    if (ip >= range.start && ip <= range.end) return true;
  }

  return false;
}

function isIpv6Loopback(hostname: string): boolean {
  const cleaned = hostname.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1';
}

export function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    if (BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (isPrivateIp(hostname)) return false;
    if (isIpv6Loopback(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

export function validateAndResolveUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (isSafeUrl(resolved.href)) {
      return resolved.href;
    }
    return null;
  } catch {
    return null;
  }
}
