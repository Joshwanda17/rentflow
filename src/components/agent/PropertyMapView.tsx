import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Building2, Navigation, Route, Loader2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { supabase } from '@/integrations/supabase/client';
import { decodePolyline } from '@/lib/decodePolyline';

// Reset default leaflet icon paths (matches LandlordLocationsMap)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const owingIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const paidIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// Numbered pin used when an optimized visit order is active.
function orderedIcon(n: number, hasDebt: boolean) {
  const bg = hasDebt ? '#e11d48' : '#059669';
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"><span style="transform:rotate(45deg);font-size:13px;font-weight:800">${n}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -24],
  });
}

const youIcon = L.divIcon({
  className: '',
  html: `<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface Tenant { id: string; full_name: string; phone: string }

interface Props {
  tenants: Tenant[];
  tenantContext: Record<string, { propertyAddress: string; landlordName: string }>;
  tenantBalances: Record<string, number>;
  tenantDaily: Record<string, number>;
  propertyLocations: Record<string, { lat: number; lng: number; address: string }>;
  onSelectTenant: (id: string) => void;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

export function PropertyMapView({
  tenants, tenantContext, tenantBalances, tenantDaily, propertyLocations, onSelectTenant,
}: Props) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [route, setRoute] = useState<{
    order: string[];
    polyline: [number, number][];
    mapsUrl: string;
    distanceMeters: number | null;
    durationSeconds: number | null;
  } | null>(null);

  // Group tenants by property and attach the location (only properties with coords are shown).
  const markers = useMemo(() => {
    const byProp = new Map<string, { loc: { lat: number; lng: number; address: string }; tenants: Tenant[]; owing: number; daily: number }>();
    for (const t of tenants) {
      const addr = tenantContext[t.id]?.propertyAddress?.trim();
      if (!addr) continue;
      const loc = propertyLocations[addr];
      if (!loc) continue;
      if (!byProp.has(addr)) byProp.set(addr, { loc, tenants: [], owing: 0, daily: 0 });
      const g = byProp.get(addr)!;
      g.tenants.push(t);
      g.owing += tenantBalances[t.id] || 0;
      g.daily += tenantDaily[t.id] || 0;
    }
    return Array.from(byProp.entries()).map(([addr, g]) => ({ addr, ...g }));
  }, [tenants, tenantContext, propertyLocations, tenantBalances, tenantDaily]);

  const points = markers.map(m => [m.loc.lat, m.loc.lng] as [number, number]);
  const totalProps = markers.length;
  const missing = Object.keys(
    tenants.reduce((s: Record<string, true>, t) => {
      const a = tenantContext[t.id]?.propertyAddress?.trim();
      if (a && !propertyLocations[a]) s[a] = true;
      return s;
    }, {}),
  ).length;

  // Map address -> optimized stop number (1-based) when a route is active.
  const orderNumber = useMemo(() => {
    if (!route) return null;
    const map: Record<string, number> = {};
    route.order.forEach((addr, i) => { map[addr] = i + 1; });
    return map;
  }, [route]);

  async function optimizeRoute() {
    if (markers.length === 0 || optimizing) return;
    setOptimizing(true);
    try {
      const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        if (!('geolocation' in navigator)) { reject(new Error('no-geo')); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => reject(new Error('denied')),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
      setOrigin(coords);

      const stops = markers.map((m) => ({ id: m.addr, lat: m.loc.lat, lng: m.loc.lng, label: m.addr }));
      const { data, error } = await supabase.functions.invoke('optimize-route', {
        body: { origin: coords, stops, roundTrip: false },
      });
      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || 'Route failed');

      const order: string[] = (data.orderedStops || []).map((s: { id: string }) => s.id);
      const polyline = data.encodedPolyline ? decodePolyline(data.encodedPolyline) : [];
      setRoute({
        order,
        polyline,
        mapsUrl: data.mapsUrl,
        distanceMeters: data.distanceMeters ?? null,
        durationSeconds: data.durationSeconds ?? null,
      });
      toast.success('Optimal visit route ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'no-geo' || msg === 'denied') {
        toast.error('Allow location access to plan your route');
      } else {
        toast.error('Could not plan a route right now');
      }
    } finally {
      setOptimizing(false);
    }
  }

  // Default to Kampala if no points
  const defaultCenter: [number, number] = points[0] || [0.3476, 32.5825];

  if (totalProps === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-xs">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm font-semibold text-foreground">No mapped properties</p>
          <p className="text-xs text-muted-foreground mt-1">
            Properties appear here once their location is captured during landlord onboarding or a rent visit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          {totalProps} mapped {totalProps === 1 ? 'property' : 'properties'}
        </span>
        {missing > 0 && (
          <span>{missing} without coordinates</span>
        )}
      </div>
      <div className="flex-1 rounded-2xl overflow-hidden border border-border/60">
        <MapContainer center={defaultCenter} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {markers.map(m => {
            const hasDebt = m.owing > 0;
            return (
              <Marker key={m.addr} position={[m.loc.lat, m.loc.lng]} icon={hasDebt ? owingIcon : paidIcon}>
                <Popup minWidth={240} maxWidth={280}>
                  <div className="space-y-2">
                    <div>
                      <p className="font-bold text-sm leading-tight">{m.addr}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {m.tenants.length} tenant{m.tenants.length !== 1 ? 's' : ''}
                        {' · '}
                        <span className={hasDebt ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                          {hasDebt ? formatUGX(m.owing) + ' owing' : 'All paid up'}
                        </span>
                      </p>
                      {m.daily > 0 && (
                        <p className="text-[11px] text-gray-500">{formatUGX(m.daily)}/day expected</p>
                      )}
                    </div>
                    <div className="max-h-44 overflow-y-auto -mx-1 px-1 space-y-1 border-t pt-1.5">
                      {m.tenants.map(t => {
                        const bal = tenantBalances[t.id] || 0;
                        return (
                          <button
                            key={t.id}
                            onClick={() => onSelectTenant(t.id)}
                            className="w-full flex items-center justify-between gap-2 text-left p-1.5 rounded hover:bg-gray-100 active:bg-gray-200"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate text-gray-900">
                                {t.full_name?.trim() || 'Unnamed tenant'}
                              </p>
                              <p className="text-[10px] text-gray-500 truncate">{t.phone}</p>
                            </div>
                            <span className={`text-[11px] font-mono font-bold shrink-0 ${bal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {bal > 0 ? formatUGX(bal) : '✓'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => window.open(`https://www.google.com/maps?q=${m.loc.lat},${m.loc.lng}`, '_blank')}
                      className="w-full text-xs py-1.5 px-2 bg-blue-500 text-white rounded flex items-center justify-center gap-1 hover:bg-blue-600"
                    >
                      <Navigation className="h-3 w-3" />
                      Directions
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
