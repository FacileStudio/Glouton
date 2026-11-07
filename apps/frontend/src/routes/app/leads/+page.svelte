<script lang="ts">
  import type { RouterOutputs } from '@repo/trpc-client';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { onMount, onDestroy } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { Button, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import StatsCards from '$lib/components/leads/StatsCards.svelte';
  import FilterPanel, { type Filters } from '$lib/components/leads/FilterPanel.svelte';
  import AuditBanner from '$lib/components/leads/AuditBanner.svelte';
  import LeadsTable from '$lib/components/leads/LeadsTable.svelte';
  import LeadsMap from '$lib/components/leads/LeadsMap.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { setupAuditListeners, setupHuntListeners, type AuditSession, type HuntSession } from '$lib/websocket-events';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useT } from '$lib/i18n';

  const t = useT();
  let teamId = $derived(teamContextStore.getTeamId());

  
  let leads = $state<RouterOutputs['lead']['query']['list']['leads']>([]);
  let stats = $state<RouterOutputs['lead']['query']['getStats'] | null>(null);
  let auditSessions = $state<AuditSession[]>([]);
  let huntSessions = $state<HuntSession[]>([]);
  let initialLoading = $state(true);
  let loadingData = $state(false);

  
  let filters = $state<Filters>({
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
    const params = new SvelteURLSearchParams();
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
    replaceState(qs ? resolve(`/app/leads?${qs}`) : resolve('/app/leads'), {});
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
      status: (params.get('status') || '') as Filters['status'],
      contacted: params.get('contacted') || '',
      country: params.get('country') || '',
      city: params.get('city') || '',
      businessType: (params.get('businessType') as 'all' | 'domain' | 'local') || 'all',
      category: (params.get('category') || '') as Filters['category'],
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
      toast.danger(t('leads.loadFailed'));
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
      toast.success(t('leads.auditStarted'));

      
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
      toast.danger(t('leads.auditStartFailed'));
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
      toast.danger(t('leads.auditCancelFailed'));
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

      toast.success(t('leads.exported', { count: result.count }));
    } catch (error) {
      toast.danger(t('leads.exportFailed'));
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
      toast.danger(t('leads.csvRequired'));
      return;
    }

    try {
      importing = true;
      const csvText = await file.text();
      const result = await trpc.lead.importExport.importFromCsv.mutate({
        csvContent: csvText,
        teamId: teamId || undefined,
      });

      toast.success(t('leads.importStarted'));
      window.location.href = `/app/hunts/${result.huntSessionId}`;
    } catch (error) {
      const errorMessage = getErrorMessage(error, t('leads.importFailed'));
      toast.danger(errorMessage);
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

  const sortOptions = $derived([
    { label: t('leads.sort.date'), value: 'createdAt' },
    { label: t('leads.sort.score'), value: 'score' },
    { label: t('leads.sort.domain'), value: 'domain' },
    { label: t('leads.sort.email'), value: 'email' },
    { label: t('leads.sort.location'), value: 'city' },
    { label: t('leads.sort.priority'), value: 'status' },
  ]);
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".csv"
  onchange={handleFileUpload}
  class="hidden"
/>

<PageHeader
  title={t('leads.title')}
  description={t('leads.results', { count: processedLeads.length })}
>
  {#snippet actions()}
    <Button variant="outline" href="/app/leads/favorites" icon="solar:heart-linear">{t('leads.favorites')}</Button>

    <Button variant="outline" onclick={triggerFileUpload} disabled={importing} icon={importing ? undefined : 'solar:upload-linear'}>
      {#if importing}
        <Spinner size="sm" />
        {t('leads.importing')}
      {:else}
        {t('leads.import')}
      {/if}
    </Button>

    <Button variant="outline" onclick={exportToCSV} disabled={exporting} icon={exporting ? undefined : 'solar:download-linear'}>
      {#if exporting}
        <Spinner size="sm" />
        {t('leads.exporting')}
      {:else}
        {t('leads.export')}
      {/if}
    </Button>

    <Button onclick={startAudit} disabled={startingAudit || !!activeAudit} icon={startingAudit ? undefined : 'solar:shield-check-linear'}>
      {#if startingAudit}
        <Spinner size="sm" class="text-fc-accent-fg" />
        {t('leads.starting')}
      {:else}
        {t('leads.audit')}
      {/if}
    </Button>
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
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

  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('leads.sortBy')}>
    {#each sortOptions as opt (opt.value)}
      <button
        type="button"
        onclick={() => handleSort(opt.value)}
        aria-pressed={sortBy === opt.value}
        class="inline-flex h-11 items-center gap-1.5 rounded-fc-pill px-3 text-fc-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring md:h-8 {sortBy === opt.value ? 'bg-fc-accent text-fc-accent-fg' : 'text-fc-fg hover:bg-fc-surface'}"
      >
        {opt.label}
        {#if sortBy === opt.value}
          <iconify-icon icon={sortOrder === 'asc' ? 'solar:arrow-up-linear' : 'solar:arrow-down-linear'} width="12" height="12" class="block"></iconify-icon>
        {/if}
      </button>
    {/each}
  </div>

  {#if !initialLoading && processedLeads.some(l => l.coordinates)}
    <LeadsMap leads={processedLeads} />
  {/if}

  {#if loadingData && !initialLoading}
    <Card class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </Card>
  {:else if processedLeads.length === 0}
    <EmptyState
      icon="solar:ghost-linear"
      title={filters.search || filters.status || filters.contacted || filters.country || filters.city
        ? t('leads.noMatch')
        : t('leads.none')}
    />
  {:else}
    <LeadsTable leads={processedLeads} bind:sortBy bind:sortOrder onSort={handleSort} />
  {/if}

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
