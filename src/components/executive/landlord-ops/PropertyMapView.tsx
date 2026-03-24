import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Home, MapPin, Layers } from 'lucide-react';

// Lazy-load Leaflet deps to avoid blocking initial render
const LeafletMap = lazy(() => import('./PropertyMapLeaflet'));

type StatusFilter = 'all' | 'empty' | 'occupied' | 'requested' | 'paid';

export interface MapProperty {
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
      const { data: listings } = await supabase
        .from('house_listings')
        .select(`
          id, title, address, latitude, longitude, monthly_rent, daily_rate,
          house_category, number_of_rooms, status, tenant_id, agent_id, landlord_id, image_urls,
          landlords(name, phone)
        `)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(500);

      if (!listings?.length) return [];

      const agentIds = [...new Set(listings.map(l => l.agent_id))];
      const { data: agents } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', agentIds);
      const agentMap = new Map((agents || []).map(a => [a.id, a]));

      const tenantIds = listings.filter(l => l.tenant_id).map(l => l.tenant_id!);
      const rentMap = new Map<string, { status: string; amount_repaid: number; total_repayment: number }>();
      if (tenantIds.length > 0) {
        const { data: rentReqs } = await supabase
          .from('rent_requests')
          .select('tenant_id, status, amount_repaid, total_repayment')
          .in('tenant_id', tenantIds.slice(0, 500))
          .in('status', ['approved', 'disbursed', 'active', 'repaying', 'completed', 'fully_paid'])
          .order('created_at', { ascending: false });

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

  const filtered = useMemo(
    () => filter === 'all' ? properties : properties.filter(p => p.rent_status === filter),
    [filter, properties]
  );

  const counts = useMemo(() => ({
    all: properties.length,
    empty: properties.filter(p => p.rent_status === 'empty').length,
    occupied: properties.filter(p => p.rent_status === 'occupied').length,
    requested: properties.filter(p => p.rent_status === 'requested').length,
    paid: properties.filter(p => p.rent_status === 'paid').length,
  }), [properties]);

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

      {/* Map Container - lazy loaded */}
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
          <Suspense fallback={
            <div className="flex items-center justify-center h-full bg-muted/10">
              <div className="text-center space-y-3">
                <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Loading map…</p>
              </div>
            </div>
          }>
            <LeafletMap properties={filtered} />
          </Suspense>
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
