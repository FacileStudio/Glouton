<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Spinner } from '@repo/ui';
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
      toast.push('Échec du chargement des espaces', 'error');
      teams = [];
    } finally {
      loading = false;
    }
  }

  function getRoleBadgeColor(_role: string) {
    return 'bg-muted text-foreground';
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

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Espaces</h1>
      <p class="text-sm text-muted-foreground">
        Gérez vos espaces et collaborez avec vos collègues
      </p>
    </div>

    <button
      onclick={handleCreateTeam}
      class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
    >
      <iconify-icon icon="mdi:plus-circle" width="16"></iconify-icon>
      <span>Créer un espace</span>
    </button>
  </div>

  {#if !loading && teams.length > 0}
    <div class="relative">
      <iconify-icon
        icon="solar:magnifer-linear"
        width="16"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      ></iconify-icon>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Rechercher un espace..."
        class="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
      />
    </div>
  {/if}

  <div class="rounded-xl border border-border bg-card overflow-hidden">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    {:else if filteredTeams.length === 0}
      <div class="flex flex-col items-center justify-center py-16 space-y-3">
        <iconify-icon icon="solar:users-group-two-rounded-linear" width="48" class="text-muted-foreground"></iconify-icon>
        <p class="text-sm text-muted-foreground">
          {searchQuery ? 'Aucun espace trouvé' : 'Aucun espace'}
        </p>
        {#if !searchQuery}
          <button
            onclick={handleCreateTeam}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Créer un espace
          </button>
        {/if}
      </div>
    {:else}
      <div class="divide-y divide-border">
        {#each filteredTeams as team (team.id)}
          <button
            onclick={() => handleTeamClick(team.id)}
            class="group w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
          >
            <div class="size-9 rounded-lg border border-border bg-background flex items-center justify-center text-foreground text-sm font-medium shrink-0">
              {team.name[0].toUpperCase()}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <h3 class="text-sm font-medium text-foreground truncate">
                  {team.name}
                </h3>
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {getRoleBadgeColor(team.role)}">
                  {getRoleLabel(team.role)}
                </span>
              </div>

              <div class="flex items-center gap-4 text-xs text-muted-foreground">
                <div class="flex items-center gap-1">
                  <iconify-icon icon="solar:users-group-rounded-linear" width="14"></iconify-icon>
                  <span>{team._count?.members || 0} membre{(team._count?.members || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="flex items-center gap-1">
                  <iconify-icon icon="solar:chart-square-linear" width="14"></iconify-icon>
                  <span>{team._count?.leads || 0} lead{(team._count?.leads || 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            <iconify-icon
              icon="solar:alt-arrow-right-linear"
              width="18"
              class="text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5"
            ></iconify-icon>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !loading && filteredTeams.length > 0}
    <div class="flex items-center justify-center">
      <p class="text-xs text-muted-foreground">
        {filteredTeams.length} espace{filteredTeams.length !== 1 ? 's' : ''}
        {searchQuery ? ' trouvé' + (filteredTeams.length !== 1 ? 's' : '') : ''}
      </p>
    </div>
  {/if}
</div>
