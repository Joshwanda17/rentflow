import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
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
  /** Called when the agent drags the pin or taps the map to fine-tune the spot. */
  onChange?: (pos: LatLng) => void;
  /** Map height in px. */
  height?: number;
}

// Keep the Leaflet view centred on the pin when it moves programmatically.
function Recenter({ pos }: { pos: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([pos.lat, pos.lng], map.getZoom(), { animate: true });
  }, [pos.lat, pos.lng, map]);
  return null;
}

// Move the pin when the agent taps anywhere on the map.
function ClickToMove({ onMove }: { onMove: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/**
 * Inline map preview of a house's pinned GPS location. Renders a clear marker
 * the agent can visually confirm, and (when `onChange` is provided) lets them
 * drag the pin or tap the map to nudge it to the exact spot before submitting.
 */
export function HouseLocationMapPreview({ position, onChange, height = 200 }: HouseLocationMapPreviewProps) {
  const interactive = !!onChange;
  return (
    <div className="overflow-hidden rounded-lg border border-border" style={{ height }}>
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={17}
        scrollWheelZoom={false}
        dragging={interactive}
        doubleClickZoom={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter pos={position} />
        {interactive && <ClickToMove onMove={onChange!} />}
        <Marker
          position={[position.lat, position.lng]}
          draggable={interactive}
          eventHandlers={
            interactive
              ? {
                  dragend: (e) => {
                    const m = e.target as L.Marker;
                    const ll = m.getLatLng();
                    onChange!({ lat: ll.lat, lng: ll.lng });
                  },
                }
              : undefined
          }
        />
      </MapContainer>
    </div>
  );
}

export default HouseLocationMapPreview;
