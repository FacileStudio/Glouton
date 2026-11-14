import type { NextActionResult, WriteResult } from './prompt';

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
