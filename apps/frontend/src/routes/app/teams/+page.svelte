<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Spinner, EmptyState, Button } from '@repo/ui';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  let teams = $state<any[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');

  let filteredTeams = $derived(
    teams.filter(team =>
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (team.description && team.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  onMount(async () => {
    await loadTeams();
  });

  async function loadTeams() {
    loading = true;
    try {
      const result = await trpc.team.list.query();
      teams = result || [];
    } catch (error) {
      console.error('Error loading teams:', error);
      toast.push('Échec du chargement des équipes', 'error');
      teams = [];
    } finally {
      loading = false;
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'OWNER':
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case 'OWNER':
        return 'Propriétaire';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'Membre';
    }
  }

  function handleTeamClick(teamId: string) {
    goto(`/app/teams/${teamId}`);
  }

  function handleCreateTeam() {
    goto('/app/teams/new');
  }
</script>

<div
  class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
        <iconify-icon icon="solar:users-group-rounded-bold" width="32" class="text-white"></iconify-icon>
      </div>
      <div class="space-y-1">
        <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
          Équipes
        </h1>
        <p class="text-neutral-400 font-medium text-sm">
          Gérez vos équipes et collaborez avec vos collègues
        </p>
      </div>
    </div>

    <button
      onclick={handleCreateTeam}
      class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20"
    >
      <iconify-icon icon="mdi:plus-circle" width="20"></iconify-icon>
      <span>Créer une équipe</span>
    </button>
  </div>

  {#if !loading && teams.length > 0}
    <div class="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100">
      <div class="relative">
        <iconify-icon
          icon="solar:magnifer-bold"
          width="20"
          class="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
        ></iconify-icon>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Rechercher une équipe..."
          class="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 focus:border-neutral-900 focus:outline-none transition-colors font-medium"
        />
      </div>
    </div>
  {/if}

  <div class="rounded-2xl overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    {:else if filteredTeams.length === 0}
      <div class="p-12">
        <EmptyState
          title={searchQuery ? 'Aucune équipe trouvée' : 'Aucune équipe'}
          description={searchQuery ? 'Essayez de modifier votre recherche' : 'Créez votre première équipe pour commencer'}
          icon="solar:users-group-two-rounded-bold"
        >
          <div slot="action">
            {#if !searchQuery}
              <Button onclick={handleCreateTeam} intent="primary" size="lg">
                <iconify-icon icon="mdi:plus-circle" width="20"></iconify-icon>
                Créer une équipe
              </Button>
            {/if}
          </div>
        </EmptyState>
      </div>
    {:else}
      <div class="space-y-3">
        {#each filteredTeams as team (team.id)}
          <button
            onclick={() => handleTeamClick(team.id)}
            class="w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 border border-neutral-100 text-left group cursor-pointer"
          >
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center text-white font-black text-sm group-hover:bg-black transition-colors flex-shrink-0">
                {team.name[0].toUpperCase()}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-bold text-base text-neutral-900 truncate">
                    {team.name}
                  </h3>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border {getRoleBadgeColor(team.role)}">
                    {getRoleLabel(team.role)}
                  </span>
                </div>

                <div class="flex items-center gap-4 text-xs text-neutral-500">
                  <div class="flex items-center gap-1">
                    <iconify-icon icon="solar:users-group-rounded-bold" width="14"></iconify-icon>
                    <span>{team._count?.members || 0} membre{(team._count?.members || 0) !== 1 ? 's' : ''}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <iconify-icon icon="solar:chart-square-bold" width="14"></iconify-icon>
                    <span>{team._count?.leads || 0} lead{(team._count?.leads || 0) !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !loading && filteredTeams.length > 0}
    <div class="flex items-center justify-center">
      <p class="text-neutral-400 font-medium text-sm">
        {filteredTeams.length} équipe{filteredTeams.length !== 1 ? 's' : ''}
        {searchQuery ? ' trouvée' + (filteredTeams.length !== 1 ? 's' : '') : ''}
      </p>
    </div>
  {/if}
</div>
