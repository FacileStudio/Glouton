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
      } else if (filters.domain) {
        await trpc.lead.hunt.start.mutate({
          domain: filters.domain,
          positions: filters.positions || [],
          departments: filters.departments || [],
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

  function getLevelStyle(level: string) {
    switch (level) {
      case 'success': return { dot: 'bg-green-400', text: 'text-green-700', bg: 'bg-green-50' };
      case 'warning': return { dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50' };
      case 'error': return { dot: 'bg-red-400', text: 'text-red-700', bg: 'bg-red-50' };
      default: return { dot: 'bg-blue-400', text: 'text-blue-700', bg: 'bg-blue-50' };
    }
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
  <div class="flex flex-col items-center justify-center h-full space-y-6 selection:text-black font-sans" style="background-color: #FAF7F5;" in:fade>
    <Spinner size="xl" />
  </div>
{:else if !details}
  <div class="flex flex-col items-center justify-center h-full space-y-6 selection:text-black font-sans" style="background-color: #FAF7F5;" in:fade>
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">Chasse introuvable</p>
    <button onclick={() => goto('/app/hunts')} class="px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors">
      Retour aux chasses
    </button>
  </div>
{:else}
  <div class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-200 px-6 py-4">
    <div class="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
      <div class="flex items-center gap-4 min-w-0">
        <button
          onclick={() => goto('/app/hunts')}
          class="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
        >
          <iconify-icon icon="solar:arrow-left-bold" width="18"></iconify-icon>
        </button>

        <div class="w-10 h-10 flex-shrink-0 rounded-xl border border-neutral-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
          <iconify-icon icon="solar:rocket-2-bold" width="20" class="text-neutral-700"></iconify-icon>
        </div>

        <div class="min-w-0">
          <h1 class="text-xl font-black tracking-tight text-neutral-900 truncate">
            {#if details.sources?.includes('CSV_IMPORT')}
              Import CSV
            {:else if details.huntType === 'LOCAL_BUSINESS'}
              {details.filters?.location || 'Recherche locale'}
            {:else}
              {details.domain || 'Recherche large'}
            {/if}
          </h1>
          <p class="text-sm text-neutral-500 font-medium truncate">
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

      <div class="flex items-center gap-3 flex-shrink-0">
        <span class="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide {
          details.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
          details.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700' :
          details.status === 'PENDING' ? 'bg-blue-100 text-blue-700' :
          details.status === 'FAILED' ? 'bg-red-100 text-red-700' :
          'bg-neutral-100 text-neutral-700'
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
            class="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if relaunching}
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Relance...
            {:else}
              <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
              Relancer
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <div class="p-6 lg:p-12 max-w-[1800px] mx-auto space-y-8 selection:text-black font-sans" style="background-color: #FAF7F5;" in:fade>

    <div class="space-y-8 max-w-5xl mx-auto">
      {#if isProcessing && asBannerSession}
        <div in:fly={{ y: -10, duration: 300 }}>
          <HuntBanner session={asBannerSession} onCancel={cancelHunt} {cancelling} />
        </div>
      {/if}

        <section class="bg-white rounded-2xl border-2 border-neutral-200 p-8">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:settings-bold" width="20" class="text-white"></iconify-icon>
            </div>
            <h2 class="text-xl font-black tracking-tight">Configuration</h2>
          </div>
          <div class="space-y-4 text-sm">

            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Type de chasse</p>
              <div class="flex items-center gap-2">
                {#if details.huntType === 'LOCAL_BUSINESS'}
                  <div class="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <iconify-icon icon="solar:map-point-bold" width="16" class="text-emerald-600"></iconify-icon>
                    <span class="text-xs font-black text-emerald-700 uppercase">Commerce local</span>
                  </div>
                {:else}
                  <div class="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                    <iconify-icon icon="solar:global-bold" width="16" class="text-blue-600"></iconify-icon>
                    <span class="text-xs font-black text-blue-700 uppercase">Domaine</span>
                  </div>
                {/if}
              </div>
            </div>

            {#if details.huntType === 'LOCAL_BUSINESS' && details.filters}
              <div>
                <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Paramètres</p>
                <div class="bg-neutral-50 rounded-xl p-4 space-y-3 text-xs">
                  {#if details.filters.location}
                    <div class="flex justify-between items-start gap-2">
                      <span class="text-neutral-500 font-medium flex-shrink-0">Localisation</span>
                      <span class="font-bold text-right">{details.filters.location}</span>
                    </div>
                  {/if}
                  {#if details.filters.categories?.length}
                    <div>
                      <p class="text-neutral-500 font-medium mb-2">Catégories</p>
                      <div class="flex flex-wrap gap-1.5">
                        {#each details.filters.categories as cat}
                          <span class="px-2 py-1 bg-white border border-neutral-200 rounded-lg font-medium capitalize">{cat.replace(/-/g, ' ')}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if details.filters.radius}
                    <div class="flex justify-between items-center">
                      <span class="text-neutral-500 font-medium">Rayon</span>
                      <span class="font-bold">{details.filters.radius >= 1000 ? `${(details.filters.radius / 1000).toFixed(1)} km` : `${details.filters.radius} m`}</span>
                    </div>
                  {/if}
                  {#if details.filters.maxResults}
                    <div class="flex justify-between items-center">
                      <span class="text-neutral-500 font-medium">Max résultats</span>
                      <span class="font-bold">{details.filters.maxResults}</span>
                    </div>
                  {/if}
                  {#if details.filters.hasWebsite !== undefined}
                    <div class="flex justify-between items-center">
                      <span class="text-neutral-500 font-medium">Avec site web</span>
                      <span class="font-bold {details.filters.hasWebsite ? 'text-green-600' : 'text-red-500'}">{details.filters.hasWebsite ? 'Oui' : 'Non'}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if details.huntType !== 'LOCAL_BUSINESS'}
              {#if details.sources?.length > 0}
                <div>
                  <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Sources</p>
                  <div class="flex flex-wrap gap-2">
                    {#each details.sources as source}
                      <span class="px-3 py-1.5 bg-neutral-100 text-neutral-800 rounded-lg font-bold text-xs">
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
                  <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Filtres</p>
                  <div class="bg-neutral-50 rounded-xl p-4 space-y-3 text-xs">
                    {#if details.filters.type}
                      <div class="flex justify-between items-center">
                        <span class="text-neutral-500 font-medium">Type d'email</span>
                        <span class="px-2 py-0.5 bg-white border border-neutral-200 rounded-lg font-bold capitalize">{details.filters.type === 'personal' ? 'Personnel' : 'Générique'}</span>
                      </div>
                    {/if}
                    {#if details.filters.seniority?.length}
                      <div>
                        <p class="text-neutral-500 font-medium mb-1.5">Séniorité</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.seniority as s}
                            <span class="px-2 py-1 bg-white border border-neutral-200 rounded-lg font-medium capitalize">{s === 'junior' ? 'Junior' : s === 'senior' ? 'Senior' : 'Exécutif'}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.department?.length}
                      <div>
                        <p class="text-neutral-500 font-medium mb-1.5">Département</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.department as d}
                            <span class="px-2 py-1 bg-white border border-neutral-200 rounded-lg font-medium capitalize">{d}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.jobTitles?.length}
                      <div>
                        <p class="text-neutral-500 font-medium mb-1.5">Postes</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.jobTitles as t}
                            <span class="px-2 py-1 bg-white border border-neutral-200 rounded-lg font-medium">{t}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.verificationStatus?.length}
                      <div>
                        <p class="text-neutral-500 font-medium mb-1.5">Statut de vérification</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.verificationStatus as v}
                            <span class="px-2 py-1 bg-white border border-neutral-200 rounded-lg font-medium capitalize">{v === 'valid' ? 'Valide' : v === 'accept_all' ? 'Accepte tout' : 'Inconnu'}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.requiredFields?.length}
                      <div>
                        <p class="text-neutral-500 font-medium mb-1.5">Champs requis</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each details.filters.requiredFields as f}
                            <span class="px-2 py-1 bg-white border border-neutral-200 rounded-lg font-medium">{f === 'full_name' ? 'Nom complet' : f === 'position' ? 'Poste' : 'Téléphone'}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if details.filters.location && typeof details.filters.location === 'object'}
                      {@const loc = details.filters.location}
                      {#if loc.country || loc.city || loc.state || loc.continent || loc.businessRegion}
                        <div>
                          <p class="text-neutral-500 font-medium mb-1.5">Localisation</p>
                          <div class="space-y-1">
                            {#if loc.continent}
                              <div class="flex justify-between">
                                <span class="text-neutral-400">Continent</span>
                                <span class="font-bold">{loc.continent}</span>
                              </div>
                            {/if}
                            {#if loc.businessRegion}
                              <div class="flex justify-between">
                                <span class="text-neutral-400">Région</span>
                                <span class="font-bold">{loc.businessRegion}</span>
                              </div>
                            {/if}
                            {#if loc.country}
                              <div class="flex justify-between">
                                <span class="text-neutral-400">Pays</span>
                                <span class="font-bold">{loc.country}</span>
                              </div>
                            {/if}
                            {#if loc.state}
                              <div class="flex justify-between">
                                <span class="text-neutral-400">État / Région</span>
                                <span class="font-bold">{loc.state}</span>
                              </div>
                            {/if}
                            {#if loc.city}
                              <div class="flex justify-between">
                                <span class="text-neutral-400">Ville</span>
                                <span class="font-bold">{loc.city}</span>
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
                <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Performance des sources</p>
                <div class="space-y-2">
                  {#each Object.entries(details.sourceStats) as [source, stats]}
                    <div class="bg-neutral-50 rounded-xl p-4">
                      <p class="font-black text-neutral-800 mb-2 text-xs uppercase">{source}</p>
                      <div class="space-y-1 text-xs">
                        <div class="flex justify-between">
                          <span class="text-neutral-600">Leads</span>
                          <span class="font-bold text-green-600">{(stats as any).leads || 0}</span>
                        </div>
                        {#if (stats as any).errors > 0}
                          <div class="flex justify-between">
                            <span class="text-neutral-600">Erreurs</span>
                            <span class="font-bold text-red-600">{(stats as any).errors}</span>
                          </div>
                        {/if}
                        {#if (stats as any).rateLimited}
                          <div class="flex justify-between">
                            <span class="text-neutral-600">Limite dépassée</span>
                            <span class="font-bold text-orange-600">Oui</span>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-2">Dates</p>
              <div class="bg-neutral-50 rounded-xl p-4 space-y-3 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-neutral-500 font-medium">Créée le</span>
                  <span class="font-bold">{new Date(details.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                {#if details.startedAt}
                  <div class="flex justify-between items-center">
                    <span class="text-neutral-500 font-medium">Démarrée le</span>
                    <span class="font-bold">{new Date(details.startedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                {/if}
                {#if details.completedAt}
                  <div class="flex justify-between items-center">
                    <span class="text-neutral-500 font-medium">Terminée le</span>
                    <span class="font-bold">{new Date(details.completedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                {/if}
              </div>
            </div>

            {#if details.error}
              <div class="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                <div class="flex items-start gap-2">
                  <iconify-icon icon="solar:danger-bold" width="18" class="text-red-600 flex-shrink-0 mt-0.5"></iconify-icon>
                  <p class="text-xs font-medium text-red-700">{details.error}</p>
                </div>
              </div>
            {/if}
          </div>
        </section>

        {#if discoveredItems.length > 0}

        <section class="bg-white rounded-2xl border-2 border-neutral-200 p-8">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:chart-2-bold" width="20" class="text-white"></iconify-icon>
            </div>
            <h2 class="text-xl font-black tracking-tight">Stats</h2>
          </div>
          <div class="grid grid-cols-2 gap-3">
            {#each [
              { label: 'Total', value: details.stats.totalLeads, icon: 'solar:users-group-rounded-bold', color: 'text-neutral-800' },
              { label: 'Chaud', value: details.stats.hotLeads, icon: 'solar:fire-bold', color: 'text-red-600' },
              { label: 'Tiède', value: details.stats.warmLeads, icon: 'solar:sun-2-bold', color: 'text-orange-500' },
              { label: 'Froid', value: details.stats.coldLeads, icon: 'solar:snowflake-bold', color: 'text-blue-400' },
            ] as stat}
              <div class="bg-neutral-50 rounded-2xl p-4">
                <div class="flex items-center gap-1.5 mb-2">
                  <iconify-icon icon={stat.icon} class={stat.color} width="16"></iconify-icon>
                  <p class="text-xs font-bold text-neutral-500 uppercase">{stat.label}</p>
                </div>
                <p class="text-2xl font-black">{stat.value}</p>
              </div>
            {/each}
          </div>
          <div class="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-100">
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Taux</p>
              <p class="text-lg font-black text-green-600">{details.stats.successRate.toFixed(0)}%</p>
            </div>
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Score</p>
              <p class="text-lg font-black text-yellow-600">{details.stats.averageScore.toFixed(0)}</p>
            </div>
            <div>
              <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Durée</p>
              <p class="text-lg font-black">{formatDuration(details.stats.duration)}</p>
            </div>
          </div>
        </section>
        {/if}

        {#if isProcessing || liveEvents.length > 0}
          <section class="bg-white rounded-2xl border-2 border-neutral-200 overflow-hidden">
            <div class="p-8 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                  <iconify-icon icon="solar:pulse-bold" width="20" class="text-white"></iconify-icon>
                </div>
                <h2 class="text-xl font-black tracking-tight">Flux en direct</h2>
                {#if isProcessing}
                  <span class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-black animate-pulse">EN DIRECT</span>
                {/if}
              </div>
              <button
                onclick={() => { autoScroll = !autoScroll; }}
                class="px-4 py-2 rounded-xl text-xs font-bold {autoScroll ? 'bg-yellow-100 text-yellow-700' : 'bg-neutral-100 text-neutral-600'} hover:opacity-80 transition-opacity"
              >
                {autoScroll ? 'Défilement auto' : 'En pause'}
              </button>
            </div>

            <div bind:this={eventsContainer} class="px-8 pb-8 space-y-2 max-h-[400px] overflow-y-auto">
              {#if liveEvents.length === 0}
                <div class="flex flex-col items-center justify-center py-12 space-y-3">
                  <iconify-icon icon="solar:hourglass-bold" width="36" class="text-neutral-300"></iconify-icon>
                  <p class="text-sm font-bold text-neutral-400">En attente d'événements...</p>
                </div>
              {:else}
                {#each liveEvents as event (event.id)}
                  {@const style = getLevelStyle(event.level)}
                  <div class="flex items-start gap-3 py-2 border-b border-neutral-100 last:border-0" in:fly={{ y: -8, duration: 200 }}>
                    <div class="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full {style.dot}"></div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-neutral-900 leading-snug">{event.message}</p>
                    </div>
                    <span class="flex-shrink-0 text-xs font-mono text-neutral-400">{formatTs(event.timestamp)}</span>
                  </div>
                {/each}
              {/if}
            </div>
          </section>
        {:else if details.status === 'FAILED'}
          <section class="bg-white rounded-2xl border-2 border-neutral-200 overflow-hidden">
            <div class="p-8 pb-4 flex items-center gap-3">
              <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                <iconify-icon icon="solar:target-bold" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-xl font-black tracking-tight">Domaines découverts</h2>
              <span class="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-lg text-xs font-black">{discoveredItems.length}</span>
            </div>
            <div class="px-8 pb-8 space-y-2 max-h-[400px] overflow-y-auto">
              {#each discoveredItems as item (item.index)}
                <div class="flex items-center gap-4 py-2.5 border-b border-neutral-100 last:border-0" in:fly={{ y: -6, duration: 150 }}>
                  <span class="text-xs font-mono text-neutral-400 w-8 flex-shrink-0">#{item.index}</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-neutral-900 truncate text-sm">{item.organization || item.domain}</p>
                    {#if item.organization}
                      <p class="text-xs text-neutral-500 truncate">{item.domain}</p>
                    {/if}
                  </div>
                  {#if item.industry}
                    <span class="text-xs px-2 py-1 bg-neutral-100 text-neutral-600 rounded-lg font-medium flex-shrink-0 truncate max-w-[120px]">{item.industry}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <section class="bg-white rounded-2xl border-2 border-neutral-200 overflow-hidden">
          <div class="p-8 pb-4 flex items-center gap-3">
            <div class="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <iconify-icon icon="solar:users-group-rounded-bold" width="20" class="text-white"></iconify-icon>
            </div>
            <h2 class="text-xl font-black tracking-tight">Leads</h2>
            <span class="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-lg text-xs font-black">{details.leads.length}</span>
          </div>
          <div class="px-8 pb-8 space-y-2 max-h-[500px] overflow-y-auto">
            {#each details.leads as lead}
              <div class="flex items-center gap-4 py-2.5 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors rounded-xl px-2 -mx-2">
                <div class="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
                  <iconify-icon icon="solar:user-bold" width="18" class="text-neutral-500"></iconify-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-neutral-900 text-sm truncate">
                    {lead.businessName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.domain || 'Sans nom'}
                  </p>
                  <p class="text-xs text-neutral-500 truncate">
                    {lead.email || lead.domain || 'Aucune information de contact'}
                  </p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="text-xs px-2 py-1 rounded-lg font-black {
                    lead.status === 'HOT' ? 'bg-red-100 text-red-700' :
                    lead.status === 'WARM' ? 'bg-orange-100 text-orange-700' :
                    'bg-blue-100 text-blue-700'
                  }">
                    {lead.status === 'HOT' ? 'Chaud' :
                     lead.status === 'WARM' ? 'Tiède' :
                     'Froid'}
                  </span>
                  <span class="text-xs font-bold text-neutral-400">{lead.score}/100</span>
                </div>
              </div>
            {/each}
          </div>
        </section>

        {#if details.status === 'FAILED'}
        <section class="bg-white rounded-2xl border-2 border-red-200 overflow-hidden">
          <div class="p-8 text-center">
            <div class="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <iconify-icon icon="solar:danger-bold" width="32" class="text-red-600"></iconify-icon>
            </div>
            <h3 class="text-xl font-black text-neutral-900 mb-2">La chasse a échoué</h3>
            <p class="text-sm text-neutral-600 mb-6 max-w-md mx-auto">
              {#if details.error}
                {details.error}
              {:else}
                Aucun lead n'a pu être collecté. Vous pouvez relancer la chasse pour réessayer.
              {/if}
            </p>
            <button
              onclick={relaunchHunt}
              disabled={relaunching}
              class="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-black text-white hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if relaunching}
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Relance...
              {:else}
                <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
                Relancer la chasse
              {/if}
            </button>
          </div>
        </section>
        {/if}

      </div>

  </div>
{/if}
