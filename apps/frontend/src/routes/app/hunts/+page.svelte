<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { setupHuntListeners, type HuntSession } from '$lib/websocket-events.svelte';
  import HuntBanner from '$lib/components/leads/HuntBanner.svelte';
  import HuntCard from '$lib/components/hunts/HuntCard.svelte';
  import HuntListItem from '$lib/components/hunts/HuntListItem.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());

  interface Stats {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    pendingHunts: number;
    processingHunts: number;
    completedHunts: number;
    failedHunts: number;
    successRate: number;
    averageScore: number;
  }


  let stats = $state<Stats | null>(null);
  let huntSessions = $state<HuntSession[]>([]);
  let loading = $state(true);
  let cancellingHuntId = $state<string | null>(null);
  let deletingHuntId = $state<string | null>(null);
  let relaunchingHuntId = $state<string | null>(null);
  let lastFailedHunts = new Set<string>();
  let lastCompletedHunts = new Set<string>();
  let wsUnsubscribers: (() => void)[] = [];


  const updateHuntSession = (id: string, updates: Partial<HuntSession>) => {
    const index = huntSessions.findIndex(s => s.id === id);
    if (index !== -1) {
      huntSessions[index] = { ...huntSessions[index], ...updates };
      return true;
    }
    return false;
  };

  const addHuntSession = (session: HuntSession) => {
    huntSessions = [session, ...huntSessions];
  };


  onMount(async () => {

    wsUnsubscribers = setupHuntListeners(
      updateHuntSession,
      addHuntSession,
      loadData,
      loadStats
    );

    await loadData();
    await loadStats();
  });

  onDestroy(() => {
    wsUnsubscribers.forEach(unsub => unsub());
  });

  async function loadData() {
    try {
      const sessionsData = await trpc.lead.hunt.list.query({ teamId });
      huntSessions = Array.isArray(sessionsData) ? sessionsData : [];

      huntSessions.forEach((s) => {
        if (s.status === 'FAILED' && !lastFailedHunts.has(s.id)) lastFailedHunts.add(s.id);
        if (s.status === 'COMPLETED' && !lastCompletedHunts.has(s.id)) lastCompletedHunts.add(s.id);
      });
    } catch (error: any) {
      if (error?.data?.code === 'UNAUTHORIZED') return goto('/login');
      toast.push('Échec du chargement des chasses', 'error');
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      const statsData = await trpc.lead.query.getStats.query({ teamId });
      stats = statsData || null;
    } catch (error: any) {
      console.error('Error loading stats:', error);
    }
  }

  async function cancelHunt(huntSessionId: string) {
    cancellingHuntId = huntSessionId;
    try {
      await trpc.lead.hunt.cancel.mutate({ huntSessionId });


    } finally {
      cancellingHuntId = null;
    }
  }

  async function deleteHunt(huntSessionId: string) {
    deletingHuntId = huntSessionId;
    try {
      await trpc.lead.hunt.delete.mutate({ huntSessionId });
      toast.push('Chasse supprimée', 'success');
      lastFailedHunts.delete(huntSessionId);
      await loadData();
    } finally {
      deletingHuntId = null;
    }
  }

  async function relaunchHunt(huntSessionId: string) {
    relaunchingHuntId = huntSessionId;
    try {
      const session = huntSessions.find(s => s.id === huntSessionId);
      if (!session || !session.filters) {
        toast.push('Impossible de relancer cette chasse', 'error');
        return;
      }

      const filters = session.filters;

      if (session.huntType === 'LOCAL_BUSINESS' || (filters.location && filters.categories)) {
        await trpc.lead.hunt.startLocalBusiness.mutate({
          location: filters.location,
          categories: filters.categories || [filters.category],
          radius: filters.radius || 5000,
          maxResults: filters.maxResults || 20,
          hasWebsite: filters.hasWebsite,
        });
      } else if (filters.domain) {
        await trpc.lead.hunt.start.mutate({
          domain: filters.domain,
          positions: filters.positions || [],
          departments: filters.departments || [],
        });
      } else {
        toast.push('Type de chasse non reconnu', 'error');
        return;
      }

      toast.push('Nouvelle chasse lancée avec les mêmes paramètres !', 'success');
      await loadData();
      await loadStats();
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la relance', 'error');
    } finally {
      relaunchingHuntId = null;
    }
  }



</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" />
  </div>
{:else}
  <div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground">Chasses</h1>
        <p class="text-sm text-muted-foreground mt-1">Gestion des chasses aux leads</p>
      </div>

      <a
        href="/app/hunts/new"
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
      >
        <iconify-icon icon="solar:add-circle-linear" width="16"></iconify-icon>
        <span>Nouvelle chasse</span>
      </a>
    </div>

    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each [{ label: 'En attente', val: stats?.pendingHunts?.toString() || '0', icon: 'solar:history-linear' }, { label: 'En cours', val: stats?.processingHunts?.toString() || '0', icon: 'solar:rocket-2-linear' }, { label: 'Terminées', val: stats?.completedHunts?.toString() || '0', icon: 'solar:check-circle-linear' }, { label: 'Échouées', val: stats?.failedHunts?.toString() || '0', icon: 'solar:close-circle-linear' }] as stat}
        <div class="rounded-xl border border-border bg-card p-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm text-muted-foreground">{stat.label}</h3>
            <iconify-icon icon={stat.icon} class="text-muted-foreground" width="18"></iconify-icon>
          </div>
          <p class="text-2xl font-bold tracking-tight text-foreground">{stat.val}</p>
        </div>
      {/each}
    </section>

    {#if huntSessions.length === 0}
      <section class="rounded-xl border border-border bg-card">
        <div class="flex flex-col items-center justify-center py-20 px-6 space-y-4">
          <div class="size-12 rounded-lg border border-border flex items-center justify-center">
            <iconify-icon icon="solar:lightning-linear" width="24" class="text-foreground"></iconify-icon>
          </div>
          <div class="text-center space-y-2 max-w-md">
            <h3 class="text-lg font-semibold text-foreground">Aucune chasse pour l'instant</h3>
            <p class="text-sm text-muted-foreground">
              Lancez votre première chasse pour découvrir et collecter des leads selon des filtres comme la localisation, les postes et les départements
            </p>
          </div>
          <a
            href="/app/hunts/new"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            <iconify-icon icon="solar:add-circle-linear" width="16"></iconify-icon>
            <span>Lancer votre première chasse</span>
          </a>
        </div>
      </section>
    {:else if huntSessions.filter((s) => s.status === 'FAILED').length === 0 && huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length === 0 && huntSessions.filter((s) => s.status === 'COMPLETED').length === 0}
      <section class="rounded-xl border border-border bg-card">
        <div class="flex flex-col items-center justify-center py-20 px-6 space-y-4">
          <div class="size-12 rounded-lg border border-border flex items-center justify-center">
            <iconify-icon icon="solar:ghost-linear" width="24" class="text-muted-foreground"></iconify-icon>
          </div>
          <div class="text-center space-y-2 max-w-md">
            <h3 class="text-lg font-semibold text-foreground">Tout est vide</h3>
            <p class="text-sm text-muted-foreground">
              Aucune chasse active, échouée ou terminée à afficher
            </p>
          </div>
          <a
            href="/app/hunts/new"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            <iconify-icon icon="solar:add-circle-linear" width="16"></iconify-icon>
            <span>Nouvelle chasse</span>
          </a>
        </div>
      </section>
    {:else}
      {#if huntSessions.filter((s) => s.status === 'FAILED').length > 0}
        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-foreground">Chasses échouées</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each huntSessions.filter((s) => s.status === 'FAILED') as session (session.id)}
              <div in:fade>
                <HuntCard
                  {session}
                  onDelete={deleteHunt}
                  onRelaunch={relaunchHunt}
                  deleting={deletingHuntId === session.id}
                  relaunching={relaunchingHuntId === session.id}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length > 0}
        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-foreground">Chasses actives</h2>
          <div class="flex flex-col gap-3">
            {#each huntSessions.filter((s) => s.status === 'PROCESSING') as session (session.id)}
              <div in:fade>
                <HuntBanner
                  {session}
                  onCancel={cancelHunt}
                  cancelling={cancellingHuntId === session.id}
                  clickable={true}
                />
              </div>
            {/each}
            {#each huntSessions.filter((s) => s.status === 'PENDING') as session (session.id)}
              <div in:fade>
                <HuntCard
                  {session}
                  onCancel={cancelHunt}
                  cancelling={cancellingHuntId === session.id}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if huntSessions.filter((s) => s.status === 'COMPLETED').length > 0}
        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-foreground">Chasses terminées</h2>
          <div class="space-y-3">
            {#each huntSessions.filter((s) => s.status === 'COMPLETED') as session (session.id)}
              <div in:fade>
                <HuntListItem
                  {session}
                  onDelete={deleteHunt}
                  onRelaunch={relaunchHunt}
                  deleting={deletingHuntId === session.id}
                  relaunching={relaunchingHuntId === session.id}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
{/if}
