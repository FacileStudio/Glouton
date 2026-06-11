<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import 'iconify-icon';

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
    tier: Tier;
  }

  let opportunities = $state<Opportunity[]>([]);
  let stats = $state<{ total: number; hot: number; warm: number; cold: number; newToday: number } | null>(null);
  let loading = $state(true);
  let scraping = $state(false);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);

  let filters = $state({
    search: '',
    tier: '' as '' | Tier,
    source: '',
    remoteOnly: false,
  });

  let filterTimeout: ReturnType<typeof setTimeout>;

  const SOURCE_LABELS: Record<string, string> = {
    REMOTIVE: 'Remotive',
    REMOTE_CO: 'RemoteOK',
    WE_WORK_REMOTELY: 'We Work Remotely',
    LINKEDIN: 'HN Hiring',
    INDEED: 'Indeed France',
    MALT: 'Malt',
    CODEUR: 'Codeur.com',
  };

  const TIER_COLORS: Record<Tier, string> = {
    HOT: 'bg-red-500/10 text-red-400 border-red-500/20',
    WARM: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    COLD: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  const TIER_ICONS: Record<Tier, string> = {
    HOT: 'solar:fire-bold-duotone',
    WARM: 'solar:sun-bold-duotone',
    COLD: 'solar:snowflake-bold-duotone',
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
          sortBy: 'relevanceScore',
          sortOrder: 'desc',
        }),
        trpc.opportunity.stats.query(),
      ]);
      opportunities = result.opportunities as Opportunity[];
      totalPages = result.totalPages;
      total = result.total;
      stats = statsData;
    } catch (err) {
      toast.push('Erreur lors du chargement des missions', 'error');
    } finally {
      loading = false;
    }
  }

  async function triggerScrape() {
    scraping = true;
    try {
      await trpc.opportunity.triggerScrape.mutate();
      toast.push('Scraping lancé — nouvelles missions dans quelques minutes', 'success');
    } catch (err) {
      toast.push('Erreur lors du lancement du scraping', 'error');
    } finally {
      scraping = false;
    }
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
    filters.tier; filters.source; filters.remoteOnly;
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
  });
</script>

<div class="flex flex-col gap-6 p-6">
  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Missions Freelance</h1>
      <p class="text-sm text-muted-foreground mt-1">
        Opportunités scrappées depuis {Object.keys(SOURCE_LABELS).length} sources — mises à jour toutes les 3h
      </p>
    </div>
    <button
      onclick={triggerScrape}
      disabled={scraping}
      class="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
    >
      {#if scraping}
        <Spinner size="sm" />
      {:else}
        <iconify-icon icon="solar:refresh-bold-duotone" width="16"></iconify-icon>
      {/if}
      Actualiser
    </button>
  </div>

  <!-- Stats -->
  {#if stats}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div class="rounded-xl border border-border bg-card p-4">
        <p class="text-xs text-muted-foreground">Total (30j)</p>
        <p class="mt-1 text-2xl font-bold">{stats.total}</p>
      </div>
      <div class="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p class="text-xs text-red-400">🔥 HOT</p>
        <p class="mt-1 text-2xl font-bold text-red-400">{stats.hot}</p>
      </div>
      <div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p class="text-xs text-amber-400">☀️ WARM</p>
        <p class="mt-1 text-2xl font-bold text-amber-400">{stats.warm}</p>
      </div>
      <div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <p class="text-xs text-blue-400">❄️ COLD</p>
        <p class="mt-1 text-2xl font-bold text-blue-400">{stats.cold}</p>
      </div>
      <div class="rounded-xl border border-border bg-card p-4">
        <p class="text-xs text-muted-foreground">Nouvelles 24h</p>
        <p class="mt-1 text-2xl font-bold text-green-400">+{stats.newToday}</p>
      </div>
    </div>
  {/if}

  <!-- Filters -->
  <div class="flex flex-wrap gap-3">
    <input
      type="text"
      placeholder="Rechercher..."
      bind:value={filters.search}
      class="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring w-48"
    />

    <select
      bind:value={filters.tier}
      class="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">Tous les niveaux</option>
      <option value="HOT">🔥 HOT</option>
      <option value="WARM">☀️ WARM</option>
      <option value="COLD">❄️ COLD</option>
    </select>

    <select
      bind:value={filters.source}
      class="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">Toutes les sources</option>
      {#each Object.entries(SOURCE_LABELS) as [value, label]}
        <option {value}>{label}</option>
      {/each}
    </select>

    <label class="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm">
      <input type="checkbox" bind:checked={filters.remoteOnly} class="accent-foreground" />
      Remote uniquement
    </label>

    {#if filters.search || filters.tier || filters.source || filters.remoteOnly}
      <button
        onclick={() => { filters.search = ''; filters.tier = ''; filters.source = ''; filters.remoteOnly = false; }}
        class="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        Réinitialiser
      </button>
    {/if}
  </div>

  <!-- Results count -->
  {#if !loading}
    <p class="text-sm text-muted-foreground">{total} mission{total > 1 ? 's' : ''} trouvée{total > 1 ? 's' : ''}</p>
  {/if}

  <!-- Grid -->
  {#if loading}
    <div class="flex h-48 items-center justify-center">
      <Spinner />
    </div>
  {:else if opportunities.length === 0}
    <div class="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <iconify-icon icon="solar:ghost-bold-duotone" width="48" class="opacity-30"></iconify-icon>
      <p class="text-sm">Aucune mission trouvée</p>
      <button
        onclick={triggerScrape}
        class="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
      >
        Lancer un scraping
      </button>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each opportunities as opp (opp.id)}
        <a
          href={opp.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-md"
        >
          <!-- Top row: tier + score + source -->
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold {TIER_COLORS[opp.tier]}">
              <iconify-icon icon={TIER_ICONS[opp.tier]} width="12"></iconify-icon>
              {opp.tier}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">{SOURCE_LABELS[opp.sourcePlatform] ?? opp.sourcePlatform}</span>
              <span class="rounded bg-foreground/5 px-1.5 py-0.5 text-xs font-mono font-semibold">{opp.relevanceScore}</span>
            </div>
          </div>

          <!-- Title -->
          <h3 class="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-foreground">
            {opp.title}
          </h3>

          <!-- Company + date -->
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            {#if opp.company}
              <span class="truncate max-w-[140px]">{opp.company}</span>
              <span>·</span>
            {/if}
            <span class="shrink-0">{formatDate(opp.postedAt)}</span>
            {#if opp.isRemote}
              <span>·</span>
              <span class="shrink-0 text-green-400">Remote</span>
            {/if}
          </div>

          <!-- Description -->
          <p class="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {truncate(opp.description, 180)}
          </p>

          <!-- Footer: budget + tags -->
          <div class="mt-auto flex items-center justify-between gap-2 pt-1">
            {#if formatBudget(opp)}
              <span class="text-xs font-medium text-green-400">{formatBudget(opp)}</span>
            {:else}
              <span></span>
            {/if}
            <div class="flex gap-1 flex-wrap justify-end">
              {#each opp.tags.slice(0, 3) as tag}
                <span class="rounded bg-foreground/5 px-1.5 py-0.5 text-xs">{tag}</span>
              {/each}
            </div>
          </div>
        </a>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex items-center justify-center gap-2 pt-2">
        <button
          onclick={() => { currentPage = Math.max(1, currentPage - 1); loadData(); }}
          disabled={currentPage === 1}
          class="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-sm disabled:opacity-40 hover:bg-accent"
        >
          <iconify-icon icon="solar:alt-arrow-left-bold" width="14"></iconify-icon>
        </button>
        <span class="text-sm text-muted-foreground">Page {currentPage} / {totalPages}</span>
        <button
          onclick={() => { currentPage = Math.min(totalPages, currentPage + 1); loadData(); }}
          disabled={currentPage === totalPages}
          class="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-sm disabled:opacity-40 hover:bg-accent"
        >
          <iconify-icon icon="solar:alt-arrow-right-bold" width="14"></iconify-icon>
        </button>
      </div>
    {/if}
  {/if}
</div>
