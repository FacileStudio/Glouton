<script lang="ts">
  import { QUIET } from '@repo/trpc-client';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { CATEGORIES, FREQUENCIES, limitFrom, type BusinessCategory, type Frequency } from '$lib/components/schedules/labels';
  import { toast, PageHeader, Button, Card, Combobox, Field, IconButton, Input, PlanLimit, Select, Spinner, Icon, icons, type PlanLimitError } from '@facile/muse';
  import { searchTaxonomy } from '@repo/trpc/taxonomy';
  import { tagLabel } from '$lib/components/profile/targets';
  import LocationPickerMap from '$lib/components/LocationPickerMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useLocale, useT } from '$lib/i18n';
  import { onMount } from 'svelte';

  const t = useT();
  const locale = useLocale();

  let teamId = $derived(teamContextStore.getTeamId());

  let mapComponent = $state<LocationPickerMap>();
  let showMap = $state(false);

  let loading = $state(false);
  let repeat = $state<Frequency | 'none'>('none');
  let limit = $state<PlanLimitError | null>(null);
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

  const businessCategories = $derived(CATEGORIES.map((category) => ({ ...category, label: t(category.label) })));

  let tagQuery = $state('');
  const tagOptions = $derived(
    searchTaxonomy(tagQuery, locale(), { kinds: ['osm'], limit: 30 }).map((item) => ({ value: item.value, label: `${item.label} · ${item.value}` })),
  );
  const extraTags = $derived(localBusinessFilters.categories.filter((category) => category.includes('=')));

  function addTag(option: { value: string }) {
    if (!localBusinessFilters.categories.includes(option.value)) localBusinessFilters.categories = [...localBusinessFilters.categories, option.value];
    tagQuery = '';
  }

  function removeTag(tag: string) {
    localBusinessFilters.categories = localBusinessFilters.categories.filter((category) => category !== tag);
  }

  onMount(async () => {
    try {
      const profile = await trpc.prospect.get.query({ teamId }, { context: QUIET });
      const tags = profile.targets.clients.osmTags.slice(0, 10);
      if (localBusinessFilters.categories.length === 0 && tags.length > 0) localBusinessFilters.categories = [...tags];
    } catch {
      return;
    }
  });

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

      const cityName = location.city || t('hunts.new.unknownCity');
      const countryName = location.country || t('hunts.new.unknownCountry');

      toast.success(t('hunts.new.detected', { city: cityName, country: countryName }));
    } catch (error) {
      console.error('Error detecting location:', error);

      const errorMessage =
        getErrorMessage(error, '') === 'User denied Geolocation'
          ? t('hunts.new.denied')
          : t('hunts.new.detectFailed');

      toast.info(errorMessage);
    } finally {
      loadingLocation = false;
    }
  }

  async function startLocalBusinessHunt() {
    if (loading) return;

    if (localBusinessFilters.categories.length === 0) {
      toast.danger(t('hunts.new.pickCategory'));
      return;
    }

    if (!localBusinessFilters.location.city && !localBusinessFilters.location.coordinates) {
      toast.danger(t('hunts.new.pickLocation'));
      return;
    }

    loading = true;
    try {
      const locationString = localBusinessFilters.location.city
        ? `${localBusinessFilters.location.city}${localBusinessFilters.location.country ? ', ' + localBusinessFilters.location.country : ''}`
        : `${localBusinessFilters.location.coordinates?.lat},${localBusinessFilters.location.coordinates?.lng}`;

      const filters = {
        teamId,
        location: locationString,
        categories: localBusinessFilters.categories,
        hasWebsite: localBusinessFilters.hasWebsite === 'with' ? true : localBusinessFilters.hasWebsite === 'without' ? false : undefined,
        radius: localBusinessFilters.radius * 1000,
        maxResults: localBusinessFilters.maxResults,
      };
      const result =
        repeat === 'none'
          ? await trpc.lead.hunt.startLocalBusiness.mutate(filters)
          : await trpc.huntSchedule.create.mutate({ ...filters, frequency: repeat, runNow: true }, { context: QUIET });

      const huntSessionId = result?.huntSessionId;
      const categoryCount = localBusinessFilters.categories.length;
      toast.success(t(categoryCount > 1 ? 'hunts.new.startedMany' : 'hunts.new.startedOne', { count: categoryCount }));
      await goto(huntSessionId ? resolve('/app/hunts/[id]', { id: huntSessionId }) : resolve('/app/searches/hunts'));
    } catch (error) {
      limit = limitFrom(error);
      if (limit) {
        loading = false;
        return;
      }
      const errorMessage = getErrorMessage(error, t('hunts.new.startFailed'));
      toast.danger(errorMessage);
      console.error('Error starting local business hunt:', error);
      loading = false;
    }
  }
</script>

<PageHeader
  title={t('hunts.new')}
  description={t('hunts.new.subtitle')}
  back={{ href: '/app/searches/hunts', label: t('hunts.backToHunts') }}
>
  {#snippet actions()}
    <Button href="/app/searches/hunts" variant="ghost">{t('common.cancel')}</Button>
  {/snippet}
</PageHeader>

<Card class="flex w-full max-w-fc-lg flex-col gap-6">
  <div class="flex flex-col gap-1">
    <h2 class="text-fc-lg font-semibold text-fc-fg">{t('hunts.new.localTitle')}</h2>
    <p class="text-fc-sm text-fc-fg-muted">{t('hunts.new.localText')}</p>
  </div>

  <fieldset class="flex flex-col gap-3">
    <legend class="mb-3 text-fc-sm font-medium text-fc-fg">{t('hunts.new.categories')}</legend>
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
    <Field label={t('hunts.new.moreTypes')} helper={t('hunts.new.moreTypesHint')} for="hunt-tags" class="w-full">
      <Combobox id="hunt-tags" bind:value={tagQuery} options={tagOptions} onSelect={addTag} placeholder={t('hunts.new.moreTypesPlaceholder')} wrapperClass="w-full" />
    </Field>
    {#if extraTags.length > 0}
      <ul class="flex flex-wrap gap-2" aria-label={t('profile.selected')}>
        {#each extraTags as tag (tag)}
          <li class="inline-flex max-w-full items-center gap-1 rounded-fc-pill bg-fc-component py-0.5 pr-0.5 pl-3 text-fc-xs whitespace-nowrap text-fc-fg">
            <span class="truncate">{tagLabel(tag, locale()) ?? tag}</span>
            <IconButton variant="ghost" class="size-8" aria-label={t('profile.remove', { name: tagLabel(tag, locale()) ?? tag })} onclick={() => removeTag(tag)}>
              <Icon icon={icons.close} />
            </IconButton>
          </li>
        {/each}
      </ul>
    {/if}
  </fieldset>

  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-fc-sm font-medium text-fc-fg">{t('hunts.new.location')}</span>
      <Button
        variant="ghost"
        size="sm"
        icon={loadingLocation ? undefined : 'solar:map-point-linear'}
        onclick={() => detectLocation('auto')}
        disabled={loadingLocation}
      >
        {#if loadingLocation}
          <Spinner size="sm" label={t('hunts.new.detecting')} />
          {t('hunts.new.detecting')}
        {:else}
          {userLocation ? t('hunts.new.redetect') : t('hunts.new.useGps')}
        {/if}
      </Button>
    </div>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Input
        bind:value={localBusinessFilters.location.city}
        type="text"
        placeholder={t('hunts.new.cityPlaceholder')}
        aria-label={t('hunts.new.city')}
      />
      <Input
        bind:value={localBusinessFilters.location.country}
        type="text"
        placeholder={t('hunts.new.countryPlaceholder')}
        aria-label={t('hunts.new.country')}
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
        {showMap ? t('hunts.new.hideMap') : t('hunts.new.showMap')}
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
          {t('hunts.new.mapHint')}
        </p>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <Field label={t('hunts.new.websiteFilter')}>
      <Select
        value={localBusinessFilters.hasWebsite}
        onchange={(e) => (localBusinessFilters.hasWebsite = e.currentTarget.value as 'all' | 'with' | 'without')}
      >
        <option value="all">{t('hunts.new.allCompanies')}</option>
        <option value="with">{t('hunts.new.withWebsite')}</option>
        <option value="without">{t('hunts.new.withoutWebsite')}</option>
      </Select>
    </Field>

    <Field label={t('hunts.new.radius')}>
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

    <Field label={t('schedules.repeat')} helper={t('schedules.repeat.hint')}>
      <Select value={repeat} onchange={(e) => (repeat = e.currentTarget.value as Frequency | 'none')}>
        <option value="none">{t('schedules.repeat.none')}</option>
        {#each FREQUENCIES as frequency (frequency)}
          <option value={frequency}>{t(`schedules.freq.${frequency}`)}</option>
        {/each}
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
        <Spinner size="sm" label={t('hunts.new.searching')} class="text-fc-accent-fg" />
        {t('hunts.new.searching')}
      {:else}
        {t('hunts.new.start')}
      {/if}
    </Button>
  </div>
</Card>

<PlanLimit error={limit} variant="dialog" onClose={() => (limit = null)} />
