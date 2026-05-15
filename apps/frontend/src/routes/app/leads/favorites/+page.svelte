<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import LeadsTable from '$lib/components/leads/LeadsTable.svelte';
  import LeadsMap from '$lib/components/leads/LeadsMap.svelte';
  import PaginationControls from '$lib/components/leads/PaginationControls.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());

  let leads = $state<any[]>([]);
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
      toast.push('�chec du chargement des favoris', 'error');
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
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  <div class="flex items-center gap-3">
    <button
      aria-label="Retour aux leads"
      onclick={() => goto('/app/leads')}
      class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors"
    >
      <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
    </button>
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Favoris</h1>
      <p class="text-sm text-muted-foreground mt-1">
        {processedLeads.length} lead{processedLeads.length !== 1 ? 's' : ''} favori{processedLeads.length !== 1 ? 's' : ''}
      </p>
    </div>
  </div>

  <div class="space-y-6">
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

    {#if !loading && processedLeads.some(l => l.coordinates)}
      <LeadsMap leads={processedLeads} />
    {/if}

    <div class="rounded-xl border border-border bg-card overflow-hidden">
      {#if loading}
        <div class="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      {:else if processedLeads.length === 0}
        <div class="flex flex-col items-center justify-center py-16 space-y-3">
          <iconify-icon icon="solar:heart-linear" width="48" class="text-muted-foreground"></iconify-icon>
          <p class="text-sm font-medium text-foreground">Aucun lead favori</p>
          <p class="text-sm text-muted-foreground">
            Ajoutez des leads à vos favoris pour les retrouver facilement ici
          </p>
          <button
            onclick={() => goto('/app/leads')}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 mt-2"
          >
            Voir tous les leads
          </button>
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
