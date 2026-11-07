import { describe, expect, test } from 'bun:test';
import { rows } from './rows';

type Msg = string | { one?: string; other: string };

const forms = (msg: Msg): string[] => (typeof msg === 'string' ? [msg] : [msg.one, msg.other].filter((x): x is string => Boolean(x)));
const placeholders = (msg: Msg): string[] => [...new Set(forms(msg).flatMap((s) => s.match(/\{\w+\}/g) ?? []))].sort();

describe('frontend catalog', () => {
  test('en, fr, es and de carry the same placeholders for every key', () => {
    const broken: string[] = [];
    for (const [key, row] of Object.entries(rows) as [string, readonly Msg[]][]) {
      const [en, ...others] = row.map(placeholders);
      for (const other of others) if (JSON.stringify(other) !== JSON.stringify(en)) broken.push(key);
    }
    expect(broken).toEqual([]);
  });

  test('no translation is empty', () => {
    const empty = Object.entries(rows).filter(([, row]) => (row as readonly Msg[]).some((m) => forms(m).some((s) => s.trim() === '')));
    expect(empty.map(([key]) => key)).toEqual([]);
  });
});
