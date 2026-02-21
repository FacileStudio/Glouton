<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import StatsCards from '$lib/components/leads/StatsCards.svelte';
  import FilterPanel from '$lib/components/leads/FilterPanel.svelte';
  import AuditBanner from '$lib/components/leads/AuditBanner.svelte';
  import LeadsTable from '$lib/components/leads/LeadsTable.svelte';
  import LeadsGrid from '$lib/components/leads/LeadsGrid.svelte';
  import LeadsMap from '$lib/components/leads/LeadsMap.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { setupAuditListeners, type AuditSession } from '$lib/websocket-events.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());

  // State
  let leads = $state<any[]>([]);
  let stats = $state<any>(null);
  let auditSessions = $state<AuditSession[]>([]);
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
    category: '',
    hasWebsite: '' as '' | 'true' | 'false',
    hasSocial: '' as '' | 'true' | 'false',
    hasPhone: '' as '' | 'true' | 'false',
    hasGps: '' as '' | 'true' | 'false',
    hasEmail: '' as '' | 'true' | 'false',
  });

  // View settings
  let viewMode = $state<'grid' | 'table'>('table');

  let mounted = false;

  function syncToUrl() {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.contacted) params.set('contacted', filters.contacted);
    if (filters.country) params.set('country', filters.country);
    if (filters.city) params.set('city', filters.city);
    if (filters.businessType !== 'all') params.set('businessType', filters.businessType);
    if (filters.category) params.set('category', filters.category);
    if (filters.hasWebsite) params.set('hasWebsite', filters.hasWebsite);
    if (filters.hasSocial) params.set('hasSocial', filters.hasSocial);
    if (filters.hasPhone) params.set('hasPhone', filters.hasPhone);
    if (filters.hasGps) params.set('hasGps', filters.hasGps);
    if (filters.hasEmail) params.set('hasEmail', filters.hasEmail);
    if (sortBy !== 'createdAt') params.set('sortBy', sortBy);
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
    if (viewMode !== 'table') params.set('view', viewMode);
    const qs = params.toString();
    replaceState(qs ? `?${qs}` : location.pathname, {});
  }

  $effect(() => {
    viewMode;
    sortBy;
    sortOrder;
    const { search, status, contacted, country, city, businessType, category, hasWebsite, hasSocial, hasPhone, hasGps, hasEmail } = filters;
    void [search, status, contacted, country, city, businessType, category, hasWebsite, hasSocial, hasPhone, hasGps, hasEmail];
    if (!mounted) return;
    syncToUrl();
  });
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

  // WebSocket event listeners
  let wsUnsubscribers: (() => void)[] = [];

  const updateAuditSession = (id: string, updates: Partial<AuditSession>) => {
    const index = auditSessions.findIndex(s => s.id === id);
    if (index !== -1) {
      auditSessions[index] = { ...auditSessions[index], ...updates };
      return true;
    }
    return false;
  };

  const addAuditSession = (session: AuditSession) => {
    auditSessions = [session, ...auditSessions];
  };

  const removeAuditSession = (id: string) => {
    auditSessions = auditSessions.filter(s => s.id !== id);
  };

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    filters = {
      search: params.get('search') || '',
      status: params.get('status') || '',
      contacted: params.get('contacted') || '',
      country: params.get('country') || '',
      city: params.get('city') || '',
      businessType: (params.get('businessType') as 'all' | 'domain' | 'local') || 'all',
      category: params.get('category') || '',
      hasWebsite: (params.get('hasWebsite') as '' | 'true' | 'false') || '',
      hasSocial: (params.get('hasSocial') as '' | 'true' | 'false') || '',
      hasPhone: (params.get('hasPhone') as '' | 'true' | 'false') || '',
      hasGps: (params.get('hasGps') as '' | 'true' | 'false') || '',
      hasEmail: (params.get('hasEmail') as '' | 'true' | 'false') || '',
    };
    const validSortCols = ['domain', 'email', 'city', 'country', 'score', 'status', 'createdAt'];
    const urlSortBy = params.get('sortBy');
    if (urlSortBy && validSortCols.includes(urlSortBy)) sortBy = urlSortBy;
    if (params.get('sortOrder') === 'asc') sortOrder = 'asc';
    if (params.get('view') === 'grid') viewMode = 'grid';

    wsUnsubscribers = setupAuditListeners(
      updateAuditSession,
      addAuditSession,
      removeAuditSession,
      loadData,
      loadStats
    );

    await Promise.all([loadData(), loadStats()]);
    mounted = true;
  });

  onDestroy(() => {
    wsUnsubscribers.forEach(unsub => unsub());
  });

  async function loadData() {
    loadingData = true;
    try {
      const [leadsData, auditData] = await Promise.all([
        trpc.lead.query.list.query({
          teamId,
          page: currentPage,
          limit: pageSize,
          status: filters.status || undefined,
          search: filters.search || undefined,
          country: filters.country || undefined,
          city: filters.city || undefined,
          businessType: filters.businessType !== 'all' ? (filters.businessType === 'domain' ? 'DOMAIN' : 'LOCAL_BUSINESS') : undefined,
          contacted: filters.contacted !== '' ? filters.contacted === 'true' : undefined,
          category: filters.category || undefined,
          hasWebsite: filters.hasWebsite !== '' ? filters.hasWebsite === 'true' : undefined,
          hasSocial: filters.hasSocial !== '' ? filters.hasSocial === 'true' : undefined,
          hasPhone: filters.hasPhone !== '' ? filters.hasPhone === 'true' : undefined,
          hasGps: filters.hasGps !== '' ? filters.hasGps === 'true' : undefined,
          hasEmail: filters.hasEmail !== '' ? filters.hasEmail === 'true' : undefined,
          sortBy: sortBy as 'domain' | 'email' | 'city' | 'country' | 'score' | 'status' | 'createdAt',
          sortOrder: sortOrder,
        }),
        trpc.lead.audit.list.query({ teamId }),
      ]);

      leads = leadsData?.leads || [];
      totalPages = leadsData?.pagination?.totalPages || 1;
      totalLeads = leadsData?.pagination?.total || 0;

      if (auditData?.auditSessions) {
        auditSessions = auditData.auditSessions;
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.push('Échec du chargement des leads', 'error');
      leads = [];
      auditSessions = [];
    } finally {
      initialLoading = false;
      loadingData = false;
    }
  }

  async function loadStats() {
    try {
      const statsData = await trpc.lead.query.getStats.query({ teamId });
      if (statsData) stats = statsData;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  // Filter handling
  let filterTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    const { search, status, contacted, country, city, businessType, category, hasWebsite, hasSocial, hasPhone, hasGps, hasEmail } = filters;
    void [search, status, contacted, country, city, businessType, category, hasWebsite, hasSocial, hasPhone, hasGps, hasEmail];
    if (!mounted) return;
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
      toast.push('Audit démarré ! Vérification des leads pour les données manquantes...', 'success');

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
      toast.push("Échec du démarrage de l'audit", 'error');
      console.error('Audit error:', error);
    } finally {
      startingAudit = false;
    }
  }

  async function cancelAudit(auditSessionId: string) {
    cancellingAuditId = auditSessionId;
    try {
      await trpc.lead.audit.cancel.mutate({ auditSessionId });
      // The WebSocket event will update the session status to 'CANCELLED'
      // which will make activeAudit become undefined (since it only looks for PENDING/PROCESSING)
    } catch (error) {
      toast.push("Échec de l'annulation de l'audit", 'error');
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
    currentPage = 1;
    loadData();
  }

  function resetFilters() {
    filters = {
      search: '',
      status: '',
      contacted: '',
      country: '',
      city: '',
      businessType: 'all',
      category: '',
      hasWebsite: '',
      hasSocial: '',
      hasPhone: '',
      hasGps: '',
      hasEmail: '',
    };
  }

  async function exportToCSV() {
    try {
      exporting = true;
      const result = await trpc.lead.importExport.exportToCsv.query({
        status: (filters.status as 'HOT' | 'WARM' | 'COLD') || undefined,
        search: filters.search || undefined,
        country: filters.country || undefined,
        city: filters.city || undefined,
      });

      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `glouton-leads-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.push(`${result.count} lead(s) exporté(s) avec succès`, 'success');
    } catch (error) {
      toast.push("Échec de l'exportation des leads", 'error');
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
      toast.push('Veuillez télécharger un fichier CSV', 'error');
      return;
    }

    try {
      importing = true;
      const csvText = await file.text();
      const result = await trpc.lead.importExport.importFromCsv.mutate({ csvContent: csvText });

      toast.push(`${result.imported} lead(s) importé(s) avec succès`, 'success');
      await loadData();
    } catch (error: any) {
      const errorMessage = error?.message || "Échec de l'importation du CSV";
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

  let processedLeads = $derived(leads);
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
        <iconify-icon icon="solar:chart-square-bold" width="32" class="text-white"></iconify-icon>
      </div>
      <div class="space-y-1">
        <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
          Leads
        </h1>
        <p class="text-neutral-400 font-medium text-sm">
          {processedLeads.length} résultat{processedLeads.length !== 1 ? 's' : ''} trouvé{processedLeads.length !== 1 ? 's' : ''}
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
          Importation...
        {:else}
          <iconify-icon icon="solar:upload-bold" width="20"></iconify-icon>
          <span>Importer CSV</span>
        {/if}
      </button>

      <button
        onclick={exportToCSV}
        disabled={exporting}
        class="bg-white text-neutral-700 px-6 py-4 rounded-xl font-bold hover:bg-neutral-50 active:scale-95 transition-all flex items-center gap-3 shadow-lg disabled:opacity-50"
      >
        {#if exporting}
          <Spinner size="sm" />
          Exportation...
        {:else}
          <iconify-icon icon="solar:download-bold" width="20"></iconify-icon>
          <span>Exporter CSV</span>
        {/if}
      </button>

      <button
        onclick={startAudit}
        disabled={startingAudit || !!activeAudit}
        class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20 disabled:opacity-50"
      >
        {#if startingAudit}
          <Spinner size="sm" />
          Démarrage...
        {:else}
          <iconify-icon icon="solar:shield-check-bold" width="20"></iconify-icon>
          <span>Lancer l'audit</span>
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
    <FilterPanel bind:filters bind:viewMode leads={leads} onReset={resetFilters} />

    <!-- Sort Controls -->
    <div class="flex items-center gap-2 flex-wrap">
      {#each [
        { label: 'Date', value: 'createdAt' },
        { label: 'Score', value: 'score' },
        { label: 'Domaine', value: 'domain' },
        { label: 'E-mail', value: 'email' },
        { label: 'Localisation', value: 'city' },
        { label: 'Priorité', value: 'status' },
      ] as opt}
        <button
          onclick={() => handleSort(opt.value)}
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all {sortBy === opt.value ? 'bg-black text-white shadow-md' : 'bg-white text-neutral-600 hover:bg-neutral-100 shadow-sm'}"
        >
          {opt.label}
          <iconify-icon
            icon={sortBy === opt.value ? (sortOrder === 'asc' ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold') : 'solar:arrow-down-bold'}
            width="13"
            class={sortBy === opt.value ? '' : 'opacity-20'}
          ></iconify-icon>
        </button>
      {/each}
    </div>

    <!-- Leads Map -->
    {#if !initialLoading && processedLeads.some(l => l.coordinates)}
      <LeadsMap leads={processedLeads} />
    {/if}

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
              ? 'Aucun lead ne correspond à vos filtres'
              : 'Aucun lead disponible'}
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

