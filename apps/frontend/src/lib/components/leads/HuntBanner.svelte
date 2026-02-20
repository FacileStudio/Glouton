<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
  }: {
    session: HuntSession | null;
    onCancel: (id: string) => Promise<void>;
    cancelling: boolean;
  } = $props();

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
    isLocalBusiness ? 'solar:map-point-bold' : 'solar:target-bold'
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
  <div class="rounded-[32px] shadow-lg p-8 bg-gradient-to-r from-black to-neutral-800 text-white">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
          <iconify-icon icon={huntIcon} width="28"></iconify-icon>
        </div>
        <div>
          <h3 class="text-2xl font-black tracking-tight">{huntTitle}</h3>
          <div class="flex items-center gap-4 mt-1 flex-wrap">
            <span class="bg-white/20 px-3 py-1 rounded-lg text-xs font-bold uppercase">
              {session.status}
            </span>
            <span class="text-sm font-medium opacity-90 truncate max-w-xs">
              {huntLabel}
            </span>
            {#if session.successfulLeads > 0}
              <span class="text-sm font-medium">
                <iconify-icon icon="solar:check-circle-bold" width="14" class="mr-1"></iconify-icon>
                {session.successfulLeads} trouvés
              </span>
            {:else if session.totalLeads > 0 && session.progress === 0}
              <span class="text-sm font-medium opacity-80">
                <iconify-icon icon="solar:map-point-search-bold" width="14" class="mr-1"></iconify-icon>
                {session.totalLeads} découverts
              </span>
            {/if}
            {#if session.lastDiscoveredDomain}
              <span class="text-xs font-medium opacity-70 truncate max-w-[200px]">
                <iconify-icon icon="solar:globe-bold" width="12" class="mr-1"></iconify-icon>
                {session.lastDiscoveredDomain}
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-6 flex-shrink-0">
        <div class="text-right">
          <div class="text-sm font-medium opacity-90">En cours : {elapsedTime}</div>
          <div class="text-sm font-medium opacity-90">ETA : {eta}</div>
        </div>
        <button
          onclick={() => session && onCancel(session.id)}
          disabled={cancelling}
          class="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {#if cancelling}
            <iconify-icon icon="solar:close-circle-bold" width="20" class="animate-spin mr-2"></iconify-icon>
            Annulation...
          {:else}
            <iconify-icon icon="solar:close-circle-bold" width="20" class="mr-2"></iconify-icon>
            Annuler
          {/if}
        </button>
      </div>
    </div>

    <div class="space-y-3">
      <div class="flex justify-between text-sm font-medium">
        <span>Progression</span>
        <span class="font-black">{session.progress}%</span>
      </div>
      <div class="bg-white/20 rounded-full h-3 overflow-hidden">
        <div
          class="bg-white h-full transition-all duration-500 ease-out rounded-full"
          style="width: {session.progress}%"
        ></div>
      </div>
    </div>
  </div>
{/if}
