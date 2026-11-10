import type { ApprovalRequest, Idea, IdeaRun, PlanLimitError } from '@facile/muse';
import type { RouterOutputs } from '@repo/trpc-client';
import type { Key } from '$lib/i18n/rows';

export type IdeasPage = RouterOutputs['ideas']['list'];
export type IdeaView = IdeasPage['ideas'][number];
export type RunView = RouterOutputs['ideas']['runStatus'];

/** What the page knows about one idea's run: its id, the last poll, or why it stopped. */
export interface RunEntry {
  runId: string | null;
  view: RunView | null;
  error: Key | null;
}

type Translate = (key: Key, params?: Record<string, string | number>) => string;

const TOOL_KEYS: Record<string, Key> = {
  glouton_save_draft: 'ideas.tool.glouton_save_draft',
  glouton_update_draft: 'ideas.tool.glouton_update_draft',
  glouton_suggest: 'ideas.tool.glouton_suggest',
  glouton_create_company: 'ideas.tool.glouton_create_company',
  glouton_update_company: 'ideas.tool.glouton_update_company',
  glouton_create_person: 'ideas.tool.glouton_create_person',
  glouton_update_person: 'ideas.tool.glouton_update_person',
};

/** A readable name for a Bulle tool: Glouton's own are translated, others lose their prefix and underscores. */
export function toolLabel(tool: string, t: Translate): string {
  const key = TOOL_KEYS[tool];
  if (key) return t(key);
  const words = tool.replace(/^[a-z]+_/, '').replaceAll('_', ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : tool;
}

function approvalOf(view: RunView, t: Translate): ApprovalRequest | undefined {
  const first = view.approvals[0];
  if (!first) return undefined;
  const tool = toolLabel(first.tool, t);
  const args = first.args && typeof first.args === 'object' ? (first.args as Record<string, unknown>) : undefined;
  return { id: first.callId, tool, summary: t('ideas.approval.summary', { tool }), args };
}

/** The run muse draws for an entry: failed with a reason, running until the first poll, then Bulle's state. */
export function runOf(entry: RunEntry, t: Translate): IdeaRun {
  if (entry.error) return { state: 'failed', error: t(entry.error) };
  if (!entry.view) return { state: 'running' };
  const { view } = entry;
  if (view.state === 'failed') return { state: 'failed', error: view.summary || t('ideas.error.run') };
  return { state: view.state, summary: view.summary || undefined, outputs: view.outputs, approval: approvalOf(view, t) };
}

/** True while the entry still needs polling. */
export function isActive(entry: RunEntry | undefined): boolean {
  if (!entry || entry.error) return false;
  return !entry.view || entry.view.state === 'running' || entry.view.state === 'needs_approval';
}

/** One card: Bulle's idea plus its run in this session, with the continue-in-Bulle link once it ran. */
export function toIdea(view: IdeaView, entry: RunEntry | undefined, t: Translate): Idea {
  return {
    id: view.id,
    kind: view.kind,
    title: view.title,
    why: view.why,
    draft: view.draft || undefined,
    sources: view.sources,
    status: view.status as Idea['status'],
    expiresAt: view.expiresAt || undefined,
    run: entry ? runOf(entry, t) : undefined,
    continueHref: entry?.view?.continueHref,
  };
}

type TrpcFailure = { data?: { code?: string; plan_limit?: unknown } } | null;

/** The plan refusal a failed call carries (a Bulle 402 or Glouton's own ai.access check), or null. */
export function planRefusal(error: unknown, parse: (value: unknown) => PlanLimitError | null): PlanLimitError | null {
  const limit = (error as TrpcFailure)?.data?.plan_limit;
  return limit ? parse(limit) : null;
}

const ERROR_KEYS: Record<string, Key> = {
  TOO_MANY_REQUESTS: 'ideas.error.capped',
  CONFLICT: 'ideas.error.busy',
  NOT_FOUND: 'ideas.error.gone',
  PRECONDITION_FAILED: 'ideas.error.notLinked',
};

/** The message key of a failed call. */
export function errorKey(error: unknown): Key {
  return ERROR_KEYS[(error as TrpcFailure)?.data?.code ?? ''] ?? 'ideas.error.unreachable';
}
