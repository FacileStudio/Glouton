<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import type { PageProps } from './$types';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast, Spinner, PageHeader, Button, Badge, Card, Section, StatCard, EmptyState, Alert, Icon, StatusDot, icons } from '@facile/muse';
  import { ws } from '$lib/websocket';
  import HuntBanner from '$lib/components/leads/HuntBanner.svelte';

  let { params }: PageProps = $props();
  let huntSessionId = $derived(params.id);

  interface RunDetails {
    id: string;
    userId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    sources: string[];
    domain: string | null;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS';
    filters?: any;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    sourceStats?: any;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    stats: {
      totalLeads: number;
      hotLeads: number;
      warmLeads: number;
      coldLeads: number;
      contactedLeads: number;
      duration: number | null;
      successRate: number;
      averageScore: number;
    };
    leads: Array<{
      id: string;
      domain: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      businessName: string | null;
      position: string | null;
      status: string;
      score: number;
      source: string;
      createdAt: string;
    }>;
  }

  interface LiveEvent {
    id: string;
    type: string;
    level: 'success' | 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
    metadata?: any;
  }

  interface DiscoveredItem {
    domain: string;
    organization: string | null;
    industry: string | null;
    index: number;
  }

  let details = $state<RunDetails | null>(null);
  let loading = $state(true);
  let cancelling = $state(false);
  let relaunching = $state(false);
  let liveEvents = $state<LiveEvent[]>([]);
  let discoveredItems = $state<DiscoveredItem[]>([]);
  let eventsContainer = $state<HTMLDivElement | undefined>(undefined);
  let autoScroll = $state(true);
  let eventIdCounter = 0;

  const unsubscribers: (() => void)[] = [];

  function pushEvent(type: string, level: LiveEvent['level'], message: string, metadata?: any) {
    const event: LiveEvent = {
      id: `live-${eventIdCounter++}`,
      type,
      level,
      message,
      timestamp: new Date(),
      metadata,
    };
    liveEvents = [event, ...liveEvents].slice(0, 200);
  }

  function updateDetails(updates: Partial<RunDetails>) {
    if (details) {
      details = { ...details, ...updates };
    }
  }

  onMount(async () => {
    await loadData();

    unsubscribers.push(
      ws.on('hunt-started', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'PROCESSING', startedAt: new Date().toISOString() });
        pushEvent('hunt-started', 'info', data.message || 'Chasse démarrée');
      })
    );

    unsubscribers.push(
      ws.on('hunt-progress', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({
          progress: data.progress ?? details?.progress ?? 0,
          successfulLeads: data.successfulLeads ?? details?.successfulLeads ?? 0,
          totalLeads: data.totalLeads ?? details?.totalLeads ?? 0,
          status: 'PROCESSING',
        });
      })
    );

    unsubscribers.push(
      ws.on('domain-discovered', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        discoveredItems = [
          { domain: data.domain, organization: data.organization, industry: data.industry, index: data.totalDiscovered },
          ...discoveredItems,
        ].slice(0, 500);
        updateDetails({
          successfulLeads: data.totalDiscovered,
          progress: data.progress ?? details?.progress ?? 0,
        });
        pushEvent('domain-discovered', 'success', `Découvert : ${data.organization || data.domain}`, { domain: data.domain, industry: data.industry });
      })
    );

    unsubscribers.push(
      ws.on('leads-created', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ successfulLeads: (details?.successfulLeads ?? 0) + data.count });
        pushEvent('leads-created', 'success', `${data.count} nouveau${data.count > 1 ? 'x' : ''} lead${data.count > 1 ? 's' : ''} ajouté${data.count > 1 ? 's' : ''}${data.source ? ` depuis ${data.source}` : ''}`, { count: data.count });
      })
    );

    unsubscribers.push(
      ws.on('businesses-discovered', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        pushEvent('businesses-discovered', 'info', `${data.count} entreprise${data.count > 1 ? 's' : ''} trouvée${data.count > 1 ? 's' : ''} sur la carte`, { count: data.count });
      })
    );

    unsubscribers.push(
      ws.on('extraction-progress', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ progress: data.progress ?? details?.progress ?? 0, successfulLeads: data.leadsFound });
        pushEvent('extraction-progress', 'info', data.message || `Source ${data.currentSource}: ${data.sourcesCompleted}/${data.totalSources}`);
      })
    );

    unsubscribers.push(
      ws.on('source-started', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        pushEvent('source-started', 'info', data.message || `Starting source ${data.source}`);
      })
    );

    unsubscribers.push(
      ws.on('leads-discovered', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        pushEvent('leads-discovered', 'info', data.message || `Found ${data.count} leads from ${data.source}`);
      })
    );

    unsubscribers.push(
      ws.on('rate-limit-reached', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        pushEvent('rate-limit-reached', 'warning', `Limite de taux atteinte pour ${data.source}`);
      })
    );

    unsubscribers.push(
      ws.on('hunt-completed', async (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'COMPLETED', progress: 100, completedAt: new Date().toISOString() });
        pushEvent('hunt-completed', 'success', data.message || `Chasse terminée ! ${data.successfulLeads} leads trouvés`);
        toast.success(data.message || `Chasse terminée ! ${data.successfulLeads} leads trouvés`);
        await loadData();
      })
    );

    unsubscribers.push(
      ws.on('extraction-completed', async (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'COMPLETED', progress: 100, completedAt: new Date().toISOString() });
        pushEvent('extraction-completed', 'success', data.message || `Extraction terminée ! ${data.successfulLeads} leads trouvés`);
        toast.success(data.message || 'Extraction terminée !');
        await loadData();
      })
    );

    unsubscribers.push(
      ws.on('hunt-cancelled', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'CANCELLED', completedAt: new Date().toISOString() });
        pushEvent('hunt-cancelled', 'warning', 'Chasse annulée par l\'utilisateur');
      })
    );

    unsubscribers.push(
      ws.on('hunt-failed', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'FAILED', completedAt: new Date().toISOString(), error: data.error });
        pushEvent('hunt-failed', 'error', data.message || `Chasse échouée : ${data.error}`);
        toast.danger(data.message || 'Chasse échouée');
      })
    );

    unsubscribers.push(
      ws.on('extraction-failed', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'FAILED', completedAt: new Date().toISOString(), error: data.error });
        pushEvent('extraction-failed', 'error', data.message || `Extraction échouée : ${data.error}`);
      })
    );
  });

  onDestroy(() => {
    unsubscribers.forEach(u => u());
  });

  async function loadData() {
    try {
      const detailsData = await trpc.lead.hunt.getRunDetails.query({ huntSessionId });
      details = detailsData;
    } catch (error: any) {
      toast.danger('Échec du chargement des détails');
      if (error?.message?.includes('not found')) goto('/app/hunts');
    } finally {
      loading = false;
    }
  }

  async function cancelHunt(id: string) {
    cancelling = true;
    try {
      await trpc.lead.hunt.cancel.mutate({ huntSessionId: id });
      toast.info('Chasse annulée');
    } catch (err: any) {
      toast.danger(err?.message || "Échec de l'annulation");
    } finally {
      cancelling = false;
    }
  }

  async function relaunchHunt() {
    if (!details || !details.filters) {
      toast.danger('Impossible de relancer cette chasse');
      return;
    }

    relaunching = true;
    try {
      const filters = details.filters;

      if (details.huntType === 'LOCAL_BUSINESS' || (filters.location && filters.categories)) {
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
      goto('/app/hunts');
    } catch (error: any) {
      toast.danger(error?.message || 'Échec de la relance');
    } finally {
      relaunching = false;
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  function formatTs(date: Date): string {
    return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function sourceLabel(source: string): string {
    if (source === 'GOOGLE_MAPS') return 'Google Maps';
    if (source === 'OPENSTREETMAP') return 'OpenStreetMap';
    if (source === 'HUNTER') return 'Hunter';
    if (source === 'MANUAL') return 'Manuel';
    return source;
  }

  const isCsvImport = $derived(details?.sources?.includes('CSV_IMPORT') ?? false);

  const headerTitle = $derived.by(() => {
    if (!details) return '';
    if (isCsvImport) return 'Import CSV';
    if (details.huntType === 'LOCAL_BUSINESS') return details.filters?.location || 'Recherche locale';
    return details.domain || 'Recherche large';
  });

  const headerDescription = $derived.by(() => {
    if (!details) return '';
    if (isCsvImport) return 'Import depuis fichier CSV';
    if (details.huntType === 'LOCAL_BUSINESS') return details.filters?.categories?.join(', ') || 'Commerce local';
    if (details.sources && details.sources.length > 0) return details.sources.map(sourceLabel).join(', ');
    return 'Aucune source';
  });

  const statusLabel = $derived.by(() => {
    switch (details?.status) {
      case 'COMPLETED': return 'Terminée';
      case 'PROCESSING': return 'En cours';
      case 'PENDING': return 'En attente';
      case 'FAILED': return 'Échouée';
      case 'CANCELLED': return 'Annulée';
      default: return details?.status ?? '';
    }
  });

  const isProcessing = $derived(details?.status === 'PENDING' || details?.status === 'PROCESSING');

  const asBannerSession = $derived(details ? {
    id: details.id,
    huntType: details.huntType,
    sources: details.sources,
    status: details.status,
    progress: details.progress,
    totalLeads: details.totalLeads,
    successfulLeads: details.successfulLeads,
    failedLeads: details.failedLeads,
    error: details.error,
    startedAt: details.startedAt,
    completedAt: details.completedAt,
    createdAt: details.createdAt,
    filters: details.filters,
  } : null);
</script>

{#snippet row(label: string, value: string | number)}
  <div class="flex items-start justify-between gap-2">
    <span class="shrink-0 text-fc-fg-muted">{label}</span>
    <span class="text-right font-medium text-fc-fg">{value}</span>
  </div>
{/snippet}

{#snippet chips(values: string[], capitalize = false)}
  <div class="flex flex-wrap gap-1.5">
    {#each values as value}
      <Badge class={capitalize ? 'capitalize' : ''}>{value}</Badge>
    {/each}
  </div>
{/snippet}

{#if loading}
  <div class="flex items-center justify-center py-24" in:fade>
    <Spinner size="lg" label="Chargement" />
  </div>
{:else if !details}
  <EmptyState title="Chasse introuvable">
    <Button href="/app/hunts">Retour aux chasses</Button>
  </EmptyState>
{:else}
  <PageHeader
    title={headerTitle}
    description={headerDescription}
    back={{ href: '/app/hunts', label: 'Retour aux chasses' }}
  >
    {#snippet actions()}
      <Badge tone={details?.status === 'FAILED' ? 'danger' : 'neutral'}>
        {statusLabel}
        {#if details?.status === 'PROCESSING'}
          <StatusDot tone="info" pulse />
        {/if}
      </Badge>

      {#if details?.status === 'COMPLETED' || details?.status === 'FAILED'}
        <Button
          variant="outline"
          icon={relaunching ? undefined : 'solar:restart-linear'}
          onclick={relaunchHunt}
          disabled={relaunching}
        >
          {#if relaunching}
            <Spinner size="sm" label="Relance" />
            Relance
          {:else}
            Relancer
          {/if}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  {#if isProcessing && asBannerSession}
    <div in:fly={{ y: -10, duration: 300 }}>
      <HuntBanner session={asBannerSession} onCancel={cancelHunt} {cancelling} />
    </div>
  {/if}

  <Section title="Configuration" card>
    <div class="flex flex-col gap-4 text-fc-sm">
      <div class="flex flex-col gap-2">
        <p class="text-fc-fg-muted">Type de chasse</p>
        {#if details.huntType === 'LOCAL_BUSINESS'}
          <Badge><Icon icon="solar:map-point-linear" size={14} />Commerce local</Badge>
        {:else}
          <Badge><Icon icon={icons.globe} size={14} />Domaine</Badge>
        {/if}
      </div>

      {#if details.huntType === 'LOCAL_BUSINESS' && details.filters}
        <div class="flex flex-col gap-2">
          <p class="text-fc-fg-muted">Paramètres</p>
          <div class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-4">
            {#if details.filters.location}
              {@render row('Localisation', details.filters.location)}
            {/if}
            {#if details.filters.categories?.length}
              <div class="flex flex-col gap-2">
                <p class="text-fc-fg-muted">Catégories</p>
                {@render chips(details.filters.categories.map((cat: string) => cat.replace(/-/g, ' ')), true)}
              </div>
            {/if}
            {#if details.filters.radius}
              {@render row('Rayon', details.filters.radius >= 1000 ? `${(details.filters.radius / 1000).toFixed(1)} km` : `${details.filters.radius} m`)}
            {/if}
            {#if details.filters.maxResults}
              {@render row('Max résultats', details.filters.maxResults)}
            {/if}
            {#if details.filters.hasWebsite !== undefined}
              {@render row('Avec site web', details.filters.hasWebsite ? 'Oui' : 'Non')}
            {/if}
          </div>
        </div>
      {/if}

      {#if details.huntType !== 'LOCAL_BUSINESS'}
        {#if details.sources?.length > 0}
          <div class="flex flex-col gap-2">
            <p class="text-fc-fg-muted">Sources</p>
            {@render chips(details.sources.map(sourceLabel))}
          </div>
        {/if}

        {#if details.filters && Object.keys(details.filters).some(k => details?.filters[k] !== undefined && details?.filters[k] !== null)}
          <div class="flex flex-col gap-2">
            <p class="text-fc-fg-muted">Filtres</p>
            <div class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-4">
              {#if details.filters.type}
                <div class="flex items-center justify-between gap-2">
                  <span class="text-fc-fg-muted">Type d'email</span>
                  <Badge>{details.filters.type === 'personal' ? 'Personnel' : 'Générique'}</Badge>
                </div>
              {/if}
              {#if details.filters.seniority?.length}
                <div class="flex flex-col gap-1.5">
                  <p class="text-fc-fg-muted">Séniorité</p>
                  {@render chips(details.filters.seniority.map((s: string) => (s === 'junior' ? 'Junior' : s === 'senior' ? 'Senior' : 'Exécutif')))}
                </div>
              {/if}
              {#if details.filters.department?.length}
                <div class="flex flex-col gap-1.5">
                  <p class="text-fc-fg-muted">Département</p>
                  {@render chips(details.filters.department, true)}
                </div>
              {/if}
              {#if details.filters.jobTitles?.length}
                <div class="flex flex-col gap-1.5">
                  <p class="text-fc-fg-muted">Postes</p>
                  {@render chips(details.filters.jobTitles)}
                </div>
              {/if}
              {#if details.filters.verificationStatus?.length}
                <div class="flex flex-col gap-1.5">
                  <p class="text-fc-fg-muted">Statut de vérification</p>
                  {@render chips(details.filters.verificationStatus.map((v: string) => (v === 'valid' ? 'Valide' : v === 'accept_all' ? 'Accepte tout' : 'Inconnu')))}
                </div>
              {/if}
              {#if details.filters.requiredFields?.length}
                <div class="flex flex-col gap-1.5">
                  <p class="text-fc-fg-muted">Champs requis</p>
                  {@render chips(details.filters.requiredFields.map((f: string) => (f === 'full_name' ? 'Nom complet' : f === 'position' ? 'Poste' : 'Téléphone')))}
                </div>
              {/if}
              {#if details.filters.location && typeof details.filters.location === 'object'}
                {@const loc = details.filters.location}
                {#if loc.country || loc.city || loc.state || loc.continent || loc.businessRegion}
                  <div class="flex flex-col gap-1.5">
                    <p class="text-fc-fg-muted">Localisation</p>
                    <div class="flex flex-col gap-1">
                      {#if loc.continent}{@render row('Continent', loc.continent)}{/if}
                      {#if loc.businessRegion}{@render row('Région', loc.businessRegion)}{/if}
                      {#if loc.country}{@render row('Pays', loc.country)}{/if}
                      {#if loc.state}{@render row('État / Région', loc.state)}{/if}
                      {#if loc.city}{@render row('Ville', loc.city)}{/if}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      {/if}

      {#if details.sourceStats && typeof details.sourceStats === 'object' && Object.keys(details.sourceStats).length > 0}
        <div class="flex flex-col gap-2">
          <p class="text-fc-fg-muted">Performance des sources</p>
          {#each Object.entries(details.sourceStats) as [source, stats]}
            <div class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-4">
              <p class="font-medium text-fc-fg">{source}</p>
              <div class="flex flex-col gap-1">
                {@render row('Leads', (stats as any).leads || 0)}
                {#if (stats as any).errors > 0}
                  {@render row('Erreurs', (stats as any).errors)}
                {/if}
                {#if (stats as any).rateLimited}
                  {@render row('Limite dépassée', 'Oui')}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex flex-col gap-2">
        <p class="text-fc-fg-muted">Dates</p>
        <div class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-4">
          {@render row('Créée le', new Date(details.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}
          {#if details.startedAt}
            {@render row('Démarrée le', new Date(details.startedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}
          {/if}
          {#if details.completedAt}
            {@render row('Terminée le', new Date(details.completedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}
          {/if}
        </div>
      </div>

      {#if details.error}
        <Alert tone="danger">
          <div class="flex items-start gap-2">
            <Icon icon={icons.warning} class="mt-0.5" />
            <p>{details.error}</p>
          </div>
        </Alert>
      {/if}
    </div>
  </Section>

  {#if discoveredItems.length > 0}
    <Section title="Stats">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={details.stats.totalLeads} />
        <StatCard label="Chaud" value={details.stats.hotLeads} />
        <StatCard label="Tiède" value={details.stats.warmLeads} />
        <StatCard label="Froid" value={details.stats.coldLeads} />
      </div>
      <div class="grid grid-cols-3 gap-4">
        <StatCard label="Taux" value="{details.stats.successRate.toFixed(0)}%" />
        <StatCard label="Score" value={details.stats.averageScore.toFixed(0)} />
        <StatCard label="Durée" value={formatDuration(details.stats.duration)} />
      </div>
    </Section>
  {/if}

  {#if isProcessing || liveEvents.length > 0}
    <Section title="Flux en direct" card>
      {#snippet actions()}
        {#if isProcessing}
          <Badge tone="info"><StatusDot tone="info" pulse />En direct</Badge>
        {/if}
        <Button variant="outline" size="sm" onclick={() => { autoScroll = !autoScroll; }}>
          {autoScroll ? 'Défilement auto' : 'En pause'}
        </Button>
      {/snippet}

      <div bind:this={eventsContainer} class="flex max-h-[400px] flex-col overflow-y-auto">
        {#if liveEvents.length === 0}
          <EmptyState bare icon="solar:hourglass-linear" title="En attente d'événements…" />
        {:else}
          {#each liveEvents as event (event.id)}
            <div class="flex items-start gap-3 border-b border-fc-border py-2 last:border-0" in:fly={{ y: -8, duration: 200 }}>
              <span
                class="mt-1.5 size-1.5 shrink-0 rounded-fc-full {event.level === 'error' ? 'bg-fc-danger' : 'bg-fc-fg'}"
              ></span>
              <p class="min-w-0 flex-1 text-fc-sm text-fc-fg">{event.message}</p>
              <span class="shrink-0 font-fc-mono text-fc-xs text-fc-fg-muted">{formatTs(event.timestamp)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </Section>
  {:else if details.status === 'FAILED'}
    <Section title="Domaines découverts" card>
      {#snippet actions()}
        <Badge>{discoveredItems.length}</Badge>
      {/snippet}
      <div class="flex max-h-[400px] flex-col overflow-y-auto">
        {#each discoveredItems as item (item.index)}
          <div class="flex items-center gap-4 border-b border-fc-border py-2.5 last:border-0" in:fly={{ y: -6, duration: 150 }}>
            <span class="w-8 shrink-0 font-fc-mono text-fc-xs text-fc-fg-muted">#{item.index}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-fc-sm font-medium text-fc-fg">{item.organization || item.domain}</p>
              {#if item.organization}
                <p class="truncate text-fc-xs text-fc-fg-muted">{item.domain}</p>
              {/if}
            </div>
            {#if item.industry}
              <Badge class="max-w-[120px] shrink-0 truncate">{item.industry}</Badge>
            {/if}
          </div>
        {/each}
      </div>
    </Section>
  {/if}

  <Section title="Leads" card>
    {#snippet actions()}
      <Badge>{details?.leads.length ?? 0}</Badge>
    {/snippet}
    <div class="flex max-h-[500px] flex-col overflow-y-auto">
      {#each details.leads as lead}
        <div class="-mx-2 flex items-center gap-3 rounded-fc-md border-b border-fc-border px-2 py-2.5 transition-colors last:border-0 hover:bg-fc-surface">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg-muted">
            <Icon icon="solar:user-linear" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-fc-sm font-medium text-fc-fg">
              {lead.businessName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.domain || 'Sans nom'}
            </p>
            <p class="truncate text-fc-xs text-fc-fg-muted">
              {lead.email || lead.domain || 'Aucune information de contact'}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge>
              {lead.status === 'HOT' ? 'Chaud' : lead.status === 'WARM' ? 'Tiède' : 'Froid'}
            </Badge>
            <span class="text-fc-xs text-fc-fg-muted">{lead.score}/100</span>
          </div>
        </div>
      {/each}
    </div>
  </Section>

  {#if details.status === 'FAILED'}
    <EmptyState
      icon={icons.warning}
      title="La chasse a échoué"
      description={details.error || "Aucun lead n'a pu être collecté. Vous pouvez relancer la chasse pour réessayer."}
    >
      <Button
        icon={relaunching ? undefined : 'solar:restart-linear'}
        onclick={relaunchHunt}
        disabled={relaunching}
      >
        {#if relaunching}
          <Spinner size="sm" label="Relance" class="border-fc-accent-fg/30 border-t-fc-accent-fg" />
          Relance
        {:else}
          Relancer la chasse
        {/if}
      </Button>
    </EmptyState>
  {/if}
{/if}
