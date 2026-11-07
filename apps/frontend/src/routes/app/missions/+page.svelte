<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import {
    toast,
    Badge,
    Button,
    Card,
    Checkbox,
    EmptyState,
    Icon,
    IconButton,
    Input,
    PageHeader,
    Select,
    Spinner,
    StatCard,
    icons,
  } from '@facile/muse';
  import type { BadgeProps } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  type Tier = 'HOT' | 'WARM' | 'COLD';

  interface Opportunity {
    id: string;
    title: string;
    description: string;
    company?: string;
    sourcePlatform: string;
    sourceUrl: string;
    category: string;
    tags: string[];
    budget?: string;
    budgetMin?: number;
    budgetMax?: number;
    currency?: string;
    location?: string;
    isRemote: boolean;
    postedAt: string;
    relevanceScore: number;
    applicantCount: number | null;
    tier: Tier;
  }

  interface ScrapeProgress {
    percent: number;
    source: string;
    sourcesDone: number;
    sourcesTotal: number;
    totalInserted: number;
    totalFound: number;
  }

  let opportunities = $state<Opportunity[]>([]);
  let stats = $state<{ total: number; hot: number; warm: number; cold: number; newToday: number } | null>(null);
  let loading = $state(true);
  let scraping = $state(false);
  let scrapeProgress = $state<ScrapeProgress | null>(null);
  let scrapeTimeout: ReturnType<typeof setTimeout> | null = null;
  let unsubscribers: Array<() => void> = [];
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);

  type SortKey = 'relevance' | 'newest' | 'budget' | 'competition' | 'added';

  const SORT_OPTIONS = $derived<Record<SortKey, { label: string; sortBy: 'relevanceScore' | 'postedAt' | 'createdAt' | 'budgetMax' | 'applicantCount'; sortOrder: 'asc' | 'desc' }>>({
    relevance: { label: t('missions.sort.relevance'), sortBy: 'relevanceScore', sortOrder: 'desc' },
    newest: { label: t('missions.sort.newest'), sortBy: 'postedAt', sortOrder: 'desc' },
    budget: { label: t('missions.sort.budget'), sortBy: 'budgetMax', sortOrder: 'desc' },
    competition: { label: t('missions.sort.competition'), sortBy: 'applicantCount', sortOrder: 'asc' },
    added: { label: t('missions.sort.added'), sortBy: 'createdAt', sortOrder: 'desc' },
  });

  let sortKey = $state<SortKey>('relevance');

  let filters = $state({
    search: '',
    tier: '' as '' | Tier,
    source: '',
    remoteOnly: false,
  });

  let filterTimeout: ReturnType<typeof setTimeout>;

  const SOURCE_LABELS: Record<string, string> = {
    FREE_WORK: 'FreeWork',
    CODEUR: 'Codeur.com',
    REMOTIVE: 'Remotive',
    REMOTEOK: 'RemoteOK',
    WE_WORK_REMOTELY: 'We Work Remotely',
    HACKER_NEWS: 'HN Hiring',
    JOBICY: 'Jobicy',
    HIMALAYAS: 'Himalayas',
  };

  const TIER_TONES: Record<Tier, NonNullable<BadgeProps['tone']>> = {
    HOT: 'danger',
    WARM: 'warning',
    COLD: 'info',
  };

  const TIER_STATS: Array<{ tier: Tier; key: 'hot' | 'warm' | 'cold'; cls: string }> = [
    { tier: 'HOT', key: 'hot', cls: 'bg-fc-danger/10 text-fc-danger' },
    { tier: 'WARM', key: 'warm', cls: 'bg-fc-warning/10 text-fc-warning' },
    { tier: 'COLD', key: 'cold', cls: 'bg-fc-info/10 text-fc-info' },
  ];

  const TIER_ICONS: Record<Tier, string> = {
    HOT: 'solar:fire-linear',
    WARM: 'solar:sun-linear',
    COLD: 'solar:snowflake-linear',
  };

  async function loadData() {
    loading = true;
    try {
      const [result, statsData] = await Promise.all([
        trpc.opportunity.list.query({
          page: currentPage,
          limit: 24,
          search: filters.search || undefined,
          tier: filters.tier || undefined,
          source: filters.source || undefined,
          remoteOnly: filters.remoteOnly || undefined,
          sortBy: SORT_OPTIONS[sortKey].sortBy,
          sortOrder: SORT_OPTIONS[sortKey].sortOrder,
        }),
        trpc.opportunity.stats.query(),
      ]);
      opportunities = result.opportunities as Opportunity[];
      totalPages = result.totalPages;
      total = result.total;
      stats = statsData;
    } catch {
      toast.danger(t('missions.loadFailed'));
    } finally {
      loading = false;
    }
  }

  async function triggerScrape() {
    scraping = true;
    try {
      const result = await trpc.opportunity.triggerScrape.mutate();
      if (result.queued || ('alreadyRunning' in result && result.alreadyRunning)) {
        scrapeProgress = { percent: 0, source: '…', sourcesDone: 0, sourcesTotal: 8, totalInserted: 0, totalFound: 0 };
        armScrapeTimeout();
        if (result.queued) {
          toast.success(t('missions.refreshStarted'));
        }
      } else {
        toast.info(t('missions.refreshedRecently'));
        scraping = false;
      }
    } catch {
      toast.danger(t('missions.refreshFailedStart'));
      scraping = false;
    }
  }

  function armScrapeTimeout() {
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
    scrapeTimeout = setTimeout(() => {
      scrapeProgress = null;
      scraping = false;
    }, 5 * 60 * 1000);
  }

  function endScrape() {
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
    scrapeTimeout = null;
    scrapeProgress = null;
    scraping = false;
  }

  function formatBudget(opp: Opportunity): string {
    if (opp.budget) return opp.budget;
    const currency = opp.currency ?? '€';
    if (opp.budgetMin && opp.budgetMax) {
      return `${format.number(opp.budgetMin)} – ${format.number(opp.budgetMax)} ${currency}`;
    }
    if (opp.budgetMin) return `${format.number(opp.budgetMin)}+ ${currency}`;
    return '';
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 7) return format.days(days);
    return format.date(d, { day: 'numeric', month: 'short' });
  }

  function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  $effect(() => {
    filters.tier; filters.source; filters.remoteOnly; sortKey;
    currentPage = 1;
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(loadData, 100);
  });

  $effect(() => {
    filters.search;
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      currentPage = 1;
      loadData();
    }, 300);
  });

  onMount(() => {
    loadData();

    unsubscribers.push(
      ws.on('opportunity:scrape:progress', (data: ScrapeProgress) => {
        scrapeProgress = data;
        scraping = true;
        armScrapeTimeout();
      })
    );

    unsubscribers.push(
      ws.on('opportunity:scrape:completed', (data: { totalInserted: number; totalFound: number }) => {
        endScrape();
        toast.success(
          data.totalInserted > 0
            ? t('missions.refreshDone', { count: data.totalInserted })
            : t('missions.refreshNone'));
        loadData();
      })
    );

    unsubscribers.push(
      ws.on('opportunity:scrape:failed', () => {
        endScrape();
        toast.danger(t('missions.refreshFailed'));
      })
    );
  });

  onDestroy(() => {
    unsubscribers.forEach((unsub) => unsub());
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
  });
</script>

<div class="flex flex-col gap-6">
  <PageHeader
    title={t('missions.title')}
    description={t('missions.subtitle', { count: Object.keys(SOURCE_LABELS).length })}
  >
    {#snippet actions()}
      <Button variant="secondary" icon={scraping ? undefined : icons.refresh} onclick={triggerScrape} disabled={scraping}>
        {#if scraping}
          <Spinner size="sm" label={t('missions.refreshing')} />
        {/if}
        {t('missions.refresh')}
      </Button>
    {/snippet}
  </PageHeader>

  {#if scrapeProgress}
    <Card class="flex flex-col gap-2 p-4">
      <div class="flex items-center justify-between gap-3 text-fc-sm">
        <div class="flex min-w-0 items-center gap-2">
          <Spinner size="sm" label={t('missions.refreshing')} />
          <span class="font-medium text-fc-fg">{t('missions.refreshingMissions')}</span>
          <span class="truncate text-fc-fg-muted">
            {t('missions.progress', { source: scrapeProgress.source, done: scrapeProgress.sourcesDone, total: scrapeProgress.sourcesTotal })}
          </span>
        </div>
        <span class="shrink-0 font-fc-mono text-fc-xs text-fc-fg-muted">
          {scrapeProgress.percent}%
        </span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-fc-pill bg-fc-surface">
        <div
          class="h-full bg-fc-fg transition-all duration-500 ease-out"
          style="width: {scrapeProgress.percent}%"
        ></div>
      </div>
      {#if scrapeProgress.totalInserted > 0}
        <p class="text-fc-xs text-fc-fg-muted">
          {t('missions.newSoFar', { count: scrapeProgress.totalInserted })}
        </p>
      {/if}
    </Card>
  {/if}

  {#if stats}
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <StatCard label={t('missions.total30')} value={stats.total} />
      {#each TIER_STATS as item (item.tier)}
        <Card class="flex flex-col gap-1 {item.cls}">
          <span class="flex items-center gap-1.5 text-fc-xs uppercase tracking-wide">
            <Icon icon={TIER_ICONS[item.tier]} size={14} />
            {item.tier}
          </span>
          <span class="text-fc-2xl font-semibold">{stats[item.key]}</span>
        </Card>
      {/each}
      <Card class="flex flex-col gap-1">
        <span class="text-fc-xs uppercase tracking-wide text-fc-fg-muted">{t('missions.new24')}</span>
        <span class="text-fc-2xl font-semibold text-fc-success">+{stats.newToday}</span>
      </Card>
    </div>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <Input
      type="text"
      placeholder={t('missions.searchPlaceholder')}
      aria-label={t('missions.search')}
      bind:value={filters.search}
      class="w-full sm:w-48"
    />

    <Select
      bind:value={() => filters.tier, (v) => (filters.tier = v as '' | Tier)}
      aria-label={t('missions.filterTier')}
      class="w-auto"
    >
      <option value="">{t('missions.allTiers')}</option>
      <option value="HOT">HOT</option>
      <option value="WARM">WARM</option>
      <option value="COLD">COLD</option>
    </Select>

    <Select bind:value={filters.source} aria-label={t('missions.filterSource')} class="w-auto">
      <option value="">{t('missions.allSources')}</option>
      {#each Object.entries(SOURCE_LABELS) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </Select>

    <Checkbox bind:checked={filters.remoteOnly} label={t('missions.remoteOnly')} class="min-h-11 px-1" />

    <div class="flex items-center gap-1.5 sm:ml-auto">
      <Icon icon="solar:sort-vertical-linear" size={16} class="text-fc-fg-muted" />
      <Select
        bind:value={() => sortKey, (v) => (sortKey = v as SortKey)}
        aria-label={t('missions.sortLabel')}
        class="w-auto"
      >
        {#each Object.entries(SORT_OPTIONS) as [value, opt] (value)}
          <option {value}>{opt.label}</option>
        {/each}
      </Select>
    </div>

    {#if filters.search || filters.tier || filters.source || filters.remoteOnly}
      <Button
        variant="ghost"
        onclick={() => { filters.search = ''; filters.tier = ''; filters.source = ''; filters.remoteOnly = false; }}
      >
        {t('leads.filter.reset')}
      </Button>
    {/if}
  </div>

  {#if !loading}
    <p class="text-fc-sm text-fc-fg-muted">{t('missions.found', { count: total })}</p>
  {/if}

  {#if loading}
    <div class="flex h-48 items-center justify-center">
      <Spinner label={t('common.loading')} />
    </div>
  {:else if opportunities.length === 0}
    <EmptyState icon="solar:ghost-linear" title={t('missions.none')}>
      <Button variant="secondary" onclick={triggerScrape}>{t('missions.runScrape')}</Button>
    </EmptyState>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each opportunities as opp (opp.id)}
        <Card href={`/app/missions/${opp.id}`} class="flex min-w-0 flex-col gap-3 overflow-hidden p-4">
          <div class="flex items-center justify-between gap-2">
            <Badge tone={TIER_TONES[opp.tier]} class="font-semibold">
              <Icon icon={TIER_ICONS[opp.tier]} size={12} />
              {opp.tier}
            </Badge>
            <div class="flex items-center gap-2">
              <span class="text-fc-xs text-fc-fg-muted">{SOURCE_LABELS[opp.sourcePlatform] ?? opp.sourcePlatform}</span>
              <span class="rounded-fc-xs bg-fc-surface px-1.5 py-0.5 font-fc-mono text-fc-xs font-semibold text-fc-fg">{opp.relevanceScore}</span>
            </div>
          </div>

          <h3 class="line-clamp-2 break-words text-fc-sm font-semibold leading-snug text-fc-fg">
            {opp.title}
          </h3>

          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-fc-xs text-fc-fg-muted">
            {#if opp.company}
              <span class="max-w-[140px] truncate">{opp.company}</span>
              <span>·</span>
            {/if}
            <span class="shrink-0">{formatDate(opp.postedAt)}</span>
            {#if opp.isRemote}
              <span>·</span>
              <span class="shrink-0 text-fc-success">{t('missions.remote')}</span>
            {/if}
            {#if opp.applicantCount !== null && opp.applicantCount !== undefined}
              <span>·</span>
              <span class="inline-flex shrink-0 items-center gap-1 {opp.applicantCount <= 3 ? 'text-fc-success' : opp.applicantCount <= 10 ? 'text-fc-warning' : 'text-fc-danger'}">
                <Icon icon={icons.usersGroup} size={12} />
                {t('missions.applicants', { count: opp.applicantCount })}
              </span>
            {/if}
          </div>

          <p class="line-clamp-3 break-words text-fc-xs leading-relaxed text-fc-fg-muted">
            {truncate(opp.description, 180)}
          </p>

          <div class="mt-auto flex items-center justify-between gap-2 pt-1">
            {#if formatBudget(opp)}
              <span class="text-fc-xs font-medium text-fc-success">{formatBudget(opp)}</span>
            {:else}
              <span></span>
            {/if}
            <div class="flex min-w-0 flex-wrap justify-end gap-1">
              {#each opp.tags.slice(0, 3) as tag, i (i)}
                <span class="max-w-full truncate rounded-fc-xs bg-fc-surface px-1.5 py-0.5 text-fc-xs text-fc-fg">{tag}</span>
              {/each}
            </div>
          </div>
        </Card>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="flex items-center justify-center gap-2 pt-2">
        <IconButton
          variant="secondary"
          aria-label={t('leads.pagination.prev')}
          onclick={() => { currentPage = Math.max(1, currentPage - 1); loadData(); }}
          disabled={currentPage === 1}
        >
          <Icon icon={icons.chevronLeft} />
        </IconButton>
        <span class="text-fc-sm text-fc-fg-muted">{t('leads.pagination.page', { page: currentPage, pages: totalPages })}</span>
        <IconButton
          variant="secondary"
          aria-label={t('leads.pagination.next')}
          onclick={() => { currentPage = Math.min(totalPages, currentPage + 1); loadData(); }}
          disabled={currentPage === totalPages}
        >
          <Icon icon={icons.arrow} />
        </IconButton>
      </div>
    {/if}
  {/if}
</div>
