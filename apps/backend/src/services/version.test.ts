import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readVersion } from './version';

describe('readVersion', () => {
  it('equals the version in the root package.json', () => {
    const root = new URL('../../../../package.json', import.meta.url);
    expect(readVersion()).toBe(JSON.parse(readFileSync(root, 'utf8')).version);
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
