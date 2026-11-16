<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Badge, Button, Card, Modal, PlanLimit, Spinner, planLimitFrom, toast, type PlanLimitError } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import type { RouterOutputs } from '@repo/trpc-client';
  import { useFormat, useLocale, useT } from '$lib/i18n';
  import { rows, type Key } from '$lib/i18n/rows';
  import PriceTimeline from './PriceTimeline.svelte';
  import { aiLanguage } from './ai';
  import { shortUrl } from './watch';

  type Price = Awaited<ReturnType<typeof trpc.competitorAi.prices.query>>[number];
  type Snapshot = Awaited<ReturnType<typeof trpc.competitorAi.snapshot.query>>;

  interface Props {
    competitorId: string;
    teamId?: string;
    compact?: boolean;
  }

  let { competitorId, teamId, compact = false }: Props = $props();

  const t = useT();
  const format = useFormat();
  const locale = useLocale();

  let prices = $state<Price[]>([]);
  let loading = $state(true);
  let extracting = $state(false);
  let refused = $state<PlanLimitError | null>(null);
  let failure = $state<string | null>(null);
  let snapshot = $state<Snapshot | null>(null);
  let timeline = $state<RouterOutputs['competitorAi']['priceTimeline']>([]);
  let autoStatus = $state<string | null>(null);

  function statusKey(status: string): Key {
    const key = `priceStatus.${status}`;
    return (key in rows ? key : 'priceStatus.unknown') as Key;
  }

  async function loadHistory() {
    try {
      const [history, changes] = await Promise.all([
        trpc.competitorAi.priceTimeline.query({ competitorId, teamId, limit: 20 }),
        trpc.competitorWatch.changes.query({ competitorId, teamId, limit: 20 }),
      ]);
      timeline = history;
      autoStatus = changes.find((change) => change.page.kind === 'PRICING' && change.priceStatus)?.priceStatus ?? null;
    } catch {
      timeline = [];
    }
  }

  async function load() {
    try {
      prices = await trpc.competitorAi.prices.query({ competitorId, teamId });
      if (!compact) await loadHistory();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function extract() {
    extracting = true;
    refused = null;
    failure = null;
    try {
      prices = await trpc.competitorAi.extractPrices.mutate({ competitorId, teamId, language: aiLanguage(locale()) }, { context: QUIET });
      await loadHistory();
      toast.success(t('competitorAi.extracted'));
    } catch (error) {
      const data = (error as { data?: { code?: string; plan_limit?: unknown } } | null)?.data;
      const limit = planLimitFrom(data?.plan_limit);
      if (limit) refused = limit;
      else if (data?.code === 'UNPROCESSABLE_CONTENT') failure = t('competitorAi.badOutput');
      else if (data?.code === 'TOO_MANY_REQUESTS') failure = t('competitorAi.quota');
      else if (data?.code === 'BAD_REQUEST') failure = t('competitorAi.needWebsite');
      else failure = getTrpcErrorMessage(error) || t('competitorAi.failed');
    } finally {
      extracting = false;
    }
  }

  async function openSnapshot(snapshotId: string) {
    try {
      snapshot = await trpc.competitorAi.snapshot.query({ competitorId, teamId, snapshotId });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  function amount(price: Price): string {
    if (price.price === null) return t('competitorAi.onQuote');
    return price.currency
      ? format.number(price.price, { style: 'currency', currency: price.currency, maximumFractionDigits: 2 })
      : format.number(price.price, { maximumFractionDigits: 2 });
  }

  onMount(load);
</script>

<Card class="flex flex-col gap-3 {compact ? 'p-4' : ''}">
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div class="flex min-w-0 flex-col gap-1">
      <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
        <iconify-icon icon="solar:tag-price-linear" width="18" height="18" class="block shrink-0"></iconify-icon>
        {t('competitorAi.prices')}
      </h3>
      {#if !compact}<p class="max-w-prose text-fc-sm text-fc-fg-muted">{t('competitorAi.pricesText')}</p>{/if}
    </div>
    {#if !compact}
      <Button variant="secondary" size="sm" icon={extracting ? undefined : 'solar:magic-stick-3-linear'} onclick={extract} disabled={extracting}>
        {#if extracting}
          <Spinner size="sm" label={t('competitorAi.extracting')} />
          {t('competitorAi.extracting')}
        {:else}
          {t('competitorAi.extract')}
        {/if}
      </Button>
    {/if}
  </div>
  <PlanLimit error={refused} />
  {#if !compact && autoStatus}
    <p class="text-fc-sm wrap-anywhere {autoStatus === 'extracted' ? 'text-fc-fg-muted' : 'text-fc-fg'}" role="status">
      <span class="font-medium">{t('priceStatus.title')}:</span>
      {t(statusKey(autoStatus))}
    </p>
  {/if}
  {#if failure}<Alert tone="danger">{failure}</Alert>{/if}

  {#if loading}
    <div class="flex justify-center py-4"><Spinner /></div>
  {:else if prices.length === 0}
    <p class="text-fc-sm text-fc-fg-muted">{t('competitorAi.noPrices')}</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each prices as price (price.id)}
        <li class="flex flex-col gap-1 rounded-fc-md bg-fc-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-col">
            <span class="min-w-0 truncate text-fc-sm font-medium text-fc-fg">{price.name}</span>
            {#if price.unit}<span class="text-fc-xs text-fc-fg-muted">{price.unit}</span>{/if}
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <span class="text-fc-sm font-semibold whitespace-nowrap text-fc-fg">{amount(price)}</span>
            {#if price.period}<Badge class="shrink-0">{t(`competitorAi.period.${price.period}`)}</Badge>{/if}
          </div>
        </li>
      {/each}
    </ul>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-fc-xs text-fc-fg-muted">
      <span>{t('competitorAi.extractedOn', { date: format.date(prices[0]!.extractedAt) })}</span>
      {#each Array.from(new Map(prices.map((p) => [p.sourceUrl, p])).values()) as source (source.sourceUrl)}
        <Button variant="ghost" size="sm" iconRight="solar:arrow-right-up-linear" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
          {t('competitorAi.source')} : {shortUrl(source.sourceUrl)}
        </Button>
        {#if source.snapshotId}
          <Button variant="ghost" size="sm" icon="solar:document-text-linear" onclick={() => openSnapshot(source.snapshotId!)}>{t('competitorAi.snapshot')}</Button>
        {/if}
      {/each}
    </div>
  {/if}
  {#if !compact}
    <div class="flex flex-col gap-2">
      <h4 class="text-fc-sm font-semibold text-fc-fg">{t('timeline.title')}</h4>
      {#if timeline.length === 0}
        <p class="text-fc-sm text-fc-fg-muted">{t('timeline.empty')}</p>
      {:else}
        <PriceTimeline extractions={timeline} />
      {/if}
    </div>
  {/if}
</Card>

<Modal open={snapshot !== null} title={snapshot ? t('competitorAi.snapshotTitle', { url: shortUrl(snapshot.url) }) : ''} onClose={() => (snapshot = null)} class="max-w-3xl">
  {#if snapshot}
    <p class="text-fc-xs text-fc-fg-muted">{t('competitorAi.snapshotTaken', { date: format.dateTime(snapshot.fetchedAt) })}</p>
    <pre class="mt-2 max-h-[60vh] overflow-auto rounded-fc-md bg-fc-component p-3 text-fc-xs break-words whitespace-pre-wrap text-fc-fg">{snapshot.text}</pre>
  {/if}
</Modal>
