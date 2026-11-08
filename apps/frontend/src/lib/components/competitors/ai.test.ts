import { describe, expect, test } from 'bun:test';
import { acceptedValue, addedItems, aiLanguage, hasNews, type BattlecardFields } from './ai';

const current: BattlecardFields = {
  overview: 'Our notes on Rival.',
  whyWeWin: ['We answer within a day'],
  whyWeLose: [],
  objections: [{ objection: 'Rival is cheaper', response: 'Hosting included', proof: '' }],
  landmines: [],
  pricing: null,
  proofPoints: [],
};

const proposed: BattlecardFields = {
  overview: 'Rival builds websites.',
  whyWeWin: ['we answer within a day', 'Local team'],
  whyWeLose: [],
  objections: [
    { objection: 'rival is cheaper', response: 'x', proof: '' },
    { objection: 'Rival ships faster', response: 'We ship in two weeks', proof: '' },
  ],
  landmines: [],
  pricing: 'From 49 €',
  proofPoints: [],
};

describe('per-field accept', () => {
  test('accepting a list keeps every user item and appends only new ones', () => {
    expect(acceptedValue('whyWeWin', current, proposed)).toEqual({ whyWeWin: ['We answer within a day', 'Local team'] });
    expect(acceptedValue('objections', current, proposed).objections?.map((o) => o.objection)).toEqual(['Rival is cheaper', 'Rival ships faster']);
  });

  test('accepting one field returns only that field', () => {
    expect(Object.keys(acceptedValue('pricing', current, proposed))).toEqual(['pricing']);
    expect(acceptedValue('overview', current, proposed)).toEqual({ overview: 'Rival builds websites.' });
  });

  test('fields with nothing new are not offered', () => {
    expect(hasNews('whyWeLose', current, proposed)).toBe(false);
    expect(hasNews('whyWeWin', current, proposed)).toBe(true);
    expect(hasNews('overview', current, { ...proposed, overview: ' Our notes on Rival. ' })).toBe(false);
    expect(addedItems('whyWeWin', current, proposed)).toEqual(['Local team']);
  });

  test('the AI language follows the interface when supported', () => {
    expect(aiLanguage('de')).toBe('de');
    expect(aiLanguage('it')).toBe('fr');
  });
});
