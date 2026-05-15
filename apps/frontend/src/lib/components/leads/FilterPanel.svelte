<script lang="ts">
  import 'iconify-icon';

  interface Filters {
    search: string;
    status: string;
    contacted: string;
    country: string;
    city: string;
    businessType: 'all' | 'domain' | 'local';
    category: string;
    hasWebsite: '' | 'true' | 'false';
    hasSocial: '' | 'true' | 'false';
    hasPhone: '' | 'true' | 'false';
    hasGps: '' | 'true' | 'false';
    hasEmail: '' | 'true' | 'false';
  }

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

  const statusOptions = [
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
</script>

<div class="rounded-xl border border-border bg-card p-4 space-y-4">
  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <iconify-icon
        icon="solar:magnifer-linear"
        width="16"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      ></iconify-icon>
      <input
        type="text"
        bind:value={filters.search}
        placeholder="Rechercher par domaine, e-mail, nom, localisation..."
        class="w-full h-9 pl-9 pr-9 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
      />
      {#if filters.search}
        <button
          onclick={() => (filters.search = '')}
          aria-label="Effacer la recherche"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <iconify-icon icon="solar:close-circle-linear" width="16"></iconify-icon>
        </button>
      {/if}
    </div>
    <button
      onclick={() => (filtersExpanded = !filtersExpanded)}
      aria-label={filtersExpanded ? 'Masquer les filtres' : 'Afficher les filtres'}
      class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted flex-shrink-0"
    >
      <iconify-icon icon={filtersExpanded ? 'solar:alt-arrow-up-linear' : 'solar:filter-linear'} width="14"></iconify-icon>
      {filtersExpanded ? 'Masquer' : 'Filtres'}
    </button>
    {#if hasActiveFilters}
      <button
        onclick={onReset}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground flex-shrink-0"
      >
        <iconify-icon icon="solar:restart-linear" width="14"></iconify-icon>
        Réinitialiser
      </button>
    {/if}
  </div>

  {#if filtersExpanded}
    <div class="flex flex-wrap items-start gap-4 pt-2 border-t border-border">

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Statut</span>
        <div class="flex items-center gap-1">
          {#each statusOptions as opt}
            {@const count = counts.status[opt.value as keyof typeof counts.status]}
            <button
              onclick={() => (filters.status = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.status === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
              <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {filters.status === opt.value ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground'}">{count}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Contacté</span>
        <div class="flex items-center gap-1">
          {#each contactedOptions as opt}
            {@const count = counts.contacted[opt.value as keyof typeof counts.contacted]}
            <button
              onclick={() => (filters.contacted = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.contacted === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
              <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {filters.contacted === opt.value ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground'}">{count}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Type</span>
        <div class="flex items-center gap-1">
          {#each typeOptions as opt}
            {@const count = counts.type[opt.value as keyof typeof counts.type]}
            <button
              onclick={() => (filters.businessType = opt.value as Filters['businessType'])}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.businessType === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
              <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {filters.businessType === opt.value ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground'}">{count}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Catégorie</span>
        <select
          bind:value={filters.category}
          class="h-8 w-44 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-ring transition-colors"
        >
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
        </select>
      </div>
    </div>

    <div class="flex flex-wrap items-start gap-4 pt-2 border-t border-border">

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Site web</span>
        <div class="flex items-center gap-1">
          {#each [
            { value: '' as const, icon: 'solar:global-linear', label: 'Tous' },
            { value: 'true' as const, icon: 'solar:check-circle-linear', label: 'Oui' },
            { value: 'false' as const, icon: 'solar:close-circle-linear', label: 'Non' },
          ] as opt}
            <button
              onclick={() => (filters.hasWebsite = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.hasWebsite === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Social</span>
        <div class="flex items-center gap-1">
          {#each [
            { value: '' as const, icon: 'solar:share-linear', label: 'Tous' },
            { value: 'true' as const, icon: 'solar:check-circle-linear', label: 'Oui' },
            { value: 'false' as const, icon: 'solar:close-circle-linear', label: 'Non' },
          ] as opt}
            <button
              onclick={() => (filters.hasSocial = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.hasSocial === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Téléphone</span>
        <div class="flex items-center gap-1">
          {#each [
            { value: '' as const, icon: 'solar:phone-linear', label: 'Tous' },
            { value: 'true' as const, icon: 'solar:check-circle-linear', label: 'Oui' },
            { value: 'false' as const, icon: 'solar:close-circle-linear', label: 'Non' },
          ] as opt}
            <button
              onclick={() => (filters.hasPhone = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.hasPhone === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">GPS</span>
        <div class="flex items-center gap-1">
          {#each [
            { value: '' as const, icon: 'solar:map-point-linear', label: 'Tous' },
            { value: 'true' as const, icon: 'solar:check-circle-linear', label: 'Oui' },
            { value: 'false' as const, icon: 'solar:close-circle-linear', label: 'Non' },
          ] as opt}
            <button
              onclick={() => (filters.hasGps = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.hasGps === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">E-mail</span>
        <div class="flex items-center gap-1">
          {#each [
            { value: '' as const, icon: 'solar:letter-linear', label: 'Tous' },
            { value: 'true' as const, icon: 'solar:check-circle-linear', label: 'Oui' },
            { value: 'false' as const, icon: 'solar:close-circle-linear', label: 'Non' },
          ] as opt}
            <button
              onclick={() => (filters.hasEmail = opt.value)}
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors {filters.hasEmail === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'}"
            >
              <iconify-icon icon={opt.icon} width="12"></iconify-icon>
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Localisation</span>
        <div class="flex items-center gap-1.5">
          <input
            type="text"
            bind:value={filters.country}
            placeholder="Pays"
            class="h-8 w-28 rounded-lg border border-input bg-background px-3 text-xs placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
          />
          <input
            type="text"
            bind:value={filters.city}
            placeholder="Ville"
            class="h-8 w-28 rounded-lg border border-input bg-background px-3 text-xs placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
          />
        </div>
      </div>
    </div>
  {/if}
</div>
