import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Ensure default Leaflet marker icons resolve (CDN assets, no bundler config needed).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

type LatLng = { lat: number; lng: number };

interface HouseLocationMapPreviewProps {
  /** Current pin position. */
  position: LatLng;
  /** Reported GPS accuracy radius in metres (drawn as a circle around the pin). */
  accuracy?: number | null;
  /** Called when the agent drags the pin or taps the map to fine-tune the spot. */
  onChange?: (pos: LatLng) => void;
  /** Map height in px. */
  height?: number;
}

/**
 * Inline map preview of a house's pinned GPS location. Renders a clear marker
 * the agent can visually confirm, and (when `onChange` is provided) lets them
 * drag the pin or tap the map to nudge it to the exact spot before submitting.
 */
export function HouseLocationMapPreview({ position, accuracy, onChange, height = 200 }: HouseLocationMapPreviewProps) {
  const interactive = !!onChange;
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef<typeof onChange>(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Colour the accuracy ring by quality: green ≤25m, amber ≤100m, red beyond.
  const ringColor = useMemo(() => (
    accuracy == null
      ? 'hsl(var(--primary))'
      : accuracy <= 25
      ? 'hsl(var(--success))'
      : accuracy <= 100
      ? 'hsl(var(--warning))'
      : 'hsl(var(--destructive))'
  ), [accuracy]);

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;

    const map = L.map(mapHostRef.current, {
      center: [position.lat, position.lng],
      zoom: 17,
      scrollWheelZoom: false,
      dragging: interactive,
      doubleClickZoom: interactive,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([position.lat, position.lng], {
      draggable: interactive,
    }).addTo(map);

    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      onChangeRef.current?.({ lat: ll.lat, lng: ll.lng });
    });

    map.on('click', (event: L.LeafletMouseEvent) => {
      onChangeRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // Initialize Leaflet once; subsequent prop changes update existing layers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const latLng = L.latLng(position.lat, position.lng);
    marker.setLatLng(latLng);
    map.setView(latLng, map.getZoom(), { animate: true });
  }, [position.lat, position.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (interactive) {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      markerRef.current?.dragging?.enable();
    } else {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      markerRef.current?.dragging?.disable();
    }
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (accuracy != null && accuracy > 0) {
      if (!circleRef.current) {
        circleRef.current = L.circle([position.lat, position.lng], {
          radius: accuracy,
          color: ringColor,
          fillColor: ringColor,
          fillOpacity: 0.12,
          weight: 1.5,
        }).addTo(map);
      } else {
        circleRef.current
          .setLatLng([position.lat, position.lng])
          .setRadius(accuracy)
          .setStyle({ color: ringColor, fillColor: ringColor, fillOpacity: 0.12, weight: 1.5 });
      }
    } else if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
  }, [accuracy, position.lat, position.lng, ringColor]);

  return (
    <div className="overflow-hidden rounded-lg border border-border" style={{ height }}>
      <div ref={mapHostRef} className="h-full w-full" aria-label="House location map preview" />
    </div>
  );
}

export default HouseLocationMapPreview;
