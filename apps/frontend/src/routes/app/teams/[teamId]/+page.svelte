<script lang="ts">
  import { QUIET, type RouterOutputs } from '@repo/trpc-client';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import {
    Badge,
    Button,
    Card,
    Icon,
    PageHeader,
    SettingsRow,
    SettingsSection,
    Spinner,
    StatCard,
    icons,
    toast,
  } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  let { params }: PageProps = $props();
  let teamId = $derived(params.teamId);
  let team = $state<RouterOutputs['team']['get'] | null>(null);
  let stats = $state<RouterOutputs['team']['getStats'] | null>(null);
  let loading = $state(true);
  let loadingStats = $state(true);

  onMount(async () => {
    await Promise.all([loadTeam(), loadStats()]);
  });

  async function loadTeam() {
    loading = true;
    try {
      team = await trpc.team.get.query({ teamId });
    } catch (error) {
      console.error('Error loading team:', error);
      toast.danger(getErrorMessage(error, t('teams.loadOneFailed')));
      goto(resolve('/app/teams'));
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    loadingStats = true;
    try {
      stats = await trpc.team.getStats.query({ teamId }, { context: QUIET });
    } catch (error) {
      console.error('Error loading stats:', error);
      stats = null;
    } finally {
      loadingStats = false;
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

  function openSettings() {
    goto(resolve('/app/teams/[teamId]/settings', { teamId }));
  }

  function formatDate(value: string | Date) {
    return format.date(value, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function statValue(value: number | undefined) {
    return loadingStats ? '...' : value || 0;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center py-16">
    <Spinner size="lg" label={t('teams.loadingOne')} />
  </div>
{:else if team}
  <PageHeader
    title={team.name}
    description={team.description || undefined}
    back={{ href: '/app/teams', label: t('teams.title') }}
  >
    {#snippet actions()}
      {#if team}
        <Badge tone={getRoleTone(team.userRole)}>{getRoleLabel(team.userRole)}</Badge>
        {#if team.registreSpaceId && team.manageUrl}
          <Button variant="secondary" icon={icons.space} href={team.manageUrl}>{t('teams.manage')}</Button>
        {/if}
        <Button variant="secondary" icon={icons.settings} onclick={() => openSettings()}>
          {t('teams.settings')}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <Card href="/app/teams/{teamId}/members" class="flex flex-col gap-1">
      <span class="flex items-center justify-between text-fc-fg-muted">
        <Icon icon={icons.usersGroup} size={20} />
        <Icon icon={icons.arrow} size={16} class="transition-transform group-hover:translate-x-0.5" />
      </span>
      <span class="text-fc-sm text-fc-fg-muted">{t('teams.members')}</span>
      <span class="text-fc-2xl font-semibold text-fc-fg">{statValue(stats?.memberCount)}</span>
    </Card>

    <Card href="/app/leads" class="flex flex-col gap-1">
      <span class="flex items-center justify-between text-fc-fg-muted">
        <iconify-icon icon="solar:chart-square-linear" width="20" height="20" class="block"></iconify-icon>
        <Icon icon={icons.arrow} size={16} class="transition-transform group-hover:translate-x-0.5" />
      </span>
      <span class="text-fc-sm text-fc-fg-muted">{t('leads.title')}</span>
      <span class="text-fc-2xl font-semibold text-fc-fg">{statValue(stats?.totalLeads)}</span>
    </Card>
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label={t('teams.hotLeads')} value={statValue(stats?.hotLeads)} />
    <StatCard
      label={t('hunts.title')}
      value={statValue(stats?.totalHunts)}
      delta={stats && stats.activeHunts > 0
        ? t('teams.activeHunts', { count: stats.activeHunts })
        : undefined}
    />
    <StatCard label={t('teams.audits')} value={statValue(stats?.totalAudits)} />
    <StatCard label={t('teams.emailsSent')} value={statValue(stats?.emailsSent)} />
  </div>

  <SettingsSection title={t('teams.info')} class="max-w-fc-md">
    <SettingsRow label={t('teams.createdOn')}>
      <span class="text-fc-sm text-fc-fg">{formatDate(team.createdAt)}</span>
    </SettingsRow>
    <SettingsRow label={t('teams.updatedOn')}>
      <span class="text-fc-sm text-fc-fg">{formatDate(team.updatedAt)}</span>
    </SettingsRow>
    <SettingsRow label={t('teams.yourRole')}>
      <Badge tone={getRoleTone(team.userRole)}>{getRoleLabel(team.userRole)}</Badge>
    </SettingsRow>
  </SettingsSection>
{/if}
