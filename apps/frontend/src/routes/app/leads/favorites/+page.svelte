<script lang="ts">
  import type { RouterOutputs } from '@repo/trpc-client';
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { Button, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import LeadsTable from '$lib/components/leads/LeadsTable.svelte';
  import LeadsMap from '$lib/components/leads/LeadsMap.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useT } from '$lib/i18n';

  const t = useT();
  let teamId = $derived(teamContextStore.getTeamId());

  let leads = $state<RouterOutputs['lead']['favorite']['list']['leads']>([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let pageSize = $state(50);
  let totalPages = $state(1);
  let totalLeads = $state(0);
  let sortBy = $state('createdAt');
  let sortOrder = $state<'asc' | 'desc'>('desc');

  onMount(async () => {
    await loadFavorites();
  });

  async function loadFavorites() {
    loading = true;
    try {
      const data = await trpc.lead.favorite.list.query({
        teamId,
        page: currentPage,
        limit: pageSize,
      });

      leads = data?.leads || [];
      totalPages = data?.pagination?.totalPages || 1;
      totalLeads = data?.pagination?.total || 0;
    } catch (error) {
      console.error('Error loading favorites:', error);
      toast.danger(t('leads.favoritesLoadFailed'));
      leads = [];
    } finally {
      loading = false;
    }
  }

  async function handlePageChange(page: number) {
    currentPage = page;
    await loadFavorites();
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortOrder = 'desc';
    }
  }

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

<PageHeader
  title={t('leads.favorites')}
  description={t('leads.favoriteCount', { count: processedLeads.length })}
  back={{ href: '/app/leads', label: t('leads.title') }}
/>

<div class="flex flex-col gap-4">
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

  {#if !loading && processedLeads.some(l => l.coordinates)}
    <LeadsMap leads={processedLeads} />
  {/if}

  {#if loading}
    <Card class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </Card>
  {:else if processedLeads.length === 0}
    <EmptyState
      icon="solar:heart-linear"
      title={t('leads.noFavorites')}
      description={t('leads.noFavoritesText')}
    >
      <Button href="/app/leads">{t('leads.seeAll')}</Button>
    </EmptyState>
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
