<script lang="ts">
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import type { RouterInputs } from '@repo/trpc-client';

  type BusinessCategory = RouterInputs['lead']['hunt']['startLocalBusiness']['categories'][number];
  import { toast, PageHeader, Button, Card, Field, Input, Select, Spinner, Icon } from '@facile/muse';
  import LocationPickerMap from '$lib/components/LocationPickerMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';

  let teamId = $derived(teamContextStore.getTeamId());

  let mapComponent = $state<LocationPickerMap>();
  let showMap = $state(false);

  let loading = $state(false);
  let loadingLocation = $state(false);
  let userLocation = $state<{ city?: string; country?: string; countryCode?: string; state?: string} | null>(null);

  let localBusinessFilters = $state({
    categories: [] as BusinessCategory[],
    hasWebsite: 'all' as 'all' | 'with' | 'without',
    radius: 5,
    maxResults: 100,
    location: {
      city: '',
      country: '',
      coordinates: null as { lat: number; lng: number } | null,
    },
  });

  const businessCategories: { value: BusinessCategory; label: string; icon: string }[] = [
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

      toast.success(`Localisation détectée : ${cityName}, ${countryName}`);
    } catch (error) {
      console.error('Error detecting location:', error);

      const errorMessage =
        getErrorMessage(error, '') === 'User denied Geolocation'
          ? 'Accès à la localisation refusé. Cliquez sur "Détecter la localisation" pour réessayer ou saisissez-la manuellement.'
          : 'Impossible de détecter la localisation. Veuillez la saisir manuellement ou réessayer.';

      toast.info(errorMessage);
    } finally {
      loadingLocation = false;
    }
  }

  async function startLocalBusinessHunt() {
    if (loading) return;

    if (localBusinessFilters.categories.length === 0) {
      toast.danger('Veuillez sélectionner au moins une catégorie d\'activité');
      return;
    }

    if (!localBusinessFilters.location.city && !localBusinessFilters.location.coordinates) {
      toast.danger('Veuillez indiquer une localisation (ville ou GPS)');
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
      const categoryCount = localBusinessFilters.categories.length;
      toast.success(
        `Chasse locale démarrée pour ${categoryCount} catégorie${categoryCount > 1 ? 's' : ''} !`,
      );
      await goto(huntSessionId ? resolve('/app/hunts/[id]', { id: huntSessionId }) : resolve('/app/hunts'));
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Échec du démarrage de la chasse locale');
      toast.danger(errorMessage);
      console.error('Error starting local business hunt:', error);
      loading = false;
    }
  }
</script>

<PageHeader
  title="Nouvelle chasse"
  description="Recherche locale par localisation (OpenStreetMap, 100% gratuit)"
  back={{ href: '/app/hunts', label: 'Retour aux chasses' }}
>
  {#snippet actions()}
    <Button href="/app/hunts" variant="ghost">Annuler</Button>
  {/snippet}
</PageHeader>

<Card class="flex w-full max-w-fc-lg flex-col gap-6">
  <div class="flex flex-col gap-1">
    <h2 class="text-fc-lg font-semibold text-fc-fg">Recherche locale d'entreprises</h2>
    <p class="text-fc-sm text-fc-fg-muted">Trouvez des entreprises près d'une localisation via OpenStreetMap</p>
  </div>

  <fieldset class="flex flex-col gap-3">
    <legend class="mb-3 text-fc-sm font-medium text-fc-fg">Catégories d'activité (sélection multiple)</legend>
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
      {#each businessCategories as category (category.value)}
        <label
          class="flex min-h-11 cursor-pointer items-center gap-2 rounded-fc-md p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fc-ring {localBusinessFilters.categories.includes(category.value)
            ? 'bg-fc-accent text-fc-accent-fg'
            : 'bg-fc-component hover:bg-fc-surface'}"
        >
          <input
            type="checkbox"
            value={category.value}
            bind:group={localBusinessFilters.categories}
            class="size-4 shrink-0 accent-fc-accent"
          />
          <Icon icon={category.icon} class="text-fc-fg" />
          <span class="truncate text-fc-sm text-fc-fg">{category.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-fc-sm font-medium text-fc-fg">Localisation</span>
      <Button
        variant="ghost"
        size="sm"
        icon={loadingLocation ? undefined : 'solar:map-point-linear'}
        onclick={() => detectLocation('auto')}
        disabled={loadingLocation}
      >
        {#if loadingLocation}
          <Spinner size="sm" label="Détection" />
          Détection
        {:else}
          {userLocation ? 'Re-détecter' : 'Utiliser le GPS'}
        {/if}
      </Button>
    </div>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Input
        bind:value={localBusinessFilters.location.city}
        type="text"
        placeholder="Ville (ex. : Paris, Lyon)"
        aria-label="Ville"
      />
      <Input
        bind:value={localBusinessFilters.location.country}
        type="text"
        placeholder="Pays (ex. : FR, BE)"
        aria-label="Pays"
      />
    </div>

    <div class="flex flex-col gap-3">
      <Button
        variant="ghost"
        size="sm"
        class="w-fit"
        icon={showMap ? 'solar:map-arrow-down-linear' : 'solar:map-arrow-up-linear'}
        onclick={() => (showMap = !showMap)}
      >
        {showMap ? 'Masquer la carte' : 'Choisir sur la carte'}
      </Button>

      {#if showMap}
        <div class="h-96 overflow-hidden rounded-fc-lg">
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
        <p class="text-fc-xs text-fc-fg-muted">
          Cliquez sur la carte ou déplacez le marqueur pour sélectionner une localisation. Le rayon de recherche est affiché en cercle.
        </p>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <Field label="Filtre site web">
      <Select
        value={localBusinessFilters.hasWebsite}
        onchange={(e) => (localBusinessFilters.hasWebsite = e.currentTarget.value as 'all' | 'with' | 'without')}
      >
        <option value="all">Toutes les entreprises</option>
        <option value="with">Avec site web uniquement</option>
        <option value="without">Sans site web uniquement</option>
      </Select>
    </Field>

    <Field label="Rayon de recherche">
      <Select
        value={String(localBusinessFilters.radius)}
        onchange={(e) => {
          localBusinessFilters.radius = Number(e.currentTarget.value);
          mapComponent?.setRadius(localBusinessFilters.radius * 1000);
        }}
      >
        <option value="1">1 km</option>
        <option value="5">5 km</option>
        <option value="10">10 km</option>
        <option value="25">25 km</option>
        <option value="50">50 km</option>
      </Select>
    </Field>
  </div>

  <div class="pt-6">
    <Button
      class="w-full"
      size="lg"
      icon={loading ? undefined : 'solar:map-point-linear'}
      onclick={startLocalBusinessHunt}
      disabled={loading}
    >
      {#if loading}
        <Spinner size="sm" label="Recherche" class="text-fc-accent-fg" />
        Recherche
      {:else}
        Lancer la chasse locale
      {/if}
    </Button>
  </div>
</Card>
