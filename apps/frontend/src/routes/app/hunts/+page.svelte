<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast, Spinner, PageHeader, Button, StatCard, EmptyState, Section, icons } from '@facile/muse';
  import { setupHuntListeners, type HuntSession } from '$lib/websocket-events.svelte';
  import HuntBanner from '$lib/components/leads/HuntBanner.svelte';
  import HuntCard from '$lib/components/hunts/HuntCard.svelte';
  import HuntListItem from '$lib/components/hunts/HuntListItem.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';

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
      toast.danger('Échec du chargement des chasses');
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
      toast.success('Chasse supprimée');
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
        toast.danger('Impossible de relancer cette chasse');
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
      } else {
        toast.danger('Type de chasse non reconnu');
        return;
      }

      toast.success('Nouvelle chasse lancée avec les mêmes paramètres !');
      await loadData();
      await loadStats();
    } catch (error: any) {
      toast.danger(error?.message || 'Échec de la relance');
    } finally {
      relaunchingHuntId = null;
    }
  }



</script>

{#if loading}
  <div class="flex items-center justify-center py-24" in:fade>
    <Spinner size="lg" label="Chargement" />
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <PageHeader title="Chasses" description="Gestion des chasses aux leads">
      {#snippet actions()}
        <Button href="/app/hunts/new" icon={icons.plus}>Nouvelle chasse</Button>
      {/snippet}
    </PageHeader>

    <section class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {#each [{ label: 'En attente', val: stats?.pendingHunts?.toString() || '0' }, { label: 'En cours', val: stats?.processingHunts?.toString() || '0' }, { label: 'Terminées', val: stats?.completedHunts?.toString() || '0' }, { label: 'Échouées', val: stats?.failedHunts?.toString() || '0' }] as stat}
        <StatCard label={stat.label} value={stat.val} />
      {/each}
    </section>

    {#if huntSessions.length === 0}
      <EmptyState
        icon="solar:bolt-linear"
        title="Aucune chasse pour l'instant"
        description="Lancez votre première chasse pour découvrir et collecter des leads selon des filtres comme la localisation, les postes et les départements"
      >
        <Button href="/app/hunts/new" icon={icons.plus}>Lancer votre première chasse</Button>
      </EmptyState>
    {:else if huntSessions.filter((s) => s.status === 'FAILED').length === 0 && huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length === 0 && huntSessions.filter((s) => s.status === 'COMPLETED').length === 0}
      <EmptyState
        icon="solar:ghost-linear"
        title="Tout est vide"
        description="Aucune chasse active, échouée ou terminée à afficher"
      >
        <Button href="/app/hunts/new" icon={icons.plus}>Nouvelle chasse</Button>
      </EmptyState>
    {:else}
      {#if huntSessions.filter((s) => s.status === 'FAILED').length > 0}
        <Section title="Chasses échouées">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
        </Section>
      {/if}

      {#if huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length > 0}
        <Section title="Chasses actives">
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
        </Section>
      {/if}

      {#if huntSessions.filter((s) => s.status === 'COMPLETED').length > 0}
        <Section title="Chasses terminées">
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
        </Section>
      {/if}
    {/if}
  </div>
{/if}
