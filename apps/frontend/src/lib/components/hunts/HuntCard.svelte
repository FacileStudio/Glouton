<script lang="ts">
  import type { HuntFilters } from '$lib/websocket-events';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Badge, Button, Icon, IconButton, Spinner, icons } from '@facile/muse';

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    sources?: string[];
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    totalLeads: number;
    successfulLeads: number;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    filters?: HuntFilters | null;
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

  function formatTimeAgo(date: string): string {
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
      const cat = session.filters?.categories?.[0] || 'Commerce local';
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

  const statusTone = $derived(session.status === 'FAILED' ? 'danger' : 'neutral');

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
  onclick={() => goto(resolve('/app/hunts/[id]', { id: session.id }))}
  onkeydown={(e) => e.key === 'Enter' && goto(resolve('/app/hunts/[id]', { id: session.id }))}
  class="group flex cursor-pointer flex-col gap-4 rounded-fc-md bg-fc-component p-5 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
>
  <div class="flex items-start gap-3">
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <p class="truncate text-fc-sm font-semibold text-fc-fg" title={huntTitle}>
        {huntTitle}
      </p>
      <div class="flex flex-wrap items-center gap-2 text-fc-xs text-fc-fg-muted">
        <Badge tone={statusTone}>{statusLabel}</Badge>
        <span>{formatTimeAgo(referenceDate)}</span>
        <span>{isCsvImport ? 'CSV' : isLocal ? 'Local' : 'Domaine'}</span>
      </div>
    </div>

    <div
      class="flex shrink-0 items-center gap-1"
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      {#if session.status === 'PENDING' && onCancel}
        <Button
          variant="ghost-danger"
          size="sm"
          icon={cancelling ? undefined : icons.error}
          onclick={() => onCancel!(session.id)}
          disabled={cancelling}
        >
          {#if cancelling}
            <Spinner size="sm" label="Annulation" />
            Annulation
          {:else}
            Annuler
          {/if}
        </Button>
      {/if}

      {#if session.status === 'FAILED' && onRelaunch}
        <Button
          variant="outline"
          size="sm"
          icon={relaunching ? undefined : 'solar:restart-linear'}
          onclick={() => onRelaunch!(session.id)}
          disabled={relaunching}
          title="Relancer la chasse"
        >
          {#if relaunching}
            <Spinner size="sm" label="Relance" />
            Relance
          {:else}
            Relancer
          {/if}
        </Button>
      {/if}

      {#if (session.status === 'COMPLETED' || session.status === 'FAILED') && onDelete}
        <IconButton
          variant="danger"
          onclick={() => onDelete!(session.id)}
          disabled={deleting}
          aria-label="Supprimer la chasse"
          title="Supprimer la chasse"
        >
          {#if deleting}
            <Spinner size="sm" label="Suppression" />
          {:else}
            <Icon icon="solar:trash-bin-trash-linear" />
          {/if}
        </IconButton>
      {/if}
    </div>
  </div>

  {#if session.status === 'FAILED' && session.error}
    <div class="rounded-fc-sm bg-fc-danger/10 px-3 py-2.5">
      <p class="line-clamp-2 overflow-hidden break-words text-fc-xs text-fc-danger">{session.error}</p>
    </div>
  {/if}

  <div class="flex items-center gap-4 border-t border-fc-border pt-3">
    <div class="flex items-center gap-1.5">
      <Icon icon={icons.usersGroup} size={15} class="text-fc-fg-muted" />
      <span class="text-fc-sm font-medium text-fc-fg">{displayLeads}</span>
      <span class="hidden text-fc-sm text-fc-fg-muted sm:inline">leads</span>
    </div>

    {#if session.status === 'COMPLETED' && displayLeads > 0}
      <div class="flex items-center gap-1.5">
        <Icon icon={icons.dashboard} size={15} class="text-fc-fg-muted" />
        <span class="text-fc-sm font-medium text-fc-fg">{successRate}%</span>
        <span class="hidden text-fc-sm text-fc-fg-muted sm:inline">succès</span>
      </div>
    {/if}
  </div>
</div>
