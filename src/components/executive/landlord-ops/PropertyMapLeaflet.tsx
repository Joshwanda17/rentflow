import { useEffect, useMemo, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Phone, MessageCircle, Home } from 'lucide-react';
import type { MapProperty } from './PropertyMapView';
import 'leaflet/dist/leaflet.css';

// Pre-create icons once (not per render)
const ICON_CACHE = new Map<string, L.DivIcon>();
function getIcon(status: string): L.DivIcon {
  if (ICON_CACHE.has(status)) return ICON_CACHE.get(status)!;
  const colors: Record<string, string> = {
    empty: '#ef4444',
    requested: '#f59e0b',
    paid: '#22c55e',
    occupied: '#3b82f6',
  };
  const color = colors[status] || '#6b7280';
  const icon = L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -26],
    html: `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  });
  ICON_CACHE.set(status, icon);
  return icon;
}

// Fit bounds with useEffect (not useMemo)
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [positions, map]);
  return null;
}

function PhoneLink({ phone, name }: { phone: string; name?: string }) {
  const clean = phone.replace(/\s/g, '');
  const intl = clean.startsWith('0') ? `+256${clean.slice(1)}` : clean.startsWith('+') ? clean : `+256${clean}`;
  return (
    <div className="flex items-center gap-1.5">
      <a href={`tel:${intl}`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
        <Phone className="h-3 w-3" />{phone}
      </a>
      <a
        href={`https://wa.me/${intl.replace('+', '')}?text=${encodeURIComponent(`Hello ${name || ''}, Welile Operations.`)}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-500/20 text-green-600 hover:bg-green-500/30"
      >
        <MessageCircle className="h-3 w-3" />
      </a>
    </div>
  );
}

// Memoized individual marker to prevent re-renders
const PropertyMarker = memo(({ prop }: { prop: MapProperty }) => (
  <Marker position={[prop.latitude, prop.longitude]} icon={getIcon(prop.rent_status)}>
    <Popup maxWidth={260} minWidth={200}>
      <div className="space-y-2 p-1">
        <div className="flex gap-2">
          {prop.image_url ? (
            <img src={prop.image_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" loading="lazy" />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Home className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-tight truncate">{prop.title}</p>
            <p className="text-[10px] text-gray-500 truncate">{prop.address}</p>
            <div className="flex gap-1 mt-0.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 font-medium">{prop.house_category}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 font-medium">{prop.number_of_rooms}rm</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1.5">
          <div>
            <p className="text-[9px] text-gray-500">Monthly</p>
            <p className="font-bold text-xs">UGX {prop.monthly_rent.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-500">Daily</p>
            <p className="font-bold text-xs text-blue-600">UGX {prop.daily_rate.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex justify-center">
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
            prop.rent_status === 'empty' ? 'bg-red-100 text-red-700' :
            prop.rent_status === 'requested' ? 'bg-amber-100 text-amber-700' :
            prop.rent_status === 'paid' ? 'bg-green-100 text-green-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {prop.rent_status === 'empty' ? '🏚️ Empty' :
             prop.rent_status === 'requested' ? '⏳ Rent Requested' :
             prop.rent_status === 'paid' ? '✅ Rent Paid' :
             '🏠 Occupied'}
          </span>
        </div>

        <div className="space-y-1 border-t pt-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Agent:</span>
            <span className="font-medium">{prop.agent_name}</span>
          </div>
          {prop.agent_phone && <PhoneLink phone={prop.agent_phone} name={prop.agent_name} />}
          {prop.landlord_name && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Landlord:</span>
                <span className="font-medium">{prop.landlord_name}</span>
              </div>
              {prop.landlord_phone && <PhoneLink phone={prop.landlord_phone} name={prop.landlord_name} />}
            </>
          )}
        </div>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${prop.latitude},${prop.longitude}`}
          target="_blank" rel="noopener noreferrer"
          className="block text-center text-[10px] text-blue-600 hover:underline font-medium py-0.5"
        >
          📍 Get Directions
        </a>
      </div>
    </Popup>
  </Marker>
));
PropertyMarker.displayName = 'PropertyMarker';

interface Props {
  properties: MapProperty[];
}

function PropertyMapLeaflet({ properties }: Props) {
  const positions = useMemo(
    () => properties.map(p => [p.latitude, p.longitude] as [number, number]),
    [properties]
  );

  const center: [number, number] = useMemo(() => {
    if (positions.length === 0) return [0.3476, 32.5825];
    return [
      positions.reduce((s, p) => s + p[0], 0) / positions.length,
      positions.reduce((s, p) => s + p[1], 0) / positions.length,
    ];
  }, [positions]);

  return (
    <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds positions={positions} />
      {properties.map(prop => (
        <PropertyMarker key={prop.id} prop={prop} />
      ))}
    </MapContainer>
  );
}

export default PropertyMapLeaflet;
