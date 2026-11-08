<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Alert, Badge, Button, Card, EmptyState, Field, Icon, Select, Spinner, toast } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { formatDate, useLocale, useT } from '$lib/i18n';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { MIN_SCORES, hostOf, scoreTone, sourceLabel, type Suggestion, type SuggestionList } from './discovery';

  let { teamId, onChange }: { teamId?: string; onChange?: () => void } = $props();

  const t = useT();
  const locale = useLocale();

  let list = $state<SuggestionList | null>(null);
  let loading = $state(true);
  let starting = $state(false);
  let busyId = $state<string | null>(null);
  let bulk = $state(false);
  let minScore = $state<number>(70);
  let view = $state<'PENDING' | 'REJECTED'>('PENDING');

  const items = $derived(list?.items ?? []);
  const running = $derived(list?.run?.status === 'queued' || list?.run?.status === 'running');
  const eligible = $derived(items.filter((item) => item.score >= minScore).length);
  const lastResult = $derived(list?.run?.lastResult ?? null);

  async function load() {
    try {
      list = await trpc.competitorDiscovery.list.query({ teamId, status: view });
      if (view === 'PENDING' && list.items.some((item) => !item.seenAt)) {
        void trpc.competitorDiscovery.markSeen.mutate({ teamId }, { context: QUIET }).then(() => onChange?.()).catch(() => {});
      }
    } catch (error) {
      toast.danger(getErrorMessage(error, t('discovery.actionFailed')));
    } finally {
      loading = false;
    }
  }

  async function find() {
    starting = true;
    try {
      const res = await trpc.competitorDiscovery.run.mutate({ teamId });
      if (res.queued) toast.success(t('discovery.queued'));
      else toast.info(t('discovery.alreadyRunning'));
      await load();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('discovery.runFailed')));
    } finally {
      starting = false;
    }
  }

  async function accept(item: Suggestion) {
    busyId = item.id;
    try {
      const res = await trpc.competitorDiscovery.accept.mutate({ teamId, suggestionId: item.id });
      toast.success(t('discovery.accepted', { name: item.name }), {
        action: { label: t('discovery.openCompetitor'), onClick: () => void goto(resolve('/app/competitors/[id]', { id: res.competitorId })) },
      });
      await load();
      onChange?.();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('discovery.actionFailed')));
    } finally {
      busyId = null;
    }
  }

  async function decide(item: Suggestion, action: 'reject' | 'restore') {
    busyId = item.id;
    try {
      if (action === 'reject') {
        await trpc.competitorDiscovery.reject.mutate({ teamId, suggestionId: item.id });
        toast.info(t('discovery.rejected', { name: item.name }));
      } else {
        await trpc.competitorDiscovery.restore.mutate({ teamId, suggestionId: item.id });
        toast.success(t('discovery.restored', { name: item.name }));
      }
      await load();
      onChange?.();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('discovery.actionFailed')));
    } finally {
      busyId = null;
    }
  }

  async function acceptAll() {
    bulk = true;
    try {
      const { accepted } = await trpc.competitorDiscovery.acceptAbove.mutate({ teamId, minScore });
      toast.success(t('discovery.acceptedMany', { count: accepted }));
      await load();
      onChange?.();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('discovery.actionFailed')));
    } finally {
      bulk = false;
    }
  }

  function toggleView() {
    view = view === 'PENDING' ? 'REJECTED' : 'PENDING';
    loading = true;
    void load();
  }

  function why(item: Suggestion): string {
    const parts = item.scoreParts;
    const bits = [t('discovery.whySources', { count: parts.sources.length })];
    if (parts.nafMatch) bits.push(t('discovery.whyNaf'));
    else if (parts.keywordTotal > 0) bits.push(t('discovery.whyKeywords', { hits: parts.keywords.length, total: parts.keywordTotal }));
    if (parts.distanceKm !== null) bits.push(t('discovery.whyDistance', { km: parts.distanceKm }));
    else if (parts.inArea) bits.push(t('discovery.whyArea'));
    return bits.join(' · ');
  }

  onMount(() => {
    void load();
    const off = [
      ws.on('competitor-discovery:done', () => void load()),
      ws.on('competitor:new-registered', () => void load()),
    ];
    const timer = setInterval(() => {
      if (running) void load();
    }, 15_000);
    return () => {
      off.forEach((stop) => stop());
      clearInterval(timer);
    };
  });
</script>

<section class="flex flex-col gap-4" aria-labelledby="discovery-title">
  <Card class="flex flex-col gap-3">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h2 id="discovery-title" class="text-fc-base font-semibold text-fc-fg">{t('discovery.title')}</h2>
        <p class="text-fc-sm text-fc-fg-muted">{t('discovery.description')}</p>
      </div>
      {#if list?.profileReady}
        <Button icon="solar:magnifer-linear" class="shrink-0" onclick={find} disabled={starting || running}>
          {#if starting || running}<Spinner size="sm" />{t('discovery.searching')}{:else}{t('discovery.find')}{/if}
        </Button>
      {/if}
    </div>
    {#if list?.run?.lastRunAt && lastResult?.status !== 'failed' && list.run.status !== 'failed'}
      <p class="text-fc-xs text-fc-fg-muted">
        {t('discovery.lastRun', { date: formatDate(list.run.lastRunAt, locale(), { dateStyle: 'medium', timeStyle: 'short' }), count: lastResult?.created ?? 0 })}
        {#if list.run.nextRunAt}{t('discovery.nextRun', { date: formatDate(list.run.nextRunAt, locale()) })}{/if}
      </p>
    {/if}
    {#if list?.run?.status === 'failed'}
      <Alert tone="danger">{t('discovery.lastFailed')}</Alert>
    {/if}
    {#if lastResult?.quotaExhausted}
      <Alert tone="warning">{t('discovery.quota')}</Alert>
    {/if}
  </Card>

  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if list && !list.profileReady}
    <EmptyState icon="solar:target-linear" title={t('discovery.profileTitle')} description={t('discovery.profileText')}>
      <Button href="/app/settings/prospecting" icon="solar:settings-linear">{t('discovery.openProfile')}</Button>
    </EmptyState>
  {:else}
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      {#if view === 'PENDING' && items.length > 0}
        <div class="flex flex-wrap items-end gap-3">
          <Field label={t('discovery.minScore')} for="discovery-min-score">
            <Select id="discovery-min-score" value={String(minScore)} onchange={(e) => (minScore = Number(e.currentTarget.value))}>
              {#each MIN_SCORES as score (score)}<option value={String(score)}>{score}</option>{/each}
            </Select>
          </Field>
          <Button variant="secondary" icon="solar:check-read-linear" onclick={acceptAll} disabled={bulk || eligible === 0}>
            {#if bulk}<Spinner size="sm" />{/if}
            {t('discovery.acceptAbove', { count: eligible, score: minScore })}
          </Button>
        </div>
      {:else}
        <span></span>
      {/if}
      <Button variant="ghost" onclick={toggleView}>{view === 'PENDING' ? t('discovery.showRejected') : t('discovery.showPending')}</Button>
    </div>

    {#if items.length === 0}
      <EmptyState
        icon="solar:magnifer-linear"
        title={view === 'PENDING' ? t('discovery.none') : t('discovery.noneRejected')}
        description={view === 'PENDING' ? t('discovery.noneText') : undefined}
      />
    {:else}
      <ul class="flex flex-col gap-2">
        {#each items as item (item.id)}
          <li class="flex flex-col gap-3 rounded-fc-lg bg-fc-component p-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="truncate text-fc-sm font-semibold text-fc-fg">{item.name}</p>
                <p class="truncate text-fc-xs text-fc-fg-muted">
                  {#if item.website}
                    <a href={item.website} target="_blank" rel="noopener noreferrer external" class="hover:underline">{hostOf(item.website)}</a>
                  {/if}
                  {[item.area, item.siren ? t('discovery.siren', { siren: item.siren }) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                {#if !item.seenAt && view === 'PENDING'}<Badge tone="info" class="shrink-0">{t('discovery.new')}</Badge>{/if}
                <Badge tone={scoreTone(item.score)} class="shrink-0">{t('discovery.score', { score: item.score })}</Badge>
                {#each item.sources as source (source)}<Badge class="shrink-0">{t(sourceLabel(source))}</Badge>{/each}
              </div>
            </div>
            <p class="flex items-center gap-1.5 text-fc-xs text-fc-fg-muted">
              <Icon icon="solar:info-circle-linear" size={14} class="shrink-0" />
              <span class="sr-only">{t('discovery.why')}</span>{why(item)}
            </p>
            {#if item.evidence.length > 0}
              <ul class="flex flex-col gap-1.5 rounded-fc-md bg-fc-surface p-3" aria-label={t('discovery.evidence')}>
                {#each item.evidence as entry, index (index)}
                  <li class="text-fc-xs text-fc-fg">
                    <span class="font-medium">{t(sourceLabel(entry.source))}</span> · {entry.snippet}
                    {#if entry.url}
                      <a href={entry.url} target="_blank" rel="noopener noreferrer external" class="text-fc-fg-muted underline">{t('discovery.viewSource')}</a>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="flex flex-wrap justify-end gap-2">
              {#if view === 'PENDING'}
                <Button variant="ghost" icon="solar:close-circle-linear" aria-label={t('discovery.rejectName', { name: item.name })} onclick={() => decide(item, 'reject')} disabled={busyId === item.id}>
                  {t('discovery.reject')}
                </Button>
                <Button icon="solar:check-circle-linear" aria-label={t('discovery.acceptName', { name: item.name })} onclick={() => accept(item)} disabled={busyId === item.id}>
                  {t('discovery.accept')}
                </Button>
              {:else}
                <Button variant="secondary" icon="solar:restart-linear" onclick={() => decide(item, 'restore')} disabled={busyId === item.id}>{t('discovery.restore')}</Button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
