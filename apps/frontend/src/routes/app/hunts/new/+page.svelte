<script lang="ts">
  import { goto, afterNavigate } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { FILTER_PRESETS, getPresetById } from '@repo/lead-sources';
  import { onMount } from 'svelte';
  import { Tabs } from '@repo/ui';
  import LocationPickerMap from '$lib/components/LocationPickerMap.svelte';
  import 'iconify-icon';

  let mapComponent: LocationPickerMap;
  let showMap = false;

  let huntType: 'domain' | 'local' = 'domain';
  let loading = false;
  let loadingLocation = false;
  let targetUrl = '';
  let selectedPresetId: string | null = null;
  let showPresets = true;
  let configuredSourcesCount = 0;
  let userLocation: { city?: string; country?: string; countryCode?: string; state?: string; raw?: any } | null = null;

  let localBusinessFilters = {
    categories: [] as string[],
    hasWebsite: 'all' as 'all' | 'with' | 'without',
    radius: 5,
    maxResults: 100,
    location: {
      city: '',
      country: '',
      coordinates: null as { lat: number; lng: number } | null,
    },
  };

  const businessCategories = [
    { value: 'restaurant', label: 'Restaurants & Cafes', icon: 'solar:chef-hat-bold' },
    { value: 'retail', label: 'Retail Stores', icon: 'solar:shop-bold' },
    { value: 'service', label: 'Services', icon: 'solar:case-round-bold' },
    { value: 'healthcare', label: 'Healthcare', icon: 'solar:heart-bold' },
    { value: 'fitness', label: 'Fitness & Wellness', icon: 'solar:dumbbell-bold' },
    { value: 'beauty', label: 'Beauty & Spa', icon: 'solar:scissors-bold' },
    { value: 'automotive', label: 'Automotive', icon: 'solar:wheel-bold' },
    { value: 'professional-services', label: 'Professional Services', icon: 'solar:user-id-bold' },
    { value: 'hotel', label: 'Hotels & Lodging', icon: 'solar:bed-bold' },
    { value: 'education', label: 'Education', icon: 'solar:book-bold' },
  ];

  let filters = {
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
  };

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

  let jobTitleInput = '';

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

      /**
       * if
       */
      if (location.city && !filters.location.city) {
        filters.location.city = location.city;
      }
      /**
       * if
       */
      if (location.countryCode && !filters.location.country) {
        filters.location.country = location.countryCode;
      }

      /**
       * if
       */
      if (location.city && !localBusinessFilters.location.city) {
        localBusinessFilters.location.city = location.city;
      }
      /**
       * if
       */
      if (location.countryCode && !localBusinessFilters.location.country) {
        localBusinessFilters.location.country = location.countryCode;
      }

      const cityName = location.city || 'Unknown city';
      const countryName = location.country || 'Unknown country';

      toast.push(`Location detected: ${cityName}, ${countryName}`, 'success');
    } catch (error: any) {
      console.error('Error detecting location:', error);

      const errorMessage =
        error?.message === 'User denied Geolocation'
          ? 'Location access denied. Click "Detect Location" to try again or enter manually.'
          : 'Could not detect location. Please enter manually or try again.';

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

    toast.push(`Applied "${preset.name}" preset`, 'success');
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
      toast.push('Please configure at least one API key in Settings', 'error');
      /**
       * goto
       */
      goto('/app/settings');
      return;
    }

    let normalizedUrl: string | undefined = undefined;
    /**
     * if
     */
    if (targetUrl && targetUrl.trim()) {
      normalizedUrl = targetUrl.trim();
      /**
       * if
       */
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
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

      await trpc.lead.hunt.start.mutate({
        targetUrl: normalizedUrl,
        filters: huntFilters,
      });

      toast.push(
        `Hunt started across ${configuredSourcesCount} configured source(s)!`,
        'success',
      );

      /**
       * goto
       */
      goto('/app/hunts');
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start hunt';
      toast.push(errorMessage, 'error');
      console.error('Error starting hunt:', error);
    } finally {
      loading = false;
    }
  }

  /**
   * startLocalBusinessHunt
   */
  async function startLocalBusinessHunt() {
    /**
     * if
     */
    if (localBusinessFilters.categories.length === 0) {
      toast.push('Please select at least one business category', 'error');
      return;
    }

    /**
     * if
     */
    if (!localBusinessFilters.location.city && !localBusinessFilters.location.coordinates) {
      toast.push('Please provide a location (city or use GPS)', 'error');
      return;
    }

    loading = true;
    try {
      const locationString = localBusinessFilters.location.city
        ? `${localBusinessFilters.location.city}${localBusinessFilters.location.country ? ', ' + localBusinessFilters.location.country : ''}`
        : `${localBusinessFilters.location.coordinates?.lat},${localBusinessFilters.location.coordinates?.lng}`;

      await trpc.lead.hunt.startLocalBusiness.mutate({
        location: locationString,
        categories: localBusinessFilters.categories,
        hasWebsite: localBusinessFilters.hasWebsite === 'with' ? true : localBusinessFilters.hasWebsite === 'without' ? false : undefined,
        radius: localBusinessFilters.radius * 1000,
        maxResults: localBusinessFilters.maxResults,
      });

      const categoryCount = localBusinessFilters.categories.length;
      toast.push(
        `Local business hunt started for ${categoryCount} categor${categoryCount > 1 ? 'ies' : 'y'}!`,
        'success',
      );

      /**
       * goto
       */
      goto('/app/hunts');
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start local business hunt';
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
      const sources = await trpc.user.getConfiguredSources.query();
      console.log('Configured sources:', sources);
      configuredSourcesCount = sources.length;
      console.log('configuredSourcesCount:', configuredSourcesCount);

      /**
       * if
       */
      if (configuredSourcesCount === 0) {
        toast.push('No API keys configured. Please add them in Settings.', 'info');
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

<div class="min-h-screen p-6 lg:p-12">
  <div class="max-w-4xl mx-auto space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-5xl font-black tracking-tight text-brand-purple">
          New Hunt<span class="text-brand-gold">.</span>
        </h1>
        <p class="text-slate-500 font-medium mt-2">
          {#if huntType === 'domain'}
            {#if configuredSourcesCount > 0}
              Using {configuredSourcesCount} configured source{configuredSourcesCount > 1
                ? 's'
                : ''}
            {:else}
              Configure API keys in Settings to start hunting
            {/if}
          {:else}
            Search for local businesses near a location
          {/if}
        </p>
      </div>
      <a
        href="/app/leads"
        class="px-4 py-2 border-2 border-slate-200 rounded-xl font-bold hover:border-brand-purple hover:text-brand-purple transition-all flex items-center gap-2"
      >
        <iconify-icon icon="solar:close-circle-bold" width="20"></iconify-icon>
        Cancel
      </a>
    </div>

    <Tabs
      tabs={[
        { label: 'Domain Hunt', value: 'domain', icon: 'solar:global-bold' },
        { label: 'Local Business Hunt', value: 'local', icon: 'solar:map-point-bold' }
      ]}
      bind:activeTab={huntType}
    />

    {#if huntType === 'domain'}
    <div class="bg-white rounded-[35px] border border-slate-100 shadow-md p-8 space-y-8">
      <div class="space-y-4">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm font-black uppercase tracking-wider text-slate-400"
            >Smart Auto Filters</span
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
            {showPresets ? 'Hide' : 'Show'} Presets
          </button>
        </div>

        {#if showPresets}
          <div class="bg-brand-purple/5 border border-brand-purple/20 rounded-2xl p-6 space-y-4">
            <div class="flex items-center gap-3">
              <iconify-icon icon="solar:magic-stick-3-bold" width="24" class="text-brand-purple"
              ></iconify-icon>
              <div>
                <h3 class="font-black text-lg text-brand-purple">Choose Your Business Type</h3>
                <p class="text-sm text-slate-600">
                  Pre-configured filters optimized for different industries
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

      <div class="space-y-4">
        <label class="block">
          <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
            >Target URL <span class="text-xs font-medium text-slate-500">(Optional)</span></span
          >
          <input
            bind:value={targetUrl}
            type="text"
            placeholder="example.com (leave empty for broad search)"
            class="w-full px-6 py-4 border-2 border-slate-200 rounded-2xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 hover:bg-white bg-slate-50/50"
          />
          <p class="text-xs text-slate-500 mt-2">
            Enter a company domain to target specific organizations, or leave empty to search broadly based on filters.
          </p>
        </label>
      </div>

      <div class="pt-8 border-t-2 border-slate-100 space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-black flex items-center gap-3 text-brand-purple">
            <iconify-icon icon="solar:filter-bold" width="24"></iconify-icon>
            Filters
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
              Clear Filters
            </button>
          {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
              >Email Type</span
            >
            <select
              bind:value={filters.type}
              class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 bg-slate-50/50 hover:bg-white"
            >
              <option value={undefined}>All Types</option>
              <option value="personal">Personal Only</option>
              <option value="generic">Generic Only</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block"
              >Seniority</span
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
            >Departments</span
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
            >Job Titles</span
          >
          <div class="flex gap-2 mb-3">
            <input
              bind:value={jobTitleInput}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addJobTitle(); } }}
              type="text"
              placeholder="e.g., CEO, CTO, Marketing Manager"
              class="flex-1 px-4 py-2 border-2 border-slate-200 rounded-xl font-medium focus:border-brand-gold focus:outline-none transition-all duration-200 bg-slate-50/50 hover:bg-white"
            />
            <button
              type="button"
              onclick={addJobTitle}
              class="px-6 py-2 bg-brand-purple text-white rounded-xl font-bold hover:bg-brand-gold hover:text-brand-purple transition-all duration-200"
            >
              Add
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
            <span class="text-sm font-black uppercase tracking-wider text-slate-400">Location</span>
            <button
              type="button"
              onclick={() => detectLocation('auto')}
              disabled={loadingLocation}
              class="text-sm font-bold text-brand-purple hover:text-brand-gold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {#if loadingLocation}
                <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="16"></iconify-icon>
                Detecting...
              {:else}
                <iconify-icon icon="solar:map-point-bold" width="16"></iconify-icon>
                {userLocation ? 'Re-detect' : 'Detect'} Location
              {/if}
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-semibold text-slate-700">Country</span>
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
                <span class="text-sm font-semibold text-slate-700">City</span>
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
              <span class="text-sm font-bold text-brand-purple">Detecting your location...</span>
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
                <h3 class="font-black text-lg mb-1 text-brand-purple">No API Keys Configured</h3>
                <p class="text-sm text-slate-700 mb-4">
                  To start hunting for leads, you need to configure at least one API key in your
                  settings.
                </p>
                <a
                  href="/app/settings"
                  class="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-xl font-bold hover:bg-brand-gold hover:text-brand-purple transition-all duration-200"
                >
                  <iconify-icon icon="solar:settings-bold" width="18"></iconify-icon>
                  Go to Settings
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
            <span>Starting Hunt...</span>
          {:else}
            <iconify-icon icon="solar:rocket-2-bold" width="24"></iconify-icon>
            <span>Start Domain Hunt</span>
          {/if}
        </button>
      </div>
    </div>
    {:else}
    <div class="bg-white rounded-[35px] border border-slate-100 shadow-md p-8 space-y-8">
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-yellow-400/10 rounded-2xl flex items-center justify-center">
            <iconify-icon icon="solar:map-point-bold" width="24" class="text-yellow-600"></iconify-icon>
          </div>
          <div>
            <h2 class="text-2xl font-black text-neutral-900">Local Business Search</h2>
            <p class="text-sm text-neutral-500 font-medium">Find businesses near a specific location</p>
          </div>
        </div>

        <div class="space-y-4">
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Business Categories (Select Multiple)</span>
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
            <span class="text-sm font-black uppercase tracking-wider text-slate-400">Location</span>
            <button
              type="button"
              onclick={() => detectLocation('auto')}
              disabled={loadingLocation}
              class="text-sm font-bold text-yellow-600 hover:text-yellow-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {#if loadingLocation}
                <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="16"></iconify-icon>
                Detecting...
              {:else}
                <iconify-icon icon="solar:map-point-bold" width="16"></iconify-icon>
                {userLocation ? 'Re-detect' : 'Use GPS'}
              {/if}
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              bind:value={localBusinessFilters.location.city}
              type="text"
              placeholder="City (e.g., Paris, London)"
              class="px-4 py-3 border-2 border-neutral-200 rounded-xl font-medium focus:border-yellow-400 focus:outline-none transition-all bg-neutral-50 hover:bg-white"
            />
            <input
              bind:value={localBusinessFilters.location.country}
              type="text"
              placeholder="Country (e.g., FR, UK)"
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
              {showMap ? 'Hide Map' : 'Pick Location on Map'}
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
                Click on the map or drag the marker to select a location. The search radius is shown as a circle.
              </p>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Website Filter</span>
            <select
              bind:value={localBusinessFilters.hasWebsite}
              class="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl font-medium focus:border-yellow-400 focus:outline-none transition-all bg-neutral-50 hover:bg-white"
            >
              <option value="all">All Businesses</option>
              <option value="with">With Website Only</option>
              <option value="without">Without Website Only</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Search Radius</span>
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

        <div>
          <label class="block">
            <span class="text-sm font-black uppercase tracking-wider text-slate-400 mb-3 block">Max Results: {localBusinessFilters.maxResults}</span>
            <input
              type="range"
              bind:value={localBusinessFilters.maxResults}
              min="50"
              max="500"
              step="50"
              class="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
            <div class="flex justify-between text-xs font-bold text-neutral-400 mt-2">
              <span>50</span>
              <span>500</span>
            </div>
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
              <span>Searching...</span>
            {:else}
              <iconify-icon icon="solar:map-point-bold" width="24"></iconify-icon>
              <span>Start Local Hunt</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
    {/if}
  </div>
</div>
