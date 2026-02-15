<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import 'iconify-icon';

  const huntSessionId = $page.params.id;

  interface RunDetails {
    id: string;
    userId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    sources: string[];
    targetUrl: string | null;
    domain: string | null;
    filters: any;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    sourceStats: any;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    stats: {
      totalLeads: number;
      hotLeads: number;
      warmLeads: number;
      coldLeads: number;
      contactedLeads: number;
      duration: number | null;
      successRate: number;
      averageScore: number;
    };
    leads: Array<{
      id: string;
      domain: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      position: string | null;
      status: string;
      score: number;
      source: string;
      createdAt: Date;
    }>;
  }

  interface RunEvent {
    id: string;
    timestamp: Date;
    level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
    category: string;
    message: string;
    metadata?: any;
  }

  let details: RunDetails | null = null;
  let events: RunEvent[] = [];
  let loading = true;
  let eventsLoading = false;
  let selectedLevel: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | null = null;
  let selectedCategory: string | null = null;
  let currentPage = 1;
  let totalEvents = 0;
  let autoScroll = true;
  let eventsContainer: HTMLDivElement;

  let unsubscribeHuntUpdate: (() => void) | null = null;
  let unsubscribeHuntCompleted: (() => void) | null = null;

  /**
   * onMount
   */
  onMount(async () => {
    await loadData();

    unsubscribeHuntUpdate = ws.on('hunt-update', async (data: any) => {
      /**
       * if
       */
      if (data.huntSessionId === huntSessionId) {
        await loadData();
      }
    });

    unsubscribeHuntCompleted = ws.on('hunt-completed', async (data: any) => {
      /**
       * if
       */
      if (data.huntSessionId === huntSessionId) {
        await loadData();
        toast.push(`Hunt completed! Found ${data.successfulLeads} leads`, 'success');
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
  });

  /**
   * loadData
   */
  async function loadData() {
    try {
      const [detailsData, eventsData] = await Promise.all([
        trpc.huntRun.getRunDetails.query({ huntSessionId }),
        trpc.huntRun.getRunEvents.query({
          huntSessionId,
          level: selectedLevel || undefined,
          category: selectedCategory || undefined,
          page: currentPage,
          limit: 50,
        }),
      ]);

      details = detailsData;
      events = eventsData.events;
      totalEvents = eventsData.total;

      /**
       * if
       */
      if (autoScroll && eventsContainer) {
        /**
         * setTimeout
         */
        setTimeout(() => {
          eventsContainer.scrollTop = eventsContainer.scrollHeight;
        }, 100);
      }
    } catch (error: any) {
      toast.push('Failed to load hunt run details', 'error');
      console.error('Error loading run details:', error);
      /**
       * if
       */
      if (error?.message?.includes('not found')) {
        /**
         * goto
         */
        goto('/app/hunts');
      }
    } finally {
      loading = false;
      eventsLoading = false;
    }
  }

  /**
   * filterEvents
   */
  async function filterEvents() {
    eventsLoading = true;
    currentPage = 1;
    await loadData();
  }

  /**
   * getLevelColor
   */
  function getLevelColor(level: string): string {
    /**
     * switch
     */
    switch (level) {
      case 'SUCCESS': return 'text-green-600 bg-green-100';
      case 'INFO': return 'text-blue-600 bg-blue-100';
      case 'WARN': return 'text-orange-600 bg-orange-100';
      case 'ERROR': return 'text-red-600 bg-red-100';
      default: return 'text-neutral-600 bg-neutral-100';
    }
  }

  /**
   * getLevelIcon
   */
  function getLevelIcon(level: string): string {
    /**
     * switch
     */
    switch (level) {
      case 'SUCCESS': return 'solar:verified-check-bold';
      case 'INFO': return 'solar:info-circle-bold';
      case 'WARN': return 'solar:danger-triangle-bold';
      case 'ERROR': return 'solar:close-circle-bold';
      default: return 'solar:question-circle-bold';
    }
  }

  /**
   * getStatusColor
   */
  function getStatusColor(status: string): string {
    /**
     * switch
     */
    switch (status) {
      case 'COMPLETED': return 'bg-green-500';
      case 'PROCESSING': return 'bg-yellow-500';
      case 'PENDING': return 'bg-blue-500';
      case 'FAILED': return 'bg-red-500';
      case 'CANCELLED': return 'bg-neutral-500';
      default: return 'bg-neutral-400';
    }
  }

  /**
   * formatDuration
   */
  function formatDuration(seconds: number | null): string {
    /**
     * if
     */
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    /**
     * if
     */
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  /**
   * formatTimestamp
   */
  function formatTimestamp(date: Date): string {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  $: categories = events.reduce((acc, event) => {
    /**
     * if
     */
    if (!acc.includes(event.category)) acc.push(event.category);
    return acc;
  }, [] as string[]);
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading hunt details...
    </p>
  </div>
{:else if details}
  <div class="p-6 lg:p-12 max-w-[1800px] mx-auto space-y-8 selection:bg-yellow-400 selection:text-black font-sans">

    <div class="flex items-start justify-between gap-6">
      <div class="flex items-center gap-4">
        <button
          on:click={() => goto('/app/hunts')}
          class="w-12 h-12 flex items-center justify-center bg-neutral-100 rounded-xl hover:bg-neutral-200 transition-colors"
        >
          <iconify-icon icon="solar:alt-arrow-left-bold" width="24" class="text-neutral-700"></iconify-icon>
        </button>
        <div class="space-y-1">
          <div class="flex items-center gap-3">
            <h1 class="text-4xl font-black tracking-tight leading-none">
              Hunt Details<span class="text-yellow-400">.</span>
            </h1>
            <div class="flex items-center gap-2 px-4 py-2 rounded-xl {getStatusColor(details.status)} text-white">
              <span class="text-xs font-black uppercase">{details.status}</span>
              {#if details.status === 'PROCESSING'}
                <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              {/if}
            </div>
          </div>
          <p class="text-neutral-400 font-medium text-sm">
            {details.targetUrl || details.domain || 'Broad search'}
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <section class="bg-white rounded-[32px] border-2 border-neutral-200 p-8 space-y-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:chart-bold" width="20" class="text-white"></iconify-icon>
            </div>
            <h2 class="text-2xl font-black tracking-tight">Statistics</h2>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            {#each [
              { label: 'Total Leads', value: details.stats.totalLeads, icon: 'solar:users-group-rounded-bold', color: 'text-blue-600' },
              { label: 'Hot Leads', value: details.stats.hotLeads, icon: 'solar:fire-bold', color: 'text-red-600' },
              { label: 'Warm Leads', value: details.stats.warmLeads, icon: 'solar:sun-2-bold', color: 'text-orange-600' },
              { label: 'Cold Leads', value: details.stats.coldLeads, icon: 'solar:snowflake-bold', color: 'text-blue-400' }
            ] as stat}
              <div class="bg-neutral-50 rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-3">
                  <iconify-icon icon={stat.icon} class={stat.color} width="20"></iconify-icon>
                  <p class="text-xs font-bold text-neutral-600 uppercase">{stat.label}</p>
                </div>
                <p class="text-3xl font-black">{stat.value}</p>
              </div>
            {/each}
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-neutral-200">
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Success Rate</p>
              <p class="text-2xl font-black text-green-600">{details.stats.successRate.toFixed(1)}%</p>
            </div>
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Avg Score</p>
              <p class="text-2xl font-black text-yellow-600">{details.stats.averageScore.toFixed(0)}/100</p>
            </div>
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Duration</p>
              <p class="text-2xl font-black text-neutral-900">{formatDuration(details.stats.duration)}</p>
            </div>
          </div>

          {#if details.status === 'PROCESSING'}
            <div class="pt-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-bold text-neutral-700">Progress</span>
                <span class="text-sm font-black text-yellow-600">{details.progress}%</span>
              </div>
              <div class="w-full h-4 bg-neutral-100 rounded-full overflow-hidden relative">
                <div
                  class="h-full bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all duration-500"
                  style="width: {details.progress}%"
                ></div>
                <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              </div>
            </div>
          {/if}

          {#if details.error}
            <div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
              <div class="flex items-start gap-3">
                <iconify-icon icon="solar:danger-bold" width="24" class="text-red-600 flex-shrink-0 mt-0.5"></iconify-icon>
                <div class="flex-1">
                  <p class="text-sm font-black text-red-800 mb-2">Error Details</p>
                  <p class="text-sm text-red-700 font-medium">{details.error}</p>
                </div>
              </div>
            </div>
          {/if}
        </section>

        <section class="bg-white rounded-[32px] border-2 border-neutral-200 p-8">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                <iconify-icon icon="solar:document-text-bold" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black tracking-tight">Live Events</h2>
              {#if details.status === 'PROCESSING'}
                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-black animate-pulse">
                  LIVE
                </span>
              {/if}
            </div>
            <button
              on:click={() => { autoScroll = !autoScroll; }}
              class="px-4 py-2 rounded-xl text-xs font-bold {autoScroll ? 'bg-yellow-100 text-yellow-700' : 'bg-neutral-100 text-neutral-600'} hover:opacity-80 transition-opacity"
            >
              <iconify-icon icon={autoScroll ? "solar:arrow-down-bold" : "solar:pause-bold"} width="14"></iconify-icon>
              {autoScroll ? 'Auto-scroll' : 'Paused'}
            </button>
          </div>

          <div class="flex flex-wrap gap-2 mb-4">
            <button
              on:click={() => { selectedLevel = null; filterEvents(); }}
              class="px-3 py-2 rounded-lg text-xs font-bold transition-all {selectedLevel === null ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}"
            >
              All Levels
            </button>
            {#each ['INFO', 'SUCCESS', 'WARN', 'ERROR'] as level}
              <button
                on:click={() => { selectedLevel = level; filterEvents(); }}
                class="px-3 py-2 rounded-lg text-xs font-bold transition-all {selectedLevel === level ? getLevelColor(level) : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}"
              >
                {level}
              </button>
            {/each}
          </div>

          <div
            bind:this={eventsContainer}
            class="space-y-2 max-h-[600px] overflow-y-auto"
          >
            {#if eventsLoading}
              <div class="flex items-center justify-center py-12">
                <Spinner size="md" color="accent" />
              </div>
            {:else if events.length === 0}
              <div class="flex flex-col items-center justify-center py-12 space-y-3">
                <iconify-icon icon="solar:ghost-bold" width="48" class="text-neutral-300"></iconify-icon>
                <p class="text-sm font-bold text-neutral-400">No events found</p>
              </div>
            {:else}
              {#each events as event (event.id)}
                <div
                  class="bg-neutral-50 rounded-xl p-4"
                  in:fly={{ y: 10, duration: 200 }}
                >
                  <div class="flex items-start gap-3">
                    <div class="flex-shrink-0 w-8 h-8 rounded-lg {getLevelColor(event.level)} flex items-center justify-center">
                      <iconify-icon icon={getLevelIcon(event.level)} width="16"></iconify-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-black uppercase {getLevelColor(event.level).split(' ')[0]}">{event.level}</span>
                        <span class="text-xs font-bold text-neutral-400">{event.category}</span>
                        <span class="text-xs text-neutral-400">{formatTimestamp(event.timestamp)}</span>
                      </div>
                      <p class="text-sm font-medium text-neutral-900">{event.message}</p>
                      {#if event.metadata}
                        <details class="mt-2">
                          <summary class="text-xs font-bold text-neutral-500 cursor-pointer hover:text-neutral-700">
                            View metadata
                          </summary>
                          <pre class="mt-2 text-xs bg-neutral-100 rounded-lg p-3 overflow-x-auto">{JSON.stringify(event.metadata, null, 2)}</pre>
                        </details>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          {#if totalEvents > 50}
            <div class="flex items-center justify-center gap-2 mt-4">
              <button
                on:click={() => { if (currentPage > 1) { currentPage--; loadData(); } }}
                disabled={currentPage === 1}
                class="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-bold hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span class="text-xs font-bold text-neutral-500">Page {currentPage}</span>
              <button
                on:click={() => { if (currentPage * 50 < totalEvents) { currentPage++; loadData(); } }}
                disabled={currentPage * 50 >= totalEvents}
                class="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-bold hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          {/if}
        </section>
      </div>

      <div class="space-y-6">
        <section class="bg-white rounded-[32px] border-2 border-neutral-200 p-8">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:settings-bold" width="20" class="text-white"></iconify-icon>
            </div>
            <h2 class="text-xl font-black tracking-tight">Configuration</h2>
          </div>

          <div class="space-y-4 text-sm">
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Sources</p>
              <div class="flex flex-wrap gap-2">
                {#each details.sources as source}
                  <span class="px-3 py-1 bg-neutral-100 text-neutral-800 rounded-lg font-bold">{source}</span>
                {/each}
              </div>
            </div>

            {#if details.filters}
              <div>
                <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Filters</p>
                <div class="bg-neutral-50 rounded-xl p-4 space-y-2">
                  {#if details.filters.jobTitles && details.filters.jobTitles.length > 0}
                    <div>
                      <p class="text-xs font-bold text-neutral-600 mb-1">Job Titles</p>
                      <div class="flex flex-wrap gap-1">
                        {#each details.filters.jobTitles as title}
                          <span class="text-xs px-2 py-1 bg-white rounded-md font-medium">{title}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if details.filters.departments && details.filters.departments.length > 0}
                    <div>
                      <p class="text-xs font-bold text-neutral-600 mb-1">Departments</p>
                      <div class="flex flex-wrap gap-1">
                        {#each details.filters.departments as dept}
                          <span class="text-xs px-2 py-1 bg-white rounded-md font-medium">{dept}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if details.sourceStats && typeof details.sourceStats === 'object'}
              <div>
                <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Source Performance</p>
                <div class="space-y-2">
                  {#each Object.entries(details.sourceStats) as [source, stats]}
                    <div class="bg-neutral-50 rounded-xl p-4">
                      <p class="font-black text-neutral-800 mb-2">{source}</p>
                      <div class="space-y-1 text-xs">
                        <div class="flex justify-between">
                          <span class="text-neutral-600">Leads</span>
                          <span class="font-bold text-green-600">{stats.leads || 0}</span>
                        </div>
                        {#if stats.errors > 0}
                          <div class="flex justify-between">
                            <span class="text-neutral-600">Errors</span>
                            <span class="font-bold text-red-600">{stats.errors}</span>
                          </div>
                        {/if}
                        {#if stats.rateLimited}
                          <div class="flex justify-between">
                            <span class="text-neutral-600">Status</span>
                            <span class="font-bold text-orange-600">Rate Limited</span>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>

        {#if details.leads.length > 0}
          <section class="bg-white rounded-[32px] border-2 border-neutral-200 p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                <iconify-icon icon="solar:users-group-rounded-bold" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-xl font-black tracking-tight">Leads ({details.leads.length})</h2>
            </div>

            <div class="space-y-3 max-h-[600px] overflow-y-auto">
              {#each details.leads as lead}
                <div class="bg-neutral-50 rounded-xl p-4 hover:bg-neutral-100 transition-colors">
                  <div class="flex items-start justify-between gap-3 mb-2">
                    <div class="flex-1 min-w-0">
                      <p class="font-bold text-neutral-900 truncate">
                        {lead.firstName || ''} {lead.lastName || 'Unknown'}
                      </p>
                      {#if lead.email}
                        <p class="text-xs text-neutral-600 truncate">{lead.email}</p>
                      {/if}
                    </div>
                    <div class="flex flex-col items-end gap-1">
                      <span class="text-xs px-2 py-1 rounded font-black {
                        lead.status === 'HOT' ? 'bg-red-100 text-red-700' :
                        lead.status === 'WARM' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }">
                        {lead.status}
                      </span>
                      <span class="text-xs text-neutral-400 font-bold">{lead.score}/100</span>
                    </div>
                  </div>
                  {#if lead.position}
                    <p class="text-xs text-neutral-500 truncate">{lead.position}</p>
                  {/if}
                  <div class="flex items-center gap-2 mt-2">
                    <span class="text-xs px-2 py-1 bg-white rounded-md text-neutral-600 font-medium">{lead.source}</span>
                    <span class="text-xs text-neutral-400">{lead.domain}</span>
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
</style>
