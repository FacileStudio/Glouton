<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import 'leaflet/dist/leaflet.css';
  import 'iconify-icon';

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
    coordinates: { lat: number; lng: number };
  }

  let { leads }: { leads: Lead[] } = $props();

  let expanded = $state(false);
  let mapContainer: HTMLElement;
  let map: any;
  let markersLayer: any;
  let mounted = false;

  const leadsWithCoords = $derived(leads.filter((l) => l.coordinates));

  function getDisplayName(lead: Lead): string {
    if (lead.firstName || lead.lastName) return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    if (lead.businessName) return lead.businessName;
    return lead.domain ?? 'Unknown';
  }

  function getStatusColor(status?: string): string {
    if (status === 'HOT') return '#F97316';
    if (status === 'WARM') return '#EAB308';
    return '#6B7280';
  }

  function makePinSvg(color: string): string {
    return `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path fill="${color}" d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z"/>
      <circle fill="#fff" cx="14" cy="14" r="5.5"/>
      <circle fill="${color}" cx="14" cy="14" r="3"/>
    </svg>`;
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

  function renderMarkers(L: any) {
    if (!markersLayer) return;
    markersLayer.clearLayers();

    const bounds: [number, number][] = [];

    for (const lead of leadsWithCoords) {
      const color = getStatusColor(lead.status);
      const svg = makePinSvg(color);
      const icon = L.icon({
        iconUrl: 'data:image/svg+xml;base64,' + btoa(svg),
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -42],
      });

      const name = getDisplayName(lead);
      const location = [lead.city, lead.country].filter(Boolean).join(', ');

      const marker = L.marker([lead.coordinates.lat, lead.coordinates.lng], { icon }).addTo(markersLayer);

      marker.bindPopup(`
        <div style="min-width:160px;font-family:sans-serif;">
          <p style="font-weight:800;font-size:13px;margin:0 0 2px">${name}</p>
          ${location ? `<p style="font-size:11px;color:#6b7280;margin:0 0 6px">${location}</p>` : ''}
          <a href="/app/leads/${lead.id}" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#F97316;text-decoration:none;">
            View lead →
          </a>
        </div>
      `);

      marker.on('click', () => {
        marker.openPopup();
      });

      bounds.push([lead.coordinates.lat, lead.coordinates.lng]);
    }

    if (bounds.length > 0) {
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
    mounted = true;
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
  <div class="rounded-[32px] overflow-hidden shadow-lg transition-all duration-300" style="background-color: #EFEAE6;">
    <button
      onclick={toggleExpand}
      class="w-full flex items-center justify-between px-8 py-6 hover:bg-black/5 transition-colors"
    >
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center flex-shrink-0">
          <iconify-icon icon="solar:map-bold-duotone" width="24" class="text-orange-500"></iconify-icon>
        </div>
        <div class="text-left">
          <p class="font-black text-neutral-900 text-lg leading-tight">Leads Map</p>
          <p class="text-sm text-neutral-500 font-medium">{leadsWithCoords.length} lead{leadsWithCoords.length !== 1 ? 's' : ''} with location</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
          <span class="text-xs font-bold text-neutral-500">HOT</span>
          <span class="w-2.5 h-2.5 rounded-full bg-yellow-400 ml-2"></span>
          <span class="text-xs font-bold text-neutral-500">WARM</span>
          <span class="w-2.5 h-2.5 rounded-full bg-gray-400 ml-2"></span>
          <span class="text-xs font-bold text-neutral-500">COLD</span>
        </div>
        <div class="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm transition-transform duration-300 {expanded ? 'rotate-180' : ''}">
          <iconify-icon icon="solar:alt-arrow-down-bold" width="18" class="text-neutral-600"></iconify-icon>
        </div>
      </div>
    </button>

    <div
      class="overflow-hidden transition-all duration-300 ease-in-out"
      style="max-height: {expanded ? '480px' : '0px'}; opacity: {expanded ? '1' : '0'};"
    >
      <div class="px-4 pb-4 h-[440px]">
        <div bind:this={mapContainer} class="w-full h-full rounded-2xl overflow-hidden shadow-inner"></div>
      </div>
    </div>
  </div>
{/if}
