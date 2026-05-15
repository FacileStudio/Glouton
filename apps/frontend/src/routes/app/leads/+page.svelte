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
  import LeadsMap from '$lib/components/leads/LeadsMap.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { setupAuditListeners, setupHuntListeners, type AuditSession, type HuntSession } from '$lib/websocket-events.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());

  
  let leads = $state<any[]>([]);
  let stats = $state<any>(null);
  let auditSessions = $state<AuditSession[]>([]);
  let huntSessions = $state<HuntSession[]>([]);
  let initialLoading = $state(true);
  let loadingData = $state(false);

  
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

  
  let filtersExpanded = $state(false);

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
    const qs = params.toString();
    replaceState(qs ? `?${qs}` : location.pathname, {});
  }

  $effect(() => {
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

  
  let startingAudit = $state(false);
  let cancellingAuditId = $state<string | null>(null);

  
  let exporting = $state(false);
  let importing = $state(false);
  let fileInput: HTMLInputElement;

  
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

    const auditUnsubscribers = setupAuditListeners(
      updateAuditSession,
      addAuditSession,
      removeAuditSession,
      loadData,
      loadStats
    );

    const huntUnsubscribers = setupHuntListeners(
      updateHuntSession,
      addHuntSession,
      loadData,
      loadStats
    );

    wsUnsubscribers = [...auditUnsubscribers, ...huntUnsubscribers];

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
      const result = await trpc.lead.audit.start.mutate({ teamId: teamId || undefined });
      toast.push('Audit démarré ! Vérification des leads pour les données manquantes...', 'success');

      
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
        teamId: teamId || undefined,
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
      const result = await trpc.lead.importExport.importFromCsv.mutate({
        csvContent: csvText,
        teamId: teamId || undefined,
      });

      toast.push('Import CSV démarré ! Redirection...', 'success');
      window.location.href = `/app/hunts/${result.huntSessionId}`;
    } catch (error: any) {
      const errorMessage = error?.message || "Échec de l'importation du CSV";
      toast.push(errorMessage, 'error');
      console.error('Import error:', error);
      importing = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function triggerFileUpload() {
    fileInput?.click();
  }

  
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

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
      <p class="text-sm text-muted-foreground mt-1">
        {processedLeads.length} résultat{processedLeads.length !== 1 ? 's' : ''}
      </p>
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <a
        href="/app/leads/favorites"
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        <iconify-icon icon="solar:heart-linear" width="16"></iconify-icon>
        <span>Favoris</span>
      </a>

      <button
        onclick={triggerFileUpload}
        disabled={importing}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        {#if importing}
          <Spinner size="sm" />
          Importation...
        {:else}
          <iconify-icon icon="solar:upload-linear" width="16"></iconify-icon>
          <span>Importer CSV</span>
        {/if}
      </button>

      <button
        onclick={exportToCSV}
        disabled={exporting}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        {#if exporting}
          <Spinner size="sm" />
          Exportation...
        {:else}
          <iconify-icon icon="solar:download-linear" width="16"></iconify-icon>
          <span>Exporter CSV</span>
        {/if}
      </button>

      <button
        onclick={startAudit}
        disabled={startingAudit || !!activeAudit}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
      >
        {#if startingAudit}
          <Spinner size="sm" />
          Démarrage...
        {:else}
          <iconify-icon icon="solar:shield-check-linear" width="16"></iconify-icon>
          <span>Lancer l'audit</span>
        {/if}
      </button>
    </div>
  </div>

  <div class="space-y-6">
    {#if activeAudit}
      <AuditBanner
        session={activeAudit}
        onCancel={cancelAudit}
        cancelling={cancellingAuditId === activeAudit.id}
      />
    {/if}

    {#if !initialLoading}
      <StatsCards {stats} />
    {/if}

    <FilterPanel bind:filters bind:filtersExpanded leads={leads} onReset={resetFilters} />

    <div class="flex items-center gap-1.5 flex-wrap">
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
          class="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors {sortBy === opt.value ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-foreground hover:bg-muted'}"
        >
          {opt.label}
          {#if sortBy === opt.value}
            <iconify-icon
              icon={sortOrder === 'asc' ? 'solar:arrow-up-linear' : 'solar:arrow-down-linear'}
              width="12"
            ></iconify-icon>
          {/if}
        </button>
      {/each}
    </div>

    {#if !initialLoading && processedLeads.some(l => l.coordinates)}
      <LeadsMap leads={processedLeads} />
    {/if}

    <div class="rounded-xl border border-border bg-card overflow-hidden">
      {#if loadingData && !initialLoading}
        <div class="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      {:else if processedLeads.length === 0}
        <div class="flex flex-col items-center justify-center py-16 space-y-3">
          <iconify-icon icon="solar:ghost-linear" width="48" class="text-muted-foreground"></iconify-icon>
          <p class="text-sm text-muted-foreground">
            {filters.search ||
            filters.status ||
            filters.contacted ||
            filters.country ||
            filters.city
              ? 'Aucun lead ne correspond à vos filtres'
              : 'Aucun lead disponible'}
          </p>
        </div>
      {:else}
        <LeadsTable leads={processedLeads} bind:sortBy bind:sortOrder onSort={handleSort} />
      {/if}
    </div>

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

