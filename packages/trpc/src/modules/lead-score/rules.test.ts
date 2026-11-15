import { describe, expect, test } from 'bun:test';
import { auditGaps, employeeCount } from './audit';
import { WEIGHTS, categoryKey, scoreLead, type CategoryHistory, type ScoreLead, type ScoreTargets } from './rules';

const NOW = new Date('2026-11-16T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const lead = (patch: Partial<ScoreLead> = {}): ScoreLead => ({
  category: 'craft=plumber',
  businessName: 'Dupont Plomberie',
  city: 'Lyon',
  country: 'France',
  hasWebsite: true,
  email: 'contact@dupont.test',
  emailVerified: true,
  phoneNumbers: ['+33400000000'],
  websiteAudit: { ssl: { valid: true }, seo: { title: 'Dupont', description: 'Plombier' }, companyInfo: { employees: '11-50' } },
  scrapedAt: daysAgo(3),
  auditedAt: daysAgo(2),
  createdAt: daysAgo(3),
  contacted: false,
  lastContactedAt: null,
  emailsSentCount: 0,
  ...patch,
});

const targets: ScoreTargets = { osmTags: ['craft=plumber', 'craft=electrician'], keywords: ['chauffage'], nafCodes: [], area: 'Lyon et alentours' };
const noHistory: CategoryHistory = new Map();

function reasonOf(entry: ReturnType<typeof scoreLead>, factor: string) {
  return entry.reasons.find((item) => item.factor === factor)!;
}

describe('lead fit score', () => {
  test('weights sum to 100 and no score leaves 0 to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const best = scoreLead(lead({ hasWebsite: false }), targets, new Map([['craft=plumber', { won: 20, lost: 0 }]]), NOW);
    const worst = scoreLead(
      lead({ category: 'shop=bakery', city: 'Paris', hasWebsite: true, email: null, phoneNumbers: [], contacted: true, emailsSentCount: 9, lastContactedAt: daysAgo(1) }),
      targets,
      new Map([['shop=bakery', { won: 0, lost: 20 }]]),
      NOW
    );
    expect(best.score).toBeLessThanOrEqual(100);
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(best.score).toBeGreaterThan(worst.score);
  });

  const targetCases: Array<[string, Partial<ScoreLead>, string, number]> = [
    ['exact category tag', { category: 'craft=plumber' }, 'category_match', 25],
    ['legacy category mapped to a target tag', { category: 'home-services' }, 'category_match', 25],
    ['keyword in the name', { category: 'shop=bakery', businessName: 'Chauffage Martin' }, 'keyword_match', 18],
    ['same tag family', { category: 'craft=carpenter' }, 'category_family', 14],
    ['nothing in common', { category: 'shop=bakery' }, 'no_match', 0],
    ['no category at all', { category: null }, 'no_match', 0],
  ];
  test.each(targetCases)('target: %s', (_name, patch, code, points) => {
    const reason = reasonOf(scoreLead(lead(patch), targets, noHistory, NOW), 'target');
    expect({ code: reason.code, points: reason.points }).toEqual({ code, points });
  });

  test('a profile with no targets is neutral on the target factor', () => {
    const reason = reasonOf(scoreLead(lead(), { osmTags: [], keywords: [], nafCodes: [], area: null }, noHistory, NOW), 'target');
    expect(reason).toMatchObject({ code: 'unset', points: 13 });
  });

  const auditCases: Array<[string, Partial<ScoreLead>, string, number]> = [
    ['no website is the biggest gap', { hasWebsite: false }, 'no_website', 20],
    ['never audited', { websiteAudit: null }, 'not_audited', 8],
    ['clean audit', {}, 'audit_clean', 6],
    ['invalid certificate', { websiteAudit: { ssl: { valid: false }, seo: { title: 'a', description: 'b' } } }, 'audit_gaps', 10],
    [
      'three gaps',
      { websiteAudit: { ssl: { valid: false }, seo: { title: '', description: '' } } },
      'audit_gaps',
      17,
    ],
    [
      'four gaps cap at the weight',
      { websiteAudit: { ssl: { valid: false }, seo: {}, performance: { performanceScore: 20 } } },
      'audit_gaps',
      20,
    ],
  ];
  test.each(auditCases)('audit: %s', (_name, patch, code, points) => {
    const reason = reasonOf(scoreLead(lead(patch), targets, noHistory, NOW), 'audit');
    expect({ code: reason.code, points: reason.points }).toEqual({ code, points });
  });

  const activityCases: Array<[string, Partial<ScoreLead>, string, number]> = [
    ['added this week', {}, 'new', 15],
    ['added a month ago', { scrapedAt: daysAgo(30), auditedAt: daysAgo(30), createdAt: daysAgo(30) }, 'fresh', 10],
    ['added months ago', { scrapedAt: null, auditedAt: null, createdAt: daysAgo(200) }, 'old', 5],
    ['contacted yesterday', { contacted: true, emailsSentCount: 1, lastContactedAt: daysAgo(1) }, 'just_contacted', 2],
    ['contacted five days ago', { contacted: true, emailsSentCount: 1, lastContactedAt: daysAgo(5) }, 'waiting', 6],
    ['contacted ten days ago', { contacted: true, emailsSentCount: 1, lastContactedAt: daysAgo(10) }, 'follow_up_due', 15],
    ['contacted two months ago', { contacted: true, emailsSentCount: 2, lastContactedAt: daysAgo(60) }, 'dormant', 8],
    ['mailed four times', { contacted: true, emailsSentCount: 4, lastContactedAt: daysAgo(10) }, 'over_contacted', 3],
  ];
  test.each(activityCases)('activity: %s', (_name, patch, code, points) => {
    const reason = reasonOf(scoreLead(lead(patch), targets, noHistory, NOW), 'activity');
    expect({ code: reason.code, points: reason.points }).toEqual({ code, points });
  });

  const reachCases: Array<[string, Partial<ScoreLead>, number]> = [
    ['verified email and phone', {}, 15],
    ['unverified email and phone', { emailVerified: false }, 10],
    ['email only', { phoneNumbers: [] }, 10],
    ['phone only', { email: null }, 5],
    ['nothing', { email: null, phoneNumbers: [] }, 0],
  ];
  test.each(reachCases)('reach: %s', (_name, patch, points) => {
    expect(reasonOf(scoreLead(lead(patch), targets, noHistory, NOW), 'reach').points).toBe(points);
  });

  const historyCases: Array<[string, { won: number; lost: number } | undefined, string, number]> = [
    ['no closes', undefined, 'history_none', 8],
    ['one close is too few', { won: 1, lost: 0 }, 'history_none', 8],
    ['mostly won', { won: 8, lost: 1 }, 'history_won', 12],
    ['mostly lost', { won: 1, lost: 8 }, 'history_lost', 3],
    ['even', { won: 2, lost: 2 }, 'history_won', 8],
  ];
  test.each(historyCases)('history: %s', (_name, closes, code, points) => {
    const history: CategoryHistory = closes ? new Map([['craft=plumber', closes]]) : new Map();
    const reason = reasonOf(scoreLead(lead(), targets, history, NOW), 'history');
    expect({ code: reason.code, points: reason.points }).toEqual({ code, points });
  });

  test('history is keyed by the lead category, trimmed and lower case', () => {
    const history: CategoryHistory = new Map([['craft=plumber', { won: 5, lost: 0 }]]);
    expect(reasonOf(scoreLead(lead({ category: '  Craft=Plumber ' }), targets, history, NOW), 'history').code).toBe('history_won');
    expect(categoryKey('  ')).toBeNull();
  });

  test('area and size', () => {
    expect(reasonOf(scoreLead(lead({ city: 'Lyon' }), targets, noHistory, NOW), 'area')).toMatchObject({ code: 'area_match', points: 5 });
    expect(reasonOf(scoreLead(lead({ city: 'Brest' }), targets, noHistory, NOW), 'area')).toMatchObject({ code: 'outside_area', points: 0 });
    expect(reasonOf(scoreLead(lead({ websiteAudit: { companyInfo: { employees: '500+' } } }), targets, noHistory, NOW), 'size')).toMatchObject({ code: 'size_large' });
    expect(reasonOf(scoreLead(lead({ websiteAudit: null }), targets, noHistory, NOW), 'size')).toMatchObject({ code: 'size_unknown', points: 2 });
  });

  test('the same input always gives the same answer, and reasons add up to the score', () => {
    const first = scoreLead(lead(), targets, noHistory, NOW);
    expect(scoreLead(lead(), targets, noHistory, NOW)).toEqual(first);
    expect(first.reasons.reduce((sum, item) => sum + item.points, 0)).toBe(first.score);
    expect(first.reasons.map((item) => item.factor)).toEqual(['target', 'area', 'audit', 'reach', 'activity', 'history', 'size']);
  });

  test('audit helpers read what they expect and ignore the rest', () => {
    expect(auditGaps(null)).toEqual([]);
    expect(auditGaps('text')).toEqual([]);
    expect(employeeCount({ companyInfo: { employees: '1 200 employees' } })).toBe(1200);
    expect(employeeCount({ companyInfo: { employees: 'many' } })).toBeNull();
  });
});
