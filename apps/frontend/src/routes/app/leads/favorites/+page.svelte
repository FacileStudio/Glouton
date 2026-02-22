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

<div
  class="min-h-screen selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  <div class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex items-center gap-4">
      <button
        onclick={() => goto('/app/leads')}
        class="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
      >
        <iconify-icon icon="solar:arrow-left-bold" width="20"></iconify-icon>
      </button>

      <div class="w-16 h-16 flex items-center justify-center bg-red-500 rounded-2xl">
        <iconify-icon icon="solar:heart-bold" width="32" class="text-white"></iconify-icon>
      </div>
      <div class="space-y-1">
        <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
          Favoris
        </h1>
        <p class="text-neutral-400 font-medium text-sm">
          {processedLeads.length} lead{processedLeads.length !== 1 ? 's' : ''} favori{processedLeads.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  </div>

  <div class="space-y-8">
    <div class="flex items-center gap-2 flex-wrap">
      {#each [
        { label: 'Date', value: 'createdAt' },
        { label: 'Score', value: 'score' },
        { label: 'Domaine', value: 'domain' },
        { label: 'E-mail', value: 'email' },
        { label: 'Localisation', value: 'city' },
        { label: 'Priorit�', value: 'status' },
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

    {#if !loading && processedLeads.some(l => l.coordinates)}
      <LeadsMap leads={processedLeads} />
    {/if}

    <div class="rounded-2xl overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      {#if loading}
        <div class="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      {:else if processedLeads.length === 0}
        <div class="flex flex-col items-center justify-center py-20 space-y-4">
          <iconify-icon icon="solar:heart-linear" width="80" class="text-neutral-200"></iconify-icon>
          <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
            Aucun lead favori
          </p>
          <p class="text-neutral-400 text-sm">
            Ajoutez des leads à vos favoris pour les retrouver facilement ici
          </p>
          <button
            onclick={() => goto('/app/leads')}
            class="mt-4 px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors"
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
</div>
