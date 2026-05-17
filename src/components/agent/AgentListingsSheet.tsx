import { useMemo, useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, MapPin, DoorOpen, CheckCircle, Clock, AlertTriangle, RotateCcw, Building2, ChevronDown, ChevronRight, User, UserCog, Pencil, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHouseListings, HouseListing } from '@/hooks/useHouseListings';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TenantProfileView } from './TenantProfileView';
import { ReassignAgentDialog } from '@/components/shared/ReassignAgentDialog';
import { HouseActivityTimeline } from '@/components/shared/HouseActivityTimeline';
import { HighlightText } from '@/components/shared/HighlightText';
import { useFilterKeyboardShortcuts } from '@/hooks/useFilterKeyboardShortcuts';

interface AgentListingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentListingsSheet({ open, onOpenChange }: AgentListingsSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { listings, loading, refresh } = useHouseListings({
    agentId: user?.id,
    status: undefined, // show all statuses for agent
    limit: 100,
  });
  const [relisting, setRelisting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [timelineOpen, setTimelineOpen] = useState<Record<string, boolean>>({});
  const [viewingTenantId, setViewingTenantId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{
    rentRequestId: string; tenantName: string; currentAgentId: string;
  } | null>(null);
  const FILTERS_STORAGE_KEY = 'agent-listings-sheet:filters:v1';
  type SheetFilters = {
    search: string;
    statusFilter: 'all' | 'occupied' | 'vacant' | 'rejected';
    regionFilter: string;
    sortBy: 'newest' | 'oldest' | 'title' | 'region' | 'occupied_first' | 'vacant_first';
  };
  const DEFAULT_FILTERS: SheetFilters = { search: '', statusFilter: 'all', regionFilter: 'all', sortBy: 'newest' };
  const initial: SheetFilters = (() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
    } catch { return DEFAULT_FILTERS; }
  })();
  const [search, setSearch] = useState(initial.search);
  const [statusFilter, setStatusFilter] = useState<SheetFilters['statusFilter']>(initial.statusFilter);
  const [regionFilter, setRegionFilter] = useState<string>(initial.regionFilter);
  const [sortBy, setSortBy] = useState<SheetFilters['sortBy']>(initial.sortBy);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ search, statusFilter, regionFilter, sortBy }));
    } catch { /* ignore */ }
  }, [search, statusFilter, regionFilter, sortBy]);

  // Enrich with landlord profile + tenant profile + active rent_request id for each occupied house.
  const [enrichment, setEnrichment] = useState<{
    landlords: Record<string, { name: string; phone: string | null }>;
    tenants: Record<string, { name: string; phone: string | null }>;
    activeRequestByTenant: Record<string, { id: string; agent_id: string | null }>;
  }>({ landlords: {}, tenants: {}, activeRequestByTenant: {} });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!listings.length) return;
      const landlordIds = Array.from(new Set(listings.map(l => l.landlord_id).filter(Boolean) as string[]));
      const tenantIds = Array.from(new Set(listings.map(l => l.tenant_id).filter(Boolean) as string[]));
      const [landlords, tenants, reqs] = await Promise.all([
        landlordIds.length
          ? supabase.from('profiles').select('id,full_name,phone').in('id', landlordIds)
          : Promise.resolve({ data: [] as any }),
        tenantIds.length
          ? supabase.from('profiles').select('id,full_name,phone').in('id', tenantIds)
          : Promise.resolve({ data: [] as any }),
        tenantIds.length
          ? supabase.from('rent_requests').select('id,tenant_id,agent_id,created_at').in('tenant_id', tenantIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any }),
      ]);
      if (cancelled) return;
      const lmap: Record<string, { name: string; phone: string | null }> = {};
      for (const p of (landlords.data ?? []) as any[]) lmap[p.id] = { name: p.full_name || 'Unknown landlord', phone: p.phone ?? null };
      const tmap: Record<string, { name: string; phone: string | null }> = {};
      for (const p of (tenants.data ?? []) as any[]) tmap[p.id] = { name: p.full_name || 'Unknown tenant', phone: p.phone ?? null };
      const rmap: Record<string, { id: string; agent_id: string | null }> = {};
      for (const r of (reqs.data ?? []) as any[]) {
        if (!rmap[r.tenant_id]) rmap[r.tenant_id] = { id: r.id, agent_id: r.agent_id };
      }
      setEnrichment({ landlords: lmap, tenants: tmap, activeRequestByTenant: rmap });
    }
    run();
    return () => { cancelled = true; };
  }, [listings]);

  const handleRelist = async (listing: HouseListing) => {
    setRelisting(listing.id);
    try {
      const { error } = await supabase
        .from('house_listings')
        .update({ status: 'available' })
        .eq('id', listing.id);
      if (error) throw error;
      toast({ title: 'Relisted', description: `${listing.title} is now available again.` });
      refresh();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setRelisting(null);
    }
  };

  const rejected = listings.filter(l => l.status === 'rejected');
  const others = listings.filter(l => l.status !== 'rejected');

  // Group `others` by landlord_id
  const grouped = useMemo(() => {
    type Group = { landlord_id: string | null; name: string; phone: string | null; houses: HouseListing[] };
    const map = new Map<string, Group>();
    for (const h of others) {
      const key = h.landlord_id ?? '__none__';
      const prof = h.landlord_id ? enrichment.landlords[h.landlord_id] : null;
      const g = map.get(key) ?? {
        landlord_id: h.landlord_id ?? null,
        name: prof?.name ?? (h.landlord_id ? 'Loading…' : 'No landlord on file'),
        phone: prof?.phone ?? null,
        houses: [],
      };
      g.houses.push(h);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [others, enrichment.landlords]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings) if (l.region) set.add(l.region);
    return Array.from(set).sort();
  }, [listings]);

  const q = search.trim().toLowerCase();
  const matchHouse = (l: HouseListing) => {
    if (regionFilter !== 'all' && l.region !== regionFilter) return false;
    if (statusFilter === 'occupied' && !l.tenant_id) return false;
    if (statusFilter === 'vacant' && (l.tenant_id || l.status !== 'available')) return false;
    if (!q) return true;
    const tenant = l.tenant_id ? enrichment.tenants[l.tenant_id] : null;
    const landlord = l.landlord_id ? enrichment.landlords[l.landlord_id] : null;
    return (
      l.title.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q) ||
      (l.region ?? '').toLowerCase().includes(q) ||
      (tenant?.name.toLowerCase().includes(q) ?? false) ||
      (tenant?.phone ?? '').includes(q) ||
      (landlord?.name.toLowerCase().includes(q) ?? false) ||
      (landlord?.phone ?? '').includes(q)
    );
  };

  const sortHouses = (arr: HouseListing[]) => {
    const copy = [...arr];
    copy.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return (a.created_at || '').localeCompare(b.created_at || '');
        case 'title': return a.title.localeCompare(b.title);
        case 'region': return (a.region || '').localeCompare(b.region || '') || a.title.localeCompare(b.title);
        case 'occupied_first': return (a.tenant_id ? 0 : 1) - (b.tenant_id ? 0 : 1);
        case 'vacant_first': return (a.tenant_id ? 1 : 0) - (b.tenant_id ? 1 : 0);
        case 'newest':
        default: return (b.created_at || '').localeCompare(a.created_at || '');
      }
    });
    return copy;
  };

  const filteredGrouped = useMemo(() => {
    if (statusFilter === 'rejected') return [];
    return grouped
      .map(g => ({ ...g, houses: sortHouses(g.houses.filter(matchHouse)) }))
      .filter(g => g.houses.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, search, statusFilter, regionFilter, enrichment, sortBy]);

  const filteredRejected = useMemo(() => {
    if (statusFilter !== 'all' && statusFilter !== 'rejected') return [];
    return sortHouses(rejected.filter(matchHouse));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejected, search, statusFilter, regionFilter, enrichment, sortBy]);

  const hasActiveFilter = q.length > 0 || statusFilter !== 'all' || regionFilter !== 'all' || sortBy !== 'newest';

  const searchRef = useRef<HTMLInputElement>(null);
  const clearAll = () => { setSearch(''); setStatusFilter('all'); setRegionFilter('all'); setSortBy('newest'); };
  useFilterKeyboardShortcuts({ inputRef: searchRef, onClear: clearAll, hasActiveFilter, enabled: open });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            My Listed Houses
          </SheetTitle>
          {!loading && listings.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="Search landlord, house, tenant, phone…  ( / focus · Esc clear )"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-9 h-9"
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
                  <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={regionFilter} onValueChange={setRegionFilter}>
                  <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All regions</SelectItem>
                    {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                  <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="title">Title (A–Z)</SelectItem>
                    <SelectItem value="region">Region (A–Z)</SelectItem>
                    <SelectItem value="occupied_first">Occupied first</SelectItem>
                    <SelectItem value="vacant_first">Vacant first</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline" size="sm" className="h-8 text-xs gap-1"
                  onClick={clearAll}
                  disabled={!hasActiveFilter}
                  title="Reset search, status, region, and sort back to defaults"
                >
                  <X className="h-3 w-3" /> Reset filters
                </Button>
              </div>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))
          ) : listings.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Home className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">No houses listed yet</p>
            </div>
          ) : (
            <>
              {filteredRejected.length === 0 && filteredGrouped.length === 0 && hasActiveFilter && (
                <div className="text-center py-12 space-y-2">
                  <Search className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">No houses match your filters</p>
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear filters
                  </Button>
                </div>
              )}
              {/* Rejected listings - shown prominently at top */}
              {filteredRejected.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <p className="text-xs font-bold text-destructive">
                      {filteredRejected.length} Rejected — needs revision
                    </p>
                  </div>
                  {filteredRejected.map(l => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate"><HighlightText text={l.title} query={search} /></p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate"><HighlightText text={l.address} query={search} />, <HighlightText text={l.region} query={search} /></span>
                          </div>
                        </div>
                        <Badge variant="destructive" className="text-[10px] shrink-0">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Rejected
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{formatUGX(l.monthly_rent)}/mo</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => handleRelist(l)}
                          disabled={relisting === l.id}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {relisting === l.id ? 'Relisting...' : 'Relist'}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Houses grouped by landlord */}
              {filteredGrouped.map(g => {
                const key = g.landlord_id ?? '__none__';
                const isOpen = expanded[key] !== false; // default open
                return (
                  <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setExpanded(s => ({ ...s, [key]: !isOpen }))}
                      className="w-full text-left p-3 active:bg-muted/50 transition-colors flex items-center justify-between gap-2 min-h-[56px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="h-4 w-4 text-sky-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate"><HighlightText text={g.name} query={search} /></p>
                          <p className="text-[11px] text-muted-foreground">
                            {g.phone ? <><HighlightText text={g.phone} query={search} /> · </> : ''}{g.houses.length} house{g.houses.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {isOpen && (
                      <div className="border-t bg-muted/10 p-2 space-y-2">
                        {g.houses.map(l => {
                          const tenant = l.tenant_id ? enrichment.tenants[l.tenant_id] : null;
                          const req = l.tenant_id ? enrichment.activeRequestByTenant[l.tenant_id] : null;
                          return (
                            <motion.div
                              key={l.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="rounded-lg border border-border bg-background p-3 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-sm truncate"><HighlightText text={l.title} query={search} /></p>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate"><HighlightText text={l.address} query={search} />, <HighlightText text={l.region} query={search} /></span>
                                  </div>
                                </div>
                                <Badge variant={l.status === 'available' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                                  {l.status === 'available' ? (
                                    <><CheckCircle className="h-3 w-3 mr-1" /> Available</>
                                  ) : l.status === 'occupied' ? (
                                    <><DoorOpen className="h-3 w-3 mr-1" /> Occupied</>
                                  ) : (
                                    <><Clock className="h-3 w-3 mr-1" /> {l.status}</>
                                  )}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{formatUGX(l.monthly_rent)}/mo</span>
                                <span className="font-bold text-success">{formatUGX(l.daily_rate)}/day</span>
                              </div>

                              <div className="rounded-md bg-muted/40 p-2 text-[11px] flex items-center gap-1.5">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="font-medium">Tenant:</span>
                                <span className="truncate flex-1">
                                  {tenant ? (
                                    <>
                                      <HighlightText text={tenant.name} query={search} />
                                      {tenant.phone ? <> · <HighlightText text={tenant.phone} query={search} /></> : null}
                                    </>
                                  ) : '—'}
                                </span>
                              </div>

                              {l.tenant_id && (
                                <div className="flex flex-wrap gap-1.5">
                                  <Button
                                    size="sm" variant="outline" className="h-8 text-xs gap-1"
                                    onClick={() => setViewingTenantId(l.tenant_id!)}
                                  >
                                    <Pencil className="h-3 w-3" /> Change tenant profile
                                  </Button>
                                  {req && (
                                    <Button
                                      size="sm" variant="outline" className="h-8 text-xs gap-1"
                                      onClick={() => setReassignTarget({
                                        rentRequestId: req.id,
                                        tenantName: tenant?.name ?? 'tenant',
                                        currentAgentId: req.agent_id ?? (l.agent_id ?? ''),
                                      })}
                                    >
                                      <UserCog className="h-3 w-3" /> Reassign agent
                                    </Button>
                                  )}
                                </div>
                              )}
                              <div>
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-[11px] gap-1 px-2"
                                  onClick={() => setTimelineOpen(s => ({ ...s, [l.id]: !s[l.id] }))}
                                  aria-expanded={!!timelineOpen[l.id]}
                                >
                                  {timelineOpen[l.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  Timeline
                                </Button>
                                {timelineOpen[l.id] && (
                                  <div className="mt-1 rounded-md border bg-muted/10 p-2">
                                    <HouseActivityTimeline houseId={l.id} />
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Tenant profile editor */}
        {viewingTenantId && (
          <Sheet open={!!viewingTenantId} onOpenChange={(o) => !o && setViewingTenantId(null)}>
            <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 flex flex-col overflow-y-auto">
              <TenantProfileView tenantId={viewingTenantId} onBack={() => setViewingTenantId(null)} />
            </SheetContent>
          </Sheet>
        )}

        {/* Reassign agent dialog */}
        {reassignTarget && (
          <ReassignAgentDialog
            open={!!reassignTarget}
            onOpenChange={(o) => !o && setReassignTarget(null)}
            target={{ kind: 'rent_request', ...reassignTarget }}
            onComplete={refresh}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
