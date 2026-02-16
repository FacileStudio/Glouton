<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { setupHuntListeners, type HuntSession } from '$lib/websocket-events.svelte.js';
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
  let expandedHuntId = $state<string | null>(null);
  let huntLeadsMap = $state<Record<string, any[]>>({});
  let now = $state(new Date());

  let lastFailedHunts = new Set<string>();
  let lastCompletedHunts = new Set<string>();
  let timerInterval: any;
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
    timerInterval = setInterval(() => (now = new Date()), 1000);

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
    clearInterval(timerInterval);
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
      toast.push('Failed to load hunts data', 'error');
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
      toast.push('Hunt deleted', 'success');
      lastFailedHunts.delete(huntSessionId);
      await loadData();
    } finally {
      deletingHuntId = null;
    }
  }

  async function toggleHuntDetails(huntId: string) {
    if (expandedHuntId === huntId) return (expandedHuntId = null);
    expandedHuntId = huntId;
    if (!huntLeadsMap[huntId]) {
      const allLeads = await trpc.lead.query.list.query();
      huntLeadsMap[huntId] = allLeads.leads.filter((l) => l.huntSessionId === huntId);
    }
  }

  // --- Formatting Helpers ---
  const formatTimeAgo = (date: Date) => {
    const mins = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  const formatElapsedTime = (startDate: Date) => {
    const elapsed = Date.now() - new Date(startDate).getTime();
    const secs = Math.floor(elapsed / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);

    if (hours > 0) {
      return `${hours}h ${mins % 60}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs % 60}s`;
    }
    return `${secs}s`;
  };

  const calculateETA = (session: HuntSession) => {
    if (!session.startedAt || session.progress <= 0 || session.progress >= 100)
      return 'Calculating...';
    const elapsed = Date.now() - new Date(session.startedAt).getTime();
    const remaining = elapsed / (session.progress / 100) - elapsed;
    const mins = Math.ceil(remaining / 60000);
    return mins < 60 ? `~${mins}m` : `~${Math.floor(mins / 60)}h ${mins % 60}m`;
  };
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading hunts...
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
            Hunts<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">Lead hunt management</p>
        </div>
      </div>

      <a
        href="/app/hunts/new"
        class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20 whitespace-nowrap cursor-pointer"
      >
        <iconify-icon icon="solar:add-circle-bold" width="24"></iconify-icon>
        <span>New Hunt</span>
      </a>
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each [{ label: 'Pending', val: stats?.pendingHunts?.toString() || '0', icon: 'solar:history-bold-duotone', color: 'text-yellow-500' }, { label: 'Processing', val: stats?.processingHunts?.toString() || '0', icon: 'solar:rocket-2-bold-duotone', color: 'text-blue-500' }, { label: 'Completed', val: stats?.completedHunts?.toString() || '0', icon: 'solar:check-circle-bold-duotone', color: 'text-green-500' }, { label: 'Failed', val: stats?.failedHunts?.toString() || '0', icon: 'solar:close-circle-bold-duotone', color: 'text-red-500' }] as stat}
        <div
          class="p-8 rounded-[32px] shadow-lg hover:shadow-xl transition-shadow"
          style="background-color: #EFEAE6;"
        >
          <div class="flex items-start justify-between mb-6">
            <h3 class="text-lg font-bold text-neutral-700">{stat.label}</h3>
            <div class="p-3 bg-neutral-50 rounded-2xl flex-shrink-0">
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
            <h3 class="text-3xl font-black tracking-tight text-neutral-900">No Hunts Yet</h3>
            <p class="text-neutral-500 font-medium text-lg max-w-md">
              Start your first hunt to discover and collect leads based on filters like location,
              job titles, and departments
            </p>
          </div>
          <a
            href="/app/hunts/new"
            class="mt-4 bg-black text-white px-10 py-5 rounded-2xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-4 shadow-lg shadow-black/10 cursor-pointer"
          >
            <iconify-icon icon="solar:add-circle-bold" width="28"></iconify-icon>
            <span class="text-lg">Start Your First Hunt</span>
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
            <h3 class="text-3xl font-black tracking-tight text-neutral-900">All Clear</h3>
            <p class="text-neutral-500 font-medium text-lg max-w-md">
              No active, failed, or completed hunts to display
            </p>
          </div>
          <a
            href="/app/hunts/new"
            class="mt-4 bg-black text-white px-10 py-5 rounded-2xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-4 shadow-lg shadow-black/10 cursor-pointer"
          >
            <iconify-icon icon="solar:add-circle-bold" width="28"></iconify-icon>
            <span class="text-lg">Start New Hunt</span>
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
            <h2 class="text-2xl font-black tracking-tight">Failed Hunts</h2>
          </div>

          <div class="grid grid-cols-1 gap-4">
            {#each huntSessions.filter((s) => s.status === 'FAILED') as session (session.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => goto(`/app/hunts/${session.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
                class="rounded-xl p-6 relative overflow-hidden hover:shadow-xl transition-all cursor-pointer group shadow-lg"
                style="background-color: #EFEAE6;"
                in:fade
              >
                <div
                  class="absolute top-0 right-0 w-64 h-64 bg-red-400/5 rounded-full -mr-32 -mt-32 group-hover:bg-red-400/10 transition-colors"
                ></div>
                <div class="relative">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span
                          class="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-black uppercase"
                        >
                          Failed
                        </span>
                        <span class="text-xs font-bold text-neutral-400">
                          {formatTimeAgo(session.createdAt)} ago
                        </span>
                        <iconify-icon
                          icon="solar:alt-arrow-right-bold"
                          width="16"
                          class="text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        ></iconify-icon>
                      </div>
                      <h3 class="text-xl font-black text-neutral-900 mb-2 truncate">
                        {session.targetUrl}
                      </h3>
                      {#if session.error}
                        <div class="bg-red-50 border border-red-200 rounded-xl p-4 mt-3">
                          <div class="flex items-start gap-3">
                            <iconify-icon
                              icon="solar:info-circle-bold"
                              width="20"
                              class="text-red-600 flex-shrink-0 mt-0.5"
                            ></iconify-icon>
                            <div>
                              <p class="text-sm font-bold text-red-800 mb-1">Error Details:</p>
                              <p class="text-sm text-red-700 font-medium">{session.error}</p>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                    <div class="mt-4">
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          deleteHunt(session.id);
                        }}
                        disabled={deletingHuntId === session.id}
                        class="px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                      >
                        {#if deletingHuntId === session.id}
                          <div
                            class="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"
                          ></div>
                          <span>Deleting...</span>
                        {:else}
                          <iconify-icon icon="solar:trash-bin-trash-bold" width="16"></iconify-icon>
                          <span>Delete</span>
                        {/if}
                      </button>
                    </div>
                  </div>
                </div>
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
            <h2 class="text-2xl font-black tracking-tight" style="color: #291334;">Active Hunts</h2>
          </div>

          <div class="grid grid-cols-1 gap-4">
            {#each huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING') as session (session.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => goto(`/app/hunts/${session.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
                class="rounded-xl p-6 relative overflow-hidden hover:shadow-xl transition-all cursor-pointer group shadow-lg"
                class:border-2={session.status === 'PROCESSING'}
                class:border-green-400={session.status === 'PROCESSING'}
                style="background-color: #EFEAE6;"
                in:fade
              >
                {#if session.status === 'PROCESSING'}
                  <div class="absolute inset-0 animate-hunt-wave"></div>
                {:else}
                  <div
                    class="absolute top-0 right-0 w-64 h-64 rounded-full -mr-32 -mt-32 group-hover:opacity-50 transition-opacity"
                    style="background-color: rgba(254, 193, 41, 0.05);"
                  ></div>
                {/if}
                <div class="relative">
                  <div class="flex items-start justify-between mb-4">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span
                          class="px-3 py-1 rounded-lg text-xs font-black uppercase"
                          class:bg-yellow-400={session.status === 'PENDING'}
                          class:text-neutral-900={session.status === 'PENDING'}
                          class:bg-green-500={session.status === 'PROCESSING'}
                          class:text-white={session.status === 'PROCESSING'}
                        >
                          {session.status === 'PENDING' ? 'Queued' : 'Hunting'}
                        </span>
                        <span class="text-xs font-bold text-neutral-400">
                          {formatTimeAgo(session.createdAt)} ago
                        </span>
                        <iconify-icon
                          icon="solar:alt-arrow-right-bold-duotone"
                          width="16"
                          class="opacity-0 group-hover:opacity-100 transition-opacity"
                          style="color: #FEC129;"
                        ></iconify-icon>
                      </div>
                      <h3 class="text-xl font-black text-neutral-900 mb-1 truncate">
                        {session.targetUrl || 'Broad Search'}
                      </h3>
                      <div class="flex items-center gap-2">
                        <p class="text-sm text-neutral-600 font-medium">
                          {session.successfulLeads} leads found
                        </p>
                        {#if session.status === 'PROCESSING' && session.successfulLeads > 0}
                          <span
                            class="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs font-black animate-pulse"
                          >
                            LIVE
                          </span>
                        {/if}
                      </div>
                    </div>
                    <div class="flex flex-col items-end gap-3">
                      <div class="text-right space-y-1">
                        <div class="text-3xl font-black text-yellow-500">{session.progress}%</div>
                        <div class="text-xs font-bold text-neutral-400">Complete</div>
                        {#if session.status === 'PROCESSING' && session.startedAt}
                          <div class="text-xs font-bold text-green-600">
                            Running: {formatElapsedTime(session.startedAt)}
                          </div>
                        {/if}
                        {#if session.status === 'PROCESSING' && session.progress < 100}
                          <div class="text-xs font-bold text-yellow-600">
                            ETA: {calculateETA(session)}
                          </div>
                        {/if}
                      </div>
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          cancelHunt(session.id);
                        }}
                        disabled={cancellingHuntId === session.id}
                        class="px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                      >
                        {#if cancellingHuntId === session.id}
                          <div
                            class="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"
                          ></div>
                          <span>Cancelling...</span>
                        {:else}
                          <iconify-icon icon="solar:close-circle-bold" width="16"></iconify-icon>
                          <span>Cancel</span>
                        {/if}
                      </button>
                    </div>
                  </div>

                  <div class="w-full h-3 bg-neutral-100 rounded-full overflow-hidden relative">
                    <div
                      class="h-full rounded-full transition-all duration-1000 ease-out"
                      style="width: {session.progress}%; background: linear-gradient(to right, #FEC129, #ff9800);"
                    ></div>
                  </div>
                </div>
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
            <h2 class="text-2xl font-black tracking-tight">Completed Hunts</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each huntSessions.filter((s) => s.status === 'COMPLETED') as session (session.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => goto(`/app/hunts/${session.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
                class="rounded-xl p-6 hover:-translate-y-1 transition-transform relative cursor-pointer group shadow-lg"
                style="background-color: #EFEAE6;"
                in:fade
              >
                <div class="flex items-start justify-between mb-4">
                  <div class="flex-1 space-y-1">
                    <h3 class="text-lg font-black text-neutral-900 truncate">
                      {session.targetUrl || 'Broad Search'}
                    </h3>
                    <p class="text-xs font-bold text-neutral-400">
                      {formatTimeAgo(session.completedAt || session.createdAt)} ago
                    </p>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        deleteHunt(session.id);
                      }}
                      disabled={deletingHuntId === session.id}
                      class="p-1.5 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10 cursor-pointer"
                      title="Delete hunt"
                    >
                      {#if deletingHuntId === session.id}
                        <div
                          class="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"
                        ></div>
                      {:else}
                        <iconify-icon
                          icon="solar:trash-bin-trash-bold"
                          width="18"
                          class="text-neutral-400 hover:text-red-600"
                        ></iconify-icon>
                      {/if}
                    </button>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-sm mb-3">
                  <div>
                    <span class="font-bold text-neutral-500">Total:</span>
                    <span class="font-black text-black ml-1">{session.totalLeads}</span>
                  </div>
                  <div>
                    <span class="font-bold text-neutral-500">Success:</span>
                    <span class="font-black text-green-600 ml-1">{session.successfulLeads}</span>
                  </div>
                </div>
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
