<script lang="ts">
  import { goto } from '$app/navigation';
  import { Badge, Button, Icon, Spinner, icons } from '@facile/muse';

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    filters?: any;
  }

  let {
    session,
    onDelete,
    onRelaunch,
    deleting = false,
    relaunching = false,
  }: {
    session: HuntSession;
    onDelete?: (id: string) => Promise<void>;
    onRelaunch?: (id: string) => Promise<void>;
    deleting?: boolean;
    relaunching?: boolean;
  } = $props();

  function formatTimeAgo(date: Date): string {
    const mins = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000);
    if (mins < 2) return "À l'instant";
    if (mins < 60) return `Il y a ${mins}min`;
    if (mins < 1440) return `Il y a ${Math.floor(mins / 60)}h`;
    return `Il y a ${Math.floor(mins / 1440)}j`;
  }

  function formatDuration(start: Date | null, end: Date | null): string {
    if (!start || !end) return '—';
    const duration = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(duration / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  }

  const isLocal = $derived(
    session.huntType === 'LOCAL_BUSINESS' ||
    (!!(session.filters?.location) && !!(session.filters?.categories))
  );

  const huntTitle = $derived.by(() => {
    if (isLocal) {
      const cat = session.filters?.categories?.[0] || session.filters?.category || 'Commerce local';
      const loc = session.filters?.location || '';
      return loc ? `${cat} à ${loc}` : cat;
    }
    const domain = session.filters?.domain;
    return domain || 'Recherche large';
  });

  const displayLeads = $derived(Math.max(session.successfulLeads || 0, session.totalLeads || 0));

  const successRate = $derived(
    session.totalLeads > 0 && session.successfulLeads > 0
      ? Math.round((session.successfulLeads / session.totalLeads) * 100)
      : 0
  );

  const referenceDate = $derived(session.completedAt || session.startedAt || session.createdAt);
</script>

<div class="flex flex-col overflow-hidden rounded-fc-md bg-fc-component">
  <button
    type="button"
    onclick={() => goto(`/app/hunts/${session.id}`)}
    class="group w-full p-5 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-ring"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div class="flex min-w-0 items-center gap-4 sm:flex-1">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg">
          <Icon icon={isLocal ? 'solar:map-point-linear' : icons.globe} size={20} />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex min-w-0 items-center gap-2">
            <h3 class="truncate text-fc-sm font-semibold text-fc-fg">{huntTitle}</h3>
            <Badge class="shrink-0">Terminée</Badge>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-fc-xs text-fc-fg-muted">
            <span>{formatTimeAgo(referenceDate)}</span>
            {#if session.startedAt && session.completedAt}
              <span>·</span>
              <span>Durée : {formatDuration(session.startedAt, session.completedAt)}</span>
            {/if}
            <span>·</span>
            <span>{isLocal ? 'Local' : 'Domaine'}</span>
          </div>
        </div>
      </div>

      <div class="flex shrink-0 items-center justify-between gap-6 pl-14 sm:justify-start sm:pl-0">
        <div class="flex items-center gap-4">
          <div class="text-right">
            <div class="flex items-center justify-end gap-1.5">
              <Icon icon={icons.usersGroup} size={14} class="text-fc-fg-muted" />
              <span class="text-fc-sm font-medium text-fc-fg">{displayLeads}</span>
            </div>
            <p class="hidden text-fc-xs text-fc-fg-muted sm:block">Leads</p>
          </div>

          {#if displayLeads > 0}
            <div class="text-right">
              <div class="flex items-center justify-end gap-1.5">
                <Icon icon={icons.dashboard} size={14} class="text-fc-fg-muted" />
                <span class="text-fc-sm font-medium text-fc-fg">{successRate}%</span>
              </div>
              <p class="hidden text-fc-xs text-fc-fg-muted sm:block">Succès</p>
            </div>
          {/if}
        </div>

        <Icon
          icon={icons.arrow}
          class="text-fc-fg-muted transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </div>
  </button>

  <div
    class="flex items-center gap-2 border-t border-fc-border px-5 py-3"
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    {#if onRelaunch}
      <Button
        variant="outline"
        size="sm"
        icon={relaunching ? undefined : 'solar:restart-linear'}
        onclick={() => onRelaunch!(session.id)}
        disabled={relaunching}
      >
        {#if relaunching}
          <Spinner size="sm" label="Relance" />
          Relance
        {:else}
          Relancer
        {/if}
      </Button>
    {/if}

    <div class="flex-1"></div>

    {#if onDelete}
      <Button
        variant="ghost-danger"
        size="sm"
        icon={deleting ? undefined : 'solar:trash-bin-trash-linear'}
        onclick={() => onDelete!(session.id)}
        disabled={deleting}
        title="Supprimer la chasse"
      >
        {#if deleting}
          <Spinner size="sm" label="Suppression" />
        {:else}
          Supprimer
        {/if}
      </Button>
    {/if}
  </div>
</div>
