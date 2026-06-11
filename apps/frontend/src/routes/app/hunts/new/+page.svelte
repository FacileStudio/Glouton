<script lang="ts">
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import LocationPickerMap from '$lib/components/LocationPickerMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());

  let mapComponent: LocationPickerMap;
  let showMap = $state(false);

  let loading = $state(false);
  let loadingLocation = $state(false);
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
        categories: localBusinessFilters.categories as any,
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
          Recherche locale par localisation (OpenStreetMap, 100% gratuit)
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

<div class="min-h-screen p-6 lg:p-12" style="background-color: var(--background);">
  <div class="max-w-4xl mx-auto space-y-8">
    <div class="bg-white rounded-2xl border border-slate-100 shadow-md p-8 space-y-8">
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-yellow-400/10 rounded-2xl flex items-center justify-center">
            <iconify-icon icon="solar:map-point-bold" width="24" class="text-yellow-600"></iconify-icon>
          </div>
          <div>
            <h2 class="text-2xl font-black text-neutral-900">Recherche locale d'entreprises</h2>
            <p class="text-sm text-neutral-500 font-medium">Trouvez des entreprises près d'une localisation via OpenStreetMap</p>
          </div>
        </div>

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
                  initialLat={localBusinessFilters.location.coordinates?.lat || 48.8566}
                  initialLng={localBusinessFilters.location.coordinates?.lng || 2.3522}
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
            onclick={startLocalBusinessHunt}
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
  </div>
</div>
