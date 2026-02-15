<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { authStore } from '$lib/auth-store';
  import { toast } from '@repo/utils';
  import { Spinner, Pagination, Toggle } from '@repo/ui';
  import 'iconify-icon';

  interface Opportunity {
    id: string;
    title: string;
    description: string;
    company: string | null;
    sourceId: string;
    sourcePlatform: string;
    sourceUrl: string;
    category: string;
    tags: string[];
    budget: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    currency: string | null;
    location: string | null;
    isRemote: boolean;
    postedAt: Date;
    expiresAt: Date | null;
    scrapedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }

  interface Stats {
    total: number;
    remoteCount: number;
    last24h: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    avgBudgetMin: number;
    avgBudgetMax: number;
  }

  let opportunities: Opportunity[] = [];
  let stats: Stats | null = null;
  let loading = true;
  let currentPage = 1;
  let totalPages = 1;
  let totalOpportunities = 0;

  const OPPORTUNITY_SOURCES = [
    'MALT', 'CODEUR', 'FREELANCE_INFORMATIQUE', 'COMET', 'LE_HIBOU',
    'UPWORK', 'FIVERR', 'FREELANCER', 'TOPTAL', 'WE_WORK_REMOTELY',
    'REMOTE_CO', 'REMOTIVE', 'LINKEDIN', 'INDEED', 'GURU', 'PEOPLEPERHOUR'
  ];

  const OPPORTUNITY_CATEGORIES = [
    'WEB_DEVELOPMENT', 'WEB_DESIGN', 'MOBILE_DEVELOPMENT', 'UI_UX_DESIGN',
    'FRONTEND', 'BACKEND', 'FULLSTACK', 'DEVOPS', 'DATA_SCIENCE',
    'MACHINE_LEARNING', 'BLOCKCHAIN', 'GAME_DEVELOPMENT', 'WORDPRESS',
    'ECOMMERCE', 'SEO', 'CONTENT_WRITING', 'COPYWRITING', 'GRAPHIC_DESIGN',
    'VIDEO_EDITING', 'MARKETING', 'CONSULTING', 'OTHER'
  ];

  let searchFilter = '';
  let selectedSources: string[] = [...OPPORTUNITY_SOURCES];
  let selectedCategories: string[] = [...OPPORTUNITY_CATEGORIES];
  let remoteOnly = false;
  let minBudget: number | undefined = undefined;
  let maxBudget: number | undefined = undefined;

  let ws: WebSocket | null = null;
  let newOpportunitiesCount = 0;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let lastFetchTime = new Date();
  let searchHistory: any[] = [];
  let showHistory = false;

  /**
   * onMount
   */
  onMount(async () => {
    await loadData();
    await loadSearchHistory();
    /**
     * initWebSocket
     */
    initWebSocket();
    /**
     * startPolling
     */
    startPolling();

    /**
     * return
     */
    return () => {
      /**
       * if
       */
      if (ws) {
        ws.close();
      }
      /**
       * if
       */
      if (pollingInterval) {
        /**
         * clearInterval
         */
        clearInterval(pollingInterval);
      }
    };
  });

  /**
   * initWebSocket
   */
  function initWebSocket() {
    const authState = $authStore;
    const token = authState.session?.token;

    /**
     * if
     */
    if (!token) {
      console.log('[WebSocket] No auth token available, skipping WebSocket connection');
      return;
    }

    const wsUrl = `${import.meta.env.VITE_API_URL?.replace('http', 'ws')}/ws?token=${token}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        /**
         * if
         */
        if (message.type === 'new-opportunities') {
          newOpportunitiesCount += message.data.length;
          toast.push(`${message.data.length} new opportunities found!`, 'success');
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error', error);
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected, reconnecting in 5s...');
      /**
       * setTimeout
       */
      setTimeout(() => {
        /**
         * if
         */
        if (ws?.readyState === WebSocket.CLOSED) {
          /**
           * initWebSocket
           */
          initWebSocket();
        }
      }, 5000);
    };
  }

  /**
   * startPolling
   */
  function startPolling() {
    pollingInterval = setInterval(async () => {
      try {
        const newOpps = await trpc.opportunity.getNewOpportunitiesSince.query({
          since: lastFetchTime,
        });

        /**
         * if
         */
        if (newOpps.length > 0) {
          newOpportunitiesCount += newOpps.length;
        }

        lastFetchTime = new Date();
      } catch (error) {
        console.error('[Polling] Error fetching new opportunities', error);
      }
    }, 30000);
  }

  /**
   * refreshWithNewOpportunities
   */
  async function refreshWithNewOpportunities() {
    newOpportunitiesCount = 0;
    currentPage = 1;
    await loadData();
  }

  /**
   * loadSearchHistory
   */
  async function loadSearchHistory() {
    try {
      searchHistory = await trpc.opportunity.getSearchHistory.query({ limit: 10 });
    } catch (error) {
      console.error('Error loading search history:', error);
    }
  }

  /**
   * applySearchFromHistory
   */
  async function applySearchFromHistory(search: any) {
    searchFilter = search.query || '';
    selectedSources = search.sources.length > 0 ? search.sources : [...OPPORTUNITY_SOURCES];
    selectedCategories = search.categories.length > 0 ? search.categories : [...OPPORTUNITY_CATEGORIES];
    remoteOnly = search.remoteOnly;
    minBudget = search.minBudget;
    maxBudget = search.maxBudget;
    currentPage = 1;
    showHistory = false;
    await loadData();
  }

  /**
   * clearSearchHistory
   */
  async function clearSearchHistory() {
    try {
      await trpc.opportunity.deleteSearchHistory.mutate({});
      searchHistory = [];
      toast.push('Search history cleared', 'success');
    } catch (error) {
      toast.push('Failed to clear search history', 'error');
    }
  }

  /**
   * loadData
   */
  async function loadData() {
    loading = true;
    try {
      const [opportunitiesData, statsData] = await Promise.all([
        trpc.opportunity.list.query({
          page: currentPage,
          limit: 20,
          sources: selectedSources.length > 0 && selectedSources.length < OPPORTUNITY_SOURCES.length ? selectedSources : [],
          categories: selectedCategories.length > 0 && selectedCategories.length < OPPORTUNITY_CATEGORIES.length ? selectedCategories : [],
          remoteOnly: remoteOnly || undefined,
          minBudget,
          maxBudget,
          search: searchFilter || undefined,
        }),
        trpc.opportunity.getStats.query(),
      ]);

      opportunities = opportunitiesData.opportunities;
      totalPages = opportunitiesData.pagination.totalPages;
      totalOpportunities = opportunitiesData.pagination.total;
      stats = statsData;

      /**
       * if
       */
      if (currentPage === 1 && (searchFilter || selectedSources.length !== OPPORTUNITY_SOURCES.length || selectedCategories.length !== OPPORTUNITY_CATEGORIES.length || remoteOnly || minBudget || maxBudget)) {
        try {
          await trpc.opportunity.saveSearch.mutate({
            query: searchFilter || undefined,
            sources: selectedSources.length !== OPPORTUNITY_SOURCES.length ? selectedSources.map(s => s as any) : undefined,
            categories: selectedCategories.length !== OPPORTUNITY_CATEGORIES.length ? selectedCategories.map(c => c as any) : undefined,
            remoteOnly: remoteOnly || undefined,
            minBudget,
            maxBudget,
            resultsCount: totalOpportunities,
          });
        } catch (error) {
          console.error('Error saving search:', error);
        }
      }
    } catch (error) {
      toast.push('Failed to load opportunities', 'error');
      console.error('Error loading data:', error);
    } finally {
      loading = false;
    }
  }

  /**
   * formatTimeAgo
   */
  function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    /**
     * if
     */
    if (diffMins < 60) return `${diffMins}m ago`;
    /**
     * if
     */
    if (diffHours < 24) return `${diffHours}h ago`;
    /**
     * if
     */
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
  }

  /**
   * formatCategoryLabel
   */
  function formatCategoryLabel(category: string): string {
    return category
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * formatSourceLabel
   */
  function formatSourceLabel(source: string): string {
    return source
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * formatBudget
   */
  function formatBudget(opp: Opportunity): string {
    /**
     * if
     */
    if (opp.budget) return opp.budget;
    /**
     * if
     */
    if (opp.budgetMin && opp.budgetMax) {
      const currency = opp.currency || ''
    return `${currency}${opp.budgetMin.toLocaleString()} - ${currency}${opp.budgetMax.toLocaleString()}`;
    }
  }
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading opportunities...
    </p>
  </div>
{:else}
  <div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans" style="background-color: #FAF7F5; selection-background-color: #FEC129;">

    {#if newOpportunitiesCount > 0}
      <div class="bg-gradient-to-r from-yellow-400 to-orange-500 p-6 rounded-3xl shadow-lg flex items-center justify-between" transition:fade>
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <iconify-icon icon="solar:bell-bing-bold" width="24" class="text-yellow-600"></iconify-icon>
          </div>
          <div>
            <h3 class="text-xl font-black text-white">New Opportunities Available!</h3>
            <p class="text-sm font-medium text-white/90">{newOpportunitiesCount} new opportunities have been found</p>
          </div>
        </div>
        <button
          on:click={refreshWithNewOpportunities}
          class="bg-white text-black px-6 py-3 rounded-xl text-xs font-black uppercase hover:bg-neutral-100 transition flex items-center gap-2 cursor-pointer"
        >
          <iconify-icon icon="solar:refresh-bold" width="16"></iconify-icon>
          Refresh Now
        </button>
      </div>
    {/if}

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
          <iconify-icon icon="solar:case-round-bold" width="32" class="text-white"></iconify-icon>
        </div>
        <div class="space-y-1">
          <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
            Opportunities<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">Freelance opportunities feed</p>
        </div>
      </div>
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each [
          { label: 'Total Opportunities', val: stats?.total?.toLocaleString() || '0', icon: 'solar:case-round-bold-duotone', color: 'text-black' },
          { label: 'Remote Jobs', val: stats?.remoteCount?.toString() || '0', icon: 'solar:home-wifi-bold-duotone', color: 'text-blue-500' },
          { label: 'Added Last 24h', val: stats?.last24h?.toString() || '0', icon: 'solar:clock-circle-bold-duotone', color: 'text-green-500' }
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

    {#if searchHistory.length > 0}
      <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
        <div class="px-10 py-6 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:history-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black tracking-tight text-xl">Search History</h3>
              <p class="text-sm font-medium text-neutral-400">Your recent searches</p>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              on:click={() => showHistory = !showHistory}
              class="bg-neutral-100 text-neutral-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon={showHistory ? 'solar:eye-closed-bold' : 'solar:eye-bold'} width="16"></iconify-icon>
              {showHistory ? 'Hide' : 'Show'}
            </button>
            <button
              on:click={clearSearchHistory}
              class="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-red-600 hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon="solar:trash-bin-trash-bold" width="16"></iconify-icon>
              Clear All
            </button>
          </div>
        </div>

        {#if showHistory}
          <div class="p-6 space-y-3" transition:fade>
            {#each searchHistory as search (search.id)}
              <button
                on:click={() => applySearchFromHistory(search)}
                class="w-full bg-neutral-50 hover:bg-neutral-100 p-4 rounded-2xl text-left transition-all border border-neutral-100 hover:border-neutral-300 cursor-pointer"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 space-y-2">
                    {#if search.query}
                      <div class="flex items-center gap-2">
                        <iconify-icon icon="solar:magnifer-bold" width="16" class="text-neutral-400"></iconify-icon>
                        <span class="text-sm font-bold text-neutral-700">{search.query}</span>
                      </div>
                    {/if}
                    <div class="flex flex-wrap gap-2">
                      {#if search.sources.length > 0 && search.sources.length < OPPORTUNITY_SOURCES.length}
                        <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                          {search.sources.length} sources
                        </span>
                      {/if}
                      {#if search.categories.length > 0 && search.categories.length < OPPORTUNITY_CATEGORIES.length}
                        <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                          {search.categories.length} categories
                        </span>
                      {/if}
                      {#if search.remoteOnly}
                        <span class="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                          Remote Only
                        </span>
                      {/if}
                      {#if search.minBudget || search.maxBudget}
                        <span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-bold">
                          {search.minBudget ? `$${search.minBudget}` : ''}{search.minBudget && search.maxBudget ? ' - ' : ''}{search.maxBudget ? `$${search.maxBudget}` : ''}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div class="text-right space-y-1">
                    <p class="text-xs font-bold text-neutral-500">{search.resultsCount} results</p>
                    <p class="text-xs text-neutral-400">{formatTimeAgo(search.createdAt)}</p>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      <div class="px-10 py-8 border-b border-neutral-100 bg-neutral-50/50 space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black tracking-tight text-xl">All Opportunities</h3>
              <p class="text-sm font-medium text-neutral-400">
                {totalOpportunities} Opportunit{totalOpportunities !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>

          <div class="flex gap-3 w-full md:w-auto flex-wrap">
            <div class="relative flex-1 md:flex-none md:w-64">
              <input
                type="text"
                bind:value={searchFilter}
                placeholder="Search opportunities..."
                class="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
              <iconify-icon icon="solar:magnifer-bold" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="18"></iconify-icon>
            </div>

            <button
              on:click={resetFilters}
              class="bg-neutral-100 text-neutral-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
              Reset
            </button>
          </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-neutral-500 uppercase">Remote Only</span>
            <Toggle bind:checked={remoteOnly} />
          </div>

          <div class="flex gap-3 flex-wrap flex-1">
            <div class="flex gap-2 items-center">
              <input
                type="number"
                bind:value={minBudget}
                placeholder="Min budget"
                class="w-32 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
              <span class="text-neutral-400">-</span>
              <input
                type="number"
                bind:value={maxBudget}
                placeholder="Max budget"
                class="w-32 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
            </div>
          </div>
        </div>

        <details class="group">
          <summary class="cursor-pointer flex items-center gap-2 text-sm font-bold text-neutral-600 hover:text-black transition list-none">
            <iconify-icon icon="solar:filter-bold" width="18"></iconify-icon>
            Advanced Filters
            <iconify-icon icon="solar:alt-arrow-down-linear" width="16" class="group-open:rotate-180 transition-transform"></iconify-icon>
          </summary>
          <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase text-neutral-500">Sources</h4>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-xl">
                {#each OPPORTUNITY_SOURCES as source}
                  <button
                    on:click={() => toggleSource(source)}
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer {selectedSources.includes(source) ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-200'}"
                  >
                    {formatSourceLabel(source)}
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase text-neutral-500">Categories</h4>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-xl">
                {#each OPPORTUNITY_CATEGORIES as category}
                  <button
                    on:click={() => toggleCategory(category)}
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer {selectedCategories.includes(category) ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-200'}"
                  >
                    {formatCategoryLabel(category)}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="p-6">
        {#if opportunities.length === 0}
          <div class="flex flex-col items-center justify-center py-20 space-y-4">
            <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
            <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
              {searchFilter || selectedSources.length > 0 || selectedCategories.length > 0 ? 'No opportunities match your filters' : 'No opportunities found'}
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each opportunities as opp (opp.id)}
              <div class="rounded-2xl hover:shadow-xl transition-all overflow-hidden group shadow-lg" style="background-color: #EFEAE6;" in:fade>
                <div class="p-6 space-y-4">
                  <div class="flex items-start justify-between gap-3">
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex-1 group-hover:text-yellow-600 transition-colors cursor-pointer"
                    >
                      <h3 class="font-black text-lg leading-tight line-clamp-2">{opp.title}</h3>
                    </a>
                    <iconify-icon icon="solar:link-circle-bold" width="20" class="text-neutral-400 flex-shrink-0"></iconify-icon>
                  </div>

                  {#if opp.company}
                    <div class="flex items-center gap-2">
                      <iconify-icon icon="solar:buildings-bold" width="16" class="text-neutral-400"></iconify-icon>
                      <span class="text-sm font-semibold text-neutral-600">{opp.company}</span>
                    </div>
                  {/if}

                  <p class="text-sm text-neutral-600 leading-relaxed line-clamp-3">
                    {truncateText(opp.description, 150)}
                  </p>

                  <div class="flex flex-wrap gap-2">
                    <span class="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold uppercase">
                      {formatSourceLabel(opp.sourcePlatform)}
                    </span>
                    <span class="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold uppercase">
                      {formatCategoryLabel(opp.category)}
                    </span>
                  </div>

                  <div class="flex items-center gap-2 text-sm font-bold text-green-700">
                    <iconify-icon icon="solar:dollar-bold" width="18" class="text-green-600"></iconify-icon>
                    {formatBudget(opp)}
                  </div>

                  <div class="flex items-center gap-2 text-xs font-medium text-neutral-500">
                    <iconify-icon icon="solar:map-point-bold" width="16" class="text-neutral-400"></iconify-icon>
                    {opp.location || 'Not specified'}
                    {#if opp.isRemote}
                      <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-[10px] font-bold">
                        REMOTE
                      </span>
                    {/if}
                  </div>

                  <div class="flex items-center gap-2 text-xs text-neutral-400">
                    <iconify-icon icon="solar:clock-circle-bold" width="14"></iconify-icon>
                    {formatTimeAgo(opp.postedAt)}
                  </div>

                  {#if opp.tags && opp.tags.length > 0}
                    <div class="flex flex-wrap gap-1.5 pt-2 border-t border-neutral-100">
                      {#each opp.tags.slice(0, 5) as tag}
                        <span class="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[9px] font-semibold">
                          {tag}
                        </span>
                      {/each}
                      {#if opp.tags.length > 5}
                        <span class="px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded text-[9px] font-bold">
                          +{opp.tags.length - 5}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="px-6 pb-6">
                  <a
                    href={opp.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block w-full text-center bg-black text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all yellow-hover cursor-pointer"
                  >
                    View Opportunity
                    <iconify-icon icon="solar:arrow-right-bold" width="14" class="inline ml-1"></iconify-icon>
                  </a>
                </div>
              </div>
            {/each}
          </div>

          {#if totalPages > 1}
            <div class="mt-8 flex justify-center">
              <Pagination
                bind:currentPage
                {totalPages}
                onPageChange={(page) => {
                  currentPage = page;
                }}
              />
            </div>
          {/if}
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  :global(::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #000;
    border-radius: 10px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #f1f1f1;
  }
  .yellow-hover:hover {
    background-color: #FEC129 !important;
    color: #000 !important;
  }
</style>
;
      return `${currency}${opp.budgetMin.toLocaleString()} - ${currency}${opp.budgetMax.toLocaleString()}`;
    }
    /**
     * if
     */
    if (opp.budgetMin) {
      const currency = opp.currency || '</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading opportunities...
    </p>
  </div>
{:else}
  <div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans" style="background-color: #FAF7F5; selection-background-color: #FEC129;">

    {#if newOpportunitiesCount > 0}
      <div class="bg-gradient-to-r from-yellow-400 to-orange-500 p-6 rounded-3xl shadow-lg flex items-center justify-between" transition:fade>
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <iconify-icon icon="solar:bell-bing-bold" width="24" class="text-yellow-600"></iconify-icon>
          </div>
          <div>
            <h3 class="text-xl font-black text-white">New Opportunities Available!</h3>
            <p class="text-sm font-medium text-white/90">{newOpportunitiesCount} new opportunities have been found</p>
          </div>
        </div>
        <button
          on:click={refreshWithNewOpportunities}
          class="bg-white text-black px-6 py-3 rounded-xl text-xs font-black uppercase hover:bg-neutral-100 transition flex items-center gap-2 cursor-pointer"
        >
          <iconify-icon icon="solar:refresh-bold" width="16"></iconify-icon>
          Refresh Now
        </button>
      </div>
    {/if}

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
          <iconify-icon icon="solar:case-round-bold" width="32" class="text-white"></iconify-icon>
        </div>
        <div class="space-y-1">
          <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
            Opportunities<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">Freelance opportunities feed</p>
        </div>
      </div>
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each [
          { label: 'Total Opportunities', val: stats?.total?.toLocaleString() || '0', icon: 'solar:case-round-bold-duotone', color: 'text-black' },
          { label: 'Remote Jobs', val: stats?.remoteCount?.toString() || '0', icon: 'solar:home-wifi-bold-duotone', color: 'text-blue-500' },
          { label: 'Added Last 24h', val: stats?.last24h?.toString() || '0', icon: 'solar:clock-circle-bold-duotone', color: 'text-green-500' }
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

    {#if searchHistory.length > 0}
      <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
        <div class="px-10 py-6 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:history-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black tracking-tight text-xl">Search History</h3>
              <p class="text-sm font-medium text-neutral-400">Your recent searches</p>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              on:click={() => showHistory = !showHistory}
              class="bg-neutral-100 text-neutral-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon={showHistory ? 'solar:eye-closed-bold' : 'solar:eye-bold'} width="16"></iconify-icon>
              {showHistory ? 'Hide' : 'Show'}
            </button>
            <button
              on:click={clearSearchHistory}
              class="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-red-600 hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon="solar:trash-bin-trash-bold" width="16"></iconify-icon>
              Clear All
            </button>
          </div>
        </div>

        {#if showHistory}
          <div class="p-6 space-y-3" transition:fade>
            {#each searchHistory as search (search.id)}
              <button
                on:click={() => applySearchFromHistory(search)}
                class="w-full bg-neutral-50 hover:bg-neutral-100 p-4 rounded-2xl text-left transition-all border border-neutral-100 hover:border-neutral-300 cursor-pointer"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 space-y-2">
                    {#if search.query}
                      <div class="flex items-center gap-2">
                        <iconify-icon icon="solar:magnifer-bold" width="16" class="text-neutral-400"></iconify-icon>
                        <span class="text-sm font-bold text-neutral-700">{search.query}</span>
                      </div>
                    {/if}
                    <div class="flex flex-wrap gap-2">
                      {#if search.sources.length > 0 && search.sources.length < OPPORTUNITY_SOURCES.length}
                        <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                          {search.sources.length} sources
                        </span>
                      {/if}
                      {#if search.categories.length > 0 && search.categories.length < OPPORTUNITY_CATEGORIES.length}
                        <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                          {search.categories.length} categories
                        </span>
                      {/if}
                      {#if search.remoteOnly}
                        <span class="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                          Remote Only
                        </span>
                      {/if}
                      {#if search.minBudget || search.maxBudget}
                        <span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-bold">
                          {search.minBudget ? `$${search.minBudget}` : ''}{search.minBudget && search.maxBudget ? ' - ' : ''}{search.maxBudget ? `$${search.maxBudget}` : ''}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div class="text-right space-y-1">
                    <p class="text-xs font-bold text-neutral-500">{search.resultsCount} results</p>
                    <p class="text-xs text-neutral-400">{formatTimeAgo(search.createdAt)}</p>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      <div class="px-10 py-8 border-b border-neutral-100 bg-neutral-50/50 space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black tracking-tight text-xl">All Opportunities</h3>
              <p class="text-sm font-medium text-neutral-400">
                {totalOpportunities} Opportunit{totalOpportunities !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>

          <div class="flex gap-3 w-full md:w-auto flex-wrap">
            <div class="relative flex-1 md:flex-none md:w-64">
              <input
                type="text"
                bind:value={searchFilter}
                placeholder="Search opportunities..."
                class="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
              <iconify-icon icon="solar:magnifer-bold" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="18"></iconify-icon>
            </div>

            <button
              on:click={resetFilters}
              class="bg-neutral-100 text-neutral-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
              Reset
            </button>
          </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-neutral-500 uppercase">Remote Only</span>
            <Toggle bind:checked={remoteOnly} />
          </div>

          <div class="flex gap-3 flex-wrap flex-1">
            <div class="flex gap-2 items-center">
              <input
                type="number"
                bind:value={minBudget}
                placeholder="Min budget"
                class="w-32 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
              <span class="text-neutral-400">-</span>
              <input
                type="number"
                bind:value={maxBudget}
                placeholder="Max budget"
                class="w-32 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
            </div>
          </div>
        </div>

        <details class="group">
          <summary class="cursor-pointer flex items-center gap-2 text-sm font-bold text-neutral-600 hover:text-black transition list-none">
            <iconify-icon icon="solar:filter-bold" width="18"></iconify-icon>
            Advanced Filters
            <iconify-icon icon="solar:alt-arrow-down-linear" width="16" class="group-open:rotate-180 transition-transform"></iconify-icon>
          </summary>
          <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase text-neutral-500">Sources</h4>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-xl">
                {#each OPPORTUNITY_SOURCES as source}
                  <button
                    on:click={() => toggleSource(source)}
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer {selectedSources.includes(source) ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-200'}"
                  >
                    {formatSourceLabel(source)}
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase text-neutral-500">Categories</h4>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-xl">
                {#each OPPORTUNITY_CATEGORIES as category}
                  <button
                    on:click={() => toggleCategory(category)}
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer {selectedCategories.includes(category) ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-200'}"
                  >
                    {formatCategoryLabel(category)}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="p-6">
        {#if opportunities.length === 0}
          <div class="flex flex-col items-center justify-center py-20 space-y-4">
            <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
            <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
              {searchFilter || selectedSources.length > 0 || selectedCategories.length > 0 ? 'No opportunities match your filters' : 'No opportunities found'}
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each opportunities as opp (opp.id)}
              <div class="rounded-2xl hover:shadow-xl transition-all overflow-hidden group shadow-lg" style="background-color: #EFEAE6;" in:fade>
                <div class="p-6 space-y-4">
                  <div class="flex items-start justify-between gap-3">
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex-1 group-hover:text-yellow-600 transition-colors cursor-pointer"
                    >
                      <h3 class="font-black text-lg leading-tight line-clamp-2">{opp.title}</h3>
                    </a>
                    <iconify-icon icon="solar:link-circle-bold" width="20" class="text-neutral-400 flex-shrink-0"></iconify-icon>
                  </div>

                  {#if opp.company}
                    <div class="flex items-center gap-2">
                      <iconify-icon icon="solar:buildings-bold" width="16" class="text-neutral-400"></iconify-icon>
                      <span class="text-sm font-semibold text-neutral-600">{opp.company}</span>
                    </div>
                  {/if}

                  <p class="text-sm text-neutral-600 leading-relaxed line-clamp-3">
                    {truncateText(opp.description, 150)}
                  </p>

                  <div class="flex flex-wrap gap-2">
                    <span class="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold uppercase">
                      {formatSourceLabel(opp.sourcePlatform)}
                    </span>
                    <span class="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold uppercase">
                      {formatCategoryLabel(opp.category)}
                    </span>
                  </div>

                  <div class="flex items-center gap-2 text-sm font-bold text-green-700">
                    <iconify-icon icon="solar:dollar-bold" width="18" class="text-green-600"></iconify-icon>
                    {formatBudget(opp)}
                  </div>

                  <div class="flex items-center gap-2 text-xs font-medium text-neutral-500">
                    <iconify-icon icon="solar:map-point-bold" width="16" class="text-neutral-400"></iconify-icon>
                    {opp.location || 'Not specified'}
                    {#if opp.isRemote}
                      <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-[10px] font-bold">
                        REMOTE
                      </span>
                    {/if}
                  </div>

                  <div class="flex items-center gap-2 text-xs text-neutral-400">
                    <iconify-icon icon="solar:clock-circle-bold" width="14"></iconify-icon>
                    {formatTimeAgo(opp.postedAt)}
                  </div>

                  {#if opp.tags && opp.tags.length > 0}
                    <div class="flex flex-wrap gap-1.5 pt-2 border-t border-neutral-100">
                      {#each opp.tags.slice(0, 5) as tag}
                        <span class="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[9px] font-semibold">
                          {tag}
                        </span>
                      {/each}
                      {#if opp.tags.length > 5}
                        <span class="px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded text-[9px] font-bold">
                          +{opp.tags.length - 5}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="px-6 pb-6">
                  <a
                    href={opp.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block w-full text-center bg-black text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all yellow-hover cursor-pointer"
                  >
                    View Opportunity
                    <iconify-icon icon="solar:arrow-right-bold" width="14" class="inline ml-1"></iconify-icon>
                  </a>
                </div>
              </div>
            {/each}
          </div>

          {#if totalPages > 1}
            <div class="mt-8 flex justify-center">
              <Pagination
                bind:currentPage
                {totalPages}
                onPageChange={(page) => {
                  currentPage = page;
                }}
              />
            </div>
          {/if}
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  :global(::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #000;
    border-radius: 10px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #f1f1f1;
  }
  .yellow-hover:hover {
    background-color: #FEC129 !important;
    color: #000 !important;
  }
</style>
;
      return `From ${currency}${opp.budgetMin.toLocaleString()}`;
    }
    return 'Not specified';
  }

  /**
   * truncateText
   */
  function truncateText(text: string, maxLength: number): string {
    /**
     * if
     */
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * toggleSource
   */
  function toggleSource(source: string) {
    /**
     * if
     */
    if (selectedSources.includes(source)) {
      selectedSources = selectedSources.filter(s => s !== source);
    } else {
      selectedSources = [...selectedSources, source];
    }
  }

  /**
   * toggleCategory
   */
  function toggleCategory(category: string) {
    /**
     * if
     */
    if (selectedCategories.includes(category)) {
      selectedCategories = selectedCategories.filter(c => c !== category);
    } else {
      selectedCategories = [...selectedCategories, category];
    }
  }

  /**
   * resetFilters
   */
  function resetFilters() {
    selectedSources = [];
    selectedCategories = [];
    remoteOnly = false;
    minBudget = undefined;
    maxBudget = undefined;
    searchFilter = '';
    currentPage = 1;
  }

  let filterTimeout: ReturnType<typeof setTimeout>;
  let lastPage = currentPage;

  $: {
    /**
     * if
     */
    if (searchFilter !== undefined || selectedSources || selectedCategories || remoteOnly !== undefined || minBudget !== undefined || maxBudget !== undefined) {
      /**
       * clearTimeout
       */
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        currentPage = 1;
        lastPage = 1;
        /**
         * loadData
         */
        loadData();
      }, 300);
    }
  }

  $: if (currentPage !== lastPage) {
    lastPage = currentPage;
    /**
     * loadData
     */
    loadData();
  }
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading opportunities...
    </p>
  </div>
{:else}
  <div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans" style="background-color: #FAF7F5; selection-background-color: #FEC129;">

    {#if newOpportunitiesCount > 0}
      <div class="bg-gradient-to-r from-yellow-400 to-orange-500 p-6 rounded-3xl shadow-lg flex items-center justify-between" transition:fade>
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <iconify-icon icon="solar:bell-bing-bold" width="24" class="text-yellow-600"></iconify-icon>
          </div>
          <div>
            <h3 class="text-xl font-black text-white">New Opportunities Available!</h3>
            <p class="text-sm font-medium text-white/90">{newOpportunitiesCount} new opportunities have been found</p>
          </div>
        </div>
        <button
          on:click={refreshWithNewOpportunities}
          class="bg-white text-black px-6 py-3 rounded-xl text-xs font-black uppercase hover:bg-neutral-100 transition flex items-center gap-2 cursor-pointer"
        >
          <iconify-icon icon="solar:refresh-bold" width="16"></iconify-icon>
          Refresh Now
        </button>
      </div>
    {/if}

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
          <iconify-icon icon="solar:case-round-bold" width="32" class="text-white"></iconify-icon>
        </div>
        <div class="space-y-1">
          <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
            Opportunities<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">Freelance opportunities feed</p>
        </div>
      </div>
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each [
          { label: 'Total Opportunities', val: stats?.total?.toLocaleString() || '0', icon: 'solar:case-round-bold-duotone', color: 'text-black' },
          { label: 'Remote Jobs', val: stats?.remoteCount?.toString() || '0', icon: 'solar:home-wifi-bold-duotone', color: 'text-blue-500' },
          { label: 'Added Last 24h', val: stats?.last24h?.toString() || '0', icon: 'solar:clock-circle-bold-duotone', color: 'text-green-500' }
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

    {#if searchHistory.length > 0}
      <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
        <div class="px-10 py-6 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:history-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black tracking-tight text-xl">Search History</h3>
              <p class="text-sm font-medium text-neutral-400">Your recent searches</p>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              on:click={() => showHistory = !showHistory}
              class="bg-neutral-100 text-neutral-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon={showHistory ? 'solar:eye-closed-bold' : 'solar:eye-bold'} width="16"></iconify-icon>
              {showHistory ? 'Hide' : 'Show'}
            </button>
            <button
              on:click={clearSearchHistory}
              class="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-red-600 hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon="solar:trash-bin-trash-bold" width="16"></iconify-icon>
              Clear All
            </button>
          </div>
        </div>

        {#if showHistory}
          <div class="p-6 space-y-3" transition:fade>
            {#each searchHistory as search (search.id)}
              <button
                on:click={() => applySearchFromHistory(search)}
                class="w-full bg-neutral-50 hover:bg-neutral-100 p-4 rounded-2xl text-left transition-all border border-neutral-100 hover:border-neutral-300 cursor-pointer"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 space-y-2">
                    {#if search.query}
                      <div class="flex items-center gap-2">
                        <iconify-icon icon="solar:magnifer-bold" width="16" class="text-neutral-400"></iconify-icon>
                        <span class="text-sm font-bold text-neutral-700">{search.query}</span>
                      </div>
                    {/if}
                    <div class="flex flex-wrap gap-2">
                      {#if search.sources.length > 0 && search.sources.length < OPPORTUNITY_SOURCES.length}
                        <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                          {search.sources.length} sources
                        </span>
                      {/if}
                      {#if search.categories.length > 0 && search.categories.length < OPPORTUNITY_CATEGORIES.length}
                        <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                          {search.categories.length} categories
                        </span>
                      {/if}
                      {#if search.remoteOnly}
                        <span class="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                          Remote Only
                        </span>
                      {/if}
                      {#if search.minBudget || search.maxBudget}
                        <span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-bold">
                          {search.minBudget ? `$${search.minBudget}` : ''}{search.minBudget && search.maxBudget ? ' - ' : ''}{search.maxBudget ? `$${search.maxBudget}` : ''}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div class="text-right space-y-1">
                    <p class="text-xs font-bold text-neutral-500">{search.resultsCount} results</p>
                    <p class="text-xs text-neutral-400">{formatTimeAgo(search.createdAt)}</p>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      <div class="px-10 py-8 border-b border-neutral-100 bg-neutral-50/50 space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black tracking-tight text-xl">All Opportunities</h3>
              <p class="text-sm font-medium text-neutral-400">
                {totalOpportunities} Opportunit{totalOpportunities !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>

          <div class="flex gap-3 w-full md:w-auto flex-wrap">
            <div class="relative flex-1 md:flex-none md:w-64">
              <input
                type="text"
                bind:value={searchFilter}
                placeholder="Search opportunities..."
                class="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
              <iconify-icon icon="solar:magnifer-bold" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="18"></iconify-icon>
            </div>

            <button
              on:click={resetFilters}
              class="bg-neutral-100 text-neutral-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 cursor-pointer"
            >
              <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
              Reset
            </button>
          </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-neutral-500 uppercase">Remote Only</span>
            <Toggle bind:checked={remoteOnly} />
          </div>

          <div class="flex gap-3 flex-wrap flex-1">
            <div class="flex gap-2 items-center">
              <input
                type="number"
                bind:value={minBudget}
                placeholder="Min budget"
                class="w-32 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
              <span class="text-neutral-400">-</span>
              <input
                type="number"
                bind:value={maxBudget}
                placeholder="Max budget"
                class="w-32 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
              />
            </div>
          </div>
        </div>

        <details class="group">
          <summary class="cursor-pointer flex items-center gap-2 text-sm font-bold text-neutral-600 hover:text-black transition list-none">
            <iconify-icon icon="solar:filter-bold" width="18"></iconify-icon>
            Advanced Filters
            <iconify-icon icon="solar:alt-arrow-down-linear" width="16" class="group-open:rotate-180 transition-transform"></iconify-icon>
          </summary>
          <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase text-neutral-500">Sources</h4>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-xl">
                {#each OPPORTUNITY_SOURCES as source}
                  <button
                    on:click={() => toggleSource(source)}
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer {selectedSources.includes(source) ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-200'}"
                  >
                    {formatSourceLabel(source)}
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase text-neutral-500">Categories</h4>
              <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-xl">
                {#each OPPORTUNITY_CATEGORIES as category}
                  <button
                    on:click={() => toggleCategory(category)}
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer {selectedCategories.includes(category) ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-200'}"
                  >
                    {formatCategoryLabel(category)}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="p-6">
        {#if opportunities.length === 0}
          <div class="flex flex-col items-center justify-center py-20 space-y-4">
            <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
            <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
              {searchFilter || selectedSources.length > 0 || selectedCategories.length > 0 ? 'No opportunities match your filters' : 'No opportunities found'}
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each opportunities as opp (opp.id)}
              <div class="rounded-2xl hover:shadow-xl transition-all overflow-hidden group shadow-lg" style="background-color: #EFEAE6;" in:fade>
                <div class="p-6 space-y-4">
                  <div class="flex items-start justify-between gap-3">
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex-1 group-hover:text-yellow-600 transition-colors cursor-pointer"
                    >
                      <h3 class="font-black text-lg leading-tight line-clamp-2">{opp.title}</h3>
                    </a>
                    <iconify-icon icon="solar:link-circle-bold" width="20" class="text-neutral-400 flex-shrink-0"></iconify-icon>
                  </div>

                  {#if opp.company}
                    <div class="flex items-center gap-2">
                      <iconify-icon icon="solar:buildings-bold" width="16" class="text-neutral-400"></iconify-icon>
                      <span class="text-sm font-semibold text-neutral-600">{opp.company}</span>
                    </div>
                  {/if}

                  <p class="text-sm text-neutral-600 leading-relaxed line-clamp-3">
                    {truncateText(opp.description, 150)}
                  </p>

                  <div class="flex flex-wrap gap-2">
                    <span class="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold uppercase">
                      {formatSourceLabel(opp.sourcePlatform)}
                    </span>
                    <span class="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold uppercase">
                      {formatCategoryLabel(opp.category)}
                    </span>
                  </div>

                  <div class="flex items-center gap-2 text-sm font-bold text-green-700">
                    <iconify-icon icon="solar:dollar-bold" width="18" class="text-green-600"></iconify-icon>
                    {formatBudget(opp)}
                  </div>

                  <div class="flex items-center gap-2 text-xs font-medium text-neutral-500">
                    <iconify-icon icon="solar:map-point-bold" width="16" class="text-neutral-400"></iconify-icon>
                    {opp.location || 'Not specified'}
                    {#if opp.isRemote}
                      <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-[10px] font-bold">
                        REMOTE
                      </span>
                    {/if}
                  </div>

                  <div class="flex items-center gap-2 text-xs text-neutral-400">
                    <iconify-icon icon="solar:clock-circle-bold" width="14"></iconify-icon>
                    {formatTimeAgo(opp.postedAt)}
                  </div>

                  {#if opp.tags && opp.tags.length > 0}
                    <div class="flex flex-wrap gap-1.5 pt-2 border-t border-neutral-100">
                      {#each opp.tags.slice(0, 5) as tag}
                        <span class="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[9px] font-semibold">
                          {tag}
                        </span>
                      {/each}
                      {#if opp.tags.length > 5}
                        <span class="px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded text-[9px] font-bold">
                          +{opp.tags.length - 5}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="px-6 pb-6">
                  <a
                    href={opp.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block w-full text-center bg-black text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all yellow-hover cursor-pointer"
                  >
                    View Opportunity
                    <iconify-icon icon="solar:arrow-right-bold" width="14" class="inline ml-1"></iconify-icon>
                  </a>
                </div>
              </div>
            {/each}
          </div>

          {#if totalPages > 1}
            <div class="mt-8 flex justify-center">
              <Pagination
                bind:currentPage
                {totalPages}
                onPageChange={(page) => {
                  currentPage = page;
                }}
              />
            </div>
          {/if}
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  :global(::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #000;
    border-radius: 10px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #f1f1f1;
  }
  .yellow-hover:hover {
    background-color: #FEC129 !important;
    color: #000 !important;
  }
</style>
