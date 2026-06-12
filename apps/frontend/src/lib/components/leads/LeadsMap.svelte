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
  let mapContainer = $state<HTMLElement | undefined>();
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
    if (status === 'HOT') return '#000000';
    return '#737373';
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
          <p style="font-weight:600;font-size:13px;margin:0 0 2px">${name}</p>
          ${location ? `<p style="font-size:11px;color:#737373;margin:0 0 6px">${location}</p>` : ''}
          <a href="/app/leads/${lead.id}" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:#000000;text-decoration:none;">
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
  <div class="rounded-xl border border-border bg-card overflow-hidden">
    <button
      onclick={toggleExpand}
      class="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/40 transition-colors"
    >
      <div class="flex items-center gap-3">
        <div class="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground shrink-0">
          <iconify-icon icon="solar:map-linear" width="18"></iconify-icon>
        </div>
        <div class="text-left">
          <p class="text-sm font-semibold text-foreground">Carte des leads</p>
          <p class="text-xs text-muted-foreground">{leadsWithCoords.length} lead{leadsWithCoords.length !== 1 ? 's' : ''} avec localisation</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-foreground"></span>
            HOT
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-muted-foreground"></span>
            Autres
          </span>
        </div>
        <iconify-icon
          icon="solar:alt-arrow-down-linear"
          width="16"
          class="text-muted-foreground transition-transform duration-300 {expanded ? 'rotate-180' : ''}"
        ></iconify-icon>
      </div>
    </button>

    <div
      class="overflow-hidden transition-all duration-300 ease-in-out"
      style="max-height: {expanded ? '480px' : '0px'}; opacity: {expanded ? '1' : '0'};"
    >
      <div class="px-3 pb-3 h-[440px]">
        <div bind:this={mapContainer} class="w-full h-full rounded-lg overflow-hidden border border-border"></div>
      </div>
    </div>
  </div>
{/if}
