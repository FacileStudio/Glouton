<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
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

  let teamId = $derived(page.params.teamId);
  let team = $state<any>(null);
  let stats = $state<any>(null);
  let loading = $state(true);
  let loadingStats = $state(true);

  onMount(async () => {
    await Promise.all([loadTeam(), loadStats()]);
  });

  async function loadTeam() {
    loading = true;
    try {
      team = await trpc.team.get.query({ teamId });
    } catch (error: any) {
      console.error('Error loading team:', error);
      toast.danger(error?.message || 'Échec du chargement de l\'espace');
      goto('/app/teams');
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    loadingStats = true;
    try {
      stats = await trpc.team.getStats.query({ teamId });
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
        return 'Propriétaire';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'Membre';
    }
  }

  function handleNavigate(path: string) {
    goto(`/app/teams/${teamId}${path}`);
  }

  function formatDate(value: string | Date) {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function statValue(value: number | undefined) {
    return loadingStats ? '...' : value || 0;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center py-16">
    <Spinner size="lg" label="Chargement de l'espace" />
  </div>
{:else if team}
  <PageHeader
    title={team.name}
    description={team.description || undefined}
    back={{ href: '/app/teams', label: 'Espaces' }}
  >
    {#snippet actions()}
      <Badge tone={getRoleTone(team.userRole)}>{getRoleLabel(team.userRole)}</Badge>
      {#if team.registreSpaceId && team.manageUrl}
        <Button variant="outline" icon={icons.space} href={team.manageUrl}>Gérer dans Registre</Button>
      {/if}
      <Button variant="outline" icon={icons.settings} onclick={() => handleNavigate('/settings')}>
        Paramètres
      </Button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <Card href="/app/teams/{teamId}/members" class="flex flex-col gap-1">
      <span class="flex items-center justify-between text-fc-fg-muted">
        <Icon icon={icons.usersGroup} size={20} />
        <Icon icon={icons.arrow} size={16} class="transition-transform group-hover:translate-x-0.5" />
      </span>
      <span class="text-fc-sm text-fc-fg-muted">Membres</span>
      <span class="text-fc-2xl font-semibold text-fc-fg">{statValue(stats?.memberCount)}</span>
    </Card>

    <Card href="/app/leads" class="flex flex-col gap-1">
      <span class="flex items-center justify-between text-fc-fg-muted">
        <iconify-icon icon="solar:chart-square-linear" width="20" height="20" class="block"></iconify-icon>
        <Icon icon={icons.arrow} size={16} class="transition-transform group-hover:translate-x-0.5" />
      </span>
      <span class="text-fc-sm text-fc-fg-muted">Leads</span>
      <span class="text-fc-2xl font-semibold text-fc-fg">{statValue(stats?.totalLeads)}</span>
    </Card>
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Leads chauds" value={statValue(stats?.hotLeads)} />
    <StatCard
      label="Chasses"
      value={statValue(stats?.totalHunts)}
      delta={stats?.activeHunts > 0
        ? `${stats.activeHunts} active${stats.activeHunts !== 1 ? 's' : ''}`
        : undefined}
    />
    <StatCard label="Audits" value={statValue(stats?.totalAudits)} />
    <StatCard label="Emails envoyés" value={statValue(stats?.emailsSent)} />
  </div>

  <SettingsSection title="Informations" class="max-w-fc-md">
    <SettingsRow label="Créé le">
      <span class="text-fc-sm text-fc-fg">{formatDate(team.createdAt)}</span>
    </SettingsRow>
    <SettingsRow label="Dernière mise à jour">
      <span class="text-fc-sm text-fc-fg">{formatDate(team.updatedAt)}</span>
    </SettingsRow>
    <SettingsRow label="Votre rôle">
      <Badge tone={getRoleTone(team.userRole)}>{getRoleLabel(team.userRole)}</Badge>
    </SettingsRow>
  </SettingsSection>
{/if}
