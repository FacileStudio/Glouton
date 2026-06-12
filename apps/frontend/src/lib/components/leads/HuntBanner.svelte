<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
      goto(`/app/hunts/${session.id}`);
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

  function formatElapsedTime(startedAt: Date | null, current: Date = new Date()): string {
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
      const cat = session.filters?.categories?.[0] || session.filters?.category || 'Commerce';
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
    class="rounded-xl border border-border bg-card p-6 transition-colors {clickable ? 'cursor-pointer hover:bg-muted/40' : ''}"
    role={clickable ? 'button' : 'region'}
    tabindex={clickable ? 0 : -1}
    onclick={handleClick}
    onkeydown={(e) => clickable && e.key === 'Enter' && handleClick()}
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
      <div class="flex items-center gap-3 min-w-0">
        <div class="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground shrink-0">
          <iconify-icon icon={huntIcon} width="18"></iconify-icon>
        </div>
        <div class="min-w-0">
          <h3 class="text-lg font-semibold text-foreground">{huntTitle}</h3>
          <div class="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
            <span class="rounded-full bg-muted px-2.5 py-0.5 font-medium text-foreground">
              {session.status}
            </span>
            <span class="truncate max-w-full sm:max-w-xs">
              {huntLabel}
            </span>
            {#if session.successfulLeads > 0}
              <span class="inline-flex items-center gap-1">
                <iconify-icon icon="solar:check-circle-linear" width="12"></iconify-icon>
                {session.successfulLeads} trouvés
              </span>
            {:else if session.totalLeads > 0 && session.progress === 0}
              <span class="inline-flex items-center gap-1">
                <iconify-icon icon="solar:map-point-search-linear" width="12"></iconify-icon>
                {session.totalLeads} découverts
              </span>
            {/if}
            {#if session.lastDiscoveredDomain}
              <span class="inline-flex items-center gap-1 truncate max-w-[200px]">
                <iconify-icon icon="solar:globe-linear" width="12"></iconify-icon>
                {session.lastDiscoveredDomain}
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 sm:shrink-0 sm:justify-start">
        <div class="text-left sm:text-right text-xs text-muted-foreground">
          <div>En cours : <span class="text-foreground font-medium">{elapsedTime}</span></div>
          <div>ETA : <span class="text-foreground font-medium">{eta}</span></div>
        </div>
        <button
          onclick={(e) => {
            e.stopPropagation();
            if (session) onCancel(session.id);
          }}
          disabled={cancelling}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if cancelling}
            <iconify-icon icon="solar:close-circle-linear" width="16" class="animate-spin"></iconify-icon>
            Annulation...
          {:else}
            <iconify-icon icon="solar:close-circle-linear" width="16"></iconify-icon>
            Annuler
          {/if}
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex justify-between text-xs text-muted-foreground">
        <span>Progression</span>
        <span class="font-medium text-foreground">{session.progress}%</span>
      </div>
      <div class="bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          class="bg-foreground h-full transition-all duration-500 ease-out"
          style="width: {session.progress}%"
        ></div>
      </div>
    </div>
  </div>
{/if}
