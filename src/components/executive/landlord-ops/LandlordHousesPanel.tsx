import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Building2, Home, Search, User, UserPlus, UserX, UserCog, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { BindTenantToHouseDialog } from './BindTenantToHouseDialog';
import { RemoveTenantDialog } from './RemoveTenantDialog';
import { ReassignAgentDialog } from '@/components/shared/ReassignAgentDialog';

interface HouseRow {
  id: string;
  title: string;
  address: string;
  region: string;
  status: string;
  monthly_rent: number;
  daily_rate: number;
  agent_id: string;
  landlord_id: string | null;
  tenant_id: string | null;
}

interface LandlordGroup {
  landlord_id: string;
  landlord_name: string;
  landlord_phone: string | null;
  houses: HouseRow[];
  occupied: number;
  vacant: number;
}

export function LandlordHousesPanel() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const housesQuery = useQuery({
    queryKey: ['landlord-houses-panel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_listings')
        .select('id,title,address,region,status,monthly_rent,daily_rate,agent_id,landlord_id,tenant_id')
        .not('landlord_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as HouseRow[];
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['landlord-houses-panel-profiles', housesQuery.data?.length ?? 0],
    enabled: !!housesQuery.data && housesQuery.data.length > 0,
    queryFn: async () => {
      const houses = housesQuery.data ?? [];
      const ids = Array.from(new Set([
        ...houses.map(h => h.landlord_id).filter(Boolean) as string[],
        ...houses.map(h => h.tenant_id).filter(Boolean) as string[],
        ...houses.map(h => h.agent_id),
      ]));
      if (!ids.length) return {} as Record<string, { name: string; phone: string | null }>;
      const { data } = await supabase.from('profiles').select('id,full_name,phone').in('id', ids);
      const out: Record<string, { name: string; phone: string | null }> = {};
      for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; phone: string | null }>) {
        out[p.id] = { name: p.full_name || 'Unnamed', phone: p.phone ?? null };
      }
      return out;
    },
  });

  const groups = useMemo<LandlordGroup[]>(() => {
    const profs = profilesQuery.data ?? {};
    const byLandlord = new Map<string, LandlordGroup>();
    for (const h of housesQuery.data ?? []) {
      if (!h.landlord_id) continue;
      const g = byLandlord.get(h.landlord_id) ?? {
        landlord_id: h.landlord_id,
        landlord_name: profs[h.landlord_id]?.name ?? 'Unknown landlord',
        landlord_phone: profs[h.landlord_id]?.phone ?? null,
        houses: [],
        occupied: 0,
        vacant: 0,
      };
      g.houses.push(h);
      if (h.tenant_id) g.occupied += 1; else g.vacant += 1;
      byLandlord.set(h.landlord_id, g);
    }
    return Array.from(byLandlord.values()).sort((a, b) => a.landlord_name.localeCompare(b.landlord_name));
  }, [housesQuery.data, profilesQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g =>
      g.landlord_name.toLowerCase().includes(q) ||
      (g.landlord_phone ?? '').includes(q) ||
      g.houses.some(h =>
        h.title.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.region.toLowerCase().includes(q),
      ),
    );
  }, [groups, search]);

  // ── Action dialog state ──
  const [bindFor, setBindFor] = useState<{ landlordId: string; landlordName: string; houseId: string; currentTenantId: string | null } | null>(null);
  const [removeFor, setRemoveFor] = useState<{ houseId: string; houseTitle: string } | null>(null);
  const [reassignFor, setReassignFor] = useState<{ houseId: string; houseTitle: string; currentAgentId: string } | null>(null);

  const refetch = () => {
    housesQuery.refetch();
  };
  const profs = profilesQuery.data ?? {};

  if (housesQuery.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        Houses by Landlord
      </h2>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search landlord, house, or address…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No landlords match.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(g => {
            const isOpen = !!expanded[g.landlord_id];
            return (
              <Card key={g.landlord_id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(s => ({ ...s, [g.landlord_id]: !s[g.landlord_id] }))}
                  className="w-full text-left p-3 active:bg-muted/50 transition-colors min-h-[64px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-sky-600 shrink-0" />
                        {g.landlord_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {g.landlord_phone && <span>{g.landlord_phone}</span>}
                        <span>· {g.houses.length} house{g.houses.length === 1 ? '' : 's'}</span>
                        <span className="text-success">· {g.occupied} occupied</span>
                        <span className="text-amber-600">· {g.vacant} vacant</span>
                      </div>
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4 mt-1 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-3 space-y-2">
                    {g.houses.map(h => {
                      const tenant = h.tenant_id ? profs[h.tenant_id] : null;
                      const agent = profs[h.agent_id];
                      return (
                        <div key={h.id} className="rounded-lg border bg-background p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm flex items-center gap-1.5">
                                <Home className="h-4 w-4 text-primary shrink-0" />
                                <span className="truncate">{h.title}</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">{h.address}, {h.region}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatUGX(h.monthly_rent)}/mo · {formatUGX(h.daily_rate)}/day
                              </p>
                            </div>
                            <Badge variant={h.tenant_id ? 'default' : 'outline'} className="text-[10px] shrink-0">
                              {h.tenant_id ? 'Occupied' : 'Vacant'}
                            </Badge>
                          </div>

                          <div className="rounded-md bg-muted/40 p-2 text-[11px] space-y-1">
                            <p className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span className="font-medium">Tenant:</span>
                              <span className="truncate">{tenant ? `${tenant.name}${tenant.phone ? ` · ${tenant.phone}` : ''}` : '—'}</span>
                            </p>
                            <p className="flex items-center gap-1">
                              <UserCog className="h-3 w-3" />
                              <span className="font-medium">Agent:</span>
                              <span className="truncate">{agent ? `${agent.name}${agent.phone ? ` · ${agent.phone}` : ''}` : '—'}</span>
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="sm" variant="outline" className="h-8 text-xs gap-1"
                              onClick={() => setBindFor({
                                landlordId: g.landlord_id, landlordName: g.landlord_name,
                                houseId: h.id, currentTenantId: h.tenant_id,
                              })}
                            >
                              <UserPlus className="h-3 w-3" />
                              {h.tenant_id ? 'Swap tenant' : 'Bind tenant'}
                            </Button>
                            {h.tenant_id && (
                              <Button
                                size="sm" variant="outline" className="h-8 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={() => setRemoveFor({ houseId: h.id, houseTitle: h.title })}
                              >
                                <UserX className="h-3 w-3" />
                                Remove (absconded)
                              </Button>
                            )}
                            <Button
                              size="sm" variant="outline" className="h-8 text-xs gap-1"
                              onClick={() => setReassignFor({ houseId: h.id, houseTitle: h.title, currentAgentId: h.agent_id })}
                            >
                              <UserCog className="h-3 w-3" />
                              Reassign agent
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {bindFor && (
        <BindTenantToHouseDialog
          open={!!bindFor}
          onOpenChange={(o) => !o && setBindFor(null)}
          landlordId={bindFor.landlordId}
          landlordName={bindFor.landlordName}
          preselectedHouseId={bindFor.houseId}
          currentTenantIdOnHouse={bindFor.currentTenantId}
          onComplete={refetch}
        />
      )}
      {removeFor && (
        <RemoveTenantDialog
          open={!!removeFor}
          onOpenChange={(o) => !o && setRemoveFor(null)}
          houseId={removeFor.houseId}
          houseTitle={removeFor.houseTitle}
          onComplete={refetch}
        />
      )}
      {reassignFor && (
        <ReassignAgentDialog
          open={!!reassignFor}
          onOpenChange={(o) => !o && setReassignFor(null)}
          target={{ kind: 'house', houseId: reassignFor.houseId, houseTitle: reassignFor.houseTitle, currentAgentId: reassignFor.currentAgentId }}
          onComplete={refetch}
        />
      )}
    </div>
  );
}
