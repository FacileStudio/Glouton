<script lang="ts">
  import { goto } from '$app/navigation';
  import 'iconify-icon';

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    sources?: string[];
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
    onCancel,
    onDelete,
    onRelaunch,
    cancelling = false,
    deleting = false,
    relaunching = false,
  }: {
    session: HuntSession;
    onCancel?: (id: string) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    onRelaunch?: (id: string) => Promise<void>;
    cancelling?: boolean;
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

  const isCsvImport = $derived(
    session.sources?.includes('CSV_IMPORT') || false
  );

  const isLocal = $derived(
    session.huntType === 'LOCAL_BUSINESS' ||
    (!!(session.filters?.location) && !!(session.filters?.categories))
  );

  const huntTitle = $derived.by(() => {
    if (isCsvImport) {
      return 'Import CSV';
    }
    if (isLocal) {
      const cat = session.filters?.categories?.[0] || session.filters?.category || 'Commerce local';
      const loc = session.filters?.location || '';
      return loc ? `${cat} à ${loc}` : cat;
    }
    const domain = session.filters?.domain;
    return domain || 'Recherche large';
  });

  const displayLeads = $derived(Math.max(session.successfulLeads || 0, session.totalLeads || 0));

  const statusLabel = $derived.by(() => {
    switch (session.status) {
      case 'COMPLETED': return 'Terminée';
      case 'FAILED': return 'Échouée';
      case 'PENDING': return 'En attente';
      default: return session.status;
    }
  });

  const statusPillCls = $derived(
    session.status === 'FAILED'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted text-foreground'
  );

  const successRate = $derived(
    session.totalLeads > 0 && session.successfulLeads > 0
      ? Math.round((session.successfulLeads / session.totalLeads) * 100)
      : 0
  );

  const referenceDate = $derived(session.completedAt || session.startedAt || session.createdAt);
</script>

<div
  role="button"
  tabindex="0"
  onclick={() => goto(`/app/hunts/${session.id}`)}
  onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
  class="group rounded-xl border border-border bg-card transition-colors cursor-pointer hover:bg-muted/40"
>
  <div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <div class="flex-1 min-w-0">
        <p
          class="font-semibold text-foreground text-sm leading-snug truncate mb-1.5"
          title={huntTitle}
        >
          {huntTitle}
        </p>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusPillCls}">
            {statusLabel}
          </span>
          <span class="text-xs text-muted-foreground">
            {formatTimeAgo(referenceDate)}
          </span>
          <span class="text-xs text-muted-foreground">
            {isCsvImport ? 'CSV' : isLocal ? 'Local' : 'Domaine'}
          </span>
        </div>
      </div>

      <div
        class="flex items-center gap-1 shrink-0"
        role="presentation"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        {#if session.status === 'PENDING' && onCancel}
          <button
            onclick={() => onCancel!(session.id)}
            disabled={cancelling}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if cancelling}
              <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Annulation
            {:else}
              <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
              Annuler
            {/if}
          </button>
        {/if}

        {#if session.status === 'FAILED' && onRelaunch}
          <button
            onclick={() => onRelaunch!(session.id)}
            disabled={relaunching}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            title="Relancer la chasse"
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

        {#if (session.status === 'COMPLETED' || session.status === 'FAILED') && onDelete}
          <button
            onclick={() => onDelete!(session.id)}
            disabled={deleting}
            aria-label="Supprimer la chasse"
            class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Supprimer la chasse"
          >
            {#if deleting}
              <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            {:else}
              <iconify-icon icon="solar:trash-bin-trash-linear" width="16"></iconify-icon>
            {/if}
          </button>
        {/if}
      </div>
    </div>

    {#if session.status === 'FAILED' && session.error}
      <div class="rounded-lg bg-destructive/10 px-3 py-2.5 mb-4">
        <p class="text-xs text-destructive line-clamp-2 leading-relaxed break-words overflow-hidden">{session.error}</p>
      </div>
    {/if}

    <div class="flex items-center gap-4 pt-3 border-t border-border">
      <div class="flex items-center gap-1.5">
        <iconify-icon
          icon="solar:users-group-rounded-linear"
          width="15"
          class="text-muted-foreground"
        ></iconify-icon>
        <span class="text-sm font-medium text-foreground">{displayLeads}</span>
        <span class="hidden text-sm text-muted-foreground sm:inline">leads</span>
      </div>

      {#if session.status === 'COMPLETED' && displayLeads > 0}
        <div class="w-px h-3 bg-border"></div>
        <div class="flex items-center gap-1.5">
          <iconify-icon
            icon="solar:chart-2-linear"
            width="15"
            class="text-muted-foreground"
          ></iconify-icon>
          <span class="text-sm font-medium text-foreground">{successRate}%</span>
          <span class="hidden text-sm text-muted-foreground sm:inline">succès</span>
        </div>
      {/if}
    </div>
  </div>
</div>
