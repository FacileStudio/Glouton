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

  let mapComponent = $state<LocationPickerMap | undefined>();
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
    { value: 'restaurant', label: 'Restaurants & Cafés', icon: 'solar:chef-hat-linear' },
    { value: 'retail', label: 'Commerces de détail', icon: 'solar:shop-linear' },
    { value: 'service', label: 'Services', icon: 'solar:case-round-linear' },
    { value: 'healthcare', label: 'Santé', icon: 'solar:heart-linear' },
    { value: 'fitness', label: 'Fitness & Bien-être', icon: 'solar:dumbbell-linear' },
    { value: 'beauty', label: 'Beauté & Spa', icon: 'solar:scissors-linear' },
    { value: 'automotive', label: 'Automobile', icon: 'solar:wheel-linear' },
    { value: 'professional-services', label: 'Services professionnels', icon: 'solar:user-id-linear' },
    { value: 'hotel', label: 'Hôtels & Hébergement', icon: 'solar:bed-linear' },
    { value: 'education', label: 'Éducation', icon: 'solar:book-linear' },
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



  async function detectLocationFromGPS() {


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

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Glouton-Lead-Hunter/1.0',
        },
      },
    );



    if (!response.ok) {
      throw new Error('Failed to reverse geocode coordinates');
    }

    const data = await response.json();

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



  async function detectLocationFromIP() {
    const response = await fetch('https://ipapi.co/json/');


    if (!response.ok) {
      throw new Error('Failed to detect location from IP');
    }

    const data = await response.json();

    return {
      city: data.city,
      country: data.country_name,
      countryCode: data.country_code,
      state: data.region,
      raw: data,
    };
  }



  async function detectLocation(method: 'gps' | 'ip' | 'auto' = 'auto') {
    loadingLocation = true;
    userLocation = null;

    try {
      let location;



      if (method === 'gps' || method === 'auto') {
        try {
          location = await detectLocationFromGPS();
        } catch (gpsError) {
          console.warn('GPS detection failed:', gpsError);



          if (method === 'gps') {
            throw gpsError;
          }

          location = await detectLocationFromIP();
        }
      } else {
        location = await detectLocationFromIP();
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



  function applyPreset(presetId: string) {
    const preset = getPresetById(presetId);


    if (!preset) return;

    selectedPresetId = presetId;

    filters.type = preset.filters.type;
    filters.seniority = preset.filters.seniority || [];
    filters.department = preset.filters.department || [];
    filters.jobTitles = preset.filters.jobTitles || [];
    filters.requiredFields = preset.filters.requiredFields || [];
    filters.verificationStatus = preset.filters.verificationStatus || [];



    if (preset.filters.location && !userLocation) {
      filters.location.country = preset.filters.location.country || '';
      filters.location.city = preset.filters.location.city || '';
    }

    toast.push(`Préréglage "${preset.name}" appliqué`, 'success');
    showPresets = false;
  }



  function addJobTitle() {


    if (jobTitleInput.trim()) {
      filters.jobTitles = [...filters.jobTitles, jobTitleInput.trim()];
      jobTitleInput = '';
    }
  }



  function removeJobTitle(title: string) {
    filters.jobTitles = filters.jobTitles.filter((t) => t !== title);
  }



  async function startDomainHunt() {


    if (configuredSourcesCount === 0) {
      toast.push('Veuillez configurer au moins une clé API dans les paramètres', 'error');


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



  function startHunt() {


    if (huntType === 'domain') {
      return startDomainHunt();
    } else {
      return startLocalBusinessHunt();
    }
  }



  async function fetchConfiguredSources() {
    try {
      const sources = await trpc.user.getConfiguredSources.query(
        teamId ? { teamId } : undefined
      );
      configuredSourcesCount = sources.length;
      hasGoogleMapsKey = sources.includes('GOOGLE_MAPS');



      if (configuredSourcesCount === 0) {
        toast.push('Aucune clé API configurée. Veuillez les ajouter dans les paramètres.', 'info');
      }
    } catch (error) {
      console.error('Error fetching configured sources:', error);
    }
  }



  onMount(async () => {
    await fetchConfiguredSources();


    detectLocation();
  });



  afterNavigate(async () => {
    await fetchConfiguredSources();
  });
</script>

<div class="sticky top-0 z-20 bg-background border-b border-border px-6 py-3">
  <div class="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
    <div class="flex items-center gap-3 min-w-0">
      <a
        href="/app/hunts"
        aria-label="Retour aux chasses"
        class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
      </a>

      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-foreground truncate">
          Nouvelle chasse
        </h1>
        <p class="text-xs text-muted-foreground truncate">
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

    <div class="flex items-center gap-2 flex-shrink-0">
      <a
        href="/app/hunts"
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        Annuler
      </a>
    </div>
  </div>
</div>

<div class="max-w-[1600px] mx-auto px-6 py-6">
  <div class="max-w-4xl mx-auto space-y-6">

    <Tabs
      tabs={[
        { label: 'Chasse par domaine', value: 'domain', icon: 'solar:global-linear' },
        { label: 'Chasse locale', value: 'local', icon: 'solar:map-point-linear' }
      ]}
      bind:activeTab={huntType}
    />

    {#if huntType === 'domain'}
    <div class="rounded-xl border border-border bg-card p-6 space-y-6">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-foreground">Filtres intelligents</h2>
          <button
            type="button"
            onclick={() => (showPresets = !showPresets)}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <iconify-icon
              icon={showPresets ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
              width="14"
            ></iconify-icon>
            {showPresets ? 'Masquer' : 'Afficher'} les préréglages
          </button>
        </div>

        {#if showPresets}
          <div class="rounded-xl border border-border bg-background p-4 space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-foreground">Choisissez votre secteur d'activité</h3>
              <p class="text-sm text-muted-foreground mt-0.5">
                Filtres préconfigurés optimisés pour différents secteurs
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {#each FILTER_PRESETS as preset}
                <button
                  type="button"
                  onclick={() => applyPreset(preset.id)}
                  class="rounded-lg border p-3 text-left transition-colors {selectedPresetId === preset.id
                    ? 'border-foreground bg-muted'
                    : 'border-border bg-background hover:bg-muted'}"
                >
                  <div class="flex items-start justify-between mb-2">
                    <iconify-icon icon={preset.icon} width="18" class="text-foreground"></iconify-icon>
                    {#if selectedPresetId === preset.id}
                      <iconify-icon
                        icon="solar:check-circle-linear"
                        width="16"
                        class="text-foreground"
                      ></iconify-icon>
                    {/if}
                  </div>
                  <h4 class="text-sm font-medium text-foreground mb-0.5">{preset.name}</h4>
                  <p class="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="pt-6 border-t border-border space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-foreground">Filtres</h2>
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
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <iconify-icon icon="solar:restart-linear" width="14"></iconify-icon>
              Effacer les filtres
            </button>
          {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="block">
            <span class="text-sm font-medium text-foreground mb-2 block">Type d'e-mail</span>
            <select
              bind:value={filters.type}
              class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value={undefined}>Tous les types</option>
              <option value="personal">Personnels uniquement</option>
              <option value="generic">Génériques uniquement</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-medium text-foreground mb-2 block">Ancienneté</span>
            <div class="space-y-1.5">
              {#each seniorityLevels as level}
                <label class="flex items-center gap-2">
                  <input type="checkbox" value={level} bind:group={filters.seniority} class="w-4 h-4" />
                  <span class="text-sm capitalize text-foreground">{level}</span>
                </label>
              {/each}
            </div>
          </label>
        </div>

        <div>
          <span class="text-sm font-medium text-foreground mb-2 block">Départements</span>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            {#each departments as dept}
              <label
                class="flex items-center gap-2 px-3 h-9 rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
              >
                <input type="checkbox" value={dept} bind:group={filters.department} class="w-4 h-4" />
                <span class="text-sm capitalize text-foreground">{dept}</span>
              </label>
            {/each}
          </div>
        </div>

        <div>
          <span class="text-sm font-medium text-foreground mb-2 block">Postes</span>
          <div class="flex gap-2 mb-3">
            <input
              bind:value={jobTitleInput}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addJobTitle(); } }}
              type="text"
              placeholder="ex. : PDG, DG, Responsable marketing"
              class="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <button
              type="button"
              onclick={addJobTitle}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Ajouter
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each filters.jobTitles as title}
              <span
                class="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
              >
                {title}
                <button
                  type="button"
                  onclick={() => removeJobTitle(title)}
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Remove {title}"
                >
                  <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
                </button>
              </span>
            {/each}
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-foreground">Localisation</span>
            <button
              type="button"
              onclick={() => detectLocation('auto')}
              disabled={loadingLocation}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              {#if loadingLocation}
                <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="14"></iconify-icon>
                Détection
              {:else}
                <iconify-icon icon="solar:map-point-linear" width="14"></iconify-icon>
                {userLocation ? 'Re-détecter' : 'Détecter'} la localisation
              {/if}
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm text-muted-foreground mb-1.5 block">Pays</span>
              <input
                bind:value={filters.location.country}
                type="text"
                placeholder="ex. US, FR, DE"
                class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>

            <label class="block">
              <span class="text-sm text-muted-foreground mb-1.5 block">Ville</span>
              <input
                bind:value={filters.location.city}
                type="text"
                placeholder="ex. San Francisco, Paris"
                class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>
          </div>
        </div>
      </div>

      <div class="pt-6 border-t border-border">
        {#if configuredSourcesCount === 0}
          <div class="rounded-xl border border-border bg-muted p-4 mb-4">
            <div class="flex items-start gap-3">
              <iconify-icon icon="solar:danger-linear" width="18" class="text-foreground mt-0.5"></iconify-icon>
              <div>
                <h3 class="text-sm font-semibold text-foreground mb-1">Aucune clé API configurée</h3>
                <p class="text-sm text-muted-foreground mb-3">
                  Pour commencer à chercher des leads, vous devez configurer au moins une clé API dans vos paramètres.
                </p>
                <a
                  href={settingsUrl}
                  class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <iconify-icon icon="solar:settings-linear" width="14"></iconify-icon>
                  Accéder aux paramètres
                </a>
              </div>
            </div>
          </div>
        {/if}

        <button
          onclick={startHunt}
          disabled={loading || configuredSourcesCount === 0}
          class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if loading}
            <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="16"></iconify-icon>
            <span>Démarrage</span>
          {:else}
            <iconify-icon icon="solar:rocket-2-linear" width="16"></iconify-icon>
            <span>Lancer la chasse par domaine</span>
          {/if}
        </button>
      </div>
    </div>
    {:else}
    <div class="rounded-xl border border-border bg-card p-6 space-y-6">
      <div class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold text-foreground">Recherche locale d'entreprises</h2>
          <p class="text-sm text-muted-foreground mt-0.5">Trouvez des entreprises près d'une localisation</p>
        </div>

        {#if !hasGoogleMapsKey}
          <div class="rounded-xl border border-border bg-muted p-4">
            <div class="flex items-start gap-3">
              <iconify-icon icon="solar:info-circle-linear" width="18" class="text-foreground flex-shrink-0 mt-0.5"></iconify-icon>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground">
                  Clé Google Maps non configurée
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  Sans clé Google Maps, nous utiliserons OpenStreetMap pour rechercher les entreprises.
                  Pour de meilleurs résultats, <a href={settingsUrl} class="underline text-foreground">configurez une clé Google Maps dans les paramètres</a>.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <div class="space-y-3">
          <span class="text-sm font-medium text-foreground block">Catégories d'activité (sélection multiple)</span>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            {#each businessCategories as category}
              <label
                class="rounded-lg border p-3 transition-colors cursor-pointer {localBusinessFilters.categories.includes(category.value)
                  ? 'border-foreground bg-muted'
                  : 'border-border bg-background hover:bg-muted'}"
              >
                <div class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    value={category.value}
                    bind:group={localBusinessFilters.categories}
                    class="w-4 h-4"
                  />
                  <iconify-icon icon={category.icon} width="16" class="text-foreground"></iconify-icon>
                  <span class="text-sm text-foreground">{category.label}</span>
                </div>
              </label>
            {/each}
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-foreground">Localisation</span>
            <button
              type="button"
              onclick={() => detectLocation('auto')}
              disabled={loadingLocation}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              {#if loadingLocation}
                <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="14"></iconify-icon>
                Détection
              {:else}
                <iconify-icon icon="solar:map-point-linear" width="14"></iconify-icon>
                {userLocation ? 'Re-détecter' : 'Utiliser le GPS'}
              {/if}
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              bind:value={localBusinessFilters.location.city}
              type="text"
              placeholder="Ville (ex. : Paris, Lyon)"
              class="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <input
              bind:value={localBusinessFilters.location.country}
              type="text"
              placeholder="Pays (ex. : FR, BE)"
              class="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </div>

          <div>
            <button
              type="button"
              onclick={() => showMap = !showMap}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <iconify-icon icon={showMap ? 'solar:map-arrow-down-linear' : 'solar:map-arrow-up-linear'} width="14"></iconify-icon>
              {showMap ? 'Masquer la carte' : 'Choisir sur la carte'}
            </button>

            {#if showMap}
              <div class="mt-3 h-96 rounded-xl overflow-hidden border border-border">
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
              <p class="mt-2 text-xs text-muted-foreground">
                Cliquez sur la carte ou déplacez le marqueur pour sélectionner une localisation. Le rayon de recherche est affiché en cercle.
              </p>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="block">
            <span class="text-sm font-medium text-foreground mb-2 block">Filtre site web</span>
            <select
              bind:value={localBusinessFilters.hasWebsite}
              class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Toutes les entreprises</option>
              <option value="with">Avec site web uniquement</option>
              <option value="without">Sans site web uniquement</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-medium text-foreground mb-2 block">Rayon de recherche</span>
            <select
              bind:value={localBusinessFilters.radius}
              onchange={() => mapComponent?.setRadius(localBusinessFilters.radius * 1000)}
              class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value={1}>1 km</option>
              <option value={5}>5 km</option>
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
              <option value={50}>50 km</option>
            </select>
          </label>
        </div>

        <div class="pt-6 border-t border-border">
          <button
            onclick={startHunt}
            disabled={loading}
            class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if loading}
              <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="16"></iconify-icon>
              <span>Recherche</span>
            {:else}
              <iconify-icon icon="solar:map-point-linear" width="16"></iconify-icon>
              <span>Lancer la chasse locale</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
    {/if}
  </div>
</div>
