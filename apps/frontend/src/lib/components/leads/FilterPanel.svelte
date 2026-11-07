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
  import { Button, Card, Input, Select } from '@facile/muse';

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

  const statusOptions: { value: Filters['status']; label: string; icon: string }[] = [
    { value: '', label: 'Tous', icon: 'solar:users-group-rounded-linear' },
    { value: 'HOT', label: 'Chaud', icon: 'solar:fire-linear' },
    { value: 'WARM', label: 'Tiède', icon: 'solar:sun-2-linear' },
    { value: 'COLD', label: 'Froid', icon: 'solar:snowflake-linear' },
  ];

  const contactedOptions = [
    { value: '', label: 'Tous', icon: 'solar:users-group-rounded-linear' },
    { value: 'false', label: 'Nouveau', icon: 'solar:user-plus-linear' },
    { value: 'true', label: 'Contacté', icon: 'solar:check-circle-linear' },
  ];

  const typeOptions = [
    { value: 'all', label: 'Tous types', icon: 'solar:widget-2-linear' },
    { value: 'domain', label: 'Domaine', icon: 'solar:global-linear' },
    { value: 'local', label: 'Local', icon: 'solar:map-point-linear' },
  ];

  const presenceGroups: { key: 'hasWebsite' | 'hasSocial' | 'hasPhone' | 'hasGps' | 'hasEmail'; label: string; icon: string }[] = [
    { key: 'hasWebsite', label: 'Site web', icon: 'solar:global-linear' },
    { key: 'hasSocial', label: 'Social', icon: 'solar:share-linear' },
    { key: 'hasPhone', label: 'Téléphone', icon: 'solar:phone-linear' },
    { key: 'hasGps', label: 'GPS', icon: 'solar:map-point-linear' },
    { key: 'hasEmail', label: 'E-mail', icon: 'solar:letter-linear' },
  ];

  function presenceOptions(icon: string) {
    return [
      { value: '' as const, icon, label: 'Tous' },
      { value: 'true' as const, icon: 'solar:check-circle-linear', label: 'Oui' },
      { value: 'false' as const, icon: 'solar:close-circle-linear', label: 'Non' },
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
        placeholder="Rechercher par domaine, e-mail, nom, localisation..."
        aria-label="Rechercher des leads"
        class="pr-11 pl-9 text-fc-sm"
      />
      {#if filters.search}
        <button
          type="button"
          onclick={() => (filters.search = '')}
          aria-label="Effacer la recherche"
          class="absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-fc-md text-fc-fg-muted transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
        >
          <iconify-icon icon="mdi:close" width="16" height="16" class="block"></iconify-icon>
        </button>
      {/if}
    </div>
    <Button
      variant="outline"
      icon={filtersExpanded ? 'mdi:chevron-up' : 'solar:filter-linear'}
      onclick={() => (filtersExpanded = !filtersExpanded)}
      aria-label={filtersExpanded ? 'Masquer les filtres' : 'Afficher les filtres'}
      aria-expanded={filtersExpanded}
      class="h-11"
    >
      {filtersExpanded ? 'Masquer' : 'Filtres'}
    </Button>
    {#if hasActiveFilters}
      <Button variant="ghost" icon="solar:restart-linear" onclick={onReset} class="h-11">
        Réinitialiser
      </Button>
    {/if}
  </div>

  {#if filtersExpanded}
    <div class="flex flex-wrap items-start gap-4 pt-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">Statut</span>
        <div class="flex flex-wrap items-center gap-1">
          {#each statusOptions as opt (opt.value)}
            {@render chip(filters.status === opt.value, () => (filters.status = opt.value), opt.icon, opt.label, counts.status[opt.value as keyof typeof counts.status])}
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">Contacté</span>
        <div class="flex flex-wrap items-center gap-1">
          {#each contactedOptions as opt (opt.value)}
            {@render chip(filters.contacted === opt.value, () => (filters.contacted = opt.value), opt.icon, opt.label, counts.contacted[opt.value as keyof typeof counts.contacted])}
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">Type</span>
        <div class="flex flex-wrap items-center gap-1">
          {#each typeOptions as opt (opt.value)}
            {@render chip(filters.businessType === opt.value, () => (filters.businessType = opt.value as Filters['businessType']), opt.icon, opt.label, counts.type[opt.value as keyof typeof counts.type])}
          {/each}
        </div>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="text-fc-xs text-fc-fg-muted">Catégorie</span>
        <Select bind:value={filters.category} class="w-full text-fc-sm sm:w-56 md:h-8 md:text-fc-xs">
          <option value="">Toutes les catégories</option>
          <option value="restaurant">Restaurant</option>
          <option value="cafe">Café</option>
          <option value="bar">Bar</option>
          <option value="hotel">Hôtel</option>
          <option value="retail">Commerce</option>
          <option value="office">Bureau</option>
          <option value="service">Service</option>
          <option value="healthcare">Santé</option>
          <option value="education">Éducation</option>
          <option value="entertainment">Divertissement</option>
          <option value="automotive">Automobile</option>
          <option value="real-estate">Immobilier</option>
          <option value="finance">Finance</option>
          <option value="beauty">Beauté</option>
          <option value="fitness">Fitness</option>
          <option value="travel">Voyage</option>
          <option value="food-delivery">Livraison repas</option>
          <option value="grocery">Épicerie</option>
          <option value="pharmacy">Pharmacie</option>
          <option value="pet-services">Animalerie</option>
          <option value="home-services">Services à domicile</option>
          <option value="professional-services">Services professionnels</option>
          <option value="seo-agency">Agence SEO</option>
          <option value="design-agency">Agence design</option>
          <option value="web-dev-agency">Agence web</option>
          <option value="marketing-agency">Agence marketing</option>
          <option value="other">Autre</option>
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
        <span class="text-fc-xs text-fc-fg-muted">Localisation</span>
        <div class="flex items-center gap-1.5">
          <Input type="text" bind:value={filters.country} placeholder="Pays" aria-label="Pays" class="w-28 text-fc-sm md:h-8 md:text-fc-xs" />
          <Input type="text" bind:value={filters.city} placeholder="Ville" aria-label="Ville" class="w-28 text-fc-sm md:h-8 md:text-fc-xs" />
        </div>
      </div>
    </div>
  {/if}
</Card>
