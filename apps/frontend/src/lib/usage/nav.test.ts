import { describe, expect, test } from 'bun:test';
import { NAV, REDIRECTS, homeFor, inSection, navFor, redirectFor } from './nav';

const ids = (usages: Parameters<typeof navFor>[0]) => navFor(usages).map((section) => [section.id, section.tabs.map((tab) => tab.id)]);

describe('usage-driven navigation', () => {
  test('competitors alone shows only the competitor section, with its three tabs', () => {
    expect(ids(['competitors'])).toEqual([['competitors', ['list', 'suggestions', 'monitoring']]]);
    expect(homeFor(['competitors'])).toBe('/app/competitors');
  });

  test('clients shows prospects without missions, searches and messages', () => {
    expect(ids(['clients'])).toEqual([
      ['prospects', ['leads', 'contacts', 'creations']],
      ['searches', ['hunts', 'schedules']],
      ['messages', ['inbox', 'outreach']],
    ]);
    expect(homeFor(['clients'])).toBe('/app/prospects/leads');
  });

  test('missions alone opens on the missions tab and has no searches', () => {
    expect(ids(['missions'])).toEqual([
      ['prospects', ['contacts', 'missions']],
      ['messages', ['inbox', 'outreach']],
    ]);
    expect(navFor(['missions'])[0]?.href).toBe('/app/prospects/contacts');
  });

  test('no usage yet shows everything; job alone shows nothing and sends to the settings', () => {
    expect(navFor([]).map((section) => section.id)).toEqual(['prospects', 'searches', 'competitors', 'messages']);
    expect(navFor(['job'])).toEqual([]);
    expect(homeFor(['job'])).toBe('/app/settings/prospecting');
  });

  test('the Ideas slot is held at the top but hidden', () => {
    expect(NAV[0]).toMatchObject({ id: 'ideas', icon: 'solar:lightbulb-linear', available: false });
    expect(navFor([]).some((section) => section.id === 'ideas')).toBe(false);
  });

  test('old list addresses redirect with their query; detail pages light their section', () => {
    expect(redirectFor('/app/leads', '?status=HOT')).toBe('/app/prospects/leads?status=HOT');
    expect(redirectFor('/app/hunts/schedules/', '')).toBe('/app/searches/schedules');
    expect(redirectFor('/app/leads/123', '')).toBeNull();
    expect(Object.keys(REDIRECTS)).toHaveLength(8);
    const prospects = navFor([]).find((section) => section.id === 'prospects')!;
    expect(inSection(prospects, '/app/leads/123')).toBe(true);
    expect(inSection(prospects, '/app/competitors')).toBe(false);
  });
});
