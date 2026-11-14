import type { Run, RunState } from '@facile/tronc/bulle';
import { record, text } from '@repo/courrier';

export interface IdeaLink {
  label: string;
  href?: string;
}

/** One Glouton idea card, as the page shows it. */
export interface IdeaView {
  id: string;
  kind: string;
  title: string;
  why: string;
  draft: string;
  sources: IdeaLink[];
  status: string;
  createdAt: string;
  expiresAt: string;
}

/** The Ideas page of the active space. */
export interface IdeasPageView {
  aiAccess: boolean;
  upgradeUrl: string;
  ideas: IdeaView[];
  generating: boolean;
  lastBatchAt: string | null;
}

/** A call held for the user's confirmation. */
export interface ApprovalView {
  callId: string;
  tool: string;
  args: unknown;
}

/** A background run, mapped from Bulle's GET /api/runs/{id}. */
export interface RunView {
  runId: string;
  state: RunState;
  summary: string;
  outputs: Required<IdeaLink>[];
  approvals: ApprovalView[];
  continueHref: string;
}

/** A link Glouton can render: an absolute http(s) URL, or nothing. */
export function safeHref(value: unknown): string | undefined {
  const raw = text(value).trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** One idea from Bulle's list. */
export function ideaView(raw: unknown): IdeaView {
  const idea = record(raw);
  return {
    id: text(idea.id),
    kind: text(idea.kind) || 'other',
    title: text(idea.title),
    why: text(idea.why),
    draft: text(idea.draft),
    sources: list(idea.sources).map((source) => ({ label: text(record(source).label), href: safeHref(record(source).ref) })),
    status: text(idea.status) || 'new',
    createdAt: text(idea.created_at),
    expiresAt: text(idea.expires_at),
  };
}

/** Bulle's GET /api/ideas answer as the page shows it. */
export function pageView(raw: unknown, upgradeUrl: string): IdeasPageView {
  const body = record(raw);
  return {
    aiAccess: true,
    upgradeUrl,
    ideas: list(body.ideas).map(ideaView).filter((idea) => idea.id),
    generating: body.generating === true,
    lastBatchAt: text(body.last_batch_at) || null,
  };
}

/** Bulle's run view as the card shows it: state, last words, links to what it made, and pending approvals. */
export function runView(run: Run): RunView {
  const approvals = list(run.pending_approvals).map((item) => {
    const approval = record(item);
    return { callId: text(approval.call_id), tool: text(approval.tool), args: approval.args ?? null };
  });
  const outputs = list(run.outputs).flatMap((item) => {
    const output = record(item);
    const href = text(output.url);
    return href ? [{ label: text(output.preview) || text(output.tool), href }] : [];
  });
  return {
    runId: text(run.id),
    state: run.state,
    summary: text(run.summary),
    outputs,
    approvals: approvals.filter((approval) => approval.callId),
    continueHref: run.continue_url,
  };
}
