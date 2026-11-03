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

  const SORT_OPTIONS: Record<SortKey, { label: string; sortBy: 'relevanceScore' | 'postedAt' | 'createdAt' | 'budgetMax' | 'applicantCount'; sortOrder: 'asc' | 'desc' }> = {
    relevance: { label: 'Pertinence', sortBy: 'relevanceScore', sortOrder: 'desc' },
    newest: { label: 'Plus récentes', sortBy: 'postedAt', sortOrder: 'desc' },
    budget: { label: 'Budget le plus élevé', sortBy: 'budgetMax', sortOrder: 'desc' },
    competition: { label: 'Moins de concurrence', sortBy: 'applicantCount', sortOrder: 'asc' },
    added: { label: 'Ajoutées récemment', sortBy: 'createdAt', sortOrder: 'desc' },
  };

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
      toast.danger('Erreur lors du chargement des missions');
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
          toast.success('Actualisation lancée');
        }
      } else {
        toast.info('Missions déjà actualisées il y a moins de 10 minutes');
        scraping = false;
      }
    } catch {
      toast.danger("Erreur lors du lancement de l'actualisation");
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
    if (opp.budgetMin && opp.budgetMax) {
      return `${opp.budgetMin.toLocaleString()} – ${opp.budgetMax.toLocaleString()} ${opp.currency ?? '€'}`;
    }
    if (opp.budgetMin) return `${opp.budgetMin.toLocaleString()}+ ${opp.currency ?? '€'}`;
    return '';
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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
            ? `Actualisation terminée : ${data.totalInserted} nouvelle${data.totalInserted > 1 ? 's' : ''} mission${data.totalInserted > 1 ? 's' : ''}`
            : 'Actualisation terminée : aucune nouvelle mission');
        loadData();
      })
    );

    unsubscribers.push(
      ws.on('opportunity:scrape:failed', () => {
        endScrape();
        toast.danger("L'actualisation des missions a échoué");
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
    title="Missions Freelance"
    description="Opportunités scrappées depuis {Object.keys(SOURCE_LABELS).length} sources, mises à jour toutes les 3h"
  >
    {#snippet actions()}
      <Button variant="outline" icon={scraping ? undefined : icons.refresh} onclick={triggerScrape} disabled={scraping}>
        {#if scraping}
          <Spinner size="sm" label="Actualisation" />
        {/if}
        Actualiser
      </Button>
    {/snippet}
  </PageHeader>

  {#if scrapeProgress}
    <Card class="flex flex-col gap-2 p-4">
      <div class="flex items-center justify-between gap-3 text-fc-sm">
        <div class="flex min-w-0 items-center gap-2">
          <Spinner size="sm" label="Actualisation" />
          <span class="font-medium text-fc-fg">Actualisation des missions</span>
          <span class="truncate text-fc-fg-muted">
            · {scrapeProgress.source} ({scrapeProgress.sourcesDone}/{scrapeProgress.sourcesTotal} sources)
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
          {scrapeProgress.totalInserted} nouvelle{scrapeProgress.totalInserted > 1 ? 's' : ''} mission{scrapeProgress.totalInserted > 1 ? 's' : ''} pour l'instant
        </p>
      {/if}
    </Card>
  {/if}

  {#if stats}
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <StatCard label="Total (30j)" value={stats.total} />
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
        <span class="text-fc-xs uppercase tracking-wide text-fc-fg-muted">Nouvelles 24h</span>
        <span class="text-fc-2xl font-semibold text-fc-success">+{stats.newToday}</span>
      </Card>
    </div>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <Input
      type="text"
      placeholder="Rechercher..."
      aria-label="Rechercher une mission"
      bind:value={filters.search}
      class="w-full sm:w-48"
    />

    <Select
      bind:value={() => filters.tier, (v) => (filters.tier = v as '' | Tier)}
      aria-label="Filtrer par niveau"
      class="w-auto"
    >
      <option value="">Tous les niveaux</option>
      <option value="HOT">HOT</option>
      <option value="WARM">WARM</option>
      <option value="COLD">COLD</option>
    </Select>

    <Select bind:value={filters.source} aria-label="Filtrer par source" class="w-auto">
      <option value="">Toutes les sources</option>
      {#each Object.entries(SOURCE_LABELS) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </Select>

    <Checkbox bind:checked={filters.remoteOnly} label="Remote uniquement" class="min-h-11 px-1" />

    <div class="flex items-center gap-1.5 sm:ml-auto">
      <Icon icon="solar:sort-vertical-linear" size={16} class="text-fc-fg-muted" />
      <Select
        bind:value={() => sortKey, (v) => (sortKey = v as SortKey)}
        aria-label="Trier les missions"
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
        Réinitialiser
      </Button>
    {/if}
  </div>

  {#if !loading}
    <p class="text-fc-sm text-fc-fg-muted">{total} mission{total > 1 ? 's' : ''} trouvée{total > 1 ? 's' : ''}</p>
  {/if}

  {#if loading}
    <div class="flex h-48 items-center justify-center">
      <Spinner label="Chargement" />
    </div>
  {:else if opportunities.length === 0}
    <EmptyState icon="solar:ghost-linear" title="Aucune mission trouvée">
      <Button variant="outline" onclick={triggerScrape}>Lancer un scraping</Button>
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
              <span class="shrink-0 text-fc-success">Remote</span>
            {/if}
            {#if opp.applicantCount !== null && opp.applicantCount !== undefined}
              <span>·</span>
              <span class="inline-flex shrink-0 items-center gap-1 {opp.applicantCount <= 3 ? 'text-fc-success' : opp.applicantCount <= 10 ? 'text-fc-warning' : 'text-fc-danger'}">
                <Icon icon={icons.usersGroup} size={12} />
                {opp.applicantCount} sur le coup
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
          aria-label="Page précédente"
          onclick={() => { currentPage = Math.max(1, currentPage - 1); loadData(); }}
          disabled={currentPage === 1}
        >
          <Icon icon={icons.chevronLeft} />
        </IconButton>
        <span class="text-fc-sm text-fc-fg-muted">Page {currentPage} / {totalPages}</span>
        <IconButton
          aria-label="Page suivante"
          onclick={() => { currentPage = Math.min(totalPages, currentPage + 1); loadData(); }}
          disabled={currentPage === totalPages}
        >
          <Icon icon={icons.arrow} />
        </IconButton>
      </div>
    {/if}
  {/if}
</div>
