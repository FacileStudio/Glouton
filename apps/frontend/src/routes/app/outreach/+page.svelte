<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner, Skeleton } from '@repo/ui';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import 'iconify-icon';

  interface Lead {
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    contacted: boolean;
    emailsSentCount: number;
    lastContactedAt: Date | null;
    createdAt: Date;
  }

  interface Stats {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    contactableLeads: number;
    contactedLeads: number;
  }

  let leads: Lead[] = [];
  let stats: Stats | null = null;
  let initialLoading = true;
  let loadingData = false;
  let selectedLeads = new Set<string>();
  let selectAll = false;
  let currentPage = 1;
  let pageSize = 50;
  let totalPages = 1;
  let totalLeads = 0;

  /**
   * onMount
   */
  onMount(async () => {
    await loadData();
  });

  /**
   * loadData
   */
  async function loadData() {
    loadingData = true;
    try {
      const [leadsData, statsData] = await Promise.all([
        trpc.lead.query.list.query({
          page: currentPage,
          limit: pageSize
        }),
        initialLoading ? trpc.lead.query.getStats.query() : Promise.resolve(stats),
      ]);

      leads = leadsData.leads.filter(lead => lead.email);
      /**
       * if
       */
      if (statsData) stats = statsData;
      totalPages = leadsData.pagination.totalPages;
      totalLeads = leadsData.pagination.total;
    } catch (error) {
      toast.push('Failed to load leads data', 'error');
      console.error('Error loading data:', error);
    } finally {
      initialLoading = false;
      loadingData = false;
    }
  }

  /**
   * changePage
   */
  async function changePage(page: number) {
    /**
     * if
     */
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    await loadData();
  }

  /**
   * changePageSize
   */
  async function changePageSize(size: number) {
    pageSize = size;
    currentPage = 1;
    await loadData();
  }

  /**
   * toggleSelectAll
   */
  function toggleSelectAll() {
    /**
     * if
     */
    if (selectAll) {
      selectedLeads = new Set(contactableLeads.map(l => l.id));
    } else {
      selectedLeads.clear();
    }
    selectedLeads = selectedLeads;
  }

  /**
   * toggleLead
   */
  function toggleLead(leadId: string) {
    /**
     * if
     */
    if (selectedLeads.has(leadId)) {
      selectedLeads.delete(leadId);
    } else {
      selectedLeads.add(leadId);
    }
    selectedLeads = selectedLeads;
    selectAll = selectedLeads.size === contactableLeads.length;
  }

  /**
   * getStatusColor
   */
  function getStatusColor(status: Lead['status']): string {
    const colors = {
      HOT: 'bg-orange-100 text-orange-700',
      WARM: 'bg-yellow-100 text-yellow-700',
      COLD: 'bg-blue-100 text-blue-700',
    };
    return colors[status];
  }

  /**
   * openContactPage
   */
  function openContactPage(lead: Lead) {
    /**
     * goto
     */
    goto(`/app/outreach/${lead.id}`);
  }

  $: contactableLeads = leads.filter(lead => !lead.contacted && lead.email);
  $: contactedLeads = leads.filter(lead => lead.contacted);
</script>

<div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans" style="background-color: #FAF7F5; selection-background-color: #FEC129;">

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
          <iconify-icon icon="solar:letter-bold" width="32" class="text-white"></iconify-icon>
        </div>
        <div class="space-y-1">
          <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
            Outreach<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">Contact and manage your leads</p>
        </div>
      </div>

      {#if selectedLeads.size > 0}
        <button
          class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20"
          onclick={() => toast.push('Email campaign feature coming soon!', 'info')}
        >
          <iconify-icon icon="solar:letter-bold" width="24"></iconify-icon>
          <span>Send to {selectedLeads.size} Lead{selectedLeads.size !== 1 ? 's' : ''}</span>
        </button>
      {/if}
    </div>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#if initialLoading}
        {#each Array(4) as _, i}
          <div class="p-8 rounded-[32px] shadow-lg" style="background-color: #EFEAE6;">
            <div class="flex items-start justify-between mb-6">
              <Skeleton width="120px" height="1.5rem" rounded="md" />
              <Skeleton width="52px" height="52px" rounded="2xl" />
            </div>
            <Skeleton width="80px" height="3.5rem" rounded="md" />
          </div>
        {/each}
      {:else}
        {#each [
            { label: 'Total Contacts', val: totalLeads.toLocaleString(), icon: 'solar:users-group-rounded-bold-duotone', color: 'text-black' },
            { label: 'To Contact', val: (stats?.contactableLeads ?? 0).toLocaleString(), icon: 'solar:letter-bold-duotone', color: 'text-blue-500' },
            { label: 'Contacted', val: (stats?.contactedLeads ?? 0).toLocaleString(), icon: 'solar:check-circle-bold-duotone', color: 'text-green-500' },
            { label: 'Selected', val: selectedLeads.size.toString(), icon: 'solar:clipboard-list-bold-duotone', color: 'text-yellow-500' }
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
      {/if}
    </section>

    {#if contactedLeads.length > 0}
      <section class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:check-circle-bold" width="20" class="text-white"></iconify-icon>
          </div>
          <h2 class="text-2xl font-black tracking-tight">Contacted Leads</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each contactedLeads.slice(0, 6) as lead (lead.id)}
            <div class="rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow" style="background-color: #EFEAE6;" in:fade>
              <div class="flex items-start justify-between mb-3">
                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-black uppercase">
                  ✅ Contacted
                </span>
                <span class="px-2 py-1 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-bold">
                  {lead.emailsSentCount} email{lead.emailsSentCount !== 1 ? 's' : ''}
                </span>
              </div>
              <h3 class="text-lg font-black text-neutral-900 mb-1 truncate">{lead.domain}</h3>
              <p class="text-sm text-neutral-600 font-medium truncate">{lead.email}</p>
              {#if lead.firstName || lead.lastName}
                <p class="text-xs text-neutral-500 mt-2">{lead.firstName || ''} {lead.lastName || ''}</p>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      <div class="px-10 py-8 border-b border-neutral-100 flex flex-col md:flex-row justify-between items-center gap-6 bg-neutral-50/50">
          <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
                  <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
              </div>
              <div>
                <h3 class="font-black tracking-tight text-xl">Leads to Contact</h3>
                <p class="text-sm font-medium text-neutral-400">
                  {contactableLeads.length} Lead{contactableLeads.length !== 1 ? 's' : ''} ready for outreach
                </p>
              </div>
          </div>

          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 px-4 py-3 bg-white border border-neutral-200 rounded-xl cursor-pointer hover:border-black transition">
              <input
                type="checkbox"
                bind:checked={selectAll}
                onchange={toggleSelectAll}
                class="w-4 h-4 cursor-pointer"
              />
              <span class="text-xs font-bold">Select All</span>
            </label>
          </div>
      </div>

      <div class="overflow-x-auto">
          {#if contactableLeads.length === 0}
            <div class="flex flex-col items-center justify-center py-20 space-y-4">
              <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
              <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
                No leads available for outreach
              </p>
            </div>
          {:else}
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-white border-b-2 border-neutral-200">
                        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 w-12"></th>
                        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">Domain</th>
                        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">Email</th>
                        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">Name</th>
                        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">Priority</th>
                        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">Score</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-neutral-100">
                    {#each contactableLeads as lead (lead.id)}
                        <tr class="hover:bg-neutral-50/80 transition-all cursor-pointer" in:fade onclick={() => openContactPage(lead)}>
                            <td class="px-8 py-5" onclick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedLeads.has(lead.id)}
                                onchange={() => toggleLead(lead.id)}
                                class="w-5 h-5 cursor-pointer"
                              />
                            </td>
                            <td class="px-8 py-5">
                              <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg border border-neutral-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                                  <img
                                    src={getFaviconUrl(lead.domain, 64)}
                                    alt="{lead.domain} favicon"
                                    class="w-6 h-6"
                                    loading="lazy"
                                    onerror={(e) => handleFaviconError(e.currentTarget)}
                                  />
                                </div>
                                <span class="text-neutral-900 font-bold text-sm">{lead.domain}</span>
                              </div>
                            </td>
                            <td class="px-8 py-5">
                              <span class="text-neutral-700 font-medium text-sm">{lead.email}</span>
                            </td>
                            <td class="px-8 py-5">
                              {#if lead.firstName || lead.lastName}
                                <span class="text-neutral-700 font-medium text-sm">{lead.firstName || ''} {lead.lastName || ''}</span>
                              {:else}
                                <span class="text-neutral-400 text-sm">No name</span>
                              {/if}
                            </td>
                            <td class="px-8 py-5">
                                <span class="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide {getStatusColor(lead.status)}">
                                  {lead.status}
                                </span>
                            </td>
                            <td class="px-8 py-5">
                              <div class="flex items-center gap-3">
                                <div class="w-16 h-2 bg-neutral-200 rounded-full overflow-hidden">
                                  <div
                                    class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}"
                                    style="width: {Math.min(lead.score, 100)}%"
                                  ></div>
                                </div>
                                <span class="text-sm font-bold text-neutral-600">{lead.score}</span>
                              </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
          {/if}
      </div>

      <div class="px-10 py-6 border-t border-neutral-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-neutral-50/50">
        <div class="flex items-center gap-4">
          <select
            bind:value={pageSize}
            onchange={() => changePageSize(pageSize)}
            class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
          >
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
          <p class="text-sm font-medium text-neutral-600">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalLeads)} of {totalLeads} leads
          </p>
        </div>

        <div class="flex gap-2">
          <button
            onclick={() => changePage(1)}
            disabled={currentPage === 1}
            class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
          >
            First
          </button>
          <button
            onclick={() => changePage(currentPage - 1)}
            disabled={currentPage === 1}
            class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
          >
            Previous
          </button>
          <div class="flex items-center gap-2 px-4">
            <span class="text-xs font-bold text-neutral-600">Page {currentPage} of {totalPages}</span>
          </div>
          <button
            onclick={() => changePage(currentPage + 1)}
            disabled={currentPage === totalPages}
            class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
          >
            Next
          </button>
          <button
            onclick={() => changePage(totalPages)}
            disabled={currentPage === totalPages}
            class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
          >
            Last
          </button>
        </div>
      </div>
    </section>
</div>
