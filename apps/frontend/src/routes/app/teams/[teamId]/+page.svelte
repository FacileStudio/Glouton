<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Spinner, EmptyState } from '@repo/ui';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  let teamId = $derived($page.params.teamId);
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
      toast.push(error?.message || 'Échec du chargement de l\'équipe', 'error');
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

  function handleNavigate(path: string) {
    goto(`/app/teams/${teamId}${path}`);
  }

  function handleBack() {
    goto('/app/teams');
  }
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <div class="flex items-center gap-3">
      <button
        aria-label="Retour"
        onclick={handleBack}
        class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
      </button>
      <div class="flex-1 space-y-1">
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold tracking-tight text-foreground">
            {team.name}
          </h1>
          <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {getRoleBadgeColor(team.userRole)}">
            {getRoleLabel(team.userRole)}
          </span>
        </div>
        {#if team.description}
          <p class="text-sm text-muted-foreground">
            {team.description}
          </p>
        {/if}
      </div>
      <button
        onclick={() => handleNavigate('/settings')}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        <iconify-icon icon="solar:settings-linear" width="16"></iconify-icon>
        <span>Paramètres</span>
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button
        onclick={() => handleNavigate('/members')}
        class="rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div class="flex items-center justify-between mb-2">
          <iconify-icon icon="solar:users-group-rounded-linear" width="20" class="text-muted-foreground"></iconify-icon>
          <iconify-icon icon="solar:arrow-right-linear" width="16" class="text-muted-foreground"></iconify-icon>
        </div>
        <h3 class="text-sm text-muted-foreground">Membres</h3>
        <p class="text-2xl font-bold tracking-tight text-foreground mt-1">
          {loadingStats ? '...' : stats?.memberCount || 0}
        </p>
      </button>

      <button
        onclick={() => goto('/app/leads')}
        class="rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div class="flex items-center justify-between mb-2">
          <iconify-icon icon="solar:chart-square-linear" width="20" class="text-muted-foreground"></iconify-icon>
          <iconify-icon icon="solar:arrow-right-linear" width="16" class="text-muted-foreground"></iconify-icon>
        </div>
        <h3 class="text-sm text-muted-foreground">Leads</h3>
        <p class="text-2xl font-bold tracking-tight text-foreground mt-1">
          {loadingStats ? '...' : stats?.totalLeads || 0}
        </p>
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 mb-2">
          <iconify-icon icon="solar:fire-linear" width="18" class="text-muted-foreground"></iconify-icon>
          <h3 class="text-sm text-muted-foreground">Leads Chauds</h3>
        </div>
        <p class="text-2xl font-bold tracking-tight text-foreground">
          {loadingStats ? '...' : stats?.hotLeads || 0}
        </p>
      </div>

      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 mb-2">
          <iconify-icon icon="solar:lightning-linear" width="18" class="text-muted-foreground"></iconify-icon>
          <h3 class="text-sm text-muted-foreground">Chasses</h3>
        </div>
        <p class="text-2xl font-bold tracking-tight text-foreground">
          {loadingStats ? '...' : stats?.totalHunts || 0}
        </p>
        {#if stats?.activeHunts > 0}
          <p class="text-xs text-muted-foreground mt-1">
            {stats.activeHunts} active{stats.activeHunts !== 1 ? 's' : ''}
          </p>
        {/if}
      </div>

      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 mb-2">
          <iconify-icon icon="solar:shield-check-linear" width="18" class="text-muted-foreground"></iconify-icon>
          <h3 class="text-sm text-muted-foreground">Audits</h3>
        </div>
        <p class="text-2xl font-bold tracking-tight text-foreground">
          {loadingStats ? '...' : stats?.totalAudits || 0}
        </p>
      </div>

      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 mb-2">
          <iconify-icon icon="solar:letter-linear" width="18" class="text-muted-foreground"></iconify-icon>
          <h3 class="text-sm text-muted-foreground">Emails Envoyés</h3>
        </div>
        <p class="text-2xl font-bold tracking-tight text-foreground">
          {loadingStats ? '...' : stats?.emailsSent || 0}
        </p>
      </div>
    </div>

    <div class="max-w-2xl">
      <div class="rounded-xl border border-border bg-card p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4">Informations</h3>
        <div class="space-y-4">
          <div>
            <p class="text-xs text-muted-foreground mb-1">Créée le</p>
            <p class="text-sm text-foreground">
              {new Date(team.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>

          <div>
            <p class="text-xs text-muted-foreground mb-1">Dernière mise à jour</p>
            <p class="text-sm text-foreground">
              {new Date(team.updatedAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>

          <div>
            <p class="text-xs text-muted-foreground mb-1">Votre rôle</p>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {getRoleBadgeColor(team.userRole)}">
              {getRoleLabel(team.userRole)}
            </span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
