<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'leaflet/dist/leaflet.css';

  export let businesses: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    category?: string;
    hasWebsite?: boolean;
    address?: string;
  }> = [];

  export let center: { lat: number; lng: number } = { lat: 48.8566, lng: 2.3522 };
  export let zoom = 13;
  export let onBusinessClick: ((business: any) => void) | null = null;

  let mapContainer: HTMLElement;
  let map: any;
  let L: any;
  let markers: any[] = [];

  onMount(async () => {
    L = (await import('leaflet')).default;

    const iconUrl = 'data:image/svg+xml;base64,' + btoa(`
      <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
        <path fill="#FACC15" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.125 12.5 28.125S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="6"/>
      </svg>
    `);

    const customIcon = L.icon({
      iconUrl,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });

    map = L.map(mapContainer, {
      zoomControl: true,
    }).setView([center.lat, center.lng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    updateMarkers();
  });

  function updateMarkers() {
    if (!map || !L) return;

    markers.forEach(marker => marker.remove());
    markers = [];

    businesses.forEach(business => {
      const iconUrl = 'data:image/svg+xml;base64,' + btoa(`
        <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
          <path fill="${business.hasWebsite === false ? '#EF4444' : '#FACC15'}" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.125 12.5 28.125S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z"/>
          <circle fill="#fff" cx="12.5" cy="12.5" r="6"/>
        </svg>
      `);

      const customIcon = L.icon({
        iconUrl,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
      });

      const marker = L.marker([business.lat, business.lng], { icon: customIcon }).addTo(map);

      const popupContent = `
        <div class="p-2">
          <h3 class="font-bold text-sm mb-1">${business.name}</h3>
          ${business.category ? `<p class="text-xs text-gray-600 mb-1">${business.category}</p>` : ''}
          ${business.address ? `<p class="text-xs text-gray-500">${business.address}</p>` : ''}
          ${business.hasWebsite === false ? '<span class="inline-block px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold mt-2">No Website</span>' : ''}
        </div>
      `;

      marker.bindPopup(popupContent);

      if (onBusinessClick) {
        marker.on('click', () => onBusinessClick?.(business));
      }

      markers.push(marker);
    });

    if (businesses.length > 0) {
      const bounds = L.latLngBounds(businesses.map(b => [b.lat, b.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  $: if (map && businesses) {
    updateMarkers();
  }

  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });
</script>

<div bind:this={mapContainer} class="w-full h-full rounded-2xl overflow-hidden shadow-lg border-2 border-neutral-200"></div>

<style>
  :global(.leaflet-popup-content-wrapper) {
    border-radius: 12px;
    overflow: hidden;
  }

  :global(.leaflet-popup-content) {
    margin: 0;
  }
</style>
