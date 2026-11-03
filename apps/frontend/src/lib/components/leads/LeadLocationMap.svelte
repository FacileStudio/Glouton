<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { Map as LeafletMap } from 'leaflet';

  let { lat, lng, name = '' }: { lat: number; lng: number; name?: string } = $props();

  let mapContainer: HTMLElement;
  let map: LeafletMap | undefined;

  onMount(async () => {
    const L = (await import('leaflet')).default;

    const pinIcon = L.divIcon({
      className: 'text-black',
      html: `<svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg" class="block">
        <path fill="currentColor" d="M16 0C7.163 0 0 7.163 0 16c0 12 16 32 16 32S32 28 32 16C32 7.163 24.837 0 16 0z"/>
        <circle class="fill-white" cx="16" cy="16" r="7"/>
        <circle fill="currentColor" cx="16" cy="16" r="4"/>
      </svg>`,
      iconSize: [32, 48],
      iconAnchor: [16, 48],
      popupAnchor: [0, -48],
    });

    map = L.map(mapContainer, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);

    if (name) {
      const label = document.createElement('div');
      label.className = 'px-0.5 py-1 text-fc-sm font-semibold';
      label.textContent = name;
      marker.bindPopup(label).openPopup();
    }
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div bind:this={mapContainer} class="h-full w-full overflow-hidden rounded-fc-md"></div>
