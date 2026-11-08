<script lang="ts">
  import { getErrorCode, getErrorMessage } from '$lib/utils/trpc-error';
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { toast, Spinner, PageHeader, Button, StatCard, EmptyState, Section, icons } from '@facile/muse';
  import { setupHuntListeners, type HuntSession } from '$lib/websocket-events';
  import HuntBanner from '$lib/components/leads/HuntBanner.svelte';
  import HuntCard from '$lib/components/hunts/HuntCard.svelte';
  import HuntListItem from '$lib/components/hunts/HuntListItem.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useT } from '$lib/i18n';

  const t = useT();

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
    } catch (error) {
      if (getErrorCode(error) === 'UNAUTHORIZED') return goto(resolve('/login'));
      toast.danger(t('hunts.loadFailed'));
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      const statsData = await trpc.lead.query.getStats.query({ teamId });
      stats = statsData || null;
    } catch (error) {
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
      toast.success(t('hunts.deleted'));
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
        toast.danger(t('hunts.relaunchImpossible'));
        return;
      }

      const filters = session.filters;

      const { location, categories } = filters;
      if (!location || !categories) {
        toast.danger(t('hunts.unknownType'));
        return;
      }

      await trpc.lead.hunt.startLocalBusiness.mutate({
        location,
        categories,
        radius: filters.radius || 5000,
        maxResults: filters.maxResults || 20,
        hasWebsite: filters.hasWebsite,
      });

      toast.success(t('hunts.relaunched'));
      await loadData();
      await loadStats();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('hunts.relaunchFailed')));
    } finally {
      relaunchingHuntId = null;
    }
  }



</script>

{#if loading}
  <div class="flex items-center justify-center py-24" in:fade>
    <Spinner size="lg" label={t('common.loading')} />
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <PageHeader title={t('hunts.title')} description={t('hunts.subtitle')}>
      {#snippet actions()}
        <Button href="/app/hunts/schedules" variant="secondary" icon="solar:refresh-circle-linear">{t('schedules.open')}</Button>
        <Button href="/app/hunts/new" icon={icons.plus}>{t('hunts.new')}</Button>
      {/snippet}
    </PageHeader>

    <section class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {#each [{ label: t('hunts.status.pending'), val: stats?.pendingHunts?.toString() || '0' }, { label: t('hunts.status.processing'), val: stats?.processingHunts?.toString() || '0' }, { label: t('hunts.status.completedPlural'), val: stats?.completedHunts?.toString() || '0' }, { label: t('hunts.status.failedPlural'), val: stats?.failedHunts?.toString() || '0' }] as stat (stat.label)}
        <StatCard label={stat.label} value={stat.val} />
      {/each}
    </section>

    {#if huntSessions.length === 0}
      <EmptyState
        icon="solar:bolt-linear"
        title={t('hunts.empty.title')}
        description={t('hunts.empty.text')}
      >
        <Button href="/app/hunts/new" icon={icons.plus}>{t('hunts.empty.cta')}</Button>
      </EmptyState>
    {:else if huntSessions.filter((s) => s.status === 'FAILED').length === 0 && huntSessions.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').length === 0 && huntSessions.filter((s) => s.status === 'COMPLETED').length === 0}
      <EmptyState
        icon="solar:ghost-linear"
        title={t('hunts.allEmpty.title')}
        description={t('hunts.allEmpty.text')}
      >
        <Button href="/app/hunts/new" icon={icons.plus}>{t('hunts.new')}</Button>
      </EmptyState>
    {:else}
      {#if huntSessions.filter((s) => s.status === 'FAILED').length > 0}
        <Section title={t('hunts.section.failed')}>
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
        <Section title={t('hunts.section.active')}>
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
        <Section title={t('hunts.section.completed')}>
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
