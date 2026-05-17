import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2, Home, Search, User, UserPlus, UserX, UserCog, ChevronDown, ChevronRight, Loader2, X,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { BindTenantToHouseDialog } from './BindTenantToHouseDialog';
import { RemoveTenantDialog } from './RemoveTenantDialog';
import { ReassignAgentDialog } from '@/components/shared/ReassignAgentDialog';
import { HouseActivityTimeline } from '@/components/shared/HouseActivityTimeline';

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
  created_at: string;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'occupied' | 'vacant'>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'region' | 'occupied_first' | 'vacant_first'>('newest');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const housesQuery = useQuery({
    queryKey: ['landlord-houses-panel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_listings')
        .select('id,title,address,region,status,monthly_rent,daily_rate,agent_id,landlord_id,tenant_id,created_at')
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

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const h of housesQuery.data ?? []) if (h.region) set.add(h.region);
    return Array.from(set).sort();
  }, [housesQuery.data]);

  const profs = profilesQuery.data ?? {};

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const houseMatches = (h: HouseRow) => {
      if (regionFilter !== 'all' && h.region !== regionFilter) return false;
      if (statusFilter === 'occupied' && !h.tenant_id) return false;
      if (statusFilter === 'vacant' && h.tenant_id) return false;
      if (!q) return true;
      const tenant = h.tenant_id ? profs[h.tenant_id] : null;
      const agent = profs[h.agent_id];
      return (
        h.title.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.region.toLowerCase().includes(q) ||
        (tenant?.name.toLowerCase().includes(q) ?? false) ||
        (tenant?.phone ?? '').includes(q) ||
        (agent?.name.toLowerCase().includes(q) ?? false) ||
        (agent?.phone ?? '').includes(q)
      );
    };
    const landlordTextMatch = (g: LandlordGroup) =>
      !q || g.landlord_name.toLowerCase().includes(q) || (g.landlord_phone ?? '').includes(q);

    return groups
      .map(g => {
        const houses = g.houses.filter(houseMatches);
        if (houses.length === 0 && !landlordTextMatch(g)) return null;
        if (houses.length === 0) return null;
        const sorted = [...houses].sort((a, b) => {
          switch (sortBy) {
            case 'oldest': return a.created_at.localeCompare(b.created_at);
            case 'title': return a.title.localeCompare(b.title);
            case 'region': return (a.region || '').localeCompare(b.region || '') || a.title.localeCompare(b.title);
            case 'occupied_first': return (a.tenant_id ? 0 : 1) - (b.tenant_id ? 0 : 1);
            case 'vacant_first': return (a.tenant_id ? 1 : 0) - (b.tenant_id ? 1 : 0);
            case 'newest':
            default: return b.created_at.localeCompare(a.created_at);
          }
        });
        const occupied = sorted.filter(h => h.tenant_id).length;
        return { ...g, houses: sorted, occupied, vacant: sorted.length - occupied };
      })
      .filter(Boolean) as LandlordGroup[];
  }, [groups, search, statusFilter, regionFilter, profs, sortBy]);

  const hasActiveFilter = search.trim().length > 0 || statusFilter !== 'all' || regionFilter !== 'all' || sortBy !== 'newest';
  const totalHouses = filtered.reduce((s, g) => s + g.houses.length, 0);

  // ── Action dialog state ──
  const [bindFor, setBindFor] = useState<{ landlordId: string; landlordName: string; houseId: string; currentTenantId: string | null } | null>(null);
  const [removeFor, setRemoveFor] = useState<{ houseId: string; houseTitle: string } | null>(null);
  const [reassignFor, setReassignFor] = useState<{ houseId: string; houseTitle: string; currentAgentId: string } | null>(null);
  const [timelineOpen, setTimelineOpen] = useState<Record<string, boolean>>({});

  const refetch = () => {
    housesQuery.refetch();
  };

  if (housesQuery.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        Houses by Landlord
      </h2>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search landlord, house, tenant, agent, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All houses</SelectItem>
              <SelectItem value="occupied">Occupied only</SelectItem>
              <SelectItem value="vacant">Vacant only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="h-9 w-auto min-w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title">Title (A–Z)</SelectItem>
              <SelectItem value="region">Region (A–Z)</SelectItem>
              <SelectItem value="occupied_first">Occupied first</SelectItem>
              <SelectItem value="vacant_first">Vacant first</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilter && (
            <Button
              variant="ghost" size="sm" className="h-9 text-xs gap-1"
              onClick={() => { setSearch(''); setStatusFilter('all'); setRegionFilter('all'); setSortBy('newest'); }}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
          <div className="ml-auto text-[11px] text-muted-foreground self-center">
            {filtered.length} landlord{filtered.length === 1 ? '' : 's'} · {totalHouses} house{totalHouses === 1 ? '' : 's'}
          </div>
        </div>
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
                            <Button
                              size="sm" variant="ghost" className="h-8 text-xs gap-1"
                              onClick={() => setTimelineOpen(s => ({ ...s, [h.id]: !s[h.id] }))}
                              aria-expanded={!!timelineOpen[h.id]}
                            >
                              {timelineOpen[h.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              Timeline
                            </Button>
                          </div>
                          {timelineOpen[h.id] && (
                            <div className="rounded-md border bg-muted/10 p-2">
                              <HouseActivityTimeline houseId={h.id} />
                            </div>
                          )}
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
