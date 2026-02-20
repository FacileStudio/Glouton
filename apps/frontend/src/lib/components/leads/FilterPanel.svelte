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
    viewMode = $bindable(),
    leads = [],
    onReset,
  }: {
    filters: Filters;
    viewMode: 'grid' | 'table';
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
    { value: '', label: 'Tous', icon: 'solar:users-group-rounded-bold-duotone', iconClass: 'text-neutral-400' },
    { value: 'HOT', label: 'Chaud', icon: 'solar:fire-bold-duotone', iconClass: 'text-orange-500' },
    { value: 'WARM', label: 'Tiède', icon: 'solar:sun-2-bold-duotone', iconClass: 'text-yellow-500' },
    { value: 'COLD', label: 'Froid', icon: 'solar:snowflake-bold-duotone', iconClass: 'text-blue-400' },
  ];

  const contactedOptions = [
    { value: '', label: 'Tous', icon: 'solar:users-group-rounded-bold-duotone', iconClass: 'text-neutral-400' },
    { value: 'false', label: 'Nouveau', icon: 'solar:user-plus-bold-duotone', iconClass: 'text-violet-500' },
    { value: 'true', label: 'Contacté', icon: 'solar:check-circle-bold-duotone', iconClass: 'text-green-500' },
  ];

  const typeOptions = [
    { value: 'all', label: 'Tous types', icon: 'solar:widget-2-bold-duotone', iconClass: 'text-neutral-400' },
    { value: 'domain', label: 'Domaine', icon: 'solar:global-bold-duotone', iconClass: 'text-blue-500' },
    { value: 'local', label: 'Local', icon: 'solar:map-point-bold-duotone', iconClass: 'text-rose-500' },
  ];
</script>

<div class="rounded-[28px] shadow-lg p-5 space-y-3" style="background-color: #EFEAE6;">

  <!-- Row 1: Search + View Toggle + Reset -->
  <div class="flex items-center gap-3">
    <div class="relative flex-1">
      <iconify-icon
        icon="solar:magnifer-bold"
        width="18"
        class="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
      ></iconify-icon>
      <input
        type="text"
        bind:value={filters.search}
        placeholder="Rechercher par domaine, e-mail, nom, localisation..."
        class="w-full h-12 pl-11 pr-10 bg-white rounded-2xl border border-neutral-200 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 outline-none font-medium text-sm placeholder:text-neutral-400 transition-all"
      />
      {#if filters.search}
        <button
          onclick={() => (filters.search = '')}
          aria-label="Effacer la recherche"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black transition-colors"
        >
          <iconify-icon icon="solar:close-circle-bold" width="18"></iconify-icon>
        </button>
      {/if}
    </div>
    <div class="flex items-center gap-1 bg-white rounded-2xl p-1 border border-neutral-200 h-12 flex-shrink-0">
      <button
        onclick={() => (viewMode = 'table')}
        aria-label="Vue tableau"
        class="px-3 h-full rounded-xl transition-all flex items-center justify-center {viewMode === 'table' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}"
      >
        <iconify-icon icon="solar:list-bold" width="18"></iconify-icon>
      </button>
      <button
        onclick={() => (viewMode = 'grid')}
        aria-label="Vue grille"
        class="px-3 h-full rounded-xl transition-all flex items-center justify-center {viewMode === 'grid' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}"
      >
        <iconify-icon icon="solar:widget-2-bold" width="18"></iconify-icon>
      </button>
    </div>
    {#if hasActiveFilters}
      <button
        onclick={onReset}
        class="h-12 px-4 bg-white rounded-2xl border border-neutral-200 text-neutral-600 hover:text-black hover:border-neutral-900 transition-all font-bold text-sm flex items-center gap-2 flex-shrink-0"
      >
        <iconify-icon icon="solar:restart-bold" width="16"></iconify-icon>
        Réinitialiser
      </button>
    {/if}
  </div>

  <!-- Row 2: Lead filters -->
  <div class="flex flex-wrap items-start gap-4 pt-1">

    <!-- Status -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Statut</span>
      <div class="flex items-center gap-1">
        {#each statusOptions as opt}
          {@const count = counts.status[opt.value as keyof typeof counts.status]}
          <button
            onclick={() => (filters.status = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.status === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.status === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
            <span class="text-[10px] px-1.5 py-0.5 rounded-lg font-black {filters.status === opt.value ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}">{count}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Contacted -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Contacté</span>
      <div class="flex items-center gap-1">
        {#each contactedOptions as opt}
          {@const count = counts.contacted[opt.value as keyof typeof counts.contacted]}
          <button
            onclick={() => (filters.contacted = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.contacted === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.contacted === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
            <span class="text-[10px] px-1.5 py-0.5 rounded-lg font-black {filters.contacted === opt.value ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}">{count}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Type -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Type</span>

      <div class="flex items-center gap-1">
        {#each typeOptions as opt}
          {@const count = counts.type[opt.value as keyof typeof counts.type]}
          <button
            onclick={() => (filters.businessType = opt.value as Filters['businessType'])}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.businessType === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.businessType === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
            <span class="text-[10px] px-1.5 py-0.5 rounded-lg font-black {filters.businessType === opt.value ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}">{count}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Category -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Catégorie</span>
      <div class="relative">
        <iconify-icon icon="solar:tag-bold-duotone" width="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"></iconify-icon>
        <select
          bind:value={filters.category}
          class="h-8 w-44 pl-7 pr-3 bg-white rounded-xl border border-neutral-200 focus:border-neutral-900 outline-none font-medium text-xs text-neutral-600 transition-all appearance-none cursor-pointer"
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

  </div>

  <!-- Row 3: Data presence + Location filters -->
  <div class="flex flex-wrap items-start gap-4 pt-1 border-t border-neutral-300/60">

    <!-- Website -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Site web</span>
      <div class="flex items-center gap-1">
        {#each [
          { value: '' as const, icon: 'solar:global-bold-duotone', label: 'Tous', iconClass: 'text-neutral-400' },
          { value: 'true' as const, icon: 'solar:check-circle-bold-duotone', label: 'Oui', iconClass: 'text-emerald-500' },
          { value: 'false' as const, icon: 'solar:close-circle-bold-duotone', label: 'Non', iconClass: 'text-red-400' },
        ] as opt}
          <button
            onclick={() => (filters.hasWebsite = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.hasWebsite === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.hasWebsite === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Social -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Social</span>
      <div class="flex items-center gap-1">
        {#each [
          { value: '' as const, icon: 'solar:share-bold-duotone', label: 'Tous', iconClass: 'text-neutral-400' },
          { value: 'true' as const, icon: 'solar:check-circle-bold-duotone', label: 'Oui', iconClass: 'text-emerald-500' },
          { value: 'false' as const, icon: 'solar:close-circle-bold-duotone', label: 'Non', iconClass: 'text-red-400' },
        ] as opt}
          <button
            onclick={() => (filters.hasSocial = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.hasSocial === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.hasSocial === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Phone -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Téléphone</span>
      <div class="flex items-center gap-1">
        {#each [
          { value: '' as const, icon: 'solar:phone-bold-duotone', label: 'Tous', iconClass: 'text-neutral-400' },
          { value: 'true' as const, icon: 'solar:check-circle-bold-duotone', label: 'Oui', iconClass: 'text-emerald-500' },
          { value: 'false' as const, icon: 'solar:close-circle-bold-duotone', label: 'Non', iconClass: 'text-red-400' },
        ] as opt}
          <button
            onclick={() => (filters.hasPhone = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.hasPhone === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.hasPhone === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- GPS -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">GPS</span>
      <div class="flex items-center gap-1">
        {#each [
          { value: '' as const, icon: 'solar:map-point-bold-duotone', label: 'Tous', iconClass: 'text-neutral-400' },
          { value: 'true' as const, icon: 'solar:check-circle-bold-duotone', label: 'Oui', iconClass: 'text-emerald-500' },
          { value: 'false' as const, icon: 'solar:close-circle-bold-duotone', label: 'Non', iconClass: 'text-red-400' },
        ] as opt}
          <button
            onclick={() => (filters.hasGps = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.hasGps === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.hasGps === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Email -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">E-mail</span>
      <div class="flex items-center gap-1">
        {#each [
          { value: '' as const, icon: 'solar:letter-bold-duotone', label: 'Tous', iconClass: 'text-neutral-400' },
          { value: 'true' as const, icon: 'solar:check-circle-bold-duotone', label: 'Oui', iconClass: 'text-emerald-500' },
          { value: 'false' as const, icon: 'solar:close-circle-bold-duotone', label: 'Non', iconClass: 'text-red-400' },
        ] as opt}
          <button
            onclick={() => (filters.hasEmail = opt.value)}
            class="h-8 pl-2 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 {filters.hasEmail === opt.value
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            <iconify-icon icon={opt.icon} width="14" class={filters.hasEmail === opt.value ? 'text-white' : opt.iconClass}></iconify-icon>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="w-px self-stretch bg-neutral-300"></div>

    <!-- Location -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 pl-0.5">Localisation</span>
      <div class="flex items-center gap-1.5">
        <div class="relative">
          <iconify-icon icon="solar:global-bold" width="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"></iconify-icon>
          <input
            type="text"
            bind:value={filters.country}
            placeholder="Pays"
            class="h-8 w-28 pl-7 pr-3 bg-white rounded-xl border border-neutral-200 focus:border-neutral-900 outline-none font-medium text-xs placeholder:text-neutral-400 transition-all"
          />
        </div>
        <div class="relative">
          <iconify-icon icon="solar:map-point-bold" width="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"></iconify-icon>
          <input
            type="text"
            bind:value={filters.city}
            placeholder="Ville"
            class="h-8 w-24 pl-7 pr-3 bg-white rounded-xl border border-neutral-200 focus:border-neutral-900 outline-none font-medium text-xs placeholder:text-neutral-400 transition-all"
          />
        </div>
      </div>
    </div>

  </div>
</div>
