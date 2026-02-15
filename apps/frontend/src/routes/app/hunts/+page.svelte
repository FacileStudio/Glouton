<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import { authStore } from '$lib/auth-store';
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

  interface HuntSession {
    id: string;
    targetUrl: string;
    speed: number;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }

  let stats: Stats | null = null;
  let huntSessions: HuntSession[] = [];
  let loading = true;
  let cancellingHuntId: string | null = null;
  let deletingHuntId: string | null = null;
  let lastFailedHunts = new Set<string>();
  let lastCompletedHunts = new Set<string>();
  let lastHuntCounts: Record<string, { success: number; total: number }> = {};
  let expandedHuntId: string | null = null;
  let huntLeadsMap: Record<string, any[]> = {};
  let now = new Date();
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  let unsubscribeHuntUpdate: (() => void) | null = null;
  let unsubscribeHuntCompleted: (() => void) | null = null;
  let unsubscribeStatsChanged: (() => void) | null = null;

  /**
   * onMount
   */
  onMount(async () => {
    timerInterval = setInterval(() => {
      now = new Date();
    }, 1000);
    await loadData();

    unsubscribeHuntUpdate = ws.on('hunt-update', (data: any) => {
      console.log('[Hunts] Received hunt-update:', {
        huntSessionId: data.huntSessionId?.slice(0, 8),
        progress: data.progress,
        totalLeads: data.totalLeads,
        successfulLeads: data.successfulLeads,
        status: data.status,
      });

      const session = huntSessions.find(s => s.id === data.huntSessionId);
      /**
       * if
       */
      if (session) {
        const oldLeads = session.successfulLeads;
        session.progress = data.progress;
        session.totalLeads = data.totalLeads;
        session.successfulLeads = data.successfulLeads;
        session.status = data.status;
        huntSessions = [...huntSessions];

        /**
         * if
         */
        if (data.successfulLeads > oldLeads) {
          console.log(`[Hunts] Lead count updated: ${oldLeads} → ${data.successfulLeads} (+${data.successfulLeads - oldLeads})`);
        }
      } else {
        console.warn('[Hunts] Hunt session not found in local state:', data.huntSessionId?.slice(0, 8));
      }
    });

    unsubscribeHuntCompleted = ws.on('hunt-completed', async (data: any) => {
      console.log('[Hunts] Received hunt-completed:', {
        huntSessionId: data.huntSessionId?.slice(0, 8),
        totalLeads: data.totalLeads,
        successfulLeads: data.successfulLeads,
      });

      const session = huntSessions.find(s => s.id === data.huntSessionId);
      /**
       * if
       */
      if (session) {
        session.progress = 100;
        session.totalLeads = data.totalLeads;
        session.successfulLeads = data.successfulLeads;
        session.status = 'COMPLETED';
        huntSessions = [...huntSessions];

        toast.push(`Hunt completed! Found ${data.successfulLeads} leads`, 'success');
        await loadData();
      }
    });

    unsubscribeStatsChanged = ws.on('stats-changed', async () => {
      try {
        const [statsData, sessionsData] = await Promise.all([
          trpc.lead.query.getStats.query(),
          trpc.lead.hunt.list.query(),
        ]);
        /**
         * if
         */
        if (statsData) stats = statsData;
        /**
         * if
         */
        if (sessionsData) huntSessions = sessionsData;
      } catch (error) {
        console.error('Error refreshing hunt data:', error);
      }
    });
  });

  /**
   * onDestroy
   */
  onDestroy(() => {
    /**
     * if
     */
    if (unsubscribeHuntUpdate) unsubscribeHuntUpdate();
    /**
     * if
     */
    if (unsubscribeHuntCompleted) unsubscribeHuntCompleted();
    /**
     * if
     */
    if (unsubscribeStatsChanged) unsubscribeStatsChanged();
    /**
     * if
     */
    if (timerInterval) clearInterval(timerInterval);
  });

  /**
   * loadData
   */
  async function loadData() {
    try {
      const [statsData, sessionsData] = await Promise.all([
        trpc.lead.query.getStats.query(),
        trpc.lead.hunt.list.query(),
      ]);

      stats = statsData || null;
      huntSessions = sessionsData || [];

      /**
       * if
       */
      if (!sessionsData || !Array.isArray(sessionsData)) {
        huntSessions = [];
        return;
      }

      const newFailedHunts = sessionsData.filter(s => s.status === 'FAILED' && !lastFailedHunts.has(s.id));
      /**
       * for
       */
      for (const failedHunt of newFailedHunts) {
        const errorMsg = failedHunt.error || 'Unknown error occurred';
        toast.push(`Hunt failed: ${errorMsg}`, 'error');
        lastFailedHunts.add(failedHunt.id);
      }

      const newlyCompletedHunts = sessionsData.filter(s => s.status === 'COMPLETED' && !lastCompletedHunts.has(s.id));
      /**
       * for
       */
      for (const completedHunt of newlyCompletedHunts) {
        toast.push(`Hunt completed! Found ${completedHunt.successfulLeads} leads from ${completedHunt.targetUrl || 'broad search'}`, 'success');
        lastCompletedHunts.add(completedHunt.id);
      }

      /**
       * for
       */
      for (const session of sessionsData) {
        /**
         * if
         */
        if (session.status === 'PROCESSING') {
          const lastCount = lastHuntCounts[session.id];
          lastHuntCounts[session.id] = { success: session.successfulLeads, total: session.totalLeads };
        }
      }
    } catch (error: any) {
      console.error('Error loading data:', error);

      /**
       * if
       */
      if (error?.data?.code === 'UNAUTHORIZED' || error?.message?.includes('log in')) {
        toast.push('Please log in to view hunts', 'error');
        /**
         * goto
         */
        goto('/login');
        return;
      }

      toast.push('Failed to load hunts data', 'error');
      huntSessions = [];
      stats = null;
    } finally {
      loading = false;
    }
  }

  /**
   * formatTimeAgo
   */
  function formatTimeAgo(date: Date): string {
    const nowTime = new Date();
    const diffMs = nowTime.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    /**
     * if
     */
    if (diffMins < 60) return `${diffMins}m`;
    /**
     * if
     */
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}j`;
  }

  /**
   * formatElapsedTime
   */
  function formatElapsedTime(startedAt: Date | null): string {
    /**
     * if
     */
    if (!startedAt) return '0s';

    const elapsedMs = now.getTime() - new Date(startedAt).getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedHours = Math.floor(elapsedMinutes / 60);

    /**
     * if
     */
    if (elapsedHours > 0) {
      const mins = elapsedMinutes % 60;
      const secs = elapsedSeconds % 60;
      return `${elapsedHours}h ${mins}m ${secs}s`;
    } else if (elapsedMinutes > 0) {
      const secs = elapsedSeconds % 60;
      return `${elapsedMinutes}m ${secs}s`;
    } else {
      return `${elapsedSeconds}s`;
    }
  }

  /**
   * calculateETA
   */
  function calculateETA(session: HuntSession): string {
    /**
     * if
     */
    if (!session.startedAt || session.progress >= 100) {
      return 'Calculating...';
    }

    /**
     * if
     */
    if (session.progress === 0) {
      return 'Starting...';
    }

    const now = Date.now();
    const startTime = new Date(session.startedAt).getTime();
    const elapsedMs = now - startTime;
    const progressPercent = session.progress / 100;

    const estimatedTotalMs = elapsedMs / progressPercent;
    const remainingMs = estimatedTotalMs - elapsedMs;

    /**
     * if
     */
    if (remainingMs <= 0) return 'Almost done...';

    const remainingMins = Math.ceil(remainingMs / 60000);
    const remainingHours = Math.floor(remainingMins / 60);
    const remainingDays = Math.floor(remainingHours / 24);

    /**
     * if
     */
    if (remainingMins < 1) return 'Less than 1m';
    /**
     * if
     */
    if (remainingMins < 60) return `~${remainingMins}m`;
    /**
     * if
     */
    if (remainingHours < 24) {
      const mins = remainingMins % 60;
      return mins > 0 ? `~${remainingHours}h ${mins}m` : `~${remainingHours}h`;
    }
    return `~${remainingDays}d`;
  }

  /**
   * cancelHunt
   */
  async function cancelHunt(huntSessionId: string) {
    cancellingHuntId = huntSessionId;
    try {
      await trpc.lead.hunt.cancel.mutate({ huntSessionId });
      toast.push('Hunt cancelled successfully', 'success');
      await loadData();
    } catch (error) {
      toast.push('Failed to cancel hunt', 'error');
      console.error('Error cancelling hunt:', error);
    } finally {
      cancellingHuntId = null;
    }
  }

  /**
   * deleteHunt
   */
  async function deleteHunt(huntSessionId: string) {
    deletingHuntId = huntSessionId;
    try {
      await trpc.lead.hunt.delete.mutate({ huntSessionId });
      toast.push('Hunt deleted successfully', 'success');
      lastFailedHunts.delete(huntSessionId);
      await loadData();
    } catch (error) {
      toast.push('Failed to delete hunt', 'error');
      console.error('Error deleting hunt:', error);
    } finally {
      deletingHuntId = null;
    }
  }

  /**
   * toggleHuntDetails
   */
  async function toggleHuntDetails(huntId: string) {
    /**
     * if
     */
    if (expandedHuntId === huntId) {
      expandedHuntId = null;
    } else {
      expandedHuntId = huntId;
      /**
       * if
       */
      if (!huntLeadsMap[huntId]) {
        await loadHuntLeads(huntId);
      }
    }
  }

  /**
   * loadHuntLeads
   */
  async function loadHuntLeads(huntSessionId: string) {
    try {
      const allLeads = await trpc.lead.query.list.query();
      const hunts = allLeads.leads.filter(lead => lead.huntSessionId === huntSessionId);
      huntLeadsMap[huntSessionId] = hunts;
    } catch (error) {
      console.error('Failed to load hunt leads:', error);
      toast.push('Failed to load hunt leads', 'error');
    }
  }
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading hunts...
    </p>
  </div>
{:else}
  <div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans" style="background-color: #FAF7F5; selection-background-color: #FEC129;">

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
      {#each [
          { label: 'Pending', val: stats?.pendingHunts?.toString() || '0', icon: 'solar:history-bold-duotone', color: 'text-yellow-500' },
          { label: 'Processing', val: stats?.processingHunts?.toString() || '0', icon: 'solar:rocket-2-bold-duotone', color: 'text-blue-500' },
          { label: 'Completed', val: stats?.completedHunts?.toString() || '0', icon: 'solar:check-circle-bold-duotone', color: 'text-green-500' },
          { label: 'Failed', val: stats?.failedHunts?.toString() || '0', icon: 'solar:close-circle-bold-duotone', color: 'text-red-500' }
      ] as stat}
          <div class="p-8 rounded-[32px] shadow-lg hover:shadow-xl transition-shadow" style="background-color: #EFEAE6;">
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
          <iconify-icon icon="solar:lightning-bold-duotone" width="64" style="color: #FEC129;"></iconify-icon>
        </div>
        <div class="text-center space-y-3">
          <h3 class="text-3xl font-black tracking-tight text-neutral-900">
            No Hunts Yet
          </h3>
          <p class="text-neutral-500 font-medium text-lg max-w-md">
            Start your first hunt to discover and collect leads based on filters like location, job titles, and departments
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
  {:else if huntSessions.filter(s => s.status === 'FAILED').length === 0 &&
           huntSessions.filter(s => s.status === 'PENDING' || s.status === 'PROCESSING').length === 0 &&
           huntSessions.filter(s => s.status === 'COMPLETED').length === 0}
    <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      <div class="flex flex-col items-center justify-center py-32 px-6 space-y-6">
        <div class="w-32 h-32 bg-neutral-50 rounded-[32px] flex items-center justify-center">
          <iconify-icon icon="solar:ghost-bold" width="64" class="text-neutral-300"></iconify-icon>
        </div>
        <div class="text-center space-y-3">
          <h3 class="text-3xl font-black tracking-tight text-neutral-900">
            All Clear
          </h3>
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
    {#if huntSessions.filter(s => s.status === 'FAILED').length > 0}
      <section class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:danger-bold" width="20" class="text-white"></iconify-icon>
          </div>
          <h2 class="text-2xl font-black tracking-tight">Failed Hunts</h2>
        </div>

        <div class="grid grid-cols-1 gap-4">
          {#each huntSessions.filter(s => s.status === 'FAILED') as session (session.id)}
            <div
              role="button"
              tabindex="0"
              onclick={() => goto(`/app/hunts/${session.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
              class="rounded-xl p-6 relative overflow-hidden hover:shadow-xl transition-all cursor-pointer group shadow-lg" style="background-color: #EFEAE6;"
              in:fade
            >
              <div class="absolute top-0 right-0 w-64 h-64 bg-red-400/5 rounded-full -mr-32 -mt-32 group-hover:bg-red-400/10 transition-colors"></div>
              <div class="relative">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <span class="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-black uppercase">
                        Failed
                      </span>
                      <span class="text-xs font-bold text-neutral-400">
                        {formatTimeAgo(session.createdAt)} ago
                      </span>
                      <iconify-icon icon="solar:alt-arrow-right-bold" width="16" class="text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"></iconify-icon>
                    </div>
                    <h3 class="text-xl font-black text-neutral-900 mb-2 truncate">{session.targetUrl}</h3>
                    {#if session.error}
                      <div class="bg-red-50 border border-red-200 rounded-xl p-4 mt-3">
                        <div class="flex items-start gap-3">
                          <iconify-icon icon="solar:info-circle-bold" width="20" class="text-red-600 flex-shrink-0 mt-0.5"></iconify-icon>
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
                      onclick={(e) => { e.stopPropagation(); deleteHunt(session.id); }}
                      disabled={deletingHuntId === session.id}
                      class="px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                    >
                      {#if deletingHuntId === session.id}
                        <div class="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
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

    {#if huntSessions.filter(s => s.status === 'PENDING' || s.status === 'PROCESSING').length > 0}
      <section class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background-color: #FEC129;">
            <iconify-icon icon="solar:lightning-bold-duotone" width="20" class="text-white"></iconify-icon>
          </div>
          <h2 class="text-2xl font-black tracking-tight" style="color: #291334;">Active Hunts</h2>
        </div>

        <div class="grid grid-cols-1 gap-4">
          {#each huntSessions.filter(s => s.status === 'PENDING' || s.status === 'PROCESSING') as session (session.id)}
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
                <div class="absolute top-0 right-0 w-64 h-64 rounded-full -mr-32 -mt-32 group-hover:opacity-50 transition-opacity" style="background-color: rgba(254, 193, 41, 0.05);"></div>
              {/if}
              <div class="relative">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <span class="px-3 py-1 rounded-lg text-xs font-black uppercase" class:bg-yellow-400={session.status === 'PENDING'} class:text-neutral-900={session.status === 'PENDING'} class:bg-green-500={session.status === 'PROCESSING'} class:text-white={session.status === 'PROCESSING'}>
                        {session.status === 'PENDING' ? 'Queued' : 'Hunting'}
                      </span>
                      <span class="text-xs font-bold text-neutral-400">
                        {formatTimeAgo(session.createdAt)} ago
                      </span>
                      <iconify-icon icon="solar:alt-arrow-right-bold-duotone" width="16" class="opacity-0 group-hover:opacity-100 transition-opacity" style="color: #FEC129;"></iconify-icon>
                    </div>
                    <h3 class="text-xl font-black text-neutral-900 mb-1 truncate">{session.targetUrl || 'Broad Search'}</h3>
                    <div class="flex items-center gap-2">
                      <p class="text-sm text-neutral-600 font-medium">
                        {session.successfulLeads} leads found
                      </p>
                      {#if session.status === 'PROCESSING' && session.successfulLeads > 0}
                        <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs font-black animate-pulse">
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
                      onclick={(e) => { e.stopPropagation(); cancelHunt(session.id); }}
                      disabled={cancellingHuntId === session.id}
                      class="px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                    >
                      {#if cancellingHuntId === session.id}
                        <div class="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
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

    {#if huntSessions.filter(s => s.status === 'COMPLETED').length > 0}
      <section class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:verified-check-bold" width="20" class="text-white"></iconify-icon>
          </div>
          <h2 class="text-2xl font-black tracking-tight">Completed Hunts</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each huntSessions.filter(s => s.status === 'COMPLETED') as session (session.id)}
            <div
              role="button"
              tabindex="0"
              onclick={() => goto(`/app/hunts/${session.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
              class="rounded-xl p-6 hover:-translate-y-1 transition-transform relative cursor-pointer group shadow-lg" style="background-color: #EFEAE6;"
              in:fade
            >
              <div class="flex items-start justify-between mb-4">
                <div class="flex-1 space-y-1">
                  <h3 class="text-lg font-black text-neutral-900 truncate">{session.targetUrl || 'Broad Search'}</h3>
                  <p class="text-xs font-bold text-neutral-400">
                    {formatTimeAgo(session.completedAt || session.createdAt)} ago
                  </p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button
                    onclick={(e) => { e.stopPropagation(); deleteHunt(session.id); }}
                    disabled={deletingHuntId === session.id}
                    class="p-1.5 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10 cursor-pointer"
                    title="Delete hunt"
                  >
                    {#if deletingHuntId === session.id}
                      <div class="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                    {:else}
                      <iconify-icon icon="solar:trash-bin-trash-bold" width="18" class="text-neutral-400 hover:text-red-600"></iconify-icon>
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
