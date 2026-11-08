import { describe, expect, it } from 'bun:test';
import { checkPublicUrl, isInternalAddress, resolvePublicAddress, UnsafeUrlError, type Resolver } from './url-guard';

const fixed = (...addresses: string[]): Resolver => async () =>
  addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

function accepts(url: string): boolean {
  try {
    checkPublicUrl(url);
    return true;
  } catch {
    return false;
  }
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    expect(error).toBeInstanceOf(UnsafeUrlError);
    return (error as Error).message;
  }
}

describe('isInternalAddress', () => {
  it('blocks every internal IPv4 range', () => {
    for (const ip of [
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '100.127.255.254',
      '127.0.0.1',
      '127.255.255.255',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.8',
      '192.0.2.1',
      '192.168.1.1',
      '198.18.0.1',
      '198.51.100.7',
      '203.0.113.9',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect({ ip, internal: isInternalAddress(ip) }).toEqual({ ip, internal: true });
    }
  });

  it('blocks every internal IPv6 range', () => {
    for (const ip of [
      '::',
      '::1',
      '[::1]',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:a00:1',
      '64:ff9b::a00:1',
      '2001:db8::1',
      '2002:7f00:1::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'febf::1',
      'fec0::1',
      'ff02::1',
    ]) {
      expect({ ip, internal: isInternalAddress(ip) }).toEqual({ ip, internal: true });
    }
  });

  it('allows public addresses and treats garbage as internal', () => {
    for (const ip of ['8.8.8.8', '188.114.96.1', '100.128.0.1', '172.32.0.1', '2606:4700:10::ac42:93f3', '2a06:98c1:3120::1']) {
      expect({ ip, internal: isInternalAddress(ip) }).toEqual({ ip, internal: false });
    }
    expect(isInternalAddress('not-an-ip')).toBe(true);
  });
});

describe('checkPublicUrl', () => {
  it('refuses schemes, credentials, internal and single-label hosts', () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://a.example/',
      'not a url',
      'https://user:pw@hooks.example.com/',
      'https://user@hooks.example.com/',
      'http://localhost:3000/',
      'http://LOCALHOST./',
      'http://glouton-redis:6379/',
      'http://intranet/',
      'http://printer.local/',
      'http://db.internal/',
      'http://app.localhost/',
      'http://nas.lan/',
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://0x7f.1/',
      'http://10.0.0.5/',
      'http://169.254.169.254/latest/meta-data',
      'http://100.100.100.200/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
    ]) {
      expect({ url, ok: accepts(url) }).toEqual({ url, ok: false });
    }
  });

  it('allows a public https url', () => {
    expect(checkPublicUrl('https://antenne.facile.studio/webhook/glouton').hostname).toBe('antenne.facile.studio');
    expect(checkPublicUrl('http://8.8.8.8/x').hostname).toBe('8.8.8.8');
  });
});

describe('resolvePublicAddress', () => {
  it('returns a checked public address, preferring IPv4', async () => {
    expect(await resolvePublicAddress('antenne.facile.studio', fixed('2a06:98c1:3120::1', '188.114.96.1'))).toEqual({
      address: '188.114.96.1',
      family: 4,
    });
  });

  it('refuses a name when any address is internal', async () => {
    expect(await reasonOf(resolvePublicAddress('evil.example.com', fixed('188.114.96.1', '10.0.0.1')))).toBe(
      'host resolves to an internal address'
    );
    expect(await reasonOf(resolvePublicAddress('127.0.0.1.nip.io', fixed('127.0.0.1')))).toBe(
      'host resolves to an internal address'
    );
    expect(await reasonOf(resolvePublicAddress('v6.example.com', fixed('::1')))).toBe('host resolves to an internal address');
  });

  it('refuses names that do not resolve', async () => {
    expect(await reasonOf(resolvePublicAddress('gone.example.com', fixed()))).toBe('host does not resolve');
    const failing: Resolver = async () => {
      throw new Error('ENOTFOUND');
    };
    expect(await reasonOf(resolvePublicAddress('gone.example.com', failing))).toBe('host does not resolve');
  });

  it('checks IP literals without resolving', async () => {
    const never: Resolver = async () => {
      throw new Error('should not resolve');
    };
    expect(await resolvePublicAddress('8.8.8.8', never)).toEqual({ address: '8.8.8.8', family: 4 });
    expect(await reasonOf(resolvePublicAddress('[::1]', never))).toBe('internal hosts are not allowed');
  });
});
