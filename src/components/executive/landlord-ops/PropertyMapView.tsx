import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Home, MapPin, Layers } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Color-coded marker icons
function createIcon(color: string) {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
    "><div style="transform:rotate(45deg);color:white;font-size:12px;font-weight:bold;">🏠</div></div>`,
  });
}

const ICONS = {
  empty: createIcon('#ef4444'),       // red - empty/available
  requested: createIcon('#f59e0b'),   // amber - rent requested
  paid: createIcon('#22c55e'),        // green - rent paid
  occupied: createIcon('#3b82f6'),    // blue - occupied (no active rent request)
};

type StatusFilter = 'all' | 'empty' | 'occupied' | 'requested' | 'paid';

interface MapProperty {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  monthly_rent: number;
  daily_rate: number;
  house_category: string;
  number_of_rooms: number;
  status: string;
  tenant_id: string | null;
  agent_name: string;
  agent_phone: string | null;
  landlord_name: string | null;
  landlord_phone: string | null;
  image_url: string | null;
  rent_status: 'empty' | 'occupied' | 'requested' | 'paid';
}

// Auto-fit bounds
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useMemo(() => {
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

const FILTER_OPTIONS: { value: StatusFilter; label: string; color: string; dot: string }[] = [
  { value: 'all', label: 'All', color: 'bg-muted text-foreground', dot: 'bg-foreground' },
  { value: 'empty', label: 'Empty', color: 'bg-red-500/10 text-red-700', dot: 'bg-red-500' },
  { value: 'occupied', label: 'Occupied', color: 'bg-blue-500/10 text-blue-700', dot: 'bg-blue-500' },
  { value: 'requested', label: 'Rent Requested', color: 'bg-amber-500/10 text-amber-700', dot: 'bg-amber-500' },
  { value: 'paid', label: 'Rent Paid', color: 'bg-green-500/10 text-green-700', dot: 'bg-green-500' },
];

export function PropertyMapView() {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['property-map-all'],
    queryFn: async () => {
      // Fetch all listings with GPS
      const { data: listings } = await supabase
        .from('house_listings')
        .select(`
          id, title, address, latitude, longitude, monthly_rent, daily_rate,
          house_category, number_of_rooms, status, tenant_id, agent_id, landlord_id, image_urls,
          landlords(name, phone)
        `)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1000);

      if (!listings?.length) return [];

      // Get agent profiles
      const agentIds = [...new Set(listings.map(l => l.agent_id))];
      const { data: agents } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', agentIds);
      const agentMap = new Map((agents || []).map(a => [a.id, a]));

      // Get active rent requests for tenant_ids to determine rent status
      const tenantIds = listings.filter(l => l.tenant_id).map(l => l.tenant_id!);
      let rentMap = new Map<string, { status: string; amount_repaid: number; total_repayment: number }>();
      if (tenantIds.length > 0) {
        const { data: rentReqs } = await supabase
          .from('rent_requests')
          .select('tenant_id, status, amount_repaid, total_repayment')
          .in('tenant_id', tenantIds.slice(0, 500))
          .in('status', ['approved', 'disbursed', 'active', 'repaying', 'completed', 'fully_paid'])
          .order('created_at', { ascending: false });

        // Latest rent request per tenant
        for (const rr of (rentReqs || [])) {
          if (!rentMap.has(rr.tenant_id)) {
            rentMap.set(rr.tenant_id, rr);
          }
        }
      }

      return listings.map((l): MapProperty => {
        const agent = agentMap.get(l.agent_id);
        const landlord = l.landlords as any;
        let rent_status: MapProperty['rent_status'] = 'empty';

        if (l.tenant_id) {
          const rr = rentMap.get(l.tenant_id);
          if (rr) {
            const repaid = Number(rr.amount_repaid || 0);
            const total = Number(rr.total_repayment || 0);
            if (rr.status === 'completed' || rr.status === 'fully_paid' || (total > 0 && repaid >= total)) {
              rent_status = 'paid';
            } else {
              rent_status = 'requested';
            }
          } else {
            rent_status = 'occupied';
          }
        }

        return {
          id: l.id,
          title: l.title,
          address: l.address,
          latitude: l.latitude!,
          longitude: l.longitude!,
          monthly_rent: l.monthly_rent,
          daily_rate: l.daily_rate,
          house_category: l.house_category,
          number_of_rooms: l.number_of_rooms,
          status: l.status,
          tenant_id: l.tenant_id,
          agent_name: agent?.full_name || 'Unknown Agent',
          agent_phone: agent?.phone || null,
          landlord_name: landlord?.name || null,
          landlord_phone: landlord?.phone || null,
          image_url: (l.image_urls as string[] | null)?.[0] || null,
          rent_status,
        };
      });
    },
    staleTime: 120000,
  });

  const filtered = filter === 'all' ? properties : properties.filter(p => p.rent_status === filter);

  const positions = filtered.map(p => [p.latitude, p.longitude] as [number, number]);

  // Uganda center fallback
  const center: [number, number] = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length, positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [0.3476, 32.5825];

  const counts = {
    all: properties.length,
    empty: properties.filter(p => p.rent_status === 'empty').length,
    occupied: properties.filter(p => p.rent_status === 'occupied').length,
    requested: properties.filter(p => p.rent_status === 'requested').length,
    paid: properties.filter(p => p.rent_status === 'paid').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] rounded-2xl bg-muted/30 border border-border">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading property map…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Legend + Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Filter:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              size="sm"
              variant={filter === opt.value ? 'default' : 'outline'}
              className={`h-7 text-[11px] gap-1.5 px-2.5 ${filter === opt.value ? '' : opt.color}`}
              onClick={() => setFilter(opt.value)}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${opt.dot}`} />
              {opt.label}
              <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5 bg-background/50">
                {counts[opt.value]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Map Container */}
      <div className="rounded-2xl overflow-hidden border-2 border-border shadow-lg" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center space-y-2">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground font-medium">No properties with GPS in this category</p>
              <p className="text-xs text-muted-foreground">Properties need GPS coordinates to appear on the map.</p>
            </div>
          </div>
        ) : (
          <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds positions={positions} />
            {filtered.map(prop => (
              <Marker
                key={prop.id}
                position={[prop.latitude, prop.longitude]}
                icon={ICONS[prop.rent_status]}
              >
                <Popup maxWidth={280} minWidth={220}>
                  <div className="space-y-2 p-1">
                    {/* Header with image */}
                    <div className="flex gap-2">
                      {prop.image_url ? (
                        <img src={prop.image_url} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Home className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm leading-tight truncate">{prop.title}</p>
                        <p className="text-[10px] text-gray-500 truncate">{prop.address}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 font-medium">{prop.house_category}</span>
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 font-medium">{prop.number_of_rooms} rooms</span>
                        </div>
                      </div>
                    </div>

                    {/* Rent info */}
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1.5">
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase tracking-wider">Monthly</p>
                        <p className="font-bold text-sm">UGX {prop.monthly_rent.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wider">Daily</p>
                        <p className="font-bold text-sm text-blue-600">UGX {prop.daily_rate.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-full ${
                        prop.rent_status === 'empty' ? 'bg-red-100 text-red-700' :
                        prop.rent_status === 'requested' ? 'bg-amber-100 text-amber-700' :
                        prop.rent_status === 'paid' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {prop.rent_status === 'empty' ? '🏚️ Empty / Available' :
                         prop.rent_status === 'requested' ? '⏳ Rent Requested' :
                         prop.rent_status === 'paid' ? '✅ Rent Paid' :
                         '🏠 Occupied'}
                      </span>
                    </div>

                    {/* Agent & Landlord */}
                    <div className="space-y-1 border-t pt-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-gray-500 font-medium">Agent:</span>
                        <span className="text-xs font-medium">{prop.agent_name}</span>
                      </div>
                      {prop.agent_phone && (
                        <div className="flex justify-end">
                          <PhoneLink phone={prop.agent_phone} name={prop.agent_name} />
                        </div>
                      )}
                      {prop.landlord_name && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-500 font-medium">Landlord:</span>
                            <span className="text-xs font-medium">{prop.landlord_name}</span>
                          </div>
                          {prop.landlord_phone && (
                            <div className="flex justify-end">
                              <PhoneLink phone={prop.landlord_phone} name={prop.landlord_name} />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Google Maps link */}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${prop.latitude},${prop.longitude}`}
                      target="_blank" rel="noopener noreferrer"
                      className="block text-center text-[10px] text-blue-600 hover:underline font-medium py-1"
                    >
                      📍 Get Directions
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500" /> Empty: {counts.empty}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500" /> Occupied: {counts.occupied}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" /> Rent Requested: {counts.requested}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-500" /> Rent Paid: {counts.paid}</span>
        <span className="font-semibold text-foreground">Total on map: {properties.length}</span>
      </div>
    </div>
  );
}
