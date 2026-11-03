<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { Circle, LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet';

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
  let map: LeafletMap | undefined;
  let marker: Marker | undefined;
  let circle: Circle | undefined;
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

    const leafletMap = L.map(mapContainer).setView([initialLat, initialLng], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(leafletMap);

    const pin = L.marker([initialLat, initialLng], { draggable: true }).addTo(leafletMap);

    const area = L.circle([initialLat, initialLng], {
      className: 'fc-radius-circle',
      fillOpacity: 0.2,
      radius: radiusInMeters,
    }).addTo(leafletMap);

    pin.on('dragend', async () => {
      const position = pin.getLatLng();
      area.setLatLng(position);

      const address = await reverseGeocode(position.lat, position.lng);

      onLocationSelected({
        lat: position.lat,
        lng: position.lng,
        address,
      });
    });

    leafletMap.on('click', async (event: LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      pin.setLatLng([lat, lng]);
      area.setLatLng([lat, lng]);

      const address = await reverseGeocode(lat, lng);

      onLocationSelected({
        lat,
        lng,
        address,
      });
    });

    map = leafletMap;
    marker = pin;
    circle = area;

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
