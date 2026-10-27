<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import {
    Badge,
    Button,
    Card,
    Checkbox,
    EmptyState,
    Icon,
    IconButton,
    Input,
    PageHeader,
    Spinner,
    StatCard,
    icons,
    toast,
  } from '@facile/muse';

  interface CompanyCreation {
    id: string;
    country: string;
    registrationId: string;
    name: string;
    legalForm?: string | null;
    activityCode?: string | null;
    activityLabel?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    region?: string | null;
    capital?: number | null;
    currency?: string | null;
    directors?: unknown;
    sourceUrl?: string | null;
    publishedAt: string | Date;
    hasWebsite: boolean;
    websiteUrl?: string | null;
    domain?: string | null;
    email?: string | null;
    phone?: string | null;
    enrichmentStatus: string;
    convertedLeadId?: string | null;
    convertedAt?: string | Date | null;
    scrapedAt: string | Date;
    createdAt: string | Date;
    updatedAt: string | Date;
  }

  interface Stats {
    total: number;
    withoutWebsite: number;
    byCountry: Record<string, number>;
    newToday: number;
  }

  type CountryFilter = 'ALL' | 'FR' | 'GB' | 'DE';

  const COUNTRY_INFO: Record<string, { label: string; flag: string }> = {
    FR: { label: 'France', flag: '🇫🇷' },
    GB: { label: 'Royaume-Uni', flag: '🇬🇧' },
    DE: { label: 'Allemagne', flag: '🇩🇪' },
  };

  let creations = $state<CompanyCreation[]>([]);
  let stats = $state<Stats | null>(null);
  let loading = $state(true);
  let scraping = $state(false);
  let countryFilter = $state<CountryFilter>('ALL');
  let searchQuery = $state('');
  let withoutWebsiteOnly = $state(false);
  let page = $state(1);
  let totalPages = $state(1);
  let total = $state(0);
  let convertingId = $state<string | null>(null);

  let mounted = false;
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  const franceCount = $derived(stats?.byCountry?.FR ?? stats?.byCountry?.fr ?? 0);
  const ukCount = $derived(stats?.byCountry?.GB ?? stats?.byCountry?.gb ?? stats?.byCountry?.UK ?? stats?.byCountry?.uk ?? 0);

  function formatDate(dateVal: string | Date | null | undefined): string {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days > 1 && days < 7) return `Il y a ${days}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDirectors(directors: unknown): string {
    if (!directors) return '';
    if (typeof directors === 'string') return directors;
    if (Array.isArray(directors)) {
      return directors
        .map((d) => {
          if (typeof d === 'string') return d;
          if (d && typeof d === 'object') {
            if ('name' in d && typeof d.name === 'string') return d.name;
            if ('fullName' in d && typeof d.fullName === 'string') return d.fullName;
            const parts = [
              ('firstName' in d && typeof d.firstName === 'string' && d.firstName) || '',
              ('lastName' in d && typeof d.lastName === 'string' && d.lastName) || '',
            ].filter(Boolean);
            if (parts.length > 0) return parts.join(' ');
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }
    if (typeof directors === 'object') {
      const d = directors as Record<string, unknown>;
      if (typeof d.name === 'string') return d.name;
      if (typeof d.fullName === 'string') return d.fullName;
      const parts = [d.firstName, d.lastName].filter((p): p is string => typeof p === 'string');
      if (parts.length > 0) return parts.join(' ');
    }
    return '';
  }

  async function loadData() {
    loading = true;
    try {
      const result = await (trpc as any).companyCreation.list.query({
        page,
        limit: 25,
        country: countryFilter === 'ALL' ? undefined : countryFilter,
        search: searchQuery.trim() || undefined,
        hasWebsite: withoutWebsiteOnly ? false : undefined,
      });

      const items = (result?.items ?? result?.creations ?? (Array.isArray(result) ? result : [])) as CompanyCreation[];
      creations = items;
      total = result?.total ?? items.length;
      totalPages = result?.totalPages ?? Math.max(1, Math.ceil(total / 25));
    } catch {
      toast.danger('Erreur lors du chargement des créations');
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      stats = await (trpc as any).companyCreation.stats.query();
    } catch {
      stats = null;
    }
  }

  async function triggerScrape() {
    scraping = true;
    try {
      await (trpc as any).companyCreation.triggerScrape.mutate();
      toast.success('Actualisation du flux lancée');
      await Promise.all([loadData(), loadStats()]);
    } catch (err: any) {
      toast.danger(err?.message || "Erreur lors de l'actualisation du flux");
    } finally {
      scraping = false;
    }
  }

  async function handleConvertToLead(creation: CompanyCreation) {
    convertingId = creation.id;
    try {
      const teamId = teamContextStore.getTeamId();
      const result = await (trpc as any).companyCreation.convertToLead.mutate({
        creationId: creation.id,
        id: creation.id,
        teamId,
      });
      toast.success('Entreprise convertie en lead');
      const leadId = result?.leadId || result?.id || result?.lead?.id;
      creation.convertedLeadId = leadId ?? 'converted';
      creation.convertedAt = new Date().toISOString();
    } catch (err: any) {
      toast.danger(err?.message || 'Erreur lors de la conversion');
    } finally {
      convertingId = null;
    }
  }

  function resetFilters() {
    countryFilter = 'ALL';
    searchQuery = '';
    withoutWebsiteOnly = false;
    page = 1;
    loadData();
  }

  onMount(() => {
    mounted = true;
    loadData();
    loadStats();
  });

  onDestroy(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });

  $effect(() => {
    countryFilter;
    withoutWebsiteOnly;
    if (!mounted) return;
    page = 1;
    loadData();
  });

  $effect(() => {
    searchQuery;
    if (!mounted) return;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      page = 1;
      loadData();
    }, 300);
  });
</script>

<div class="flex flex-col gap-6">
  <PageHeader
    title="Nouvelles créations d'entreprises"
    description="Flux en direct des nouvelles immatriculations en France, Royaume-Uni et Allemagne"
  >
    {#snippet actions()}
      <Button
        variant="outline"
        icon={scraping ? undefined : icons.refresh}
        onclick={triggerScrape}
        disabled={scraping}
      >
        {#if scraping}
          <Spinner size="sm" label="Actualisation" />
        {/if}
        Actualiser le flux
      </Button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard
      label="Total créations"
      value={(stats?.total ?? 0).toLocaleString('fr-FR')}
      delta={stats?.newToday ? `+${stats.newToday} aujourd'hui` : undefined}
    />
    <StatCard
      label="Sans site web"
      value={(stats?.withoutWebsite ?? 0).toLocaleString('fr-FR')}
      delta="Opportunités chaudes"
    />
    <StatCard
      label="France (BODACC)"
      value={franceCount.toLocaleString('fr-FR')}
    />
    <StatCard
      label="Royaume-Uni (Companies House)"
      value={ukCount.toLocaleString('fr-FR')}
    />
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <div class="flex flex-wrap items-center gap-1.5">
      <Button
        variant={countryFilter === 'ALL' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => { countryFilter = 'ALL'; }}
      >
        Tous
      </Button>
      <Button
        variant={countryFilter === 'FR' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => { countryFilter = 'FR'; }}
      >
        🇫🇷 France
      </Button>
      <Button
        variant={countryFilter === 'GB' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => { countryFilter = 'GB'; }}
      >
        🇬🇧 Royaume-Uni
      </Button>
      <Button
        variant={countryFilter === 'DE' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => { countryFilter = 'DE'; }}
      >
        🇩🇪 Allemagne
      </Button>
    </div>

    <div class="w-full sm:w-72">
      <Input
        type="text"
        placeholder="Rechercher par nom, SIREN, ville..."
        bind:value={searchQuery}
        aria-label="Rechercher par nom, SIREN, ville"
      />
    </div>

    <Checkbox
      bind:checked={withoutWebsiteOnly}
      label="Sans site web uniquement"
      class="min-h-11 px-1"
    />

    {#if countryFilter !== 'ALL' || searchQuery || withoutWebsiteOnly}
      <Button variant="ghost" size="sm" onclick={resetFilters}>
        Réinitialiser
      </Button>
    {/if}
  </div>

  {#if !loading}
    <p class="text-fc-sm text-fc-fg-muted">
      {total} création{total > 1 ? 's' : ''} trouvée{total > 1 ? 's' : ''}
    </p>
  {/if}

  {#if loading}
    <div class="flex h-48 items-center justify-center">
      <Spinner label="Chargement des créations" />
    </div>
  {:else if creations.length === 0}
    <EmptyState
      icon="solar:buildings-2-linear"
      title="Aucune création d'entreprise trouvée"
      description="Essayez d'ajuster vos filtres de recherche ou d'actualiser le flux des registres."
    >
      <Button variant="outline" onclick={triggerScrape} disabled={scraping}>
        Actualiser le flux
      </Button>
    </EmptyState>
  {:else}
    <div class="flex flex-col gap-3">
      {#each creations as creation (creation.id)}
        <Card class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-fc-md font-semibold text-fc-fg">
                  {creation.name}
                </span>
                {#if creation.legalForm}
                  <span class="rounded-fc-xs bg-fc-surface px-1.5 py-0.5 font-fc-mono text-fc-xs text-fc-fg-muted">
                    {creation.legalForm}
                  </span>
                {/if}
                <Badge tone="neutral" class="font-fc-mono font-medium">
                  {COUNTRY_INFO[creation.country]?.flag ?? ''} {creation.country}
                </Badge>
                {#if !creation.hasWebsite}
                  <Badge tone="danger">
                    <Icon icon="solar:fire-linear" size={12} />
                    Sans site web
                  </Badge>
                {:else}
                  <Badge tone="success">
                    <Icon icon="solar:globe-linear" size={12} />
                    Site détecté
                  </Badge>
                {/if}
              </div>

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-fc-xs text-fc-fg-muted">
                {#if creation.registrationId}
                  <span class="font-fc-mono">{creation.registrationId}</span>
                  <span>·</span>
                {/if}
                {#if creation.publishedAt}
                  <span class="flex items-center gap-1">
                    <Icon icon="solar:calendar-linear" size={12} />
                    {formatDate(creation.publishedAt)}
                  </span>
                  <span>·</span>
                {/if}
                {#if creation.city || creation.postalCode}
                  <span class="flex items-center gap-1">
                    <Icon icon="solar:map-point-linear" size={12} />
                    {[creation.postalCode, creation.city].filter(Boolean).join(' ')}
                  </span>
                {/if}
                {#if creation.capital}
                  <span>·</span>
                  <span>Capital : {creation.capital.toLocaleString('fr-FR')} {creation.currency ?? 'EUR'}</span>
                {/if}
                {#if creation.domain || creation.websiteUrl}
                  <span>·</span>
                  <a
                    href={creation.websiteUrl || `https://${creation.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-fc-accent hover:underline"
                  >
                    <Icon icon="solar:link-linear" size={12} />
                    {creation.domain || creation.websiteUrl}
                  </a>
                {/if}
              </div>

              {#if creation.activityLabel || creation.activityCode}
                <p class="text-fc-sm text-fc-fg-muted">
                  {#if creation.activityCode}
                    <span class="font-fc-mono font-medium text-fc-fg">{creation.activityCode}</span>
                    {#if creation.activityLabel} — {/if}
                  {/if}
                  {creation.activityLabel ?? ''}
                </p>
              {/if}

              {#if formatDirectors(creation.directors)}
                <div class="flex items-center gap-1.5 text-fc-xs text-fc-fg-muted">
                  <Icon icon="solar:user-linear" size={12} />
                  <span>Dirigeant : <strong class="font-medium text-fc-fg">{formatDirectors(creation.directors)}</strong></span>
                </div>
              {/if}
            </div>

            <div class="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
              {#if creation.sourceUrl}
                <Button
                  variant="ghost"
                  size="sm"
                  href={creation.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  iconRight="solar:arrow-right-up-linear"
                >
                  Lien registre
                </Button>
              {/if}
              {#if creation.convertedLeadId}
                <Button
                  variant="outline"
                  size="sm"
                  href={`/app/leads/${creation.convertedLeadId}`}
                  icon="solar:check-circle-linear"
                >
                  Converti
                </Button>
              {:else}
                <Button
                  variant="primary"
                  size="sm"
                  onclick={() => handleConvertToLead(creation)}
                  disabled={convertingId === creation.id}
                  icon={convertingId === creation.id ? undefined : 'solar:magnet-linear'}
                >
                  {#if convertingId === creation.id}
                    <Spinner size="sm" label="Conversion" />
                  {/if}
                  Ajouter aux Leads
                </Button>
              {/if}
            </div>
          </div>
        </Card>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="flex items-center justify-center gap-2 pt-4">
        <IconButton
          aria-label="Page précédente"
          onclick={() => { page = Math.max(1, page - 1); loadData(); }}
          disabled={page === 1}
        >
          <Icon icon={icons.chevronLeft} />
        </IconButton>
        <span class="text-fc-sm text-fc-fg-muted">Page {page} sur {totalPages}</span>
        <IconButton
          aria-label="Page suivante"
          onclick={() => { page = Math.min(totalPages, page + 1); loadData(); }}
          disabled={page === totalPages}
        >
          <Icon icon={icons.arrow} />
        </IconButton>
      </div>
    {/if}
  {/if}
</div>
