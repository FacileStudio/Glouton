<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  interface Lead {
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    technologies: string[];
    huntSessionId: string | null;
    createdAt: Date;
  }

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
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress: number;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }

  let leads: Lead[] = [];
  let stats: Stats | null = null;
  let huntSessions: HuntSession[] = [];
  let loading = true;
  let isHunting = false;
  let targetUrl = '';
  let speed = 7;
  let searchFilter = '';
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let showSuggestions = false;

  const searchSuggestions = [
    { url: 'techcrunch.com', label: 'Tech News & Startups', icon: 'solar:laptop-bold', depth: 7 },
    { url: 'producthunt.com', label: 'Product Launches', icon: 'solar:rocket-bold', depth: 6 },
    { url: 'github.com/trending', label: 'Trending Developers', icon: 'solar:code-bold', depth: 5 },
    { url: 'medium.com', label: 'Content Creators', icon: 'solar:book-bold', depth: 6 },
    { url: 'dribbble.com', label: 'Design Agencies', icon: 'solar:palette-bold', depth: 7 },
    { url: 'clutch.co', label: 'Development Firms', icon: 'solar:buildings-bold', depth: 8 },
  ];

  function applySuggestion(suggestion: typeof searchSuggestions[0]) {
    targetUrl = suggestion.url;
    speed = suggestion.depth;
    showSuggestions = false;
  }

  onMount(async () => {
    await loadData();
    startPolling();
    return () => {
      stopPolling();
    };
  });

  async function loadData() {
    try {
      const [leadsData, statsData, sessionsData] = await Promise.all([
        trpc.lead.list.query({ limit: 100 }),
        trpc.lead.getStats.query(),
        trpc.lead.getHuntSessions.query(),
      ]);

      leads = leadsData.leads;
      stats = statsData;
      huntSessions = sessionsData;
    } catch (error) {
      toast.push('Failed to load leads data', 'error');
      console.error('Error loading data:', error);
    } finally {
      loading = false;
    }
  }

  async function startHunt() {
    if (!targetUrl) {
      toast.push('Please enter a target URL', 'error');
      return;
    }

    let normalizedUrl = targetUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    isHunting = true;
    try {
      const result = await trpc.lead.startHunt.mutate({
        targetUrl: normalizedUrl,
        speed,
      });

      toast.push('Hunt started successfully!', 'success');
      targetUrl = '';
      await loadData();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start hunt';
      toast.push(errorMessage, 'error');
      console.error('Error starting hunt:', error);
    } finally {
      isHunting = false;
    }
  }

  function startPolling() {
    pollingInterval = setInterval(async () => {
      if (stats && (stats.pendingHunts > 0 || stats.processingHunts > 0)) {
        await loadData();
      }
    }, 5000);
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  function getStatusLabel(status: Lead['status']): string {
    const labels = {
      HOT: 'High Priority',
      WARM: 'Medium Priority',
      COLD: 'Low Priority',
    };
    return labels[status];
  }

  function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}j`;
  }

  $: filteredLeads = leads.filter((lead) => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      lead.domain.toLowerCase().includes(search) ||
      lead.email?.toLowerCase().includes(search) ||
      lead.firstName?.toLowerCase().includes(search) ||
      lead.lastName?.toLowerCase().includes(search)
    );
  });

  $: dataPoints = stats ? stats.totalLeads * 5 : 0;
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <iconify-icon icon="solar:ghost-bold" width="64" class="animate-bounce text-yellow-400"></iconify-icon>
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400 animate-pulse">
      Loading leads data...
    </p>
  </div>
{:else}
  <div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:bg-yellow-400 selection:text-black font-sans">

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-1">
        <h1 class="text-5xl font-black uppercase tracking-tighter leading-none">
          Leads<span class="text-yellow-400">.</span>
        </h1>
        <p class="text-neutral-400 font-bold uppercase tracking-[0.3em] text-[10px]">Lead Management System</p>
      </div>

      <div class="flex items-center gap-6 bg-white border border-neutral-200 p-2 pl-6 rounded-2xl shadow-sm">
        <div class="flex flex-col text-right">
          <span class="text-[9px] font-black uppercase text-neutral-400 tracking-widest">System Status</span>
          <span class="text-xs font-black uppercase">
            {#if stats && (stats.pendingHunts > 0 || stats.processingHunts > 0)}
              {stats.pendingHunts + stats.processingHunts} Active Hunt{stats.pendingHunts + stats.processingHunts > 1 ? 's' : ''}
            {:else}
              Operational
            {/if}
          </span>
        </div>
        <div class="w-12 h-12 bg-black text-yellow-400 rounded-xl flex items-center justify-center {stats && (stats.pendingHunts > 0 || stats.processingHunts > 0) ? 'animate-pulse' : ''}">
          <iconify-icon icon="solar:bolt-circle-bold" width="28"></iconify-icon>
        </div>
      </div>
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each [
          { label: 'Total Leads', val: stats?.totalLeads.toLocaleString() || '0', icon: 'solar:box-bold', color: 'text-black' },
          { label: 'Pending Review', val: stats?.pendingHunts.toString() || '0', icon: 'solar:history-bold', color: 'text-yellow-500' },
          { label: 'Success Rate', val: `${stats?.successRate || 0}%`, icon: 'solar:verified-check-bold', color: 'text-green-500' },
          { label: 'Data Points', val: dataPoints > 1000 ? `${(dataPoints / 1000).toFixed(1)}k` : dataPoints.toString(), icon: 'solar:database-bold', color: 'text-blue-500' }
      ] as stat}
          <div class="bg-white p-8 rounded-[32px] border border-neutral-200 shadow-sm hover:shadow-md transition-shadow">
              <div class="flex items-center justify-between mb-6">
                  <div class="p-3 bg-neutral-50 rounded-2xl">
                      <iconify-icon icon={stat.icon} class={stat.color} width="24"></iconify-icon>
                  </div>
                  <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">{stat.label}</span>
              </div>
              <p class="text-4xl font-black tracking-tighter">{stat.val}</p>
          </div>
      {/each}
    </section>

  <section class="bg-black text-white p-10 lg:p-14 rounded-[48px] shadow-2xl relative overflow-hidden">
    <div class="relative z-10 grid lg:grid-cols-12 gap-10 items-center">
        <div class="lg:col-span-4 space-y-4">
            <h2 class="text-3xl font-black uppercase tracking-tighter">Start a <br/><span class="text-yellow-400 ">Lead Search</span></h2>
            <p class="text-neutral-400 text-sm font-medium leading-relaxed">Enter a target URL or industry sector. Our system will comprehensively analyze and extract relevant leads.</p>
        </div>

        <div class="lg:col-span-8 flex flex-col sm:flex-row gap-4">
            <div class="flex-1 relative">
                <div class="bg-white/10 p-2 rounded-2xl border border-white/10 focus-within:border-yellow-400 transition-colors flex items-center px-6">
                    <iconify-icon icon="solar:magnifer-bold" class="text-neutral-500 mr-4" width="24"></iconify-icon>
                    <input
                        bind:value={targetUrl}
                        on:focus={() => showSuggestions = true}
                        on:blur={() => setTimeout(() => showSuggestions = false, 200)}
                        placeholder="e.g., company-name.com or industry sector"
                        class="bg-transparent border-none outline-none w-full py-4 text-white font-bold placeholder:text-neutral-600 focus:ring-0"
                    />
                    <button
                        type="button"
                        on:click={() => showSuggestions = !showSuggestions}
                        class="text-neutral-400 hover:text-yellow-400 transition-colors"
                    >
                        <iconify-icon icon="solar:alt-arrow-down-bold" width="20"></iconify-icon>
                    </button>
                </div>

                {#if showSuggestions}
                    <div class="absolute top-full mt-2 w-full bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50" transition:fly="{{ y: -10, duration: 200 }}">
                        <div class="p-3 border-b border-white/10">
                            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400">Quick Start Templates</p>
                        </div>
                        <div class="max-h-[280px] overflow-y-auto">
                            {#each searchSuggestions as suggestion}
                                <button
                                    type="button"
                                    on:click={() => applySuggestion(suggestion)}
                                    class="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left group"
                                >
                                    <div class="w-10 h-10 bg-yellow-400/10 rounded-xl flex items-center justify-center group-hover:bg-yellow-400/20 transition-colors">
                                        <iconify-icon icon={suggestion.icon} class="text-yellow-400" width="20"></iconify-icon>
                                    </div>
                                    <div class="flex-1">
                                        <p class="text-sm font-bold text-white">{suggestion.label}</p>
                                        <p class="text-xs text-neutral-400">{suggestion.url}</p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <div class="text-[10px] font-black text-neutral-500">LVL {suggestion.depth}</div>
                                        <iconify-icon icon="solar:arrow-right-bold" class="text-neutral-600 group-hover:text-yellow-400 transition-colors" width="16"></iconify-icon>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

            <div class="sm:w-48 bg-white/10 p-4 rounded-2xl border border-white/10 flex flex-col justify-center">
                <div class="flex justify-between mb-2">
                  <span class="text-[8px] font-black uppercase tracking-widest text-neutral-400">Depth</span>
                  <span class="text-[10px] font-black text-yellow-400">LVL {speed}</span>
                </div>
                <input type="range" bind:value={speed} min="1" max="10" class="w-full accent-yellow-400" />
            </div>

            <button
                on:click={startHunt}
                disabled={isHunting || !targetUrl}
                class="bg-yellow-400 text-black px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale"
            >
                {#if isHunting}
                    <iconify-icon icon="svg-spinners:18-dots-revolve" width="24"></iconify-icon>
                    Processing...
                {:else}
                    <iconify-icon icon="solar:fire-bold" width="22"></iconify-icon>
                    START SEARCH
                {/if}
            </button>
        </div>
    </div>
    
    <iconify-icon icon="solar:ghost-bold" class="absolute -right-16 -bottom-16 text-white/5" width="400"></iconify-icon>
  </section>

  <section class="bg-white rounded-[40px] border border-neutral-200 overflow-hidden shadow-sm">
    <div class="px-10 py-8 border-b border-neutral-100 flex flex-col md:flex-row justify-between items-center gap-6 bg-neutral-50/50">
        <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
                <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
            </div>
            <div>
              <h3 class="font-black uppercase tracking-tight text-xl">Recent Leads</h3>
              <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                {filteredLeads.length} Lead{filteredLeads.length !== 1 ? 's' : ''}
              </p>
            </div>
        </div>

        <div class="flex gap-3 w-full md:w-auto">
          <div class="relative flex-1 md:flex-none">
             <input
               type="text"
               bind:value={searchFilter}
               placeholder="Filter..."
               class="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
             />
             <iconify-icon icon="solar:filter-bold" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="18"></iconify-icon>
          </div>
          <button class="bg-black text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-yellow-400 hover:text-black transition flex items-center gap-2">
            <iconify-icon icon="solar:download-bold" width="16"></iconify-icon>
            CSV
          </button>
        </div>
    </div>

    <div class="overflow-x-auto">
        {#if filteredLeads.length === 0}
          <div class="flex flex-col items-center justify-center py-20 space-y-4">
            <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
            <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
              {searchFilter ? 'No leads match your search' : 'No leads found. Start a hunt!'}
            </p>
          </div>
        {:else}
          <table class="w-full text-left border-collapse">
              <thead>
                  <tr class="bg-white border-b border-neutral-100">
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Target</th>
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Contact</th>
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Priority</th>
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Technologies</th>
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Score</th>
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Time</th>
                      <th class="px-10 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400 text-right">Actions</th>
                  </tr>
              </thead>
              <tbody class="divide-y divide-neutral-50 font-mono text-sm">
                  {#each filteredLeads as lead (lead.id)}
                      <tr class="hover:bg-neutral-50/80 transition-all group" in:fade>
                          <td class="px-10 py-6">
                            <div class="flex items-center gap-4">
                              <span class="text-black font-black tracking-tighter text-base group-hover:text-yellow-600 transition-colors">{lead.domain}</span>
                            </div>
                          </td>
                          <td class="px-10 py-6 text-neutral-500 font-medium lowercase tracking-tight">
                            {#if lead.email}
                              {lead.email}
                            {:else if lead.firstName || lead.lastName}
                              {lead.firstName || ''} {lead.lastName || ''}
                            {:else}
                              <span class="text-neutral-300">No contact</span>
                            {/if}
                          </td>
                          <td class="px-10 py-6">
                              <span class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest
                                  {lead.status === 'HOT' ? 'bg-orange-100 text-orange-600' :
                                   lead.status === 'WARM' ? 'bg-yellow-100 text-yellow-700' :
                                   'bg-blue-100 text-blue-600'}">
                                {getStatusLabel(lead.status)}
                              </span>
                          </td>
                          <td class="px-10 py-6">
                              <div class="flex flex-wrap gap-1.5 max-w-[200px]">
                                  {#if lead.technologies.length > 0}
                                    {#each lead.technologies.slice(0, 3) as tech}
                                        <span class="px-2 py-0.5 bg-neutral-100 rounded text-[8px] uppercase font-bold text-neutral-500">{tech}</span>
                                    {/each}
                                    {#if lead.technologies.length > 3}
                                      <span class="px-2 py-0.5 bg-neutral-200 rounded text-[8px] uppercase font-bold text-neutral-600">
                                        +{lead.technologies.length - 3}
                                      </span>
                                    {/if}
                                  {:else}
                                    <span class="text-neutral-300 text-[10px]">No tech data</span>
                                  {/if}
                              </div>
                          </td>
                          <td class="px-10 py-6">
                            <div class="flex items-center gap-2">
                              <div class="w-12 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                                <div
                                  class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}"
                                  style="width: {Math.min(lead.score, 100)}%"
                                ></div>
                              </div>
                              <span class="text-[10px] font-bold text-neutral-400">{lead.score}</span>
                            </div>
                          </td>
                          <td class="px-10 py-6 text-[10px] font-bold text-neutral-400">{formatTimeAgo(lead.createdAt)}</td>
                          <td class="px-10 py-6 text-right">
                              <button class="p-2 hover:bg-black hover:text-yellow-400 rounded-lg transition-all">
                                <iconify-icon icon="solar:map-arrow-right-bold" width="20"></iconify-icon>
                              </button>
                          </td>
                      </tr>
                  {/each}
              </tbody>
          </table>
        {/if}
    </div>
  </section>
  </div>
{/if}

<style>
  /* Custom scrollbar styling */
  :global(::-webkit-scrollbar) {
    width: 6px;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #000;
    border-radius: 10px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #f1f1f1;
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    height: 4px;
    border-radius: 10px;
    outline: none;
  }
  
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: #FACC15;
    border-radius: 4px;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(250, 204, 21, 0.4);
  }
</style>
