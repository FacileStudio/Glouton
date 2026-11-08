import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const IPV4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const IPV6_BLOCKS: Array<[string, number]> = [
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const INTERNAL_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home.arpa', '.localdomain'];

const blocked = new BlockList();
for (const [net, prefix] of IPV4_BLOCKS) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of IPV6_BLOCKS) blocked.addSubnet(net, prefix, 'ipv6');

/** True when an IP literal is loopback, private, link-local, CGNAT, ULA, multicast, reserved or documentation space. */
export function isInternalAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) return blocked.check(ip, 'ipv6');
  return true;
}

function isInternalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (isIP(host)) return isInternalAddress(host);
  if (!host.includes('.')) return true;
  return host === 'localhost' || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Parses a URL a user gave and refuses anything the backend must not reach:
 * non-http(s) schemes, credentials, single-label or internal names, and
 * internal IP literals. It does not resolve DNS; pair it with
 * `resolvePublicAddress` before connecting.
 */
export function checkPublicUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError('invalid url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('only http and https urls are allowed');
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('urls with credentials are not allowed');
  }
  if (isInternalHostname(parsed.hostname)) {
    throw new UnsafeUrlError('internal hosts are not allowed');
  }
  return parsed;
}

/** Resolves every address of a hostname through the system resolver. */
export const systemResolver: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Resolves a hostname and returns one address to connect to, refusing the
 * host when it does not resolve or when ANY of its addresses is internal.
 * Connecting to the returned address (not the name again) defeats DNS
 * rebinding between the check and the request.
 */
export async function resolvePublicAddress(
  hostname: string,
  resolve: Resolver = systemResolver
): Promise<ResolvedAddress> {
  const host = hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(host);
  if (literal) {
    if (isInternalAddress(host)) throw new UnsafeUrlError('internal hosts are not allowed');
    return { address: host, family: literal };
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new UnsafeUrlError('host does not resolve');
  }
  if (addresses.length === 0) throw new UnsafeUrlError('host does not resolve');
  if (addresses.some((entry) => isInternalAddress(entry.address))) {
    throw new UnsafeUrlError('host resolves to an internal address');
  }
  return addresses.find((entry) => entry.family === 4) ?? addresses[0];
}
