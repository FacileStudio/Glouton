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
          Recherche locale par localisation (OpenStreetMap, 100% gratuit)
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
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
    <div class="rounded-xl border border-border bg-card p-6 space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-foreground">Recherche locale d'entreprises</h2>
        <p class="text-sm text-muted-foreground mt-0.5">Trouvez des entreprises près d'une localisation via OpenStreetMap</p>
      </div>

      <div class="space-y-3">
        <span class="text-sm font-medium text-foreground block">Catégories d'activité (sélection multiple)</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {#each businessCategories as category}
            <label
              class="rounded-lg border p-3 transition-colors cursor-pointer {localBusinessFilters.categories.includes(category.value)
                ? 'border-foreground bg-muted'
                : 'border-border bg-background hover:bg-muted'}"
            >
              <div class="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  value={category.value}
                  bind:group={localBusinessFilters.categories}
                  class="w-4 h-4 shrink-0"
                />
                <iconify-icon icon={category.icon} width="16" class="text-foreground shrink-0"></iconify-icon>
                <span class="text-sm text-foreground truncate">{category.label}</span>
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
          onclick={startLocalBusinessHunt}
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
</div>
