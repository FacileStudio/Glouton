<script lang="ts">
  import type { RouterOutputs } from '@repo/trpc-client';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { Badge, Button, Card, EmptyState, Icon, Input, PageHeader, Spinner, icons, toast } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();
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
      toast.danger(t('teams.loadFailed'));
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
        return t('teams.role.owner');
      case 'ADMIN':
        return t('teams.role.admin');
      default:
        return t('teams.role.member');
    }
  }

  function handleTeamClick(teamId: string) {
    goto(resolve('/app/teams/[teamId]', { teamId }));
  }

  function handleCreateTeam() {
    goto(resolve('/app/teams/new'));
  }
</script>

<PageHeader title={t('teams.title')} description={t('teams.subtitle')}>
  {#snippet actions()}
    {#if spacesUrl}
      <Button variant="outline" icon={icons.space} href={spacesUrl}>{t('teams.manage')}</Button>
    {:else if !loading}
      <Button icon={icons.plus} onclick={handleCreateTeam}>{t('teams.create')}</Button>
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
        placeholder={t('teams.searchPlaceholder')}
        aria-label={t('teams.search')}
        class="pl-9"
      />
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" label={t('teams.loading')} />
    </div>
  {:else if filteredTeams.length === 0}
    <Card>
      <EmptyState
        icon={icons.space}
        title={searchQuery ? t('teams.noneFound') : t('teams.none')}
      >
        {#if !searchQuery && spacesUrl}
          <Button variant="outline" icon={icons.space} href={spacesUrl}>{t('teams.manage')}</Button>
        {:else if !searchQuery}
          <Button icon={icons.plus} onclick={handleCreateTeam}>{t('teams.create')}</Button>
        {/if}
      </EmptyState>
    </Card>
  {:else}
    <Card class="overflow-hidden p-0">
      <ul class="flex flex-col gap-1">
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
                    {t('teams.memberCount', { count: team._count?.members || 0 })}
                  </span>
                  <span class="flex items-center gap-1">
                    <iconify-icon icon="solar:chart-square-linear" width="14" height="14" class="block"></iconify-icon>
                    {t('teams.leadCount', { count: team._count?.leads || 0 })}
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
      {t(searchQuery ? 'teams.foundCount' : 'teams.count', { count: filteredTeams.length })}
    </p>
  {/if}
</div>
