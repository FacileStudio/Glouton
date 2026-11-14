import type { ContactContext, Sender } from './prompt';

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

/** The sender as one line of the user message. */
export function senderLine(sender: Sender): string {
  const name = fullName(sender);
  return name ? `Sender: ${name}` : 'Sender: unknown';
}
