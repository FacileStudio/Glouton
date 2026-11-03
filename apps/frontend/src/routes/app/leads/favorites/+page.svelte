<script lang="ts">
  import type { RouterOutputs } from '@repo/trpc-client';
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { Button, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import LeadsTable from '$lib/components/leads/LeadsTable.svelte';
  import LeadsMap from '$lib/components/leads/LeadsMap.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';

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
      toast.danger('Échec du chargement des favoris');
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

  const sortOptions = [
    { label: 'Date', value: 'createdAt' },
    { label: 'Score', value: 'score' },
    { label: 'Domaine', value: 'domain' },
    { label: 'E-mail', value: 'email' },
    { label: 'Localisation', value: 'city' },
    { label: 'Priorité', value: 'status' },
  ];
</script>

<PageHeader
  title="Favoris"
  description="{processedLeads.length} lead{processedLeads.length !== 1 ? 's' : ''} favori{processedLeads.length !== 1 ? 's' : ''}"
  back={{ href: '/app/leads', label: 'Leads' }}
/>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Trier par">
    {#each sortOptions as opt (opt.value)}
      <button
        type="button"
        onclick={() => handleSort(opt.value)}
        aria-pressed={sortBy === opt.value}
        class="inline-flex h-11 items-center gap-1.5 rounded-fc-pill px-3 text-fc-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring md:h-8 {sortBy === opt.value ? 'bg-fc-accent text-fc-accent-fg' : 'border border-fc-border text-fc-fg hover:bg-fc-surface'}"
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
      title="Aucun lead favori"
      description="Ajoutez des leads à vos favoris pour les retrouver facilement ici"
    >
      <Button href="/app/leads">Voir tous les leads</Button>
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
