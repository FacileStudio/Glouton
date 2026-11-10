import { isNewIdea, planLimitFrom, type IdeaStatus } from '@facile/muse';
import { QUIET } from '@repo/trpc-client';
import trpc from '$lib/trpc';
import type { Key } from '$lib/i18n/rows';
import { errorKey, isActive, planRefusal, type IdeasPage, type RunEntry } from '$lib/ideas/cards';

const LIST_POLL_MS = 4000;
const RUN_POLL_MS = 2000;

/**
 * The active space's Glouton ideas, shared by the sidebar entry (badge and
 * running dot) and the Ideas page. Runs are polled here, so a run keeps
 * going while the user browses elsewhere.
 */
class IdeasStore {
  page = $state<IdeasPage | null>(null);
  loading = $state(false);
  error = $state<Key | null>(null);
  upgradeUrl = $state<string | null>(null);
  starting = $state(false);
  runs = $state<Record<string, RunEntry>>({});
  busyIds = $state<string[]>([]);

  private teamId: string | undefined;
  private listTimer: ReturnType<typeof setTimeout> | null = null;
  private runTimer: ReturnType<typeof setTimeout> | null = null;

  get generating(): boolean {
    return this.starting || Boolean(this.page?.generating);
  }

  get upsell(): boolean {
    return this.upgradeUrl !== null || this.page?.aiAccess === false;
  }

  get running(): boolean {
    return this.generating || Object.values(this.runs).some(isActive);
  }

  get count(): number {
    return (this.page?.ideas ?? []).filter(
      (idea) => !this.runs[idea.id] && isNewIdea({ status: idea.status as IdeaStatus, expiresAt: idea.expiresAt || undefined })
    ).length;
  }

  async load(teamId: string | undefined): Promise<void> {
    this.teamId = teamId;
    this.loading = this.page === null;
    try {
      this.page = await trpc.ideas.list.query(teamId ? { teamId } : undefined, { context: QUIET });
      this.error = null;
      if (!this.page.aiAccess) this.upgradeUrl = this.page.upgradeUrl;
    } catch (error) {
      if (!this.refuse(error)) this.error = 'ideas.error.load';
    } finally {
      this.loading = false;
    }
    this.scheduleList();
  }

  async generate(): Promise<void> {
    this.starting = true;
    try {
      await trpc.ideas.generate.mutate(this.space(), { context: QUIET });
      this.error = null;
      await this.load(this.teamId);
    } catch (error) {
      if (!this.refuse(error)) this.error = errorKey(error);
    } finally {
      this.starting = false;
    }
  }

  async run(ideaId: string): Promise<void> {
    this.runs = { ...this.runs, [ideaId]: { runId: null, view: null, error: null } };
    try {
      const { runId } = await trpc.ideas.run.mutate({ ...this.space(), ideaId }, { context: QUIET });
      this.setRun(ideaId, { runId, view: null, error: null });
      await this.poll();
    } catch (error) {
      if (this.refuse(error)) this.dropRun(ideaId);
      else this.setRun(ideaId, { runId: null, view: null, error: errorKey(error) });
    }
  }

  async decide(ideaId: string, callId: string, approve: boolean): Promise<void> {
    const runId = this.runs[ideaId]?.runId;
    if (!runId) return;
    await this.busy(ideaId, async () => {
      await trpc.ideas.decide.mutate({ ...this.space(), runId, callId, approve }, { context: QUIET });
      await this.poll();
    });
  }

  async dismiss(ideaId: string): Promise<boolean> {
    return this.busy(ideaId, async () => {
      await trpc.ideas.dismiss.mutate({ ...this.space(), ideaId }, { context: QUIET });
      if (this.page) this.page = { ...this.page, ideas: this.page.ideas.filter((idea) => idea.id !== ideaId) };
      this.dropRun(ideaId);
    });
  }

  private space(): { teamId?: string } {
    return this.teamId ? { teamId: this.teamId } : {};
  }

  private async busy(ideaId: string, work: () => Promise<void>): Promise<boolean> {
    this.busyIds = [...this.busyIds, ideaId];
    try {
      await work();
      return true;
    } catch (error) {
      if (!this.refuse(error)) this.error = errorKey(error);
      return false;
    } finally {
      this.busyIds = this.busyIds.filter((id) => id !== ideaId);
    }
  }

  private refuse(error: unknown): boolean {
    const limit = planRefusal(error, planLimitFrom);
    if (!limit) return false;
    this.upgradeUrl = limit.upgrade_url ?? '';
    return true;
  }

  private setRun(ideaId: string, entry: RunEntry): void {
    this.runs = { ...this.runs, [ideaId]: entry };
  }

  private dropRun(ideaId: string): void {
    const { [ideaId]: _, ...rest } = this.runs;
    this.runs = rest;
  }

  private async poll(): Promise<void> {
    if (this.runTimer) clearTimeout(this.runTimer);
    this.runTimer = null;
    const active = Object.entries(this.runs).filter(([, entry]) => isActive(entry) && entry.runId);
    await Promise.all(
      active.map(async ([ideaId, entry]) => {
        try {
          const view = await trpc.ideas.runStatus.query({ ...this.space(), runId: entry.runId! }, { context: QUIET });
          this.setRun(ideaId, { ...entry, view });
        } catch (error) {
          this.setRun(ideaId, { ...entry, error: errorKey(error) });
        }
      })
    );
    if (Object.values(this.runs).some(isActive)) this.runTimer = setTimeout(() => void this.poll(), RUN_POLL_MS);
  }

  private scheduleList(): void {
    if (this.listTimer) clearTimeout(this.listTimer);
    this.listTimer = null;
    if (this.page?.generating) this.listTimer = setTimeout(() => void this.load(this.teamId), LIST_POLL_MS);
  }
}

export const ideasStore = new IdeasStore();
