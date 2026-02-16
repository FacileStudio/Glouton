<script lang="ts">
  import 'iconify-icon';

  interface Filters {
    search: string;
    status: string;
    contacted: string;
    country: string;
    city: string;
    businessType: 'all' | 'domain' | 'local';
  }

  let {
    filters = $bindable(),
    viewMode = $bindable(),
    onReset,
  }: {
    filters: Filters;
    viewMode: 'grid' | 'table';
    onReset: () => void;
  } = $props();
</script>

<div class="rounded-[32px] shadow-lg p-6" style="background-color: #EFEAE6;">
  <div class="flex flex-col lg:flex-row lg:items-center gap-4">
    <!-- Search Input -->
    <div class="relative flex-1 max-w-md">
      <input
        type="text"
        bind:value={filters.search}
        placeholder="Search by domain, email, name..."
        class="w-full pl-12 pr-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-black focus:border-black outline-none font-medium"
      />
      <iconify-icon icon="solar:magnifer-bold" width="20" class="absolute left-4 top-3.5 text-neutral-400"></iconify-icon>
    </div>

    <!-- Status Filter -->
    <select
      bind:value={filters.status}
      class="px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-black focus:border-black outline-none font-bold text-sm"
    >
      <option value="">All Status</option>
      <option value="HOT">🔥 Hot</option>
      <option value="WARM">☀️ Warm</option>
      <option value="COLD">❄️ Cold</option>
    </select>

    <!-- Contacted Filter -->
    <select
      bind:value={filters.contacted}
      class="px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-black focus:border-black outline-none font-bold text-sm"
    >
      <option value="">All Leads</option>
      <option value="false">Not Contacted</option>
      <option value="true">Contacted</option>
    </select>

    <!-- Country Filter -->
    <input
      type="text"
      bind:value={filters.country}
      placeholder="Country"
      class="px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-black focus:border-black outline-none font-medium w-32"
    />

    <!-- City Filter -->
    <input
      type="text"
      bind:value={filters.city}
      placeholder="City"
      class="px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-black focus:border-black outline-none font-medium w-32"
    />

    <!-- Business Type Filter -->
    <select
      bind:value={filters.businessType}
      class="px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-black focus:border-black outline-none font-bold text-sm"
    >
      <option value="all">All Types</option>
      <option value="domain">Domain Leads</option>
      <option value="local">Local Business</option>
    </select>

    <!-- View Mode Toggle -->
    <div class="flex items-center gap-1 bg-white rounded-xl p-1 border border-neutral-200">
      <button
        onclick={() => (viewMode = 'table')}
        aria-label="Table view"
        class="px-4 py-2 rounded-lg {viewMode === 'table'
          ? 'bg-black text-white'
          : 'hover:bg-neutral-100 text-neutral-600'} transition-all font-bold text-sm"
      >
        <iconify-icon icon="solar:list-bold" width="18"></iconify-icon>
      </button>
      <button
        onclick={() => (viewMode = 'grid')}
        aria-label="Grid view"
        class="px-4 py-2 rounded-lg {viewMode === 'grid'
          ? 'bg-black text-white'
          : 'hover:bg-neutral-100 text-neutral-600'} transition-all font-bold text-sm"
      >
        <iconify-icon icon="solar:widget-2-bold" width="18"></iconify-icon>
      </button>
    </div>

    <!-- Reset Button -->
    <button
      onclick={onReset}
      class="px-4 py-3 text-neutral-600 hover:text-black hover:bg-white rounded-xl transition-all font-bold text-sm flex items-center gap-2"
    >
      <iconify-icon icon="solar:refresh-bold" width="18"></iconify-icon>
      <span>Reset</span>
    </button>
  </div>
</div>