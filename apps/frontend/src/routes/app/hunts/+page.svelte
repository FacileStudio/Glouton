<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { setupHuntListeners, type HuntSession } from '$lib/websocket-events.svelte';
  import HuntBanner from '$lib/components/leads/HuntBanner.svelte';
  import HuntCard from '$lib/components/hunts/HuntCard.svelte';
  import 'iconify-icon';

  interface Stats {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    pendingHunts: number;
    processingHunts: number;
    completedHunts: number;
    failedHunts: number;
    successRate: number;
    averageScore: number;
  }

  // --- Reactive State ---
  let stats = $state<Stats | null>(null);
  let huntSessions = $state<HuntSession[]>([]);
  let loading = $state(true);
  let cancellingHuntId = $state<string | null>(null);
  let deletingHuntId = $state<string | null>(null);
  let lastFailedHunts = new Set<string>();
  let lastCompletedHunts = new Set<string>();
  let wsUnsubscribers: (() => void)[] = [];

  // --- WebSocket Helpers ---
  const updateHuntSession = (id: string, updates: Partial<HuntSession>) => {
    const index = huntSessions.findIndex(s => s.id === id);
    if (index !== -1) {
      huntSessions[index] = { ...huntSessions[index], ...updates };
      return true;
    }
    return false;
  };

  const addHuntSession = (session: HuntSession) => {
    huntSessions = [session, ...huntSessions];
  };

  // --- Lifecycle ---
  onMount(async () => {
    // Setup WebSocket listeners
    wsUnsubscribers = setupHuntListeners(
      updateHuntSession,
      addHuntSession,
      loadData,
      loadStats
    );

    await loadData();
    await loadStats();
  });

  onDestroy(() => {
    wsUnsubscribers.forEach(unsub => unsub());
  });

  async function loadData() {
    try {
      const sessionsData = await trpc.lead.hunt.list.query();
      huntSessions = Array.isArray(sessionsData) ? sessionsData : [];

      huntSessions.forEach((s) => {
        if (s.status === 'FAILED' && !lastFailedHunts.has(s.id)) lastFailedHunts.add(s.id);
        if (s.status === 'COMPLETED' && !lastCompletedHunts.has(s.id)) lastCompletedHunts.add(s.id);
      });
    } catch (error: any) {
      if (error?.data?.code === 'UNAUTHORIZED') return goto('/login');
      toast.push('Échec du chargement des chasses', 'error');
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      const statsData = await trpc.lead.query.getStats.query();
      stats = statsData || null;
    } catch (error: any) {
      console.error('Error loading stats:', error);
    }
  }

  async function cancelHunt(huntSessionId: string) {
    cancellingHuntId = huntSessionId;
    try {
      await trpc.lead.hunt.cancel.mutate({ huntSessionId });
      // The WebSocket event will update the session status to 'CANCELLED'
      // which will remove it from the active hunts section
    } finally {
      cancellingHuntId = null;
    }
  }

  async function deleteHunt(huntSessionId: string) {
    deletingHuntId = huntSessionId;
    try {
      await trpc.lead.hunt.delete.mutate({ huntSessionId });
      toast.push('Chasse supprimée', 'success');
      lastFailedHunts.delete(huntSessionId);
      await loadData();
    } finally {
      deletingHuntId = null;
    }
  }



</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Chargement des chasses...
    </p>
  </div>
{:else}
  <div
    class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans"
    style="background-color: #FAF7F5; selection-background-color: #FEC129;"
  >
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
          <iconify-icon icon="solar:lightning-bold" width="32" class="text-white"></iconify-icon>
        </div>
        <div class="space-y-1">
          <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
            Chasses<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">Gestion des chasses aux leads</p>
        </div>
      </div>

      <a
        href="/app/hunts/new"
        class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20 whitespace-nowrap cursor-pointer"
      >
        <iconify-icon icon="solar:add-circle-bold" width="24"></iconify-icon>
        <span>Nouvelle chasse</span>
      </a>
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each [{ label: 'En attente', val: stats?.pendingHunts?.toString() || '0', icon: 'solar:history-bold-duotone', color: 'text-yellow-500' }, { label: 'En cours', val: stats?.processingHunts?.toString() || '0', icon: 'solar:rocket-2-bold-duotone', color: 'text-blue-500' }, { label: 'Terminées', val: stats?.completedHunts?.toString() || '0', icon: 'solar:check-circle-bold-duotone', color: 'text-green-500' }, { label: 'Échouées', val: stats?.failedHunts?.toString() || '0', icon: 'solar:close-circle-bold-duotone', color: 'text-red-500' }] as stat}
        <div
          class="p-8 rounded-[32px] shadow-lg hover:shadow-xl transition-shadow"
          style="background-color: #EFEAE6;"
        >
          <div class="flex items-start justify-between mb-6">
            <h3 class="text-lg font-bold text-neutral-700">{stat.label}</h3>
            <div class="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <iconify-icon icon={stat.icon} class={stat.color} width="28"></iconify-icon>
            </div>
          </div>
          <p class="text-5xl font-black tracking-tighter">{stat.val}</p>
        </div>
      {/each}
    </section>

    {#if huntSessions.length === 0}
      <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
        <div class="flex flex-col items-center justify-center py-32 px-6 space-y-6">
          <div class="w-32 h-32 bg-yellow-50 rounded-[32px] flex items-center justify-center">
            <iconify-icon icon="solar:lightning-bold-duotone" width="64" style="color: #FEC129;"
            ></iconify-icon>
          </div>
          <div class="text-center space-y-3">
            <h3 class="text-3xl font-black tracking-tight text-neutral-900">Aucune chasse pour l'instant</h3>
            <p class="text-neutral-500 font-medium text-lg max-w-md">
              Lancez votre première chasse pour découvrir et collecter des leads selon des filtres comme la localisation, les postes et les départements
            </p>
          </div>
          <a
            href="/app/hunts/new"
            class="mt-4 bg-black text-white px-10 py-5 rounded-2xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-4 shadow-lg shadow-black/10 cursor-pointer"
          >
            <iconify-icon icon="solar:add-circle-bold" width="28"></iconify-icon>
            <span class="text-lg">Lancer votre première chasse</span>
          </a>
        </div>
      </section>
    {:else if huntSessions.filter((s) => s.status === 'FAILED').length === 0 && huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length === 0 && huntSessions.filter((s) => s.status === 'COMPLETED').length === 0}
      <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
        <div class="flex flex-col items-center justify-center py-32 px-6 space-y-6">
          <div class="w-32 h-32 bg-neutral-50 rounded-[32px] flex items-center justify-center">
            <iconify-icon icon="solar:ghost-bold" width="64" class="text-neutral-300"
            ></iconify-icon>
          </div>
          <div class="text-center space-y-3">
            <h3 class="text-3xl font-black tracking-tight text-neutral-900">Tout est vide</h3>
            <p class="text-neutral-500 font-medium text-lg max-w-md">
              Aucune chasse active, échouée ou terminée à afficher
            </p>
          </div>
          <a
            href="/app/hunts/new"
            class="mt-4 bg-black text-white px-10 py-5 rounded-2xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-4 shadow-lg shadow-black/10 cursor-pointer"
          >
            <iconify-icon icon="solar:add-circle-bold" width="28"></iconify-icon>
            <span class="text-lg">Nouvelle chasse</span>
          </a>
        </div>
      </section>
    {:else}
      {#if huntSessions.filter((s) => s.status === 'FAILED').length > 0}
        <section class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:danger-bold" width="20" class="text-white"></iconify-icon>
            </div>
            <h2 class="text-2xl font-black tracking-tight">Chasses échouées</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each huntSessions.filter((s) => s.status === 'FAILED') as session (session.id)}
              <div in:fade>
                <HuntCard
                  {session}
                  onDelete={deleteHunt}
                  deleting={deletingHuntId === session.id}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length > 0}
        <section class="space-y-4">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center"
              style="background-color: #FEC129;"
            >
              <iconify-icon icon="solar:lightning-bold-duotone" width="20" class="text-white"
              ></iconify-icon>
            </div>
            <h2 class="text-2xl font-black tracking-tight" style="color: #291334;">Chasses actives</h2>
          </div>
          <div class="flex flex-col gap-4">
            {#each huntSessions.filter((s) => s.status === 'PROCESSING') as session (session.id)}
              <div in:fade>
                <HuntBanner
                  {session}
                  onCancel={cancelHunt}
                  cancelling={cancellingHuntId === session.id}
                />
              </div>
            {/each}
            {#each huntSessions.filter((s) => s.status === 'PENDING') as session (session.id)}
              <div in:fade>
                <HuntCard
                  {session}
                  onCancel={cancelHunt}
                  cancelling={cancellingHuntId === session.id}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if huntSessions.filter((s) => s.status === 'COMPLETED').length > 0}
        <section class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:verified-check-bold" width="20" class="text-white"
              ></iconify-icon>
            </div>
            <h2 class="text-2xl font-black tracking-tight">Chasses terminées</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each huntSessions.filter((s) => s.status === 'COMPLETED') as session (session.id)}
              <div in:fade>
                <HuntCard
                  {session}
                  onDelete={deleteHunt}
                  deleting={deletingHuntId === session.id}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
{/if}

<style>
  @keyframes hunt-wave {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  :global(.animate-hunt-wave) {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(34, 197, 94, 0.2) 50%,
      transparent 100%
    );
    animation: hunt-wave 2s ease-in-out infinite;
  }
</style>
