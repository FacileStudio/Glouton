<script lang="ts" module>
  import type { trpc } from '$lib/trpc';
  type LeadListInput = Exclude<Parameters<typeof trpc.lead.query.list.query>[0], void | undefined>;

  export interface Filters {
    search: string;
    status: '' | NonNullable<LeadListInput['status']>;
    contacted: string;
    country: string;
    city: string;
    businessType: 'all' | 'domain' | 'local';
    category: '' | NonNullable<LeadListInput['category']>;
    hasWebsite: '' | 'true' | 'false';
    hasSocial: '' | 'true' | 'false';
    hasPhone: '' | 'true' | 'false';
    hasGps: '' | 'true' | 'false';
    hasEmail: '' | 'true' | 'false';
  }
</script>

<script lang="ts">
  import { useT } from '$lib/i18n';
  import { Button, Card, Input, Select } from '@facile/muse';

  const t = useT();

  interface Lead {
    status: 'HOT' | 'WARM' | 'COLD';
    contacted: boolean;
    domain: string | null;
  }

  let {
    filters = $bindable(),
    filtersExpanded = $bindable(),
    leads = [],
    onReset,
  }: {
    filters: Filters;
    filtersExpanded: boolean;
    leads?: Lead[];
    onReset: () => void;
  } = $props();

  let hasActiveFilters = $derived(
    !!(filters.status || filters.contacted || filters.country || filters.city
      || filters.businessType !== 'all' || filters.search || !!filters.category
      || filters.hasWebsite || filters.hasSocial || filters.hasPhone || filters.hasGps || filters.hasEmail)
  );

  let counts = $derived({
    status: {
      '': leads.length,
      HOT: leads.filter((l) => l.status === 'HOT').length,
      WARM: leads.filter((l) => l.status === 'WARM').length,
      COLD: leads.filter((l) => l.status === 'COLD').length,
    },
    contacted: {
      '': leads.length,
      false: leads.filter((l) => !l.contacted).length,
      true: leads.filter((l) => l.contacted).length,
    },
    type: {
      all: leads.length,
      domain: leads.filter((l) => !!l.domain).length,
      local: leads.filter((l) => !l.domain).length,
    },
  });

  const statusOptions = $derived<{ value: Filters['status']; label: string; icon: string }[]>([
    { value: '', label: t('common.all'), icon: 'solar:users-group-rounded-linear' },
    { value: 'HOT', label: t('temp.HOT'), icon: 'solar:fire-linear' },
    { value: 'WARM', label: t('temp.WARM'), icon: 'solar:sun-2-linear' },
    { value: 'COLD', label: t('temp.COLD'), icon: 'solar:snowflake-linear' },
  ]);

  const contactedOptions = $derived([
    { value: '', label: t('common.all'), icon: 'solar:users-group-rounded-linear' },
    { value: 'false', label: t('leads.filter.new'), icon: 'solar:user-plus-linear' },
    { value: 'true', label: t('leads.contacted'), icon: 'solar:check-circle-linear' },
  ]);

  const typeOptions = $derived([
    { value: 'all', label: t('leads.filter.allTypes'), icon: 'solar:widget-2-linear' },
    { value: 'domain', label: t('leads.sort.domain'), icon: 'solar:global-linear' },
    { value: 'local', label: t('hunts.kind.local'), icon: 'solar:map-point-linear' },
  ]);

  const presenceGroups = $derived<{ key: 'hasWebsite' | 'hasSocial' | 'hasPhone' | 'hasGps' | 'hasEmail'; label: string; icon: string }[]>([
    { key: 'hasWebsite', label: t('leads.filter.website'), icon: 'solar:global-linear' },
    { key: 'hasSocial', label: t('leads.filter.social'), icon: 'solar:share-linear' },
    { key: 'hasPhone', label: t('leads.filter.phone'), icon: 'solar:phone-linear' },
    { key: 'hasGps', label: t('leads.filter.gps'), icon: 'solar:map-point-linear' },
    { key: 'hasEmail', label: t('leads.sort.email'), icon: 'solar:letter-linear' },
  ]);

  function presenceOptions(icon: string) {
    return [
      { value: '' as const, icon, label: t('common.all') },
      { value: 'true' as const, icon: 'solar:check-circle-linear', label: t('common.yes') },
      { value: 'false' as const, icon: 'solar:close-circle-linear', label: t('common.no') },
    ];
  }
</script>

{#snippet chip(active: boolean, onSelect: () => void, icon: string, label: string, count?: number)}
  <button
    type="button"
    onclick={onSelect}
    aria-pressed={active}
    class="inline-flex h-11 items-center gap-1.5 rounded-fc-pill px-3 text-fc-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring md:h-8 {active
      ? 'bg-fc-accent text-fc-accent-fg'
      : 'text-fc-fg hover:bg-fc-surface'}"
  >
    <iconify-icon {icon} width="12" height="12" class="block"></iconify-icon>
    {label}
    {#if count !== undefined}
      <span class="rounded-fc-pill px-1.5 py-0.5 text-fc-xs font-medium {active ? 'bg-fc-accent-fg/15' : 'bg-fc-surface text-fc-fg-muted'}">{count}</span>
    {/if}
  </button>
{/snippet}

<Card class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative min-w-0 flex-1 basis-60">
      <iconify-icon
        icon="solar:magnifer-linear"
        width="16"
        height="16"
        class="pointer-events-none absolute top-1/2 left-3 block -translate-y-1/2 text-fc-fg-muted"
      ></iconify-icon>
      <Input
        type="text"
        bind:value={filters.search}
        placeholder={t('leads.filter.searchPlaceholder')}
        aria-label={t('leads.filter.search')}
        class="pr-11 pl-9 text-fc-sm"
      />
      {#if filters.search}
        <button
          type="button"
          onclick={() => (filters.search = '')}
          aria-label={t('leads.filter.clearSearch')}
          class="absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-fc-md text-fc-fg-muted transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
        >
          <iconify-icon icon="mdi:close" width="16" height="16" class="block"></iconify-icon>
        </button>
      {/if}
    </div>
    <Button
      variant="secondary"
      icon={filtersExpanded ? 'mdi:chevron-up' : 'solar:filter-linear'}
      onclick={() => (filtersExpanded = !filtersExpanded)}
      aria-label={filtersExpanded ? t('leads.filter.hideFilters') : t('leads.filter.showFilters')}
      aria-expanded={filtersExpanded}
      class="h-11"
    >
      {filtersExpanded ? t('leads.filter.hide') : t('leads.filter.filters')}
    </Button>
    {#if hasActiveFilters}
      <Button variant="ghost" icon="solar:restart-linear" onclick={onReset} class="h-11">
        {t('leads.filter.reset')}
      </Button>
    {/if}
  </div>

  {#if filtersExpanded}
    <div class="flex flex-wrap items-start gap-4 pt-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">{t('leads.col.status')}</span>
        <div class="flex flex-wrap items-center gap-1">
          {#each statusOptions as opt (opt.value)}
            {@render chip(filters.status === opt.value, () => (filters.status = opt.value), opt.icon, opt.label, counts.status[opt.value as keyof typeof counts.status])}
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">{t('leads.contacted')}</span>
        <div class="flex flex-wrap items-center gap-1">
          {#each contactedOptions as opt (opt.value)}
            {@render chip(filters.contacted === opt.value, () => (filters.contacted = opt.value), opt.icon, opt.label, counts.contacted[opt.value as keyof typeof counts.contacted])}
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">{t('leads.filter.type')}</span>
        <div class="flex flex-wrap items-center gap-1">
          {#each typeOptions as opt (opt.value)}
            {@render chip(filters.businessType === opt.value, () => (filters.businessType = opt.value as Filters['businessType']), opt.icon, opt.label, counts.type[opt.value as keyof typeof counts.type])}
          {/each}
        </div>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">{t('leads.filter.category')}</span>
        <Select bind:value={filters.category} class="w-full text-fc-sm sm:w-56 md:h-8 md:text-fc-xs">
          <option value="">{t('leads.filter.allCategories')}</option>
          <option value="restaurant">{t('leads.cat.restaurant')}</option>
          <option value="cafe">{t('leads.cat.cafe')}</option>
          <option value="bar">{t('leads.cat.bar')}</option>
          <option value="hotel">{t('leads.cat.hotel')}</option>
          <option value="retail">{t('leads.cat.retail')}</option>
          <option value="office">{t('leads.cat.office')}</option>
          <option value="service">{t('leads.cat.service')}</option>
          <option value="healthcare">{t('hunts.cat.healthcare')}</option>
          <option value="education">{t('hunts.cat.education')}</option>
          <option value="entertainment">{t('leads.cat.entertainment')}</option>
          <option value="automotive">{t('hunts.cat.automotive')}</option>
          <option value="real-estate">{t('leads.cat.realEstate')}</option>
          <option value="finance">{t('leads.cat.finance')}</option>
          <option value="beauty">{t('leads.cat.beauty')}</option>
          <option value="fitness">{t('leads.cat.fitness')}</option>
          <option value="travel">{t('leads.cat.travel')}</option>
          <option value="food-delivery">{t('leads.cat.foodDelivery')}</option>
          <option value="grocery">{t('leads.cat.grocery')}</option>
          <option value="pharmacy">{t('leads.cat.pharmacy')}</option>
          <option value="pet-services">{t('leads.cat.petServices')}</option>
          <option value="home-services">{t('leads.cat.homeServices')}</option>
          <option value="professional-services">{t('hunts.cat.professional')}</option>
          <option value="seo-agency">{t('leads.cat.seo')}</option>
          <option value="design-agency">{t('leads.cat.design')}</option>
          <option value="web-dev-agency">{t('leads.cat.webDev')}</option>
          <option value="marketing-agency">{t('leads.cat.marketing')}</option>
          <option value="other">{t('leads.cat.other')}</option>
        </Select>
      </label>
    </div>

    <div class="flex flex-wrap items-start gap-4 pt-4">
      {#each presenceGroups as group (group.key)}
        <div class="flex flex-col gap-1.5">
          <span class="text-fc-xs text-fc-fg-muted">{group.label}</span>
          <div class="flex flex-wrap items-center gap-1">
            {#each presenceOptions(group.icon) as opt (opt.value)}
              {@render chip(filters[group.key] === opt.value, () => (filters[group.key] = opt.value), opt.icon, opt.label)}
            {/each}
          </div>
        </div>
      {/each}

      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">{t('leads.sort.location')}</span>
        <div class="flex items-center gap-1.5">
          <Input type="text" bind:value={filters.country} placeholder={t('hunts.new.country')} aria-label={t('hunts.new.country')} class="w-28 text-fc-sm md:h-8 md:text-fc-xs" />
          <Input type="text" bind:value={filters.city} placeholder={t('hunts.new.city')} aria-label={t('hunts.new.city')} class="w-28 text-fc-sm md:h-8 md:text-fc-xs" />
        </div>
      </div>
    </div>
  {/if}
</Card>
