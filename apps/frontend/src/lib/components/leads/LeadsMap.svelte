<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { LayerGroup, Map as LeafletMap } from 'leaflet';
  import { Card } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();
  interface Lead {
    id: string;
    businessName?: string | null;
    domain?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    city?: string | null;
    country?: string | null;
    status?: string;
    score?: number;
    coordinates: { lat: number; lng: number } | null;
  }

  let { leads }: { leads: Lead[] } = $props();

  let expanded = $state(false);
  let mapContainer = $state<HTMLElement | undefined>();
  let map: LeafletMap | undefined;
  let markersLayer: LayerGroup | undefined;

  const leadsWithCoords = $derived(leads.filter((l) => l.coordinates));

  function getDisplayName(lead: Lead): string {
    if (lead.firstName || lead.lastName) return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    if (lead.businessName) return lead.businessName;
    return lead.domain ?? t('common.unknown');
  }

  function getStatusColor(status?: string): string {
    if (status === 'HOT') return 'text-black';
    return 'text-black/50';
  }

  const pinSvg = `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" class="block">
      <path fill="currentColor" d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z"/>
      <circle class="fill-white" cx="14" cy="14" r="5.5"/>
      <circle fill="currentColor" cx="14" cy="14" r="3"/>
    </svg>`;

  function makePopup(lead: Lead): HTMLElement {
    const root = document.createElement('div');
    root.className = 'flex min-w-40 flex-col gap-0.5';
    const title = document.createElement('p');
    title.className = 'm-0 text-fc-sm font-semibold';
    title.textContent = getDisplayName(lead);
    root.append(title);
    const location = [lead.city, lead.country].filter(Boolean).join(', ');
    if (location) {
      const sub = document.createElement('p');
      sub.className = 'm-0 mb-1.5 text-fc-xs opacity-70';
      sub.textContent = location;
      root.append(sub);
    }
    const link = document.createElement('a');
    link.href = `/app/leads/${lead.id}`;
    link.className = 'inline-flex items-center gap-1 text-fc-xs font-medium no-underline';
    link.textContent = t('leads.map.view');
    root.append(link);
    return root;
  }

  async function initMap() {
    if (!mapContainer || map) return;
    const L = (await import('leaflet')).default;

    map = L.map(mapContainer, {
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    renderMarkers(L);
  }

  function renderMarkers(L: typeof import('leaflet')) {
    if (!markersLayer) return;
    markersLayer.clearLayers();

    const bounds: [number, number][] = [];

    for (const lead of leadsWithCoords) {
      if (!lead.coordinates) continue;
      const icon = L.divIcon({
        className: getStatusColor(lead.status),
        html: pinSvg,
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -42],
      });

      const marker = L.marker([lead.coordinates.lat, lead.coordinates.lng], { icon }).addTo(markersLayer);

      marker.bindPopup(makePopup(lead));

      marker.on('click', () => {
        marker.openPopup();
      });

      bounds.push([lead.coordinates.lat, lead.coordinates.lng]);
    }

    if (map && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }

  async function toggleExpand() {
    expanded = !expanded;
    if (expanded && !map) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await initMap();
    } else if (expanded && map) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      map.invalidateSize();
    }
  }

  onMount(() => {
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  $effect(() => {
    if (map && markersLayer && leadsWithCoords) {
      import('leaflet').then(({ default: L }) => renderMarkers(L));
    }
  });
</script>

{#if leadsWithCoords.length > 0}
  <Card class="overflow-hidden p-0">
    <button
      type="button"
      onclick={toggleExpand}
      aria-expanded={expanded}
      class="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div class="inline-flex size-9 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg">
          <iconify-icon icon="solar:map-linear" width="18" height="18" class="block"></iconify-icon>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-fc-sm font-semibold text-fc-fg">{t('leads.map.title')}</p>
          <p class="text-fc-xs text-fc-fg-muted">{t('leads.map.count', { count: leadsWithCoords.length })}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <div class="hidden items-center gap-3 text-fc-xs text-fc-fg-muted sm:flex">
          <span class="inline-flex items-center gap-1.5">
            <span class="size-2 rounded-fc-pill bg-fc-fg"></span>
            HOT
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="size-2 rounded-fc-pill bg-fc-fg-muted"></span>
            {t('leads.map.others')}
          </span>
        </div>
        <iconify-icon
          icon="mdi:chevron-down"
          width="18"
          height="18"
          class="block text-fc-fg-muted transition-transform duration-300 {expanded ? 'rotate-180' : ''}"
        ></iconify-icon>
      </div>
    </button>

    <div
      class="overflow-hidden transition-all duration-300 ease-fc"
      style="max-height: {expanded ? '480px' : '0px'}; opacity: {expanded ? '1' : '0'};"
    >
      <div class="h-[440px] px-3 pb-3">
        <div bind:this={mapContainer} class="h-full w-full overflow-hidden rounded-fc-md"></div>
      </div>
    </div>
  </Card>
{/if}
