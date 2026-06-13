<script lang="ts">
  import { goto } from '$app/navigation';
  import 'iconify-icon';

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

<div
  class="group rounded-xl border border-border bg-card overflow-hidden"
>
  <button
    onclick={() => goto(`/app/hunts/${session.id}`)}
    class="w-full p-5 text-left transition-colors hover:bg-muted/40"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div class="flex items-center gap-4 min-w-0 sm:flex-1">
        <div class="flex items-center justify-center size-10 rounded-lg border border-border shrink-0">
          <iconify-icon
            icon={isLocal ? 'solar:map-point-linear' : 'solar:global-linear'}
            width="20"
            class="text-foreground"
          ></iconify-icon>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 min-w-0">
            <h3 class="font-semibold text-sm text-foreground truncate">{huntTitle}</h3>
            <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-foreground shrink-0">
              Terminée
            </span>
          </div>
          <div class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>{formatTimeAgo(referenceDate)}</span>
            {#if session.startedAt && session.completedAt}
              <span>·</span>
              <span>Durée: {formatDuration(session.startedAt, session.completedAt)}</span>
            {/if}
            <span>·</span>
            <span>{isLocal ? 'Local' : 'Domaine'}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-6 shrink-0 pl-14 sm:pl-0 sm:justify-start">
        <div class="flex items-center gap-4">
          <div class="text-right">
            <div class="flex items-center justify-end gap-1.5">
              <iconify-icon
                icon="solar:users-group-rounded-linear"
                width="14"
                class="text-muted-foreground"
              ></iconify-icon>
              <span class="text-sm font-medium text-foreground">{displayLeads}</span>
            </div>
            <p class="hidden text-xs text-muted-foreground sm:block">Leads</p>
          </div>

          {#if displayLeads > 0}
            <div class="text-right">
              <div class="flex items-center justify-end gap-1.5">
                <iconify-icon
                  icon="solar:chart-2-linear"
                  width="14"
                  class="text-muted-foreground"
                ></iconify-icon>
                <span class="text-sm font-medium text-foreground">{successRate}%</span>
              </div>
              <p class="hidden text-xs text-muted-foreground sm:block">Succès</p>
            </div>
          {/if}
        </div>

        <iconify-icon
          icon="solar:alt-arrow-right-linear"
          width="16"
          class="text-muted-foreground transition-transform group-hover:translate-x-0.5"
        ></iconify-icon>
      </div>
    </div>
  </button>

  <div
    class="border-t border-border px-5 py-3 flex items-center gap-2"
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    {#if onRelaunch}
      <button
        onclick={() => onRelaunch!(session.id)}
        disabled={relaunching}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if relaunching}
          <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          Relance
        {:else}
          <iconify-icon icon="solar:restart-linear" width="14"></iconify-icon>
          Relancer
        {/if}
      </button>
    {/if}

    <div class="flex-1"></div>

    {#if onDelete}
      <button
        onclick={() => onDelete!(session.id)}
        disabled={deleting}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Supprimer la chasse"
      >
        {#if deleting}
          <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
        {:else}
          <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
          Supprimer
        {/if}
      </button>
    {/if}
  </div>
</div>
