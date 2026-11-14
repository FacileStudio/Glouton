export const ASSISTANT_ACTIONS = [
  'draft',
  'reply',
  'rewrite',
  'shorter',
  'warmer',
  'formal',
  'fix',
  'translate',
  'subject',
] as const;

export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];
export type Language = 'fr' | 'en';

/** The contact facts Glouton loaded itself, inside the caller's scope. */
export interface ContactContext {
  person: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string | null;
    stage: string;
    notes: string | null;
  } | null;
  company: {
    name: string;
    domain: string | null;
    website: string | null;
    city: string | null;
    category: string | null;
    stage: string;
    temperature: string;
    notes: string | null;
  } | null;
  people: Array<{ firstName: string | null; lastName: string | null; role: string | null; email: string | null }>;
  activities: Array<{ kind: string; summary: string; occurredAt: Date }>;
}

export interface Sender {
  firstName: string | null;
  lastName: string | null;
}

export interface WriteInput {
  action: AssistantAction;
  instruction?: string;
  subject?: string;
  body?: string;
  language: Language;
}

export interface WriteResult {
  subject: string | null;
  body: string;
  note: string | null;
}

export interface NextActionResult {
  summary: string;
  steps: string[];
  draft: { subject: string; body: string } | null;
}

const ACTION_TASKS: Record<AssistantAction, string> = {
  draft: 'Write a new email to this contact, with a subject.',
  reply: 'Write a reply to the latest exchange with this contact. The current body, when present, is the message to answer or a first draft of the reply.',
  rewrite: 'Rewrite the current body, keeping its meaning.',
  shorter: 'Make the current body clearly shorter, keeping every important point.',
  warmer: 'Make the current body warmer and more personal, without becoming familiar.',
  formal: 'Make the current body more formal and professional.',
  fix: 'Fix spelling, grammar and punctuation in the current body only. Keep the wording otherwise.',
  translate: 'Translate the current subject and body into the output language.',
  subject: 'Propose one short subject line for the current body. Return the body unchanged.',
};

const WRITING_RULES = [
  'In Glouton you are a writing assistant for business emails sent to contacts (prospects, clients, partners).',
  'Write plain text: no Markdown, no HTML, no bullet symbols unless the email needs a list.',
  'Never invent facts: no prices, dates, meetings, figures or promises that are not in the context or the instruction.',
  'Never leave placeholders such as [Name] or {company}. When a detail is missing, write around it.',
  'Keep the user voice: short sentences, direct, courteous. No filler and no clichés.',
  'Sign with the sender name when it is known, else end without a signature.',
  'Answer with strict JSON only, no prose around it: {"subject": string | null, "body": string, "note": string | null}.',
  '"subject" is null when the subject should not change. "note" is one short remark for the user, or null.',
].join('\n');

const NEXT_ACTION_RULES = [
  'In Glouton you help the user decide the next step with a contact (prospect, client, partner).',
  'Base everything on the context given. Never invent facts, dates or past exchanges.',
  'Answer with strict JSON only, no prose around it:',
  '{"summary": string, "steps": string[], "draft": {"subject": string, "body": string} | null}.',
  '"summary" is two or three sentences on where the relationship stands. "steps" holds one to four concrete next actions.',
  '"draft" is a ready-to-send plain-text email when the first step is an email, else null. No placeholders.',
].join('\n');

function languageRule(language: Language): string {
  return language === 'en' ? 'Write in English.' : 'Write in French (vouvoiement unless the context shows tutoiement).';
}

/** The system prompt: the Glouton rules for the task, then the language. */
export function systemPrompt(task: 'write' | 'nextAction', language: Language): string {
  return [task === 'write' ? WRITING_RULES : NEXT_ACTION_RULES, languageRule(language)].join('\n\n');
}

function fullName(p: { firstName: string | null; lastName: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

function line(label: string, value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? `${label}: ${clean}` : null;
}

/** The contact facts as plain lines, for the user message. */
export function contactBlock(contact: ContactContext): string {
  const lines: Array<string | null> = [];
  if (contact.person) {
    const p = contact.person;
    lines.push(
      '## Person',
      line('Name', fullName(p)),
      line('Email', p.email),
      line('Role', p.role),
      line('Stage', p.stage),
      line('Notes', p.notes)
    );
  }
  if (contact.company) {
    const c = contact.company;
    lines.push(
      '## Company',
      line('Name', c.name),
      line('Domain', c.domain ?? c.website),
      line('City', c.city),
      line('Category', c.category),
      line('Stage', c.stage),
      line('Temperature', c.temperature),
      line('Notes', c.notes)
    );
  }
  if (contact.people.length > 0) {
    lines.push('## People at the company');
    for (const p of contact.people) lines.push(`- ${[fullName(p), p.role, p.email].filter(Boolean).join(', ')}`);
  }
  if (contact.activities.length > 0) {
    lines.push('## Recent activity (newest first)');
    for (const a of contact.activities) lines.push(`- ${a.occurredAt.toISOString().slice(0, 10)} ${a.kind}: ${a.summary}`);
  }
  const block = lines.filter((l): l is string => Boolean(l)).join('\n');
  return block || 'No contact selected.';
}

function senderLine(sender: Sender): string {
  const name = fullName(sender);
  return name ? `Sender: ${name}` : 'Sender: unknown';
}

/** The task of a writing action, with the instruction the user typed. */
export function writeTask(input: WriteInput): string {
  return [
    `# Task\n${ACTION_TASKS[input.action]}`,
    input.instruction?.trim() ? `# Instruction from the user\n${input.instruction.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The material of a writing action: current draft, contact facts and sender. */
export function writeData(input: WriteInput, contact: ContactContext, sender: Sender): string {
  return [
    `# Current subject\n${input.subject?.trim() || '(empty)'}`,
    `# Current body\n${input.body?.trim() || '(empty)'}`,
    `# Contact\n${contactBlock(contact)}`,
    `# ${senderLine(sender)}`,
  ].join('\n\n');
}

export const NEXT_ACTION_TASK = 'Suggest the next action with this contact.';

/** The material of a next-action suggestion: contact facts and sender. */
export function nextActionData(contact: ContactContext, sender: Sender): string {
  return [`# Contact\n${contactBlock(contact)}`, `# ${senderLine(sender)}`].join('\n\n');
}

/** The first JSON object in a model answer, fenced or not, or null. */
export function jsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Reads the model's JSON answer, fenced or not; anything else becomes the body as plain text. */
export function parseWriteResponse(raw: string): WriteResult {
  const json = jsonObject(raw);
  if (!json || typeof json.body !== 'string') return { subject: null, body: raw.trim(), note: null };
  return { subject: optionalText(json.subject), body: json.body.trim(), note: optionalText(json.note) };
}

/** Reads the model's next-action JSON; anything else becomes the summary. */
export function parseNextAction(raw: string): NextActionResult {
  const json = jsonObject(raw);
  if (!json || typeof json.summary !== 'string') return { summary: raw.trim(), steps: [], draft: null };
  const steps = Array.isArray(json.steps) ? json.steps.map(optionalText).filter((s): s is string => Boolean(s)) : [];
  const draft = json.draft && typeof json.draft === 'object' ? (json.draft as Record<string, unknown>) : null;
  const subject = optionalText(draft?.subject);
  const body = optionalText(draft?.body);
  return { summary: json.summary.trim(), steps, draft: subject && body ? { subject, body } : null };
}
