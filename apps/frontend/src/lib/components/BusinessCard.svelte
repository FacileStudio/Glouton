<script lang="ts">
  import 'iconify-icon';

  export let business: {
    id: string;
    name: string;
    category?: string;
    address?: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviewCount?: number;
    openingHours?: string[];
    lat?: number;
    lng?: number;
    distance?: number;
  };

  /**
   * openInMaps
   */
  function openInMaps() {
    /**
     * if
     */
    if (business.lat && business.lng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${business.lat},${business.lng}`, '_blank');
    } else if (business.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`, '_blank');
    }
  }

  /**
   * formatDistance
   */
  function formatDistance(km: number): string {
    /**
     * if
     */
    if (km < 1) {
      return `${Math.round(km * 1000)}m`;
    }
    return `${km.toFixed(1)}km`;
  }
</script>

<div class="bg-white rounded-2xl border-2 border-neutral-200 p-6 hover:shadow-lg hover:border-yellow-400 transition-all group">
  <div class="flex items-start justify-between mb-4">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
        <h3 class="text-lg font-black text-neutral-900 group-hover:text-yellow-600 transition-colors">{business.name}</h3>
        {#if !business.website}
          <span class="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold uppercase">No Website</span>
        {/if}
      </div>

      {#if business.category}
        <div class="flex items-center gap-2 mb-2">
          <iconify-icon icon="solar:tag-bold" width="14" class="text-neutral-400"></iconify-icon>
          <span class="text-sm font-semibold text-neutral-600 capitalize">{business.category}</span>
        </div>
      {/if}

      {#if business.rating !== undefined}
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1">
            {#each Array(5) as _, i}
              <iconify-icon
                icon="solar:star-bold"
                width="14"
                class={i < Math.floor(business.rating || 0) ? 'text-yellow-400' : 'text-neutral-300'}
              ></iconify-icon>
            {/each}
          </div>
          <span class="text-sm font-bold text-neutral-700">{business.rating.toFixed(1)}</span>
          {#if business.reviewCount}
            <span class="text-xs text-neutral-500">({business.reviewCount} reviews)</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if business.distance !== undefined}
      <div class="px-3 py-1 bg-neutral-100 rounded-lg text-xs font-black text-neutral-600">
        {formatDistance(business.distance)}
      </div>
    {/if}
  </div>

  <div class="space-y-3 mb-4">
    {#if business.address}
      <button
        on:click={openInMaps}
        class="flex items-start gap-2 text-left w-full hover:text-yellow-600 transition-colors group/addr cursor-pointer"
      >
        <iconify-icon icon="solar:map-point-bold" width="18" class="text-neutral-400 group-hover/addr:text-yellow-600 flex-shrink-0 mt-0.5"></iconify-icon>
        <span class="text-sm font-medium text-neutral-700 group-hover/addr:text-yellow-600">{business.address}</span>
      </button>
    {/if}

    {#if business.phone}
      <a href="tel:{business.phone}" class="flex items-center gap-2 hover:text-yellow-600 transition-colors group/phone">
        <iconify-icon icon="solar:phone-bold" width="18" class="text-neutral-400 group-hover/phone:text-yellow-600"></iconify-icon>
        <span class="text-sm font-medium text-neutral-700 group-hover/phone:text-yellow-600">{business.phone}</span>
      </a>
    {/if}

    {#if business.website}
      <a href={business.website} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 hover:text-yellow-600 transition-colors group/web">
        <iconify-icon icon="solar:global-bold" width="18" class="text-neutral-400 group-hover/web:text-yellow-600"></iconify-icon>
        <span class="text-sm font-medium text-neutral-700 group-hover/web:text-yellow-600 truncate">{business.website}</span>
      </a>
    {/if}
  </div>

  {#if business.openingHours && business.openingHours.length > 0}
    <div class="pt-3 border-t border-neutral-100">
      <div class="flex items-center gap-2 mb-2">
        <iconify-icon icon="solar:clock-circle-bold" width="16" class="text-neutral-400"></iconify-icon>
        <span class="text-xs font-bold uppercase tracking-wide text-neutral-500">Opening Hours</span>
      </div>
      <div class="space-y-1">
        {#each business.openingHours.slice(0, 3) as hours}
          <p class="text-xs text-neutral-600 font-medium">{hours}</p>
        {/each}
        {#if business.openingHours.length > 3}
          <p class="text-xs text-neutral-400 font-bold">+{business.openingHours.length - 3} more...</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if business.lat && business.lng}
    <div class="mt-3 pt-3 border-t border-neutral-100">
      <div class="flex items-center justify-between text-xs">
        <span class="text-neutral-500 font-medium">Coordinates:</span>
        <span class="font-mono text-neutral-600 font-semibold">{business.lat.toFixed(4)}, {business.lng.toFixed(4)}</span>
      </div>
    </div>
  {/if}
</div>
