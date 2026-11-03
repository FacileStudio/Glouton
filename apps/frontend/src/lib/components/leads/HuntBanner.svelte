<script lang="ts">
  import type { HuntFilters } from '$lib/websocket-events';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Badge, Button, Spinner } from '@facile/muse';

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    filters?: HuntFilters | null;
    lastDiscoveredDomain?: string | null;
  }

  let {
    session,
    onCancel,
    cancelling = false,
    clickable = false,
  }: {
    session: HuntSession | null;
    onCancel: (id: string) => Promise<void>;
    cancelling: boolean;
    clickable?: boolean;
  } = $props();

  function handleClick() {
    if (clickable && session) {
      goto(resolve('/app/hunts/[id]', { id: session.id }));
    }
  }

  let currentTime = $state(new Date());
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timerInterval = setInterval(() => {
      currentTime = new Date();
    }, 1000);
  });

  onDestroy(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });

  function formatElapsedTime(startedAt: string | null, current: Date = new Date()): string {
    if (!startedAt) return '0s';

    const elapsedMs = current.getTime() - new Date(startedAt).getTime();
    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  function calculateETA(hunt: HuntSession, current: Date = new Date()): string {
    if (!hunt.startedAt || hunt.progress === 0) {
      return 'Calcul en cours...';
    }

    const elapsedMs = current.getTime() - new Date(hunt.startedAt).getTime();
    const progressPercentage = hunt.progress / 100;

    if (progressPercentage === 0) {
      return 'Calcul en cours...';
    }

    const estimatedTotalMs = elapsedMs / progressPercentage;
    const remainingMs = estimatedTotalMs - elapsedMs;

    if (remainingMs <= 0) {
      return 'Presque terminé';
    }

    const remainingSeconds = Math.floor(remainingMs / 1000);
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingHours = Math.floor(remainingMinutes / 60);

    if (remainingHours > 0) {
      return `~${remainingHours}h ${remainingMinutes % 60}m`;
    } else if (remainingMinutes > 0) {
      return `~${remainingMinutes}m`;
    } else {
      return 'Moins d\'1 min';
    }
  }

  const isLocalBusiness = $derived(session?.huntType === 'LOCAL_BUSINESS');

  const huntIcon = $derived(
    isLocalBusiness ? 'solar:map-point-linear' : 'solar:target-linear'
  );

  const huntTitle = $derived(
    isLocalBusiness ? 'Chasse locale en cours' : 'Découverte de domaines en cours'
  );

  const huntLabel = $derived.by(() => {
    if (!session) return '';
    if (isLocalBusiness) {
      const cat = session.filters?.categories?.[0] || 'Commerce';
      const loc = session.filters?.location || '';
      return loc ? `${cat} à ${loc}` : cat;
    }
    return session.filters?.domain || 'Recherche large';
  });

  const elapsedTime = $derived(session ? formatElapsedTime(session.startedAt, currentTime) : '');
  const eta = $derived(session ? calculateETA(session, currentTime) : '');
</script>

{#if session}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="flex flex-col gap-5 rounded-fc-md bg-fc-component p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring {clickable ? 'cursor-pointer hover:bg-fc-surface' : ''}"
    role={clickable ? 'button' : 'region'}
    tabindex={clickable ? 0 : -1}
    onclick={handleClick}
    onkeydown={(e) => clickable && e.key === 'Enter' && handleClick()}
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <div class="inline-flex size-9 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg">
          <iconify-icon icon={huntIcon} width="18" height="18" class="block"></iconify-icon>
        </div>
        <div class="min-w-0">
          <h3 class="text-fc-lg font-semibold text-fc-fg">{huntTitle}</h3>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-fc-xs text-fc-fg-muted">
            <Badge>{session.status}</Badge>
            <span class="max-w-full truncate sm:max-w-xs">
              {huntLabel}
            </span>
            {#if session.successfulLeads > 0}
              <span class="inline-flex items-center gap-1">
                <iconify-icon icon="solar:check-circle-linear" width="12" height="12" class="block"></iconify-icon>
                {session.successfulLeads} trouvés
              </span>
            {:else if session.totalLeads > 0 && session.progress === 0}
              <span class="inline-flex items-center gap-1">
                <iconify-icon icon="solar:map-point-search-linear" width="12" height="12" class="block"></iconify-icon>
                {session.totalLeads} découverts
              </span>
            {/if}
            {#if session.lastDiscoveredDomain}
              <span class="inline-flex max-w-[200px] items-center gap-1 truncate">
                <iconify-icon icon="solar:globe-linear" width="12" height="12" class="block"></iconify-icon>
                {session.lastDiscoveredDomain}
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 sm:shrink-0 sm:justify-start">
        <div class="text-left text-fc-xs text-fc-fg-muted sm:text-right">
          <div>En cours : <span class="font-medium text-fc-fg">{elapsedTime}</span></div>
          <div>ETA : <span class="font-medium text-fc-fg">{eta}</span></div>
        </div>
        <Button
          variant="ghost-danger"
          icon={cancelling ? undefined : 'solar:close-circle-linear'}
          onclick={(e) => {
            e.stopPropagation();
            if (session) onCancel(session.id);
          }}
          disabled={cancelling}
        >
          {#if cancelling}
            <Spinner size="sm" />
            Annulation...
          {:else}
            Annuler
          {/if}
        </Button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex justify-between text-fc-xs text-fc-fg-muted">
        <span>Progression</span>
        <span class="font-medium text-fc-fg">{session.progress}%</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-fc-pill bg-fc-surface">
        <div
          class="h-full bg-fc-accent transition-all duration-500 ease-fc"
          style="width: {session.progress}%"
        ></div>
      </div>
    </div>
  </div>
{/if}
