<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'leaflet/dist/leaflet.css';

  let {
    onLocationSelected,
    initialLat = 40.7128,
    initialLng = -74.006,
    initialZoom = 12,
  }: {
    onLocationSelected: (location: { lat: number; lng: number; address: string }) => void;
    initialLat?: number;
    initialLng?: number;
    initialZoom?: number;
  } = $props();

  let mapContainer: HTMLDivElement;
  let map: any;
  let marker: any;
  let circle: any;
  let radiusInMeters = 5000;

  onMount(async () => {
    const L = await import('leaflet');

    const DefaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    L.Marker.prototype.options.icon = DefaultIcon;

    map = L.map(mapContainer).setView([initialLat, initialLng], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

    circle = L.circle([initialLat, initialLng], {
      className: 'fc-radius-circle',
      fillOpacity: 0.2,
      radius: radiusInMeters,
    }).addTo(map);

    marker.on('dragend', async (event: any) => {
      const position = event.target.getLatLng();
      circle.setLatLng(position);

      const address = await reverseGeocode(position.lat, position.lng);

      onLocationSelected({
        lat: position.lat,
        lng: position.lng,
        address,
      });
    });

    map.on('click', async (event: any) => {
      const { lat, lng } = event.latlng;
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);

      const address = await reverseGeocode(lat, lng);

      onLocationSelected({
        lat,
        lng,
        address,
      });
    });

    const initialAddress = await reverseGeocode(initialLat, initialLng);
    onLocationSelected({
      lat: initialLat,
      lng: initialLng,
      address: initialAddress,
    });
  });

  export function setRadius(meters: number) {
    radiusInMeters = meters;
    if (circle) {
      circle.setRadius(meters);
    }
  }

  export function setLocation(lat: number, lng: number) {
    if (map && marker && circle) {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      map.setView([lat, lng], initialZoom);
    }
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });
</script>

<div bind:this={mapContainer} class="h-full w-full rounded-fc-lg"></div>

<style>
  :global(.leaflet-container) {
    border-radius: var(--radius-fc-lg);
  }

  :global(.fc-radius-circle) {
    stroke: var(--color-fc-warning);
    fill: var(--color-fc-warning);
  }
</style>
