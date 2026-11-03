<script lang="ts">
  import type { RouterOutputs } from '@repo/trpc-client';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { Badge, Button, Card, EmptyState, Icon, Input, PageHeader, Spinner, icons, toast } from '@facile/muse';

  let teams = $state<RouterOutputs['team']['list']>([]);
  let loading = $state(true);
  let spacesUrl = $state<string | null>(null);
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
      const [result, directory] = await Promise.all([
        trpc.team.list.query(),
        trpc.team.directory.query(),
      ]);
      teams = result || [];
      spacesUrl = directory.spacesUrl;
    } catch (error) {
      console.error('Error loading teams:', error);
      toast.danger('Échec du chargement des espaces');
      teams = [];
    } finally {
      loading = false;
    }
  }

  function getRoleTone(role: string): 'owner' | 'admin' | 'neutral' {
    if (role === 'OWNER') return 'owner';
    if (role === 'ADMIN') return 'admin';
    return 'neutral';
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
    goto(resolve('/app/teams/[teamId]', { teamId }));
  }

  function handleCreateTeam() {
    goto(resolve('/app/teams/new'));
  }
</script>

<PageHeader title="Espaces" description="Gérez vos espaces et collaborez avec vos collègues">
  {#snippet actions()}
    {#if spacesUrl}
      <Button variant="outline" icon={icons.space} href={spacesUrl}>Gérer dans Registre</Button>
    {:else if !loading}
      <Button icon={icons.plus} onclick={handleCreateTeam}>Créer un espace</Button>
    {/if}
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
  {#if !loading && teams.length > 0}
    <div class="relative">
      <Icon
        icon={icons.search}
        size={16}
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fc-fg-muted"
      />
      <Input
        type="search"
        bind:value={searchQuery}
        placeholder="Rechercher un espace..."
        aria-label="Rechercher un espace"
        class="pl-9"
      />
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" label="Chargement des espaces" />
    </div>
  {:else if filteredTeams.length === 0}
    <Card>
      <EmptyState
        icon={icons.space}
        title={searchQuery ? 'Aucun espace trouvé' : 'Aucun espace'}
      >
        {#if !searchQuery && spacesUrl}
          <Button variant="outline" icon={icons.space} href={spacesUrl}>Gérer dans Registre</Button>
        {:else if !searchQuery}
          <Button icon={icons.plus} onclick={handleCreateTeam}>Créer un espace</Button>
        {/if}
      </EmptyState>
    </Card>
  {:else}
    <Card class="overflow-hidden p-0">
      <ul class="divide-y divide-fc-border">
        {#each filteredTeams as team (team.id)}
          <li>
            <button
              type="button"
              onclick={() => handleTeamClick(team.id)}
              class="group flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-ring"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-sm font-medium text-fc-fg"
              >
                {team.name[0].toUpperCase()}
              </span>

              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="flex items-center gap-2">
                  <span class="truncate text-fc-sm font-medium text-fc-fg">{team.name}</span>
                  <Badge tone={getRoleTone(team.role)}>{getRoleLabel(team.role)}</Badge>
                </span>

                <span class="flex items-center gap-4 text-fc-xs text-fc-fg-muted">
                  <span class="flex items-center gap-1">
                    <Icon icon={icons.usersGroup} size={14} />
                    {team._count?.members || 0} membre{(team._count?.members || 0) !== 1 ? 's' : ''}
                  </span>
                  <span class="flex items-center gap-1">
                    <iconify-icon icon="solar:chart-square-linear" width="14" height="14" class="block"></iconify-icon>
                    {team._count?.leads || 0} lead{(team._count?.leads || 0) !== 1 ? 's' : ''}
                  </span>
                </span>
              </span>

              <Icon
                icon={icons.arrow}
                size={18}
                class="shrink-0 text-fc-fg-muted transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </li>
        {/each}
      </ul>
    </Card>

    <p class="text-center text-fc-xs text-fc-fg-muted">
      {filteredTeams.length} espace{filteredTeams.length !== 1 ? 's' : ''}
      {searchQuery ? ' trouvé' + (filteredTeams.length !== 1 ? 's' : '') : ''}
    </p>
  {/if}
</div>
