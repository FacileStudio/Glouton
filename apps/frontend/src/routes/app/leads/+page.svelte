<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner, Skeleton } from '@repo/ui';
  import LeafletMap from '$lib/components/LeafletMap.svelte';
  import BusinessCard from '$lib/components/BusinessCard.svelte';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import { ws } from '$lib/websocket';
  import { authStore } from '$lib/auth-store';
  import 'iconify-icon';

  interface Lead {
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    country: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    technologies: string[];
    huntSessionId: string | null;
    contacted: boolean;
    lastContactedAt: Date | null;
    emailsSentCount: number;
    createdAt: Date;
  }

  interface Stats {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    totalEmails: number;
    totalPhoneNumbers: number;
    pendingHunts: number;
    processingHunts: number;
    completedHunts: number;
    failedHunts: number;
    successRate: number;
    averageScore: number;
  }

  interface AuditSession {
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    totalLeads: number;
    processedLeads: number;
    updatedLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }

  let leads: Lead[] = [];
  let stats: Stats | null = null;
  let auditSessions: AuditSession[] = [];
  let initialLoading = true;
  let loadingData = false;
  let searchFilter = '';
  let statusFilter: 'HOT' | 'WARM' | 'COLD' | undefined = undefined;
  let countryFilter = '';
  let cityFilter = '';
  let businessTypeFilter: 'all' | 'domain' | 'local' = 'all';
  let viewMode: 'list' | 'map' = 'list';
  let currentPage = 1;
  let pageSize = 50;
  let totalPages = 1;
  let totalLeads = 0;
  let startingAudit = false;
  let cancellingAuditId: string | null = null;
  let deletingAuditId: string | null = null;
  let sortBy: 'createdAt' | 'score' | 'domain' | 'status' = 'createdAt';
  let sortOrder: 'asc' | 'desc' = 'desc';
  let contactedFilter: 'all' | 'contacted' | 'not_contacted' = 'all';

  let unsubscribeProgress: (() => void) | null = null;
  let unsubscribeCompleted: (() => void) | null = null;
  let unsubscribeCancelled: (() => void) | null = null;
  let unsubscribeStatsChanged: (() => void) | null = null;
  let now = new Date();
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * onMount
   */
  onMount(async () => {
    timerInterval = setInterval(() => {
      now = new Date();
    }, 1000);
    await loadData();

    unsubscribeProgress = ws.on('audit-progress', (data) => {
      const sessionIndex = auditSessions.findIndex(s => s.id === data.auditSessionId);
      /**
       * if
       */
      if (sessionIndex !== -1) {
        auditSessions[sessionIndex] = {
          ...auditSessions[sessionIndex],
          status: data.status,
          progress: data.progress,
          processedLeads: data.processedLeads,
          updatedLeads: data.updatedLeads,
          failedLeads: data.failedLeads,
          totalLeads: data.totalLeads,
        };
        auditSessions = auditSessions;
      }
    });

    unsubscribeCompleted = ws.on('audit-completed', (data) => {
      const sessionIndex = auditSessions.findIndex(s => s.id === data.auditSessionId);
      /**
       * if
       */
      if (sessionIndex !== -1) {
        auditSessions[sessionIndex] = {
          ...auditSessions[sessionIndex],
          status: 'COMPLETED',
          progress: 100,
          processedLeads: data.processedLeads,
          updatedLeads: data.updatedLeads,
          failedLeads: data.failedLeads,
          totalLeads: data.totalLeads,
          completedAt: new Date(),
        };
        auditSessions = auditSessions;
        toast.push(`Audit completed! ${data.updatedLeads} leads updated`, 'success');
        /**
         * loadData
         */
        loadData();
      }
    });

    unsubscribeCancelled = ws.on('audit-cancelled', (data) => {
      const sessionIndex = auditSessions.findIndex(s => s.id === data.auditSessionId);
      /**
       * if
       */
      if (sessionIndex !== -1) {
        auditSessions = auditSessions.filter(s => s.id !== data.auditSessionId);
        toast.push('Audit cancelled', 'info');
      }
    });

    unsubscribeStatsChanged = ws.on('stats-changed', async () => {
      try {
        const statsData = await trpc.lead.query.getStats.query();
        /**
         * if
         */
        if (statsData) stats = statsData;
      } catch (error) {
        console.error('Error refreshing stats:', error);
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
    if (unsubscribeProgress) unsubscribeProgress();
    /**
     * if
     */
    if (unsubscribeCompleted) unsubscribeCompleted();
    /**
     * if
     */
    if (unsubscribeCancelled) unsubscribeCancelled();
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
    loadingData = true;
    try {
      const promises = [
        trpc.lead.query.list.query({
          page: currentPage,
          limit: pageSize,
          status: statusFilter,
          search: searchFilter || undefined,
          country: countryFilter || undefined,
          city: cityFilter || undefined
        }),
        trpc.lead.audit.list.query(),
      ];

      /**
       * if
       */
      if (initialLoading) {
        promises.push(trpc.lead.query.getStats.query());
      }

      const results = await Promise.all(promises);
      const [leadsData, auditSessionsData, statsData] = results;

      /**
       * if
       */
      if (leadsData && leadsData.leads) {
        leads = leadsData.leads;
        totalPages = leadsData.pagination?.totalPages || 1;
        totalLeads = leadsData.pagination?.total || 0;
      } else {
        leads = [];
        totalPages = 1;
        totalLeads = 0;
      }

      /**
       * if
       */
      if (auditSessionsData) auditSessions = auditSessionsData;
      /**
       * if
       */
      if (statsData) stats = statsData;
    } catch (error: any) {
      console.error('Error loading data:', error);

      /**
       * if
       */
      if (error?.data?.code === 'UNAUTHORIZED' || error?.message?.includes('log in')) {
        toast.push('Please log in to view leads', 'error');
        /**
         * goto
         */
        goto('/login');
        return;
      }

      toast.push('Failed to load leads data', 'error');
      leads = [];
      totalPages = 1;
      totalLeads = 0;
      auditSessions = [];
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

  let filterTimeout: ReturnType<typeof setTimeout>;
  $: {
    /**
     * if
     */
    if (searchFilter !== undefined || countryFilter !== undefined || cityFilter !== undefined || statusFilter !== undefined) {
      /**
       * clearTimeout
       */
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        currentPage = 1;
        /**
         * loadData
         */
        loadData();
      }, 300);
    }
  }

  /**
   * getStatusLabel
   */
  function getStatusLabel(status: Lead['status']): string {
    const labels = {
      HOT: 'Hot',
      WARM: 'Warm',
      COLD: 'Cold',
    };
    return labels[status];
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
    if (diffMins < 60) return `${diffMins}m`;
    /**
     * if
     */
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}j`;
  }

  let exporting = false;
  let importing = false;
  let fileInput: HTMLInputElement;

  /**
   * exportToCSV
   */
  async function exportToCSV() {
    try {
      exporting = true;
      const result = await trpc.lead.importExport.exportToCsv.query({});

      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `glouton-leads-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.push(`Exported ${result.count} leads successfully`, 'success');
    } catch (error) {
      toast.push('Failed to export leads', 'error');
      console.error('Export error:', error);
    } finally {
      exporting = false;
    }
  }

  /**
   * handleFileUpload
   */
  async function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    /**
     * if
     */
    if (!file) return;

    /**
     * if
     */
    if (!file.name.endsWith('.csv')) {
      toast.push('Please upload a CSV file', 'error');
      return;
    }

    try {
      importing = true;
      const csvText = await file.text();

      const result = await trpc.lead.importExport.importFromCsv.mutate({ csvContent: csvText });

      toast.push(`Imported ${result.imported} leads successfully`, 'success');
      await loadData();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to import CSV';
      toast.push(errorMessage, 'error');
      console.error('Import error:', error);
    } finally {
      importing = false;
      /**
       * if
       */
      if (fileInput) fileInput.value = '';
    }
  }

  /**
   * triggerFileUpload
   */
  function triggerFileUpload() {
    fileInput?.click();
  }

  /**
   * startAudit
   */
  async function startAudit() {
    try {
      startingAudit = true;
      await trpc.lead.audit.start.mutate();
      toast.push('Audit started! Checking all leads for missing data...', 'success');
      await loadData();
    } catch (error) {
      toast.push('Failed to start audit', 'error');
      console.error('Audit error:', error);
    } finally {
      startingAudit = false;
    }
  }

  /**
   * cancelAudit
   */
  async function cancelAudit(auditSessionId: string) {
    cancellingAuditId = auditSessionId;
    try {
      await trpc.lead.audit.cancel.mutate({ auditSessionId });
      toast.push('Audit cancelled successfully', 'success');
      await loadData();
    } catch (error) {
      toast.push('Failed to cancel audit', 'error');
      console.error('Error cancelling audit:', error);
    } finally {
      cancellingAuditId = null;
    }
  }

  /**
   * deleteAudit
   */
  async function deleteAudit(auditSessionId: string) {
    deletingAuditId = auditSessionId;
    try {
      await trpc.lead.audit.delete.mutate({ auditSessionId });
      toast.push('Audit deleted successfully', 'success');
      await loadData();
    } catch (error) {
      toast.push('Failed to delete audit', 'error');
      console.error('Error deleting audit:', error);
    } finally {
      deletingAuditId = null;
    }
  }

  /**
   * formatElapsedTime
   */
  function formatElapsedTime(startedAt: Date | null, currentTime?: Date): string {
    /**
     * if
     */
    if (!startedAt || !currentTime) return '0s';

    const elapsedMs = currentTime.getTime() - new Date(startedAt).getTime();
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
  function calculateETA(session: AuditSession, currentTime?: Date): string {
    /**
     * if
     */
    if (!session.startedAt || session.progress >= 100 || !currentTime) {
      return 'Calculating...';
    }

    /**
     * if
     */
    if (session.progress === 0) {
      return 'Starting...';
    }

    const nowMs = currentTime.getTime();
    const startTime = new Date(session.startedAt).getTime();
    const elapsedMs = nowMs - startTime;
    const progressPercent = session.progress / 100;

    const estimatedTotalMs = elapsedMs / progressPercent;
    const remainingMs = estimatedTotalMs - elapsedMs;

    /**
     * if
     */
    if (remainingMs <= 0) return 'Almost done...';

    const remainingMins = Math.ceil(remainingMs / 60000);
    const remainingHours = Math.floor(remainingMins / 60);

    /**
     * if
     */
    if (remainingMins < 1) return 'Less than 1m';
    /**
     * if
     */
    if (remainingMins < 60) return `~${remainingMins}m`;
    const mins = remainingMins % 60;
    return mins > 0 ? `~${remainingHours}h ${mins}m` : `~${remainingHours}h`;
  }

  /**
   * sortLeads
   */
  function sortLeads(leadsToSort: Lead[]): Lead[] {
    return [...leadsToSort].sort((a, b) => {
      let comparison = 0;

      /**
       * switch
       */
      switch (sortBy) {
        case 'domain':
          comparison = a.domain.localeCompare(b.domain);
          break;
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'status':
          const statusOrder = { HOT: 3, WARM: 2, COLD: 1 };
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * toggleSort
   */
  function toggleSort(column: typeof sortBy) {
    /**
     * if
     */
    if (sortBy === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortOrder = 'desc';
    }
  }

  $: filteredLeads = (() => {
    let filtered = (leads || []).filter((lead) => {
      /**
       * if
       */
      if (statusFilter && lead.status !== statusFilter) return false;
      /**
       * if
       */
      if (contactedFilter === 'contacted' && !lead.contacted) return false;
      /**
       * if
       */
      if (contactedFilter === 'not_contacted' && lead.contacted) return false;
      /**
       * if
       */
      if (businessTypeFilter === 'domain') return true;
      /**
       * if
       */
      if (businessTypeFilter === 'local') return false;
      /**
       * if
       */
      if (!searchFilter) return true;
      const search = searchFilter.toLowerCase();
      /**
       * return
       */
      return (
        lead.domain?.toLowerCase().includes(search) ||
        lead.email?.toLowerCase().includes(search) ||
        lead.firstName?.toLowerCase().includes(search) ||
        lead.lastName?.toLowerCase().includes(search) ||
        lead.technologies.some(tech => tech.toLowerCase().includes(search))
      );
    });

    return sortLeads(filtered);
  })();

  $: localBusinessLeads = [];

  $: hasLocalBusinesses = localBusinessLeads.length > 0;

  $: activeAudit = auditSessions.find(s => s.status === 'PENDING' || s.status === 'PROCESSING');
</script>

<div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 font-sans" style="selection-background-color: #FEC129; selection-color: black;">

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
          <iconify-icon icon="solar:chart-square-bold" width="32" class="text-white"></iconify-icon>
        </div>
        <div class="space-y-1">
          <h1 class="text-5xl font-black tracking-tight leading-none">
            Leads<span style="color: #FEC129;">.</span>
          </h1>
          <p class="text-neutral-400 font-medium text-sm">All your collected leads</p>
        </div>
      </div>

      <div class="flex gap-3 flex-wrap">
        <button
          onclick={startAudit}
          disabled={startingAudit}
          class="bg-black text-white px-6 py-3 rounded-xl text-xs font-black uppercase hover:bg-neutral-800 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/20"
        >
          {#if startingAudit}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Starting...</span>
          {:else}
            <iconify-icon icon="solar:shield-check-bold" width="16"></iconify-icon>
            <span>Audit All Leads</span>
          {/if}
        </button>
      </div>
    </div>

    {#if activeAudit}
      <div class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-[32px] p-8 shadow-xl" in:fade>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <iconify-icon icon="solar:shield-check-bold" width="32" class="text-white"></iconify-icon>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <h3 class="text-2xl font-black text-white">Audit in Progress</h3>
                <div class="px-3 py-1 bg-white/20 backdrop-blur rounded-lg">
                  <span class="text-sm font-bold text-white uppercase">{activeAudit.status}</span>
                </div>
              </div>
              <p class="text-white/90 font-medium">
                Processing {activeAudit.processedLeads.toLocaleString()} / {activeAudit.totalLeads.toLocaleString()} leads
                {#if activeAudit.updatedLeads > 0}
                  · <span class="font-bold">{activeAudit.updatedLeads} updated</span>
                {/if}
                {#if activeAudit.failedLeads > 0}
                  · <span class="text-red-200 font-bold">{activeAudit.failedLeads} failed</span>
                {/if}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            {#if activeAudit.startedAt}
              <div class="text-right">
                <p class="text-white/70 text-xs font-bold uppercase tracking-wide mb-1">Running</p>
                <p class="text-white text-xl font-black">{formatElapsedTime(activeAudit.startedAt, now)}</p>
              </div>
              <div class="text-right">
                <p class="text-white/70 text-xs font-bold uppercase tracking-wide mb-1">ETA</p>
                <p class="text-white text-xl font-black">{calculateETA(activeAudit, now)}</p>
              </div>
            {/if}
            <button
              onclick={() => cancelAudit(activeAudit.id)}
              disabled={cancellingAuditId === activeAudit.id}
              class="bg-white/20 backdrop-blur hover:bg-white/30 text-white px-6 py-3 rounded-xl text-xs font-black uppercase transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if cancellingAuditId === activeAudit.id}
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Cancelling...</span>
                </div>
              {:else}
                Cancel
              {/if}
            </button>
          </div>
        </div>
        <div class="mt-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-white/70 text-sm font-bold">{activeAudit.progress.toFixed(1)}% Complete</span>
            <span class="text-white/70 text-sm font-bold">{activeAudit.processedLeads} / {activeAudit.totalLeads}</span>
          </div>
          <div class="w-full h-3 bg-white/20 backdrop-blur rounded-full overflow-hidden">
            <div
              class="h-full bg-white rounded-full transition-all duration-500 ease-out"
              style="width: {Math.min(activeAudit.progress, 100)}%"
            ></div>
          </div>
        </div>
      </div>
    {/if}

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
      {#if initialLoading}
        {#each Array(5) as _, i}
          <div style="background-color: #EFEAE6;" class="p-8 rounded-[32px] shadow-lg">
            <div class="flex items-start justify-between mb-6">
              <Skeleton width="120px" height="1.5rem" rounded="md" />
              <Skeleton width="52px" height="52px" rounded="2xl" />
            </div>
            <Skeleton width="150px" height="3.5rem" rounded="md" />
          </div>
        {/each}
      {:else}
        {#each [
            { label: 'Total Leads', val: stats?.totalLeads?.toLocaleString() || '0', icon: 'solar:box-bold', color: 'text-black' },
            { label: 'Hot Leads', val: stats?.hotLeads?.toString() || '0', icon: 'solar:fire-bold', color: 'text-orange-500' },
            { label: 'Warm Leads', val: stats?.warmLeads?.toString() || '0', icon: 'solar:star-bold', color: 'text-yellow-500' },
            { label: 'Total Emails', val: stats?.totalEmails?.toLocaleString() || '0', icon: 'solar:letter-bold', color: 'text-blue-500' },
            { label: 'Total Phones', val: stats?.totalPhoneNumbers?.toLocaleString() || '0', icon: 'solar:phone-bold', color: 'text-green-500' }
        ] as stat}
            <div style="background-color: #EFEAE6;" class="p-8 rounded-[32px] shadow-lg hover:shadow-xl transition-shadow">
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

  <section style="background-color: #EFEAE6;" class="rounded-[40px] overflow-hidden shadow-lg">
    <div class="px-10 py-8 border-b border-neutral-100 flex flex-col gap-6 bg-neutral-50/50">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
                  <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
              </div>
              <div>
                <h3 class="font-black tracking-tight text-xl">Recent Leads</h3>
                <p class="text-sm font-medium text-neutral-400">
                  {filteredLeads.length} Lead{filteredLeads.length !== 1 ? 's' : ''}
                </p>
              </div>
          </div>

          <div class="flex gap-3">
            <button
              onclick={triggerFileUpload}
              disabled={importing}
              class="bg-white border-2 border-black text-black px-6 py-3 rounded-xl text-sm font-black uppercase hover:bg-black hover:text-white transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if importing}
                <div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                <span>Importing...</span>
              {:else}
                <iconify-icon icon="solar:upload-bold" width="18"></iconify-icon>
                <span>Import</span>
              {/if}
            </button>

            <button
              onclick={exportToCSV}
              disabled={exporting}
              class="bg-black text-white px-6 py-3 rounded-xl text-sm font-black uppercase hover:bg-neutral-800 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if exporting}
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Exporting...</span>
              {:else}
                <iconify-icon icon="solar:download-bold" width="18"></iconify-icon>
                <span>Export</span>
              {/if}
            </button>
          </div>
        </div>

        <div class="flex gap-3 flex-wrap">
          <div class="relative flex-1 min-w-[240px] max-w-sm">
             <input
               type="text"
               bind:value={searchFilter}
               placeholder="Search by domain, email, name, tech..."
               class="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
             />
             <iconify-icon icon="solar:magnifer-bold" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="18"></iconify-icon>
          </div>

          <select
            bind:value={statusFilter}
            class="px-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
          >
            <option value={undefined}>All Priority</option>
            <option value="HOT">🔥 Hot</option>
            <option value="WARM">⭐ Warm</option>
            <option value="COLD">❄️ Cold</option>
          </select>

          <select
            bind:value={contactedFilter}
            class="px-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
          >
            <option value="all">All Contacted</option>
            <option value="contacted">✅ Contacted</option>
            <option value="not_contacted">⏳ Not Contacted</option>
          </select>

          <input
            type="text"
            bind:value={countryFilter}
            placeholder="Filter by country..."
            class="px-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition min-w-[150px]"
          />

          <input
            type="text"
            bind:value={cityFilter}
            placeholder="Filter by city..."
            class="px-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition min-w-[150px]"
          />

          <select
            bind:value={businessTypeFilter}
            class="px-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
          >
            <option value="all">All Types</option>
            <option value="domain">🌐 Domain Leads</option>
            <option value="local">📍 Local Businesses</option>
          </select>

          {#if businessTypeFilter === 'local' || hasLocalBusinesses}
            <div class="flex bg-neutral-100 rounded-xl p-1 border border-neutral-200">
              <button
                onclick={() => viewMode = 'list'}
                aria-label="List view"
                class="px-4 py-2 rounded-lg text-xs font-black uppercase transition-all {viewMode === 'list' ? 'bg-white shadow-sm' : 'text-neutral-500 hover:text-black'}"
              >
                <iconify-icon icon="solar:list-bold" width="16"></iconify-icon>
              </button>
              <button
                onclick={() => viewMode = 'map'}
                aria-label="Map view"
                class="px-4 py-2 rounded-lg text-xs font-black uppercase transition-all {viewMode === 'map' ? 'bg-white shadow-sm' : 'text-neutral-500 hover:text-black'}"
              >
                <iconify-icon icon="solar:map-bold" width="16"></iconify-icon>
              </button>
            </div>
          {/if}
        </div>
    </div>

    <div class="overflow-hidden relative">
        {#if loadingData}
          <div class="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <Spinner size="lg" color="accent" />
          </div>
        {/if}
        {#if businessTypeFilter === 'local' && viewMode === 'map'}
          <div class="h-[600px] w-full">
            <LeafletMap
              businesses={localBusinessLeads}
              center={{ lat: 48.8566, lng: 2.3522 }}
              zoom={13}
              onBusinessClick={() => {}}
            />
          </div>
        {:else if businessTypeFilter === 'local' && viewMode === 'list'}
          {#if localBusinessLeads.length === 0}
            <div class="flex flex-col items-center justify-center py-20 space-y-4">
              <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
              <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
                No local businesses found. Start a local hunt!
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
              {#each localBusinessLeads as business (business.id)}
                <BusinessCard {business} />
              {/each}
            </div>
          {/if}
        {:else if filteredLeads.length === 0}
          <div class="flex flex-col items-center justify-center py-20 space-y-4">
            <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
            <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
              {searchFilter ? 'No leads match your search' : 'No leads found. Start a hunt!'}
            </p>
          </div>
        {:else}
          <table class="w-full text-left border-collapse table-fixed rounded-2xl overflow-hidden">
              <thead>
                  <tr class="bg-white border-b-2 border-neutral-200">
                      <th
                        class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:bg-neutral-50 transition-colors select-none w-[18%]"
                        onclick={() => toggleSort('domain')}
                      >
                        <div class="flex items-center gap-2">
                          Target
                          {#if sortBy === 'domain'}
                            <iconify-icon icon="solar:{sortOrder === 'asc' ? 'alt-arrow-up' : 'alt-arrow-down'}-bold" width="14"></iconify-icon>
                          {/if}
                        </div>
                      </th>
                      <th class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 w-[17%]">Contact</th>
                      <th class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 w-[8%]">City</th>
                      <th class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 w-[8%]">Country</th>
                      <th class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 w-[11%]">Status</th>
                      <th
                        class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:bg-neutral-50 transition-colors select-none w-[9%]"
                        onclick={() => toggleSort('status')}
                      >
                        <div class="flex items-center gap-2">
                          Priority
                          {#if sortBy === 'status'}
                            <iconify-icon icon="solar:{sortOrder === 'asc' ? 'alt-arrow-up' : 'alt-arrow-down'}-bold" width="14"></iconify-icon>
                          {/if}
                        </div>
                      </th>
                      <th class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 w-[15%]">Technologies</th>
                      <th
                        class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:bg-neutral-50 transition-colors select-none w-[9%]"
                        onclick={() => toggleSort('score')}
                      >
                        <div class="flex items-center gap-2">
                          Score
                          {#if sortBy === 'score'}
                            <iconify-icon icon="solar:{sortOrder === 'asc' ? 'alt-arrow-up' : 'alt-arrow-down'}-bold" width="14"></iconify-icon>
                          {/if}
                        </div>
                      </th>
                      <th
                        class="px-4 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:bg-neutral-50 transition-colors select-none w-[5%]"
                        onclick={() => toggleSort('createdAt')}
                      >
                        <div class="flex items-center gap-2">
                          Time
                          {#if sortBy === 'createdAt'}
                            <iconify-icon icon="solar:{sortOrder === 'asc' ? 'alt-arrow-up' : 'alt-arrow-down'}-bold" width="14"></iconify-icon>
                          {/if}
                        </div>
                      </th>
                  </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100">
                  {#each filteredLeads as lead (lead.id)}
                      <tr
                        class="hover:bg-neutral-100/60 hover:shadow-sm transition-all duration-200 group cursor-pointer border-l-4 border-transparent hover:border-l-4 hover:border-l-[#FEC129]"
                        in:fade
                        onclick={() => goto(`/app/leads/${lead.id}`)}
                      >
                          <td class="px-4 py-4">
                            <div class="flex items-center gap-2 min-w-0">
                              <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-md group-hover:shadow-lg transition-shadow">
                                {#if lead.domain}
                                  <img
                                    src={getFaviconUrl(lead.domain, 64)}
                                    alt="{lead.domain} favicon"
                                    class="w-6 h-6"
                                    loading="lazy"
                                    onerror={(e) => handleFaviconError(e.currentTarget)}
                                  />
                                {:else}
                                  <iconify-icon icon="solar:global-bold" width="20" class="text-neutral-300"></iconify-icon>
                                {/if}
                              </div>
                              <div class="flex flex-col min-w-0 flex-1">
                                <span class="text-neutral-900 font-bold text-sm group-hover:text-[#FEC129] transition-colors truncate" title={lead.domain || 'No domain'}>{lead.domain || 'No domain'}</span>
                              </div>
                            </div>
                          </td>
                          <td class="px-4 py-4">
                            <div class="flex flex-col min-w-0">
                              {#if lead.email}
                                <span class="text-neutral-700 font-medium text-xs truncate" title={lead.email}>{lead.email}</span>
                              {:else if lead.firstName || lead.lastName}
                                <span class="text-neutral-700 font-medium text-xs truncate" title="{lead.firstName || ''} {lead.lastName || ''}">{lead.firstName || ''} {lead.lastName || ''}</span>
                              {:else}
                                <span class="text-neutral-400 text-xs">No contact</span>
                              {/if}
                            </div>
                          </td>
                          <td class="px-4 py-4">
                            <span class="text-neutral-700 font-medium text-xs truncate block" title={lead.city || '-'}>{lead.city || '-'}</span>
                          </td>
                          <td class="px-4 py-4">
                            <span class="text-neutral-700 font-medium text-xs truncate block" title={lead.country || '-'}>{lead.country || '-'}</span>
                          </td>
                          <td class="px-4 py-4">
                            {#if lead.contacted}
                              <div class="flex items-center gap-1.5 min-w-0">
                                <iconify-icon icon="solar:check-circle-bold" width="16" class="text-green-500 flex-shrink-0"></iconify-icon>
                                <span class="text-xs font-semibold text-green-700 truncate">Contacted</span>
                                {#if lead.emailsSentCount > 0}
                                  <span class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold flex-shrink-0">
                                    {lead.emailsSentCount}
                                  </span>
                                {/if}
                              </div>
                            {:else}
                              <div class="flex items-center gap-1.5 min-w-0">
                                <iconify-icon icon="solar:clock-circle-bold" width="16" class="text-neutral-400 flex-shrink-0"></iconify-icon>
                                <span class="text-xs font-medium text-neutral-500 truncate">Pending</span>
                              </div>
                            {/if}
                          </td>
                          <td class="px-4 py-4">
                              <span class="px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide inline-block
                                  {lead.status === 'HOT' ? 'bg-orange-100 text-orange-700 group-hover:bg-orange-200' :
                                   lead.status === 'WARM' ? 'bg-yellow-100 text-yellow-700 group-hover:bg-yellow-200' :
                                   'bg-blue-100 text-blue-700 group-hover:bg-blue-200'} transition-colors">
                                {getStatusLabel(lead.status)}
                              </span>
                          </td>
                          <td class="px-4 py-4">
                              <div class="flex flex-wrap gap-1.5 min-w-0">
                                  {#if lead.technologies.length > 0}
                                    {#each lead.technologies.slice(0, 2) as tech}
                                        <span class="px-2 py-1 bg-neutral-100 group-hover:bg-neutral-200 rounded-md text-[10px] font-semibold text-neutral-600 transition-colors truncate max-w-[60px]" title={tech}>{tech}</span>
                                    {/each}
                                    {#if lead.technologies.length > 2}
                                      <span class="px-2 py-1 bg-neutral-200 group-hover:bg-neutral-300 rounded-md text-[10px] font-bold text-neutral-700 transition-colors flex-shrink-0" title={lead.technologies.slice(2).join(', ')}>
                                        +{lead.technologies.length - 2}
                                      </span>
                                    {/if}
                                  {:else}
                                    <span class="text-neutral-400 text-xs">No data</span>
                                  {/if}
                              </div>
                          </td>
                          <td class="px-4 py-4">
                            <div class="flex items-center gap-2 min-w-0">
                              <div class="w-12 h-2 bg-neutral-200 rounded-full overflow-hidden flex-shrink-0">
                                <div
                                  class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}"
                                  style="width: {Math.min(lead.score, 100)}%"
                                ></div>
                              </div>
                              <span class="text-xs font-bold text-neutral-600 flex-shrink-0">{lead.score}</span>
                            </div>
                          </td>
                          <td class="px-4 py-4">
                            <span class="text-xs font-medium text-neutral-500">{formatTimeAgo(lead.createdAt)}</span>
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
</style>
