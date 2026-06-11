<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import HuntBanner from '$lib/components/leads/HuntBanner.svelte';
  import 'iconify-icon';

  const huntSessionId = $page.params.id;

  interface RunDetails {
    id: string;
    userId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    sources: string[];
    domain: string | null;
    huntType?: 'DOMAIN' | 'LOCAL_BUSINESS';
    filters: any;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    sourceStats: any;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
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
      createdAt: Date;
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
        updateDetails({ status: 'PROCESSING', startedAt: new Date() });
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
        updateDetails({ status: 'COMPLETED', progress: 100, completedAt: new Date() });
        pushEvent('hunt-completed', 'success', data.message || `Chasse terminée ! ${data.successfulLeads} leads trouvés`);
        toast.push(data.message || `Chasse terminée ! ${data.successfulLeads} leads trouvés`, 'success');
        await loadData();
      })
    );

    unsubscribers.push(
      ws.on('extraction-completed', async (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'COMPLETED', progress: 100, completedAt: new Date() });
        pushEvent('extraction-completed', 'success', data.message || `Extraction terminée ! ${data.successfulLeads} leads trouvés`);
        toast.push(data.message || 'Extraction terminée !', 'success');
        await loadData();
      })
    );

    unsubscribers.push(
      ws.on('hunt-cancelled', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'CANCELLED', completedAt: new Date() });
        pushEvent('hunt-cancelled', 'warning', 'Chasse annulée par l\'utilisateur');
      })
    );

    unsubscribers.push(
      ws.on('hunt-failed', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'FAILED', completedAt: new Date(), error: data.error });
        pushEvent('hunt-failed', 'error', data.message || `Chasse échouée : ${data.error}`);
        toast.push(data.message || 'Chasse échouée', 'error');
      })
    );

    unsubscribers.push(
      ws.on('extraction-failed', (data: any) => {
        if (data.huntSessionId !== huntSessionId) return;
        updateDetails({ status: 'FAILED', completedAt: new Date(), error: data.error });
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
      toast.push('Échec du chargement des détails', 'error');
      if (error?.message?.includes('not found')) goto('/app/hunts');
    } finally {
      loading = false;
    }
  }

  async function cancelHunt(id: string) {
    cancelling = true;
    try {
      await trpc.lead.hunt.cancel.mutate({ huntSessionId: id });
      toast.push('Chasse annulée', 'info');
    } catch (err: any) {
      toast.push(err?.message || "Échec de l'annulation", 'error');
    } finally {
      cancelling = false;
    }
  }

  async function relaunchHunt() {
    if (!details || !details.filters) {
      toast.push('Impossible de relancer cette chasse', 'error');
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
        toast.push('Type de chasse non reconnu', 'error');
        return;
      }

      toast.push('Nouvelle chasse lancée avec les mêmes paramètres !', 'success');
      goto('/app/hunts');
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la relance', 'error');
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

  const isProcessing = $derived(details?.status === 'PENDING' || details?.status === 'PROCESSING');

  const asBannerSession = $derived(details ? {
    id: details.id,
    huntType: details.huntType as 'DOMAIN' | 'LOCAL_BUSINESS' | undefined,
    sources: details.sources,
    speed: 1,
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

{#if loading}
  <div class="flex flex-col items-center justify-center h-full space-y-6" in:fade>
    <Spinner size="xl" />
  </div>
{:else if !details}
  <div class="flex flex-col items-center justify-center h-full space-y-4" in:fade>
    <p class="text-sm text-muted-foreground">Chasse introuvable</p>
    <button onclick={() => goto('/app/hunts')} class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85">
      Retour aux chasses
    </button>
  </div>
{:else}
  <div class="sticky top-0 z-20 bg-background border-b border-border px-6 py-3">
    <div class="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <button
          aria-label="Retour aux chasses"
          onclick={() => goto('/app/hunts')}
          class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors"
        >
          <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
        </button>

        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-foreground truncate">
            {#if details.sources?.includes('CSV_IMPORT')}
              Import CSV
            {:else if details.huntType === 'LOCAL_BUSINESS'}
              {details.filters?.location || 'Recherche locale'}
            {:else}
              {details.domain || 'Recherche large'}
            {/if}
          </h1>
          <p class="text-xs text-muted-foreground truncate">
            {#if details.sources?.includes('CSV_IMPORT')}
              Import depuis fichier CSV
            {:else if details.huntType === 'LOCAL_BUSINESS'}
              {details.filters?.categories?.join(', ') || 'Commerce local'}
            {:else}
              {#if details.sources && details.sources.length > 0}
                {#each details.sources as source, i}
                  {source === 'GOOGLE_MAPS' ? 'Google Maps' : source === 'OPENSTREETMAP' ? 'OpenStreetMap' : source}{i < details.sources.length - 1 ? ', ' : ''}
                {/each}
              {:else}
                Aucune source
              {/if}
            {/if}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {
          details.status === 'FAILED' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
        }">
          {details.status === 'COMPLETED' ? 'Terminée' :
           details.status === 'PROCESSING' ? 'En cours' :
           details.status === 'PENDING' ? 'En attente' :
           details.status === 'FAILED' ? 'Échouée' :
           details.status === 'CANCELLED' ? 'Annulée' : details.status}
          {#if details.status === 'PROCESSING'}
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-current ml-1 animate-pulse"></span>
          {/if}
        </span>

        {#if details.status === 'COMPLETED' || details.status === 'FAILED'}
          <button
            onclick={relaunchHunt}
            disabled={relaunching}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if relaunching}
              <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Relance
            {:else}
              <iconify-icon icon="solar:restart-linear" width="14"></iconify-icon>
              Relancer
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6" in:fade>

    <div class="space-y-6 max-w-5xl mx-auto">
      {#if isProcessing && asBannerSession}
        <div in:fly={{ y: -10, duration: 300 }}>
          <HuntBanner session={asBannerSession} onCancel={cancelHunt} {cancelling} />
        </div>
      {/if}

        <section class="rounded-xl border border-border bg-card p-6">
          <h2 class="text-lg font-semibold text-foreground mb-4">Configuration</h2>
          <div class="space-y-4 text-sm">

            <div>
              <p class="text-sm text-muted-foreground mb-2">Type de chasse</p>
              <div class="flex items-center gap-2">
                {#if details.huntType === 'LOCAL_BUSINESS'}
                  <div class="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    <iconify-icon icon="solar:map-point-linear" width="14"></iconify-icon>
                    <span>Commerce local</span>
                  </div>
                {:else}
                  <div class="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    <iconify-icon icon="solar:global-linear" width="14"></iconify-icon>
                    <span>Domaine</span>
                  </div>
                {/if}
              </div>
            </div>

            {#if details.huntType === 'LOCAL_BUSINESS' && details.filters}
              <div>
                <p class="text-sm text-muted-foreground mb-2">Paramètres</p>
                <div class="rounded-lg border border-border bg-background p-4 space-y-3 text-sm">
                  {#if details.filters.location}
                    <div class="flex justify-between items-start gap-2">
                      <span class="text-muted-foreground flex-shrink-0">Localisation</span>
                      <span class="font-medium text-foreground text-right">{details.filters.location}</span>
                    </div>
                  {/if}
                  {#if details.filters.categories?.length}
                    <div>
                      <p class="text-muted-foreground mb-2">Catégories</p>
                      <div class="flex flex-wrap gap-1.5">
                        {#each details.filters.categories as cat}
                          <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground capitalize">{cat.replace(/-/g, ' ')}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if details.filters.radius}
                    <div class="flex justify-between items-center">
                      <span class="text-muted-foreground">Rayon</span>
                      <span class="font-medium text-foreground">{details.filters.radius >= 1000 ? `${(details.filters.radius / 1000).toFixed(1)} km` : `${details.filters.radius} m`}</span>
                    </div>
                  {/if}
                  {#if details.filters.maxResults}
                    <div class="flex justify-between items-center">
                      <span class="text-muted-foreground">Max résultats</span>
                      <span class="font-medium text-foreground">{details.filters.maxResults}</span>
                    </div>
                  {/if}
                  {#if details.filters.hasWebsite !== undefined}
                    <div class="flex justify-between items-center">
                      <span class="text-muted-foreground">Avec site web</span>
                      <span class="font-medium text-foreground">{details.filters.hasWebsite ? 'Oui' : 'Non'}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if details.huntType !== 'LOCAL_BUSINESS'}
              {#if details.sources?.length > 0}
                <div>
                  <p class="text-sm text-muted-foreground mb-2">Sources</p>
                  <div class="flex flex-wrap gap-2">
                    {#each details.sources as source}
                      <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                        {source === 'GOOGLE_MAPS' ? 'Google Maps' :
                         source === 'OPENSTREETMAP' ? 'OpenStreetMap' :
                         source === 'HUNTER' ? 'Hunter' :
                         source === 'MANUAL' ? 'Manuel' :
                         source}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if details.filters && Object.keys(details.filters).some(k => details.filters[k] !== undefined && details.filters[k] !== null)}
                <div>
                  <p class="text-sm text-muted-foreground mb-2">Filtres</p>
                  <div class="rounded-lg border border-border bg-background p-4 space-y-3 text-sm">
                    {#if details.filters.type}
                      <div class="flex justify-between items-center">
                        <span class="text-muted-foreground">Type d'email</span>
                        <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground capitalize">{details.filters.type === 'personal' ? 'Personnel' : 'Générique'}</span>
                      </div>
                    {/if}
                    {#if details.filters.seniority?.length}
                      <div>
                        <p class="text-muted-foreground mb-1.5">Séniorité</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.seniority as s}
                            <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground capitalize">{s === 'junior' ? 'Junior' : s === 'senior' ? 'Senior' : 'Exécutif'}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.department?.length}
                      <div>
                        <p class="text-muted-foreground mb-1.5">Département</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.department as d}
                            <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground capitalize">{d}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.jobTitles?.length}
                      <div>
                        <p class="text-muted-foreground mb-1.5">Postes</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.jobTitles as t}
                            <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{t}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.verificationStatus?.length}
                      <div>
                        <p class="text-muted-foreground mb-1.5">Statut de vérification</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.verificationStatus as v}
                            <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground capitalize">{v === 'valid' ? 'Valide' : v === 'accept_all' ? 'Accepte tout' : 'Inconnu'}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.requiredFields?.length}
                      <div>
                        <p class="text-muted-foreground mb-1.5">Champs requis</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.requiredFields as f}
                            <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{f === 'full_name' ? 'Nom complet' : f === 'position' ? 'Poste' : 'Téléphone'}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.location && typeof details.filters.location === 'object'}
                      {@const loc = details.filters.location}
                      {#if loc.country || loc.city || loc.state || loc.continent || loc.businessRegion}
                        <div>
                          <p class="text-muted-foreground mb-1.5">Localisation</p>
                          <div class="space-y-1">
                            {#if loc.continent}
                              <div class="flex justify-between">
                                <span class="text-muted-foreground">Continent</span>
                                <span class="font-medium text-foreground">{loc.continent}</span>
                              </div>
                            {/if}
                            {#if loc.businessRegion}
                              <div class="flex justify-between">
                                <span class="text-muted-foreground">Région</span>
                                <span class="font-medium text-foreground">{loc.businessRegion}</span>
                              </div>
                            {/if}
                            {#if loc.country}
                              <div class="flex justify-between">
                                <span class="text-muted-foreground">Pays</span>
                                <span class="font-medium text-foreground">{loc.country}</span>
                              </div>
                            {/if}
                            {#if loc.state}
                              <div class="flex justify-between">
                                <span class="text-muted-foreground">État / Région</span>
                                <span class="font-medium text-foreground">{loc.state}</span>
                              </div>
                            {/if}
                            {#if loc.city}
                              <div class="flex justify-between">
                                <span class="text-muted-foreground">Ville</span>
                                <span class="font-medium text-foreground">{loc.city}</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/if}
            {/if}

            {#if details.sourceStats && typeof details.sourceStats === 'object' && Object.keys(details.sourceStats).length > 0}
              <div>
                <p class="text-sm text-muted-foreground mb-2">Performance des sources</p>
                <div class="space-y-2">
                  {#each Object.entries(details.sourceStats) as [source, stats]}
                    <div class="rounded-lg border border-border bg-background p-4">
                      <p class="font-medium text-foreground mb-2 text-sm">{source}</p>
                      <div class="space-y-1 text-sm">
                        <div class="flex justify-between">
                          <span class="text-muted-foreground">Leads</span>
                          <span class="font-medium text-foreground">{(stats as any).leads || 0}</span>
                        </div>
                        {#if (stats as any).errors > 0}
                          <div class="flex justify-between">
                            <span class="text-muted-foreground">Erreurs</span>
                            <span class="font-medium text-foreground">{(stats as any).errors}</span>
                          </div>
                        {/if}
                        {#if (stats as any).rateLimited}
                          <div class="flex justify-between">
                            <span class="text-muted-foreground">Limite dépassée</span>
                            <span class="font-medium text-foreground">Oui</span>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div>
              <p class="text-sm text-muted-foreground mb-2">Dates</p>
              <div class="rounded-lg border border-border bg-background p-4 space-y-3 text-sm">
                <div class="flex justify-between items-center">
                  <span class="text-muted-foreground">Créée le</span>
                  <span class="font-medium text-foreground">{new Date(details.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                {#if details.startedAt}
                  <div class="flex justify-between items-center">
                    <span class="text-muted-foreground">Démarrée le</span>
                    <span class="font-medium text-foreground">{new Date(details.startedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                {/if}
                {#if details.completedAt}
                  <div class="flex justify-between items-center">
                    <span class="text-muted-foreground">Terminée le</span>
                    <span class="font-medium text-foreground">{new Date(details.completedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                {/if}
              </div>
            </div>

            {#if details.error}
              <div class="rounded-lg bg-destructive/10 p-4">
                <div class="flex items-start gap-2">
                  <iconify-icon icon="solar:danger-linear" width="16" class="text-destructive flex-shrink-0 mt-0.5"></iconify-icon>
                  <p class="text-sm text-destructive">{details.error}</p>
                </div>
              </div>
            {/if}
          </div>
        </section>

        {#if discoveredItems.length > 0}

        <section class="rounded-xl border border-border bg-card p-6">
          <h2 class="text-lg font-semibold text-foreground mb-4">Stats</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            {#each [
              { label: 'Total', value: details.stats.totalLeads, icon: 'solar:users-group-rounded-linear' },
              { label: 'Chaud', value: details.stats.hotLeads, icon: 'solar:fire-linear' },
              { label: 'Tiède', value: details.stats.warmLeads, icon: 'solar:sun-2-linear' },
              { label: 'Froid', value: details.stats.coldLeads, icon: 'solar:snowflake-linear' },
            ] as stat}
              <div class="rounded-lg border border-border bg-background p-4">
                <div class="flex items-center gap-2 mb-2">
                  <iconify-icon icon={stat.icon} class="text-muted-foreground" width="16"></iconify-icon>
                  <p class="text-sm text-muted-foreground">{stat.label}</p>
                </div>
                <p class="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
              </div>
            {/each}
          </div>
          <div class="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
            <div>
              <p class="text-sm text-muted-foreground mb-1">Taux</p>
              <p class="text-lg font-semibold text-foreground">{details.stats.successRate.toFixed(0)}%</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground mb-1">Score</p>
              <p class="text-lg font-semibold text-foreground">{details.stats.averageScore.toFixed(0)}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground mb-1">Durée</p>
              <p class="text-lg font-semibold text-foreground">{formatDuration(details.stats.duration)}</p>
            </div>
          </div>
        </section>
        {/if}

        {#if isProcessing || liveEvents.length > 0}
          <section class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="p-6 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <h2 class="text-lg font-semibold text-foreground">Flux en direct</h2>
                {#if isProcessing}
                  <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">En direct</span>
                {/if}
              </div>
              <button
                onclick={() => { autoScroll = !autoScroll; }}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                {autoScroll ? 'Défilement auto' : 'En pause'}
              </button>
            </div>

            <div bind:this={eventsContainer} class="px-6 pb-6 space-y-2 max-h-[400px] overflow-y-auto">
              {#if liveEvents.length === 0}
                <div class="flex flex-col items-center justify-center py-12 space-y-3">
                  <iconify-icon icon="solar:hourglass-linear" width="24" class="text-muted-foreground"></iconify-icon>
                  <p class="text-sm text-muted-foreground">En attente d'événements...</p>
                </div>
              {:else}
                {#each liveEvents as event (event.id)}
                  <div class="flex items-start gap-3 py-2 border-b border-border last:border-0" in:fly={{ y: -8, duration: 200 }}>
                    <div class="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full {event.level === 'error' ? 'bg-destructive' : 'bg-foreground'}"></div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-foreground leading-snug">{event.message}</p>
                    </div>
                    <span class="flex-shrink-0 text-xs font-mono text-muted-foreground">{formatTs(event.timestamp)}</span>
                  </div>
                {/each}
              {/if}
            </div>
          </section>
        {:else if details.status === 'FAILED'}
          <section class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="p-6 pb-4 flex items-center gap-3">
              <h2 class="text-lg font-semibold text-foreground">Domaines découverts</h2>
              <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{discoveredItems.length}</span>
            </div>
            <div class="px-6 pb-6 space-y-2 max-h-[400px] overflow-y-auto">
              {#each discoveredItems as item (item.index)}
                <div class="flex items-center gap-4 py-2.5 border-b border-border last:border-0" in:fly={{ y: -6, duration: 150 }}>
                  <span class="text-xs font-mono text-muted-foreground w-8 flex-shrink-0">#{item.index}</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-foreground truncate text-sm">{item.organization || item.domain}</p>
                    {#if item.organization}
                      <p class="text-xs text-muted-foreground truncate">{item.domain}</p>
                    {/if}
                  </div>
                  {#if item.industry}
                    <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground flex-shrink-0 truncate max-w-[120px]">{item.industry}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <section class="rounded-xl border border-border bg-card overflow-hidden">
          <div class="p-6 pb-4 flex items-center gap-3">
            <h2 class="text-lg font-semibold text-foreground">Leads</h2>
            <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{details.leads.length}</span>
          </div>
          <div class="px-6 pb-6 space-y-1 max-h-[500px] overflow-y-auto">
            {#each details.leads as lead}
              <div class="flex items-center gap-3 py-2.5 border-b border-border last:border-0 transition-colors hover:bg-muted/40 rounded-lg px-2 -mx-2">
                <div class="size-9 rounded-lg border border-border flex items-center justify-center flex-shrink-0">
                  <iconify-icon icon="solar:user-linear" width="16" class="text-muted-foreground"></iconify-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-foreground text-sm truncate">
                    {lead.businessName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.domain || 'Sans nom'}
                  </p>
                  <p class="text-xs text-muted-foreground truncate">
                    {lead.email || lead.domain || 'Aucune information de contact'}
                  </p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {lead.status === 'HOT' ? 'Chaud' :
                     lead.status === 'WARM' ? 'Tiède' :
                     'Froid'}
                  </span>
                  <span class="text-xs text-muted-foreground">{lead.score}/100</span>
                </div>
              </div>
            {/each}
          </div>
        </section>

        {#if details.status === 'FAILED'}
        <section class="rounded-xl border border-border bg-card overflow-hidden">
          <div class="p-6 text-center">
            <div class="size-12 rounded-lg border border-border flex items-center justify-center mx-auto mb-4">
              <iconify-icon icon="solar:danger-linear" width="24" class="text-foreground"></iconify-icon>
            </div>
            <h3 class="text-lg font-semibold text-foreground mb-2">La chasse a échoué</h3>
            <p class="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {#if details.error}
                {details.error}
              {:else}
                Aucun lead n'a pu être collecté. Vous pouvez relancer la chasse pour réessayer.
              {/if}
            </p>
            <button
              onclick={relaunchHunt}
              disabled={relaunching}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if relaunching}
                <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                Relance
              {:else}
                <iconify-icon icon="solar:restart-linear" width="14"></iconify-icon>
                Relancer la chasse
              {/if}
            </button>
          </div>
        </section>
        {/if}

      </div>

  </div>
{/if}
