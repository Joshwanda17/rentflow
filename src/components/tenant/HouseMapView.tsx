import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HouseListing } from '@/hooks/useHouseListings';
import { formatUGX } from '@/lib/rentCalculations';
import { Button } from '@/components/ui/button';

// Fix default marker icons (Leaflet's default assets break under bundlers)
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

// A price pill marker, so the map reads like Booking.com / Airbnb.
function priceIcon(label: string, selected: boolean): L.DivIcon {
  const bg = selected ? '#0f172a' : '#ffffff';
  const fg = selected ? '#ffffff' : '#0f172a';
  const ring = selected ? '#0f172a' : 'rgba(0,0,0,0.12)';
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);display:inline-flex;align-items:center;white-space:nowrap;
      padding:4px 9px;border-radius:9999px;background:${bg};color:${fg};font-weight:700;font-size:12px;
      border:1px solid ${ring};box-shadow:0 3px 10px rgba(0,0,0,0.22);font-family:inherit;">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

interface HouseMapViewProps {
  listings: HouseListing[];
  userCoords: { lat: number; lng: number } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenDetails: (listing: HouseListing) => void;
}

function FitBounds({
  points,
  userCoords,
  selectedId,
  listings,
}: {
  points: [number, number][];
  userCoords: { lat: number; lng: number } | null;
  selectedId: string | null;
  listings: HouseListing[];
}) {
  const map = useMap();

  // Re-fit whenever the visible set changes, so the map stays in sync with the list.
  useEffect(() => {
    const pts = [...points];
    if (userCoords) pts.push([userCoords.lat, userCoords.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [map, points, userCoords]);

  // Pan to the card the user picked in the list.
  useEffect(() => {
    if (!selectedId) return;
    const sel = listings.find((l) => l.id === selectedId);
    if (sel && sel.latitude != null && sel.longitude != null) {
      map.flyTo([sel.latitude, sel.longitude], Math.max(map.getZoom(), 14), { duration: 0.5 });
    }
  }, [map, selectedId, listings]);

  return null;
}

export function HouseMapView({ listings, userCoords, selectedId, onSelect, onOpenDetails }: HouseMapViewProps) {
  const mappable = useMemo(
    () => listings.filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number'),
    [listings]
  );

  const points = useMemo<[number, number][]>(
    () => mappable.map((l) => [l.latitude as number, l.longitude as number]),
    [mappable]
  );

  const center = useMemo<[number, number]>(() => {
    if (userCoords) return [userCoords.lat, userCoords.lng];
    if (points[0]) return points[0];
    return [0.3476, 32.5825]; // Kampala fallback
  }, [userCoords, points]);

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        {userCoords && (
          <CircleMarker
            center={[userCoords.lat, userCoords.lng]}
            radius={7}
            pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}
        {mappable.map((l) => (
          <Marker
            key={l.id}
            position={[l.latitude as number, l.longitude as number]}
            icon={priceIcon(formatUGX(l.daily_rate) + '/day', selectedId === l.id)}
            zIndexOffset={selectedId === l.id ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(l.id) }}
          >
            <Popup>
              <div className="w-44 space-y-1.5">
                {l.image_urls?.[0] && (
                  <img
                    src={l.image_urls[0]}
                    alt={l.title}
                    className="w-full h-24 object-cover rounded-md"
                    loading="lazy"
                  />
                )}
                <p className="font-semibold text-xs leading-tight line-clamp-2">{l.title}</p>
                {l.address && <p className="text-[11px] text-muted-foreground line-clamp-1">{l.address}</p>}
                <p className="text-xs font-bold">{formatUGX(l.daily_rate)}/day</p>
                <Button size="sm" className="w-full h-7 text-xs" onClick={() => onOpenDetails(l)}>
                  View details
                </Button>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds points={points} userCoords={userCoords} selectedId={selectedId} listings={mappable} />
      </MapContainer>
    </div>
  );
}

export default HouseMapView;
