import { describe, expect, test } from 'bun:test';
import { errorKey, isActive, planRefusal, runOf, toIdea, toolLabel, type IdeaView, type RunView } from './cards';

const t = (key: string, params?: Record<string, string | number>) => (params ? `${key}:${JSON.stringify(params)}` : key);

const idea: IdeaView = {
  id: 'idea-1',
  kind: 'follow_up',
  title: 'Relancer Martin',
  why: 'Mail ouvert mardi',
  draft: '',
  sources: [{ label: 'Martin' }],
  status: 'new',
  createdAt: '2026-11-10T08:00:00Z',
  expiresAt: '',
};

const waiting: RunView = {
  runId: 'run-1',
  state: 'needs_approval',
  summary: 'Je prépare le brouillon.',
  outputs: [],
  approvals: [{ callId: 'c-1', tool: 'glouton_save_draft', args: { subject: 'Relance' } }],
  continueHref: 'https://bulle.facile.studio/s/s-1',
};

describe('idea cards', () => {
  test('a run starts as running, then shows the first approval with a translated tool', () => {
    expect(runOf({ runId: null, view: null, error: null }, t)).toEqual({ state: 'running' });
    const run = runOf({ runId: 'run-1', view: waiting, error: null }, t);
    expect(run.state).toBe('needs_approval');
    expect(run.approval).toEqual({
      id: 'c-1',
      tool: 'ideas.tool.glouton_save_draft',
      summary: 'ideas.approval.summary:{"tool":"ideas.tool.glouton_save_draft"}',
      args: { subject: 'Relance' },
    });
  });

  test('done shows the summary and links; failed shows why; polling stops on both', () => {
    const done = { ...waiting, state: 'done' as const, approvals: [], outputs: [{ label: 'Brouillon', href: 'https://g.test/x' }] };
    expect(runOf({ runId: 'run-1', view: done, error: null }, t)).toMatchObject({ state: 'done', outputs: done.outputs });
    expect(runOf({ runId: 'run-1', view: { ...done, state: 'failed', summary: '' }, error: null }, t)).toEqual({
      state: 'failed',
      error: 'ideas.error.run',
    });
    expect(isActive({ runId: 'run-1', view: waiting, error: null })).toBe(true);
    expect(isActive({ runId: 'run-1', view: done, error: null })).toBe(false);
    expect(isActive({ runId: null, view: null, error: 'ideas.error.unreachable' })).toBe(false);
  });

  test('the card links to Bulle once the idea ran', () => {
    expect(toIdea(idea, undefined, t).continueHref).toBeUndefined();
    expect(toIdea(idea, { runId: 'run-1', view: waiting, error: null }, t).continueHref).toBe('https://bulle.facile.studio/s/s-1');
  });

  test('unknown tools lose their app prefix', () => {
    expect(toolLabel('opus_create_task', t)).toBe('Create task');
  });

  test('a 402 carries the upgrade link; other refusals map to a message', () => {
    const parse = (value: unknown) => value as { upgrade_url?: string };
    expect(planRefusal({ data: { code: 'FORBIDDEN', plan_limit: { upgrade_url: 'https://sso.test/up' } } }, parse)).toEqual({
      upgrade_url: 'https://sso.test/up',
    });
    expect(planRefusal({ data: { code: 'BAD_GATEWAY' } }, parse)).toBeNull();
    expect(errorKey({ data: { code: 'TOO_MANY_REQUESTS' } })).toBe('ideas.error.capped');
    expect(errorKey(new Error('boom'))).toBe('ideas.error.unreachable');
  });
});
