import { describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';
import { loadContact } from './service';
import {
  nextActionPrompt,
  parseNextAction,
  parseWriteResponse,
  systemPrompt,
  writePrompt,
  type ContactContext,
} from './prompt';

const contact: ContactContext = {
  person: {
    firstName: 'Claire',
    lastName: 'Martin',
    email: 'claire@boulangerie.test',
    role: 'Gérante',
    stage: 'PROSPECT',
    notes: 'Veut refaire son site avant mars',
  },
  company: {
    name: 'Boulangerie Martin',
    domain: 'boulangerie.test',
    website: null,
    city: 'Lyon',
    category: 'bakery',
    stage: 'PROSPECT',
    temperature: 'WARM',
    notes: null,
  },
  people: [],
  activities: [{ kind: 'email.sent', summary: 'Premier contact', occurredAt: new Date('2026-10-20T09:00:00Z') }],
};

const sender = { firstName: 'Yann', lastName: null };

describe('prompt building', () => {
  test('the user message carries the task, the draft and the contact facts', () => {
    const prompt = writePrompt(
      { action: 'reply', instruction: 'Propose un appel jeudi', body: 'Merci pour votre retour', language: 'fr' },
      contact,
      sender
    );
    for (const fact of [
      'Claire Martin',
      'claire@boulangerie.test',
      'Gérante',
      'Veut refaire son site avant mars',
      'Boulangerie Martin',
      'Lyon',
      'WARM',
      '2026-10-20 email.sent: Premier contact',
      'Propose un appel jeudi',
      'Merci pour votre retour',
      'Sender: Yann',
    ]) {
      expect(prompt).toContain(fact);
    }
    expect(prompt).not.toContain('## People at the company');
  });

  test('without a contact the prompt says so instead of inventing one', () => {
    const empty = { person: null, company: null, people: [], activities: [] };
    expect(nextActionPrompt(empty, sender)).toContain('No contact selected.');
  });

  test('the system prompt keeps the persona, asks for JSON and defaults to French', () => {
    const fr = systemPrompt('You are Pip.', 'write', 'fr');
    expect(fr.startsWith('You are Pip.')).toBe(true);
    expect(fr).toContain('{"subject": string | null, "body": string, "note": string | null}');
    expect(fr).toContain('Write in French');
    expect(systemPrompt('', 'nextAction', 'en')).toContain('Write in English.');
  });
});

describe('response parsing', () => {
  test('reads fenced JSON', () => {
    const raw = 'Voici :\n```json\n{"subject": "Votre site", "body": "Bonjour Claire,\\n\\nMerci.", "note": null}\n```';
    expect(parseWriteResponse(raw)).toEqual({ subject: 'Votre site', body: 'Bonjour Claire,\n\nMerci.', note: null });
  });

  test('reads bare JSON and drops empty fields', () => {
    expect(parseWriteResponse('{"subject": "", "body": " Salut ", "note": "Ton plus direct"}')).toEqual({
      subject: null,
      body: 'Salut',
      note: 'Ton plus direct',
    });
  });

  test('falls back to plain text as the body', () => {
    expect(parseWriteResponse('  Bonjour Claire, merci.  ')).toEqual({ subject: null, body: 'Bonjour Claire, merci.', note: null });
    expect(parseWriteResponse('{"text": "no body field"}').body).toBe('{"text": "no body field"}');
  });

  test('next action keeps steps and a complete draft only', () => {
    const raw = '```\n{"summary": "Prospect tiède.", "steps": ["Relancer", ""], "draft": {"subject": "Relance", "body": "Bonjour"}}\n```';
    expect(parseNextAction(raw)).toEqual({
      summary: 'Prospect tiède.',
      steps: ['Relancer'],
      draft: { subject: 'Relance', body: 'Bonjour' },
    });
    expect(parseNextAction('{"summary": "x", "steps": [], "draft": {"subject": "s"}}').draft).toBeNull();
    expect(parseNextAction('Appelez-la.')).toEqual({ summary: 'Appelez-la.', steps: [], draft: null });
  });
});

describe('contact loading', () => {
  test('every query is narrowed to the caller access', async () => {
    const wheres: Array<{ model: string; where: Record<string, unknown> }> = [];
    const model = (name: string, row: unknown) => ({
      findFirst: async ({ where }: { where: Record<string, unknown> }) => (wheres.push({ model: name, where }), row),
      findMany: async ({ where }: { where: Record<string, unknown> }) => (wheres.push({ model: name, where }), []),
    });
    const prisma = {
      person: model('person', { ...contact.person, id: 'p1', companyId: 'c1' }),
      company: model('company', { ...contact.company, id: 'c1' }),
      activity: model('activity', null),
    } as unknown as PrismaClient;
    const access = { userId: 'u1', actor: null, teamIds: ['t1'], personal: false };
    const loaded = await loadContact(prisma, access, { personId: 'p1' });
    expect(loaded.company?.name).toBe('Boulangerie Martin');
    expect(wheres.map((w) => w.model)).toEqual(['person', 'company', 'activity']);
    for (const { where } of wheres) expect(where.OR).toEqual([{ teamId: { in: ['t1'] } }]);
  });
});
