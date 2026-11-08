<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { PageProps } from './$types';
  import {
    Alert,
    Badge,
    Button,
    Card,
    ConfirmModal,
    EmptyState,
    PageHeader,
    Spinner,
    StatCard,
    toast,
  } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useFormat, useT } from '$lib/i18n';
  import Battlecard from '$lib/components/competitors/Battlecard.svelte';
  import BattlecardForm from '$lib/components/competitors/BattlecardForm.svelte';
  import WatchPanel from '$lib/components/competitors/WatchPanel.svelte';
  import ChangeTimeline from '$lib/components/competitors/ChangeTimeline.svelte';
  import BattlecardDraft from '$lib/components/competitors/BattlecardDraft.svelte';
  import PricesPanel from '$lib/components/competitors/PricesPanel.svelte';
  import { SMALL_SAMPLE, leadName, ratePercent, type CompetitorCard } from '$lib/components/competitors/labels';

  const t = useT();
  const format = useFormat();
  const teamId = $derived(teamContextStore.getTeamId());

  let { params }: PageProps = $props();
  const competitorId = $derived(params.id);

  let card = $state<CompetitorCard | null>(null);
  let loading = $state(true);
  let editing = $state(false);
  let confirmDelete = $state(false);
  let timelineKey = $state(0);
  async function load() {
    loading = true;
    try {
      card = await trpc.competitor.get.query({ competitorId });
    } catch (error) {
      card = null;
      toast.danger(getTrpcErrorMessage(error) || t('competitors.loadFailed'));
    } finally {
      loading = false;
    }
  }

  async function refresh() {
    try {
      card = await trpc.competitor.get.query({ competitorId });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  async function saved() {
    editing = false;
    await load();
  }

  async function remove() {
    try {
      await trpc.competitor.delete.mutate({ competitorId, teamId });
      toast.success(t('competitors.deleted'));
      await goto(resolve('/app/competitors'));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  const percent = $derived(card ? ratePercent(card.winRate) : null);
  onMount(load);
</script>

{#snippet leadList(title: string, leads: CompetitorCard['wonLeads'], lost: boolean)}
  <Card class="flex flex-col gap-3">
    <h3 class="text-fc-md font-semibold text-fc-fg">{title}</h3>
    {#if leads.length === 0}
      <p class="text-fc-sm text-fc-fg-muted">{t('competitors.noLeads')}</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each leads as lead (lead.id)}
          <li>
            <a
              href={resolve('/app/leads/[id]', { id: lead.id })}
              class="flex min-h-11 items-center justify-between gap-3 rounded-fc-md px-3 py-2 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
            >
              <span class="min-w-0 truncate text-fc-sm text-fc-fg">{leadName(lead)}</span>
              <span class="flex shrink-0 items-center gap-2">
                {#if lost && lead.competitorLossReason}<Badge class="shrink-0">{t(`competitorLoss.${lead.competitorLossReason}`)}</Badge>{/if}
                {#if lead.closedAt}<span class="text-fc-xs whitespace-nowrap text-fc-fg-muted">{format.date(lead.closedAt)}</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/snippet}

{#if loading}
  <div class="flex items-center justify-center py-24" in:fade><Spinner size="lg" /></div>
{:else if !card}
  <EmptyState icon="solar:close-circle-linear" title={t('competitors.notFound')}>
    <Button href={resolve('/app/competitors')}>{t('competitors.back')}</Button>
  </EmptyState>
{:else}
  <div class="flex flex-col gap-8" in:fade>
    <PageHeader
      title={card.name}
      description={[card.domain, card.area].filter(Boolean).join(' · ') || undefined}
      back={{ href: resolve('/app/competitors'), label: t('competitors.title') }}
    >
      {#snippet actions()}
        {#if card!.status === 'ARCHIVED'}<Badge class="shrink-0">{t('competitors.status.ARCHIVED')}</Badge>{/if}
        {#if !editing}
          <Button variant="secondary" icon="solar:pen-linear" onclick={() => (editing = true)}>{t('competitors.edit')}</Button>
          <Button variant="ghost" icon="solar:trash-bin-minimalistic-linear" onclick={() => (confirmDelete = true)}>{t('competitors.delete')}</Button>
        {/if}
      {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard label={t('competitors.winRate')} value={percent ?? '—'} delta={t('competitors.record', { won: card.winRate.won, lost: card.winRate.lost })} />
      <StatCard label={t('competitors.won')} value={card.winRate.won} />
      <StatCard label={t('competitors.lost')} value={card.winRate.lost} />
    </div>
    {#if card.winRate.total > 0 && card.winRate.total < SMALL_SAMPLE}
      <Alert tone="info">{t('competitors.smallSample')}</Alert>
    {/if}

    {#if card.tags.length > 0 || card.nafCodes.length > 0 || card.website}
      <div class="flex flex-wrap items-center gap-1.5">
        {#each card.tags as name (name)}<Badge tone="info" class="shrink-0">{name}</Badge>{/each}
        {#each card.nafCodes as code (code)}<Badge class="shrink-0">NAF {code}</Badge>{/each}
        {#if card.website}
          <Button variant="ghost" size="sm" iconRight="solar:arrow-right-up-linear" href={card.website.startsWith('http') ? card.website : `https://${card.website}`} target="_blank" rel="noopener noreferrer">
            {card.domain ?? card.website}
          </Button>
        {/if}
      </div>
    {/if}

    {#if editing}
      <BattlecardForm {card} onCancel={() => (editing = false)} onSaved={saved} />
    {:else}
      <BattlecardDraft
        {competitorId}
        {teamId}
        current={{
          overview: card.overview,
          whyWeWin: card.whyWeWin,
          whyWeLose: card.whyWeLose,
          objections: card.objections,
          landmines: card.landmines,
          pricing: card.pricing,
          proofPoints: card.proofPoints,
        }}
        onSaved={refresh}
      />
      <Battlecard
        overview={card.overview}
        whyWeWin={card.whyWeWin}
        whyWeLose={card.whyWeLose}
        objections={card.objections}
        landmines={card.landmines}
        pricing={card.pricing}
        proofPoints={card.proofPoints}
      />
      {#if card.notes}
        <Card class="flex flex-col gap-2">
          <h3 class="text-fc-md font-semibold text-fc-fg">{t('competitors.notes')}</h3>
          <p class="text-fc-sm whitespace-pre-line text-fc-fg">{card.notes}</p>
        </Card>
      {/if}
    {/if}

    <PricesPanel {competitorId} {teamId} />

    <div class="flex flex-col gap-4">
      <WatchPanel {competitorId} {teamId} domain={card.domain} onChanged={() => timelineKey++} />
      {#key timelineKey}<ChangeTimeline {competitorId} {teamId} />{/key}
    </div>

    {#if card.lossReasons.length > 0}
      <Card class="flex flex-col gap-3">
        <h3 class="text-fc-md font-semibold text-fc-fg">{t('competitors.lossReasons')}</h3>
        <div class="flex flex-wrap gap-1.5">
          {#each card.lossReasons as entry (entry.reason)}
            <Badge tone="warning" class="shrink-0">{t(`competitorLoss.${entry.reason}`)} · {entry.count}</Badge>
          {/each}
        </div>
      </Card>
    {/if}

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {@render leadList(t('competitors.wonLeads'), card.wonLeads, false)}
      {@render leadList(t('competitors.lostLeads'), card.lostLeads, true)}
    </div>
  </div>

  <ConfirmModal
    bind:open={confirmDelete}
    title={t('competitors.deleteTitle', { name: card.name })}
    description={t('competitors.deleteBody')}
    confirmLabel={t('competitors.delete')}
    cancelLabel={t('common.cancel')}
    tone="danger"
    onConfirm={remove}
  />
{/if}
