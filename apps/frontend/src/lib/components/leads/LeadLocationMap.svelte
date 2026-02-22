<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'leaflet/dist/leaflet.css';

  export let lat: number;
  export let lng: number;
  export let name: string = '';

  let mapContainer: HTMLElement;
  let map: any;

  onMount(async () => {
    const L = (await import('leaflet')).default;

    const pinSvg = `<svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#F97316" d="M16 0C7.163 0 0 7.163 0 16c0 12 16 32 16 32S32 28 32 16C32 7.163 24.837 0 16 0z"/>
      <circle fill="#fff" cx="16" cy="16" r="7"/>
      <circle fill="#F97316" cx="16" cy="16" r="4"/>
    </svg>`;

    const pinIcon = L.icon({
      iconUrl: 'data:image/svg+xml;base64,' + btoa(pinSvg),
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
      marker.bindPopup(`<div style="font-weight:700;font-size:13px;padding:4px 2px">${name}</div>`).openPopup();
    }
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div bind:this={mapContainer} class="w-full h-full rounded-lg overflow-hidden"></div>
