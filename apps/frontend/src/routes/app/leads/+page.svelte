<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import StatsCards from '$lib/components/leads/StatsCards.svelte';
  import FilterPanel from '$lib/components/leads/FilterPanel.svelte';
  import AuditBanner from '$lib/components/leads/AuditBanner.svelte';
  import LeadsTable from '$lib/components/leads/LeadsTable.svelte';
  import LeadsGrid from '$lib/components/leads/LeadsGrid.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { useAuditWebSocket } from '$lib/components/leads/useAuditWebSocket.svelte.js';
  import 'iconify-icon';

  // State
  let leads = $state<any[]>([]);
  let stats = $state<any>(null);
  let auditSessions = $state<any[]>([]);
  let initialLoading = $state(true);
  let loadingData = $state(false);

  // Filters
  let filters = $state({
    search: '',
    status: '',
    contacted: '',
    country: '',
    city: '',
    businessType: 'all' as 'all' | 'domain' | 'local',
  });

  // View settings
  let viewMode = $state<'grid' | 'table'>('table');
  let currentPage = $state(1);
  let pageSize = $state(50);
  let totalPages = $state(1);
  let totalLeads = $state(0);
  let sortBy = $state('createdAt');
  let sortOrder = $state<'asc' | 'desc'>('desc');

  // Audit state
  let startingAudit = $state(false);
  let cancellingAuditId = $state<string | null>(null);

  // Import/Export
  let exporting = $state(false);
  let importing = $state(false);
  let fileInput: HTMLInputElement;

  // WebSocket setup
  useAuditWebSocket(
      () => auditSessions,
      (val) => (auditSessions = val),
      loadStats,
      loadData
  );
  onMount(async () => {
    await loadData();
    await loadStats();
  });

  async function loadData() {
    loadingData = true;
    try {
      const [leadsData, auditData] = await Promise.all([
        trpc.lead.query.list.query({
          page: currentPage,
          limit: pageSize,
          status: filters.status || undefined,
          search: filters.search || undefined,
          country: filters.country || undefined,
          city: filters.city || undefined,
        }),
        trpc.lead.audit.list.query(),
      ]);

      leads = leadsData?.leads || [];
      totalPages = leadsData?.pagination?.totalPages || 1;
      totalLeads = leadsData?.pagination?.total || 0;

      if (auditData?.auditSessions) {
        auditSessions = auditData.auditSessions;
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.push('Failed to load leads data', 'error');
      leads = [];
      auditSessions = [];
    } finally {
      initialLoading = false;
      loadingData = false;
    }
  }

  async function loadStats() {
    try {
      const statsData = await trpc.lead.query.getStats.query();
      if (statsData) stats = statsData;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  // Filter handling
  let filterTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    // Track filter changes
    filters;
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      currentPage = 1;
      loadData();
    }, 300);
  });

  async function startAudit() {
    try {
      startingAudit = true;
      const result = await trpc.lead.audit.start.mutate();
      toast.push('Audit started! Checking all leads for missing data...', 'success');

      // Add the new audit session to the list
      if (result?.auditSessionId) {
        auditSessions.unshift({
          id: result.auditSessionId,
          status: 'PENDING',
          progress: 0,
          totalLeads: 0,
          processedLeads: 0,
          updatedLeads: 0,
          failedLeads: 0,
          error: null,
          startedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      toast.push('Failed to start audit', 'error');
      console.error('Audit error:', error);
    } finally {
      startingAudit = false;
    }
  }

  async function cancelAudit(auditSessionId: string) {
    cancellingAuditId = auditSessionId;
    try {
      await trpc.lead.audit.cancel.mutate({ auditSessionId });
      toast.push('Audit cancelled successfully', 'success');
      auditSessions = auditSessions.filter((s) => s.id !== auditSessionId);
    } catch (error) {
      toast.push('Failed to cancel audit', 'error');
      console.error('Error cancelling audit:', error);
    } finally {
      cancellingAuditId = null;
    }
  }

  async function handlePageChange(page: number) {
    currentPage = page;
    await loadData();
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortOrder = 'desc';
    }
  }

  function resetFilters() {
    filters = {
      search: '',
      status: '',
      contacted: '',
      country: '',
      city: '',
      businessType: 'all',
    };
  }

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

  async function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;
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
      if (fileInput) fileInput.value = '';
    }
  }

  function triggerFileUpload() {
    fileInput?.click();
  }

  // Derived state
  let activeAudit = $derived(
    auditSessions.find((s) => s.status === 'PENDING' || s.status === 'PROCESSING')
  );

  // Apply filters and sorting to leads
  let processedLeads = $derived.by(() => {
    let filtered = leads.filter((lead) => {
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.contacted === 'true' && !lead.contacted) return false;
      if (filters.contacted === 'false' && lead.contacted) return false;
      if (filters.country && !lead.country?.toLowerCase().includes(filters.country.toLowerCase()))
        return false;
      if (filters.city && !lead.city?.toLowerCase().includes(filters.city.toLowerCase()))
        return false;
      if (filters.businessType === 'domain' && !lead.domain) return false;
      if (filters.businessType === 'local' && lead.domain) return false;

      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          lead.domain?.toLowerCase().includes(search) ||
          lead.email?.toLowerCase().includes(search) ||
          lead.firstName?.toLowerCase().includes(search) ||
          lead.lastName?.toLowerCase().includes(search) ||
          lead.technologies?.some((tech: string) => tech.toLowerCase().includes(search))
        );
      }
      return true;
    });

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'domain':
          comparison = (a.domain || '').localeCompare(b.domain || '');
          break;
        case 'email':
          comparison = (a.email || '').localeCompare(b.email || '');
          break;
        case 'city':
          comparison = (a.city || '').localeCompare(b.city || '');
          break;
        case 'country':
          comparison = (a.country || '').localeCompare(b.country || '');
          break;
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'status':
          const statusOrder: Record<string, number> = { HOT: 3, WARM: 2, COLD: 1 };
          comparison = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  });
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".csv"
  onchange={handleFileUpload}
  style="display: none;"
/>

<div
  class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
        <iconify-icon icon="solar:database-bold" width="32" class="text-white"></iconify-icon>
      </div>
      <div class="space-y-1">
        <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
          Leads<span style="color: #FEC129;">.</span>
        </h1>
        <p class="text-neutral-400 font-medium text-sm">
          {totalLeads} total leads in your database
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <button
        onclick={triggerFileUpload}
        disabled={importing}
        class="bg-white text-neutral-700 px-6 py-4 rounded-xl font-bold hover:bg-neutral-50 active:scale-95 transition-all flex items-center gap-3 shadow-lg disabled:opacity-50"
      >
        {#if importing}
          <Spinner size="sm" />
          Importing...
        {:else}
          <iconify-icon icon="solar:upload-bold" width="20"></iconify-icon>
          <span>Import CSV</span>
        {/if}
      </button>

      <button
        onclick={exportToCSV}
        disabled={exporting}
        class="bg-white text-neutral-700 px-6 py-4 rounded-xl font-bold hover:bg-neutral-50 active:scale-95 transition-all flex items-center gap-3 shadow-lg disabled:opacity-50"
      >
        {#if exporting}
          <Spinner size="sm" />
          Exporting...
        {:else}
          <iconify-icon icon="solar:download-bold" width="20"></iconify-icon>
          <span>Export CSV</span>
        {/if}
      </button>

      <button
        onclick={startAudit}
        disabled={startingAudit || !!activeAudit}
        class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20 disabled:opacity-50"
      >
        {#if startingAudit}
          <Spinner size="sm" />
          Starting...
        {:else}
          <iconify-icon icon="solar:shield-check-bold" width="20"></iconify-icon>
          <span>Start Audit</span>
        {/if}
      </button>
    </div>
  </div>

  <div class="space-y-8">
    <!-- Active Audit Banner -->
    {#if activeAudit}
      <AuditBanner
        session={activeAudit}
        onCancel={cancelAudit}
        cancelling={cancellingAuditId === activeAudit.id}
      />
    {/if}

    <!-- Stats Cards -->
    {#if !initialLoading}
      <StatsCards {stats} />
    {/if}

    <!-- Filters -->
    <FilterPanel bind:filters bind:viewMode onReset={resetFilters} />

    <!-- Leads Table/Grid -->
    <div class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      {#if loadingData && !initialLoading}
        <div class="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      {:else if processedLeads.length === 0}
        <div class="flex flex-col items-center justify-center py-20 space-y-4">
          <iconify-icon icon="solar:ghost-bold" width="80" class="text-neutral-200"></iconify-icon>
          <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
            {filters.search ||
            filters.status ||
            filters.contacted ||
            filters.country ||
            filters.city
              ? 'No leads match your filters'
              : 'No leads available'}
          </p>
        </div>
      {:else if viewMode === 'table'}
        <LeadsTable leads={processedLeads} bind:sortBy bind:sortOrder onSort={handleSort} />
      {:else}
        <LeadsGrid leads={processedLeads} />
      {/if}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <PaginationControls
        bind:currentPage
        {totalPages}
        bind:pageSize
        totalItems={totalLeads}
        onPageChange={handlePageChange}
      />
    {/if}
  </div>
</div>

