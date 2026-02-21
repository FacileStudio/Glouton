<script lang="ts">
  import { goto, afterNavigate } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { FILTER_PRESETS, getPresetById } from '@repo/lead-sources';
  import { onMount } from 'svelte';
  import { Tabs } from '@repo/ui';
  import LocationPickerMap from '$lib/components/LocationPickerMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());
  let settingsUrl = $derived(teamId ? `/app/teams/${teamId}/settings` : '/app/settings');

  let hasGoogleMapsKey = $state(false);

  let mapComponent: LocationPickerMap;
  let showMap = $state(false);

  let huntType = $state<'domain' | 'local'>('domain');
  let loading = $state(false);
  let loadingLocation = $state(false);
  let selectedPresetId = $state<string | null>(null);
  let showPresets = $state(true);
  let configuredSourcesCount = $state(0);
  let userLocation = $state<{ city?: string; country?: string; countryCode?: string; state?: string; raw?: any } | null>(null);

  let localBusinessFilters = $state({
    categories: [] as string[],
    hasWebsite: 'all' as 'all' | 'with' | 'without',
    radius: 5,
    maxResults: 100,
    location: {
      city: '',
      country: '',
      coordinates: null as { lat: number; lng: number } | null,
    },
  });

  const businessCategories = [
    { value: 'restaurant', label: 'Restaurants & Cafés', icon: 'solar:chef-hat-bold' },
    { value: 'retail', label: 'Commerces de détail', icon: 'solar:shop-bold' },
    { value: 'service', label: 'Services', icon: 'solar:case-round-bold' },
    { value: 'healthcare', label: 'Santé', icon: 'solar:heart-bold' },
    { value: 'fitness', label: 'Fitness & Bien-être', icon: 'solar:dumbbell-bold' },
    { value: 'beauty', label: 'Beauté & Spa', icon: 'solar:scissors-bold' },
    { value: 'automotive', label: 'Automobile', icon: 'solar:wheel-bold' },
    { value: 'professional-services', label: 'Services professionnels', icon: 'solar:user-id-bold' },
    { value: 'hotel', label: 'Hôtels & Hébergement', icon: 'solar:bed-bold' },
    { value: 'education', label: 'Éducation', icon: 'solar:book-bold' },
  ];

  let filters = $state({
    type: undefined as 'personal' | 'generic' | undefined,
    seniority: [] as string[],
    department: [] as string[],
    jobTitles: [] as string[],
    requiredFields: [] as string[],
    verificationStatus: [] as string[],
    location: {
      country: '',
      city: '',
    },
  });

  const departments = [
    'executive',
    'it',
    'finance',
    'management',
    'sales',
    'legal',
    'support',
    'hr',
    'marketing',
    'communication',
    'education',
    'design',
    'health',
    'operations',
  ];

  const seniorityLevels = ['junior', 'senior', 'executive'];

  let jobTitleInput = $state('');

  /**
   * detectLocationFromGPS
   */
  async function detectLocationFromGPS() {
    /**
     * if
     */
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported by your browser');
    }

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 15000,
        maximumAge: 0,
        enableHighAccuracy: true,
      });
    });

    const { latitude, longitude } = position.coords;
    console.log(`GPS coordinates: ${latitude}, ${longitude}`);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Glouton-Lead-Hunter/1.0',
        },
      },
    );

    /**
     * if
     */
    if (!response.ok) {
      throw new Error('Failed to reverse geocode coordinates');
    }

    const data = await response.json();
    console.log('Reverse geocode data:', data);

    return {
      city:
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.municipality ||
        data.address?.county,
      country: data.address?.country,
      countryCode: data.address?.country_code?.toUpperCase(),
      state: data.address?.state,
      raw: data,
    };
  }

  /**
   * detectLocationFromIP
   */
  async function detectLocationFromIP() {
    const response = await fetch('https://ipapi.co/json/');
    /**
     * if
     */
    if (!response.ok) {
      throw new Error('Failed to detect location from IP');
    }

    const data = await response.json();
    console.log('IP geolocation data:', data);

    return {
      city: data.city,
      country: data.country_name,
      countryCode: data.country_code,
      state: data.region,
      raw: data,
    };
  }

  /**
   * detectLocation
   */
  async function detectLocation(method: 'gps' | 'ip' | 'auto' = 'auto') {
    loadingLocation = true;
    userLocation = null;

    try {
      let location;

      /**
       * if
       */
      if (method === 'gps' || method === 'auto') {
        try {
          location = await detectLocationFromGPS();
          console.log('GPS detection successful:', location);
        } catch (gpsError) {
          console.warn('GPS detection failed:', gpsError);

          /**
           * if
           */
          if (method === 'gps') {
            throw gpsError;
          }

          console.log('Falling back to IP-based detection...');
          location = await detectLocationFromIP();
          console.log('IP detection successful:', location);
        }
      } else {
        location = await detectLocationFromIP();
        console.log('IP detection successful:', location);
      }

      userLocation = location;

      if (location.city) {
        filters.location.city = location.city;
      }
      if (location.countryCode) {
        filters.location.country = location.countryCode;
      }

      if (location.city) {
        localBusinessFilters.location.city = location.city;
      }
      if (location.countryCode) {
        localBusinessFilters.location.country = location.countryCode;
      }

      const cityName = location.city || 'Unknown city';
      const countryName = location.country || 'Unknown country';

      toast.push(`Localisation détectée : ${cityName}, ${countryName}`, 'success');
    } catch (error: any) {
      console.error('Error detecting location:', error);

      const errorMessage =
        error?.message === 'User denied Geolocation'
          ? 'Accès à la localisation refusé. Cliquez sur "Détecter la localisation" pour réessayer ou saisissez-la manuellement.'
          : 'Impossible de détecter la localisation. Veuillez la saisir manuellement ou réessayer.';

      toast.push(errorMessage, 'info');
    } finally {
      loadingLocation = false;
    }
  }

  /**
   * applyPreset
   */
  function applyPreset(presetId: string) {
    const preset = getPresetById(presetId);
    /**
     * if
     */
    if (!preset) return;

    selectedPresetId = presetId;

    filters.type = preset.filters.type;
    filters.seniority = preset.filters.seniority || [];
    filters.department = preset.filters.department || [];
    filters.jobTitles = preset.filters.jobTitles || [];
    filters.requiredFields = preset.filters.requiredFields || [];
    filters.verificationStatus = preset.filters.verificationStatus || [];

    /**
     * if
     */
    if (preset.filters.location && !userLocation) {
      filters.location.country = preset.filters.location.country || '';
      filters.location.city = preset.filters.location.city || '';
    }

    toast.push(`Préréglage "${preset.name}" appliqué`, 'success');
    showPresets = false;
  }

  /**
   * addJobTitle
   */
  function addJobTitle() {
    /**
     * if
     */
    if (jobTitleInput.trim()) {
      filters.jobTitles = [...filters.jobTitles, jobTitleInput.trim()];
      jobTitleInput = '';
    }
  }

  /**
   * removeJobTitle
   */
  function removeJobTitle(title: string) {
    filters.jobTitles = filters.jobTitles.filter((t) => t !== title);
  }

  /**
   * startDomainHunt
   */
  async function startDomainHunt() {
    /**
     * if
     */
    if (configuredSourcesCount === 0) {
      toast.push('Veuillez configurer au moins une clé API dans les paramètres', 'error');
      /**
       * goto
       */
      goto(settingsUrl);
      return;
    }

    loading = true;
    try {
      const huntFilters = {
        type: filters.type,
        seniority: filters.seniority.length > 0 ? filters.seniority : undefined,
        department: filters.department.length > 0 ? filters.department : undefined,
        jobTitles: filters.jobTitles.length > 0 ? filters.jobTitles : undefined,
        requiredFields: filters.requiredFields.length > 0 ? filters.requiredFields : undefined,
        verificationStatus:
          filters.verificationStatus.length > 0 ? filters.verificationStatus : undefined,
        location:
          filters.location.country || filters.location.city
            ? {
                country: filters.location.country || undefined,
                city: filters.location.city || undefined,
              }
            : undefined,
      };

      const result = await trpc.lead.hunt.start.mutate({
        teamId,
        filters: huntFilters,
      });

      const huntSessionId = result?.huntSessionId;
      goto(huntSessionId ? `/app/hunts/${huntSessionId}` : '/app/hunts');
      toast.push(
        `Chasse lancée sur ${configuredSourcesCount} source${configuredSourcesCount > 1 ? 's' : ''} configurée${configuredSourcesCount > 1 ? 's' : ''} !`,
        'success',
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec du démarrage de la chasse';
      toast.push(errorMessage, 'error');
      console.error('Error starting hunt:', error);
    } finally {
      loading = false;
    }
  }

  async function startLocalBusinessHunt() {
    if (localBusinessFilters.categories.length === 0) {
      toast.push('Veuillez sélectionner au moins une catégorie d\'activité', 'error');
      return;
    }

    if (!localBusinessFilters.location.city && !localBusinessFilters.location.coordinates) {
      toast.push('Veuillez indiquer une localisation (ville ou GPS)', 'error');
      return;
    }

    loading = true;
    try {
      const locationString = localBusinessFilters.location.city
        ? `${localBusinessFilters.location.city}${localBusinessFilters.location.country ? ', ' + localBusinessFilters.location.country : ''}`
        : `${localBusinessFilters.location.coordinates?.lat},${localBusinessFilters.location.coordinates?.lng}`;

      const result = await trpc.lead.hunt.startLocalBusiness.mutate({
        teamId,
        location: locationString,
        categories: localBusinessFilters.categories,
        hasWebsite: localBusinessFilters.hasWebsite === 'with' ? true : localBusinessFilters.hasWebsite === 'without' ? false : undefined,
        radius: localBusinessFilters.radius * 1000,
        maxResults: localBusinessFilters.maxResults,
      });

      const huntSessionId = result?.huntSessionId;
      goto(huntSessionId ? `/app/hunts/${huntSessionId}` : '/app/hunts');
      const categoryCount = localBusinessFilters.categories.length;
      toast.push(
        `Chasse locale démarrée pour ${categoryCount} catégorie${categoryCount > 1 ? 's' : ''} !`,
        'success',
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec du démarrage de la chasse locale';
      toast.push(errorMessage, 'error');
      console.error('Error starting local business hunt:', error);
    } finally {
      loading = false;
    }
  }

  /**
   * startHunt
   */
  function startHunt() {
    /**
     * if
     */
    if (huntType === 'domain') {
      return startDomainHunt();
    } else {
      return startLocalBusinessHunt();
    }
  }

  /**
   * fetchConfiguredSources
   */
  async function fetchConfiguredSources() {
    try {
      const sources = await trpc.user.getConfiguredSources.query(
        teamId ? { teamId } : undefined
      );
      console.log('Configured sources:', sources);
      configuredSourcesCount = sources.length;
      hasGoogleMapsKey = sources.includes('GOOGLE_MAPS');
      console.log('configuredSourcesCount:', configuredSourcesCount);
      console.log('hasGoogleMapsKey:', hasGoogleMapsKey);

      /**
       * if
       */
      if (configuredSourcesCount === 0) {
        toast.push('Aucune clé API configurée. Veuillez les ajouter dans les paramètres.', 'info');
      }
    } catch (error) {
      console.error('Error fetching configured sources:', error);
    }
  }

  /**
   * onMount
   */
  onMount(async () => {
    await fetchConfiguredSources();
    /**
     * detectLocation
     */
    detectLocation();
  });

  /**
   * afterNavigate
   */
  afterNavigate(async () => {
    await fetchConfiguredSources();
  });
</script>

<div class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-200 px-6 py-4">
  <div class="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
    <div class="flex items-center gap-4 min-w-0">
      <a
        href="/app/hunts"
        class="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
      >
        <iconify-icon icon="solar:arrow-left-bold" width="18"></iconify-icon>
      </a>

      <div class="w-10 h-10 flex-shrink-0 rounded-xl border border-neutral-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
        <iconify-icon icon="solar:rocket-2-bold" width="20" class="text-neutral-700"></iconify-icon>
      </div>

      <div class="min-w-0">
        <h1 class="text-xl font-black tracking-tight text-neutral-900 truncate">
          Nouvelle Chasse
        </h1>
        <p class="text-sm text-neutral-500 font-medium truncate">
          {#if huntType === 'domain'}
            {#if configuredSourcesCount > 0}
              {configuredSourcesCount} source{configuredSourcesCount > 1 ? 's' : ''} configurée{configuredSourcesCount > 1 ? 's' : ''}
            {:else}
              Configurez des clés API dans les paramètres
            {/if}
          {:else}
            Recherche locale par localisation
          {/if}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3 flex-shrink-0">
      <a
        href="/app/hunts"
        class="px-5 py-2.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
      >
        <iconify-icon icon="solar:close-circle-bold" width="16"></iconify-icon>
        Annuler
      </a>
    </div>
  </div>
</div>

<div class="min-h-screen p-6 lg:p-12" style="background-color: #FAF7F5;">
  <div class="max-w-4xl mx-auto space-y-8">

    <Tabs
      tabs={[
        { label: 'Chasse par domaine', value: 'domain', icon: 'solar:global-bold' },
        { label: 'Chasse locale', value: 'local', icon: 'solar:map-point-bold' }
      ]}
      bind:activeTab={huntType}
    />

    {#if huntType === 'domain'}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-md p-8 space-y-8">
      <div class="space-y-4">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm font-black uppercase tracking-wider text-slate-400"
            >Filtres intelligents</span
          >
          <button
            type="button"
            onclick={() => (showPresets = !showPresets)}
            class="text-sm font-bold text-brand-purple hover:text-brand-gold flex items-center gap-2 transition-colors"
          >
            <iconify-icon
              icon={showPresets ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}
              width="16"
            ></iconify-icon>
            {showPresets ? 'Masquer' : 'Afficher'} les préréglages
          </button>
        </div>

        {#if showPresets}
          <div class="bg-brand-purple/5 border border-brand-purple/20 rounded-2xl p-6 space-y-4">
            <div class="flex items-center gap-3">
              <iconify-icon icon="solar:magic-stick-3-bold" width="24" class="text-brand-purple"
              ></iconify-icon>
              <div>
                <h3 class="font-black text-lg text-brand-purple">Choisissez votre secteur d'activité</h3>
                <p class="text-sm text-slate-600">
                  Filtres préconfigurés optimisés pour différents secteurs
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {#each FILTER_PRESETS as preset}
                <button
                  type="button"
                  onclick={() => applyPreset(preset.id)}
                  class="p-4 rounded-xl border-2 transition-all duration-200 text-left {selectedPresetId ===
                  preset.id
                    ? 'border-brand-purple bg-brand-gold/10 shadow-md'
                    : 'border-slate-200 hover:border-brand-gold hover:shadow-sm bg-white'}"
                >
                  <div class="flex items-start justify-between mb-2">
                    <iconify-icon icon={preset.icon} width="24" class="text-brand-purple"
                    ></iconify-icon>
                    {#if selectedPresetId === preset.id}
                      <iconify-icon
                        icon="solar:check-circle-bold"
                        width="20"
                        class="text-brand-purple"
                      ></iconify-icon>
                    {/if}
                  </div>
                  <h4 class="font-black text-sm mb-1 text-brand-purple">{preset.name}</h4>
                  <p class="text-xs text-slate-500 line-clamp-2">{preset.description}</p>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="pt-8 border-t-2 border-slate-100 space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-black flex items-center gap-3 text-brand-purple">
            <iconify-icon icon="solar:filter-bold" width="24"></iconify-icon>
            Filtres
          </h2>
          {#if selectedPresetId}
            <button
              type="button"
              onclick={() => {
                selectedPresetId = null;
                filters = {
                  type: undefined,
                  seniority: [],
                  department: [],
                  jobTitles: [],
                  requiredFields: [],
                  verificationStatus: [],
                  location: { country: '', city: '' },
                };
              }}
              class="text-sm font-bold text-danger hover:text-danger-hover flex items-center gap-2 transition-colors"
            >
              <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
              Effacer les filtres
            </button>
          {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
              >Type d'e-mail</span
            >
            <select
              bind:value={filters.type}
              class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 bg-slate-50/50 hover:bg-white"
            >
              <option value={undefined}>Tous les types</option>
              <option value="personal">Personnels uniquement</option>
              <option value="generic">Génériques uniquement</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
              >Ancienneté</span
            >
            <div class="space-y-2">
              {#each seniorityLevels as level}
                <label class="flex items-center gap-2">
                  <input type="checkbox" value={level} bind:group={filters.seniority} class="w-4 h-4 accent-brand-purple" />
                  <span class="text-sm font-semibold capitalize text-slate-700">{level}</span>
                </label>
              {/each}
            </div>
          </label>
        </div>

        <div>
          <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
            >Départements</span
          >
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            {#each departments as dept}
              <label
                class="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <input type="checkbox" value={dept} bind:group={filters.department} class="w-4 h-4 accent-brand-purple" />
                <span class="text-xs font-bold capitalize text-slate-700">{dept}</span>
              </label>
            {/each}
          </div>
        </div>

        <div>
          <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
            >Postes</span
          >
          <div class="flex gap-2 mb-3">
            <input
              bind:value={jobTitleInput}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addJobTitle(); } }}
              type="text"
              placeholder="ex. : PDG, DG, Responsable marketing"
              class="flex-1 px-4 py-2 border-2 border-slate-200 rounded-xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 bg-slate-50/50 hover:bg-white"
            />
            <button
              type="button"
              onclick={addJobTitle}
              class="px-6 py-2 bg-brand-purple text-white rounded-xl font-bold hover:bg-brand-gold hover:text-brand-purple transition-all duration-200"
            >
              Ajouter
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each filters.jobTitles as title}
              <span
                class="px-3 py-1 bg-brand-gold/20 text-brand-purple border border-brand-gold/30 rounded-lg text-sm font-bold flex items-center gap-2"
              >
                {title}
                <button
                  type="button"
                  onclick={() => removeJobTitle(title)}
                  class="hover:text-brand-gold transition-colors"
                  aria-label="Remove {title}"
                >
                  <iconify-icon icon="solar:close-circle-bold" width="16"></iconify-icon>
                </button>
              </span>
            {/each}
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400">Localisation</span>
            <button
              type="button"
              onclick={() => detectLocation('auto')}
              disabled={loadingLocation}
              class="text-sm font-bold text-brand-purple hover:text-brand-gold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {#if loadingLocation}
                <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="16"></iconify-icon>
                Détection...
              {:else}
                <iconify-icon icon="solar:map-point-bold" width="16"></iconify-icon>
                {userLocation ? 'Re-détecter' : 'Détecter'} la localisation
              {/if}
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-semibold text-slate-700">Pays</span>
                {#if userLocation}
                  <span class="text-xs font-bold text-success flex items-center gap-1">
                    <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                    Auto
                  </span>
                {/if}
              </div>
              <input
                bind:value={filters.location.country}
                type="text"
                placeholder="e.g., US, FR, DE"
                class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 bg-slate-50/50 hover:bg-white"
              />
            </label>

            <label class="block">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-semibold text-slate-700">Ville</span>
                {#if userLocation}
                  <span class="text-xs font-bold text-success flex items-center gap-1">
                    <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                    Auto
                  </span>
                {/if}
              </div>
              <input
                bind:value={filters.location.city}
                type="text"
                placeholder="e.g., San Francisco, Paris"
                class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 bg-slate-50/50 hover:bg-white"
              />
            </label>
          </div>

          {#if loadingLocation}
            <div class="bg-brand-purple/10 border border-brand-purple/20 rounded-xl p-4 flex items-center gap-3 mt-4">
              <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="20" class="text-brand-purple"
              ></iconify-icon>
              <span class="text-sm font-bold text-brand-purple">Détection de votre localisation...</span>
            </div>
          {/if}
        </div>
      </div>

      <div class="pt-6 border-t-2 border-slate-100">
        {#if configuredSourcesCount === 0}
          <div class="bg-warning-light border-2 border-warning/30 rounded-2xl p-6 mb-6">
            <div class="flex items-start gap-3">
              <iconify-icon icon="solar:danger-bold" width="24" class="text-warning"
              ></iconify-icon>
              <div>
                <h3 class="font-black text-lg mb-1 text-brand-purple">Aucune clé API configurée</h3>
                <p class="text-sm text-slate-700 mb-4">
                  Pour commencer à chercher des leads, vous devez configurer au moins une clé API dans vos paramètres.
                </p>
                <a
                  href={settingsUrl}
                  class="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-xl font-bold hover:bg-brand-gold hover:text-brand-purple transition-all duration-200"
                >
                  <iconify-icon icon="solar:settings-bold" width="18"></iconify-icon>
                  Accéder aux paramètres
                </a>
              </div>
            </div>
          </div>
        {/if}

        <button
          onclick={startHunt}
          disabled={loading || configuredSourcesCount === 0}
          class="w-full bg-brand-purple text-white px-8 py-4 rounded-full font-black text-lg hover:bg-brand-gold hover:text-brand-purple active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-brand-purple/20"
        >
          {#if loading}
            <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="24"></iconify-icon>
            <span>Démarrage...</span>
          {:else}
            <iconify-icon icon="solar:rocket-2-bold" width="24"></iconify-icon>
            <span>Lancer la chasse par domaine</span>
          {/if}
        </button>
      </div>
    </div>
    {:else}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-md p-8 space-y-8">
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-yellow-400/10 rounded-2xl flex items-center justify-center">
            <iconify-icon icon="solar:map-point-bold" width="24" class="text-yellow-600"></iconify-icon>
          </div>
          <div>
            <h2 class="text-2xl font-black text-neutral-900">Recherche locale d'entreprises</h2>
            <p class="text-sm text-neutral-500 font-medium">Trouvez des entreprises près d'une localisation</p>
          </div>
        </div>

        {#if !hasGoogleMapsKey}
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <iconify-icon icon="solar:info-circle-bold" width="20" class="text-blue-600 flex-shrink-0 mt-0.5"></iconify-icon>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-blue-900">
                  Clé Google Maps non configurée
                </p>
                <p class="text-xs text-blue-700 mt-1">
                  Sans clé Google Maps, nous utiliserons OpenStreetMap pour rechercher les entreprises.
                  Pour de meilleurs résultats, <a href={settingsUrl} class="underline hover:text-blue-900 font-bold">configurez une clé Google Maps dans les paramètres</a>.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <div class="space-y-4">
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Catégories d'activité (sélection multiple)</span>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              {#each businessCategories as category}
                <label
                  class="p-4 rounded-xl border-2 transition-all cursor-pointer {localBusinessFilters.categories.includes(category.value)
                    ? 'border-yellow-400 bg-yellow-50 shadow-md'
                    : 'border-neutral-200 hover:border-yellow-300 bg-white'}"
                >
                  <div class="flex items-center gap-3">
                    <input
                      type="checkbox"
                      value={category.value}
                      bind:group={localBusinessFilters.categories}
                      class="w-4 h-4 accent-yellow-400"
                    />
                    <iconify-icon icon={category.icon} width="24" class={localBusinessFilters.categories.includes(category.value) ? 'text-yellow-600' : 'text-neutral-400'}></iconify-icon>
                    <span class="text-sm font-bold {localBusinessFilters.categories.includes(category.value) ? 'text-yellow-900' : 'text-neutral-700'}">{category.label}</span>
                  </div>
                </label>
              {/each}
            </div>
          </label>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400">Localisation</span>
            <button
              type="button"
              onclick={() => detectLocation('auto')}
              disabled={loadingLocation}
              class="text-sm font-bold text-yellow-600 hover:text-yellow-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {#if loadingLocation}
                <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="16"></iconify-icon>
                Détection...
              {:else}
                <iconify-icon icon="solar:map-point-bold" width="16"></iconify-icon>
                {userLocation ? 'Re-détecter' : 'Utiliser le GPS'}
              {/if}
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              bind:value={localBusinessFilters.location.city}
              type="text"
              placeholder="Ville (ex. : Paris, Lyon)"
              class="px-4 py-3 border-2 border-neutral-200 rounded-xl font-medium focus:border-yellow-400 focus:outline-none transition-all bg-neutral-50 hover:bg-white"
            />
            <input
              bind:value={localBusinessFilters.location.country}
              type="text"
              placeholder="Pays (ex. : FR, BE)"
              class="px-4 py-3 border-2 border-neutral-200 rounded-xl font-medium focus:border-yellow-400 focus:outline-none transition-all bg-neutral-50 hover:bg-white"
            />
          </div>

          <div class="mt-4">
            <button
              type="button"
              onclick={() => showMap = !showMap}
              class="text-sm font-bold text-yellow-600 hover:text-yellow-700 flex items-center gap-2 transition-colors"
            >
              <iconify-icon icon={showMap ? 'solar:map-arrow-down-bold' : 'solar:map-arrow-up-bold'} width="16"></iconify-icon>
              {showMap ? 'Masquer la carte' : 'Choisir sur la carte'}
            </button>

            {#if showMap}
              <div class="mt-4 h-96 bg-neutral-100 rounded-xl overflow-hidden border-2 border-neutral-200">
                <LocationPickerMap
                  bind:this={mapComponent}
                  initialLat={localBusinessFilters.location.coordinates?.lat || 40.7128}
                  initialLng={localBusinessFilters.location.coordinates?.lng || -74.006}
                  onLocationSelected={(location) => {
                    localBusinessFilters.location.coordinates = { lat: location.lat, lng: location.lng };
                    const parts = location.address.split(', ');
                    if (parts.length >= 2) {
                      localBusinessFilters.location.city = parts[parts.length - 2] || '';
                      localBusinessFilters.location.country = parts[parts.length - 1] || '';
                    }
                  }}
                />
              </div>
              <p class="mt-2 text-xs text-neutral-500 italic">
                Cliquez sur la carte ou déplacez le marqueur pour sélectionner une localisation. Le rayon de recherche est affiché en cercle.
              </p>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Filtre site web</span>
            <select
              bind:value={localBusinessFilters.hasWebsite}
              class="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl font-medium focus:border-yellow-400 focus:outline-none transition-all bg-neutral-50 hover:bg-white"
            >
              <option value="all">Toutes les entreprises</option>
              <option value="with">Avec site web uniquement</option>
              <option value="without">Sans site web uniquement</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Rayon de recherche</span>
            <select
              bind:value={localBusinessFilters.radius}
              onchange={() => mapComponent?.setRadius(localBusinessFilters.radius * 1000)}
              class="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl font-medium focus:border-yellow-400 focus:outline-none transition-all bg-neutral-50 hover:bg-white"
            >
              <option value={1}>1 km</option>
              <option value={5}>5 km</option>
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
              <option value={50}>50 km</option>
            </select>
          </label>
        </div>

        <div class="pt-6 border-t-2 border-neutral-100">
          <button
            onclick={startHunt}
            disabled={loading}
            class="w-full bg-yellow-400 text-neutral-900 px-8 py-4 rounded-full font-black text-lg hover:bg-yellow-500 active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-yellow-400/20"
          >
            {#if loading}
              <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="24"></iconify-icon>
              <span>Recherche...</span>
            {:else}
              <iconify-icon icon="solar:map-point-bold" width="24"></iconify-icon>
              <span>Lancer la chasse locale</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
    {/if}
  </div>
</div>
