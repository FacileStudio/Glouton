<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Spinner } from '@repo/ui';
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

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  // Navigation cards: explicit destinations with description + arrow so
  // they read as links, not as stat tiles.
  let sections = $derived([
    {
      href: `/app/teams/${teamId}/members`,
      icon: 'solar:users-group-rounded-linear',
      title: 'Membres',
      description: 'Inviter des membres, gérer les rôles et les accès',
      count: stats?.memberCount ?? null,
    },
    {
      href: '/app/leads',
      icon: 'solar:chart-square-linear',
      title: 'Leads de l\'équipe',
      description: 'Consulter et travailler les leads partagés',
      count: stats?.totalLeads ?? null,
    },
    {
      href: `/app/teams/${teamId}/settings`,
      icon: 'solar:settings-linear',
      title: 'Paramètres',
      description: 'Nom, description et configuration de l\'équipe',
      count: null,
    },
  ]);

  let statTiles = $derived([
    { icon: 'solar:fire-linear', label: 'Leads chauds', value: stats?.hotLeads ?? 0, sub: null },
    {
      icon: 'solar:lightning-linear',
      label: 'Chasses',
      value: stats?.totalHunts ?? 0,
      sub: stats?.activeHunts > 0 ? `${stats.activeHunts} active${stats.activeHunts !== 1 ? 's' : ''}` : null,
    },
    { icon: 'solar:shield-check-linear', label: 'Audits', value: stats?.totalAudits ?? 0, sub: null },
    { icon: 'solar:letter-linear', label: 'Emails envoyés', value: stats?.emailsSent ?? 0, sub: null },
  ]);
</script>

<div class="max-w-5xl mx-auto px-6 py-6 space-y-8">
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <!-- Header -->
    <div class="space-y-4">
      <a
        href="/app/teams"
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="15"></iconify-icon>
        Équipes
      </a>

      <div class="flex items-start gap-4">
        <div
          class="size-14 rounded-2xl border border-primary/20 bg-primary/10 flex items-center justify-center text-xl font-bold text-primary shrink-0"
        >
          {team.name[0].toUpperCase()}
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-2xl font-bold tracking-tight text-foreground">
              {team.name}
            </h1>
            <span class="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium">
              {getRoleLabel(team.userRole)}
            </span>
          </div>
          {#if team.description}
            <p class="text-sm text-muted-foreground">
              {team.description}
            </p>
          {/if}
          <p class="text-xs text-muted-foreground">
            Créée le {formatDate(team.createdAt)} · Mise à jour le {formatDate(team.updatedAt)}
          </p>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Gérer l'équipe
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {#each sections as section (section.href)}
          <a
            href={section.href}
            class="group rounded-xl border border-border bg-card p-5 flex flex-col gap-4 transition-all hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
          >
            <div class="flex items-center justify-between">
              <div
                class="size-10 rounded-lg bg-muted flex items-center justify-center text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"
              >
                <iconify-icon icon={section.icon} width="20"></iconify-icon>
              </div>
              <iconify-icon
                icon="solar:arrow-right-linear"
                width="18"
                class="text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary"
              ></iconify-icon>
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-foreground">{section.title}</h3>
                {#if section.count !== null && !loadingStats}
                  <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {section.count}
                  </span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground leading-relaxed">
                {section.description}
              </p>
            </div>
          </a>
        {/each}
      </div>
    </div>

    <!-- Stats -->
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Activité
      </h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each statTiles as tile (tile.label)}
          <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-center gap-2 mb-2">
              <iconify-icon icon={tile.icon} width="16" class="text-muted-foreground"></iconify-icon>
              <h3 class="text-xs text-muted-foreground">{tile.label}</h3>
            </div>
            <p class="text-2xl font-bold tracking-tight text-foreground">
              {loadingStats ? '…' : tile.value}
            </p>
            {#if tile.sub && !loadingStats}
              <p class="text-xs text-muted-foreground mt-1">{tile.sub}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
