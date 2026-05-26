import { useState, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, User, Home, ChevronRight, Phone, Image as ImageIcon, Search, X, Maximize2, RefreshCw } from 'lucide-react';
import { TenantLocationBreadcrumbs } from './TenantLocationBreadcrumbs';
import { ImageZoomLightbox } from '@/components/executive/landlord-ops/ImageZoomLightbox';
import { formatUGX } from '@/lib/rentCalculations';
import { UGANDA_REGION_GROUPS, UGANDA_DISTRICT_AREAS } from '@/lib/ugandaDistricts';
import { ChevronDown } from 'lucide-react';
import { UserDrilldownDrawer } from '@/components/ops/UserDrilldownDrawer';
import {
  useTenantLocationBreakdown,
  useTenantsAtLeaf,
  tenantNextLevel,
  type TenantBreadcrumbPath,
  type TenantBreakdownRow,
  type TenantLeaf,
} from '@/hooks/useTenantLocationBreakdown';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const LEVEL_ICON: Record<string, any> = {
  country: MapPin, region: MapPin, district: MapPin, ward: MapPin,
  agent: User, landlord: Home,
};

type QuickFilter = 'all' | 'linked' | 'pending' | 'revenue';

const LEVEL_PLACEHOLDER: Record<string, string> = {
  country: 'Search countries…',
  region: 'Search regions…',
  district: 'Search districts…',
  ward: 'Search wards…',
  agent: 'Search agents…',
  landlord: 'Search landlords…',
};

export function TenantLocationBrowser() {
  const [path, setPath] = useState<TenantBreadcrumbPath>({});
  const level = tenantNextLevel(path);
  const { data: rows, isLoading } = useTenantLocationBreakdown(path);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [agentDrilldownId, setAgentDrilldownId] = useState<string | null>(null);
  const refreshCounts = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-location-breakdown'] }),
        queryClient.invalidateQueries({ queryKey: ['tenants-at-leaf'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const pick = (row: TenantBreakdownRow) => {
    // Tapping an agent tile opens the full agent profile drawer
    // (wallet, float, capacity, landlords, partners, referrals) instead
    // of drilling another level deeper into the location tree.
    if (level === 'agent' && row.agent_id) {
      setAgentDrilldownId(row.agent_id);
      return;
    }
    const p: TenantBreadcrumbPath = { ...path };
    switch (level) {
      case 'country':  p.country  = row.label; break;
      case 'region':   p.region   = row.label; break;
      case 'district': p.district = row.label; break;
      case 'ward':     p.ward     = row.label; break;
      case 'agent':    p.agentId  = row.agent_id ?? null; p.agentName = row.label; break;
      case 'landlord': p.landlordId = row.landlord_id ?? null; p.landlordName = row.label; break;
    }
    setPath(p);
  };

  return (
    <div className="space-y-3">
      <Card className="p-2.5 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <TenantLocationBreadcrumbs path={path} onJump={(p) => setPath(p)} />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshCounts}
            disabled={refreshing}
            className="h-7 px-2 text-[11px] shrink-0"
            title="Refresh tenant counts"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="ml-1 hidden sm:inline">Refresh counts</span>
          </Button>
        </div>
      </Card>

      {level === 'tenants' ? (
        <TenantLeafList path={path} />
      ) : level === 'region' && (path.country ?? '').toLowerCase() === 'uganda' ? (
        <UgandaRegionDistrictPicker
          rows={rows ?? []}
          loading={isLoading}
          onPickDistrict={(district, backendRegion) =>
            setPath({ ...path, region: backendRegion, district })
          }
        />
      ) : level === 'ward' && path.district && UGANDA_DISTRICT_AREAS[path.district] ? (
        <DistrictAreaPicker
          districtName={path.district}
          liveRows={rows ?? []}
          loading={isLoading}
          onPickArea={(area) => setPath({ ...path, ward: area })}
        />
      ) : (
        <TenantTileGrid rows={rows ?? []} level={level} loading={isLoading} onPick={pick} />
      )}

      <UserDrilldownDrawer
        open={!!agentDrilldownId}
        onOpenChange={(o) => { if (!o) setAgentDrilldownId(null); }}
        agentId={agentDrilldownId}
        defaultTab="agent"
      />
    </div>
  );
}

/**
 * Uganda-only picker. Shows 5 regions (Central / Eastern / Western /
 * Northern / Southern) as collapsible sections with their districts
 * listed underneath. Tapping a district jumps straight to the ward
 * level using the district's canonical backend region — Uganda has
 * only 4 official regions, so "Southern" districts still resolve to
 * Central/Western behind the scenes.
 */
function UgandaRegionDistrictPicker({
  rows,
  loading,
  onPickDistrict,
}: {
  rows: TenantBreakdownRow[];
  loading: boolean;
  onPickDistrict: (district: string, backendRegion: string) => void;
}) {
  const [openRegion, setOpenRegion] = useState<string | null>('central');

  // Fetch district-level tenant counts for each of the 4 backend regions
  // in parallel so we can purple-highlight every district that has at
  // least one tenant, and show live counts per district + per group.
  const districtQueries = useQueries({
    queries: (['Central', 'Eastern', 'Northern', 'Western'] as const).map((br) => ({
      queryKey: ['tenant-location-breakdown', 'district', 'Uganda', br],
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_tenant_location_breakdown' as any, {
          p_level: 'district',
          p_country: 'Uganda',
          p_region: br,
          p_district: null,
          p_ward: null,
          p_agent_id: null,
        });
        if (error) throw error;
        return { backendRegion: br, rows: (data ?? []) as TenantBreakdownRow[] };
      },
    })),
  });

  // Map "backendRegion::district" (lowercased) → tenant total.
  const districtTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of districtQueries) {
      if (!q.data) continue;
      for (const r of q.data.rows) {
        m[`${q.data.backendRegion}::${r.label}`.toLowerCase()] = r.total;
      }
    }
    return m;
  }, [districtQueries]);
  const countFor = (name: string, backendRegion: string) =>
    districtTotals[`${backendRegion}::${name}`.toLowerCase()] ?? 0;

  return (
    <div className="space-y-2">
      {loading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {UGANDA_REGION_GROUPS.map((group) => {
        const isOpen = openRegion === group.key;
        const groupTotal = group.districts.reduce((s, d) => s + countFor(d.name, d.backendRegion), 0);
        const groupActive = group.districts.filter((d) => countFor(d.name, d.backendRegion) > 0).length;
        return (
          <Card key={group.key} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenRegion(isOpen ? null : group.key)}
              className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/40 transition"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">{group.label}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {group.districts.length} districts
                </Badge>
                {groupActive > 0 && (
                  <Badge className="text-[10px] shrink-0 bg-purple-600 hover:bg-purple-600 text-white border-transparent">
                    {groupActive} active · {groupTotal.toLocaleString()} tenants
                  </Badge>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="border-t bg-muted/20 p-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {group.districts.map((d) => {
                    const count = countFor(d.name, d.backendRegion);
                    const hasUsers = count > 0;
                    const card = (
                      <button
                        key={`${group.key}-${d.name}`}
                        onClick={() => onPickDistrict(d.name, d.backendRegion)}
                        className="group text-left"
                      >
                        <Card
                          className={`p-2.5 h-full transition active:scale-[0.98] ${
                            hasUsers
                              ? 'bg-purple-50 border-purple-400 hover:border-purple-600 hover:shadow-sm dark:bg-purple-950/30 dark:border-purple-700'
                              : 'hover:border-primary hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  hasUsers ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'
                                }`}
                              />
                              <span
                                className={`text-xs font-semibold truncate ${
                                  hasUsers ? 'text-purple-900 dark:text-purple-100' : ''
                                }`}
                              >
                                {d.name}
                              </span>
                            </div>
                            <ChevronRight
                              className={`h-3.5 w-3.5 shrink-0 ${
                                hasUsers
                                  ? 'text-purple-600 dark:text-purple-400'
                                  : 'text-muted-foreground group-hover:text-primary'
                              }`}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <p className="text-[10px] text-muted-foreground">
                              {d.backendRegion} region
                            </p>
                            {hasUsers && (
                              <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                                {count.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </Card>
                      </button>
                    );
                    if (!hasUsers) return card;
                    return (
                      <Tooltip key={`${group.key}-${d.name}`}>
                        <TooltipTrigger asChild>{card}</TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {count.toLocaleString()} tenant{count === 1 ? '' : 's'}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Curated administrative-area picker for a single district (e.g. Wakiso).
 * Renders EVERY official sub-county / town council / division from
 * UGANDA_DISTRICT_AREAS and overlays live tenant counts from the RPC,
 * matching by case-insensitive label. Areas with at least one tenant
 * are highlighted in purple, mirroring the district picker UX.
 */
function DistrictAreaPicker({
  districtName,
  liveRows,
  loading,
  onPickArea,
}: {
  districtName: string;
  liveRows: TenantBreakdownRow[];
  loading: boolean;
  onPickArea: (area: string) => void;
}) {
  const areas = UGANDA_DISTRICT_AREAS[districtName] ?? [];
  const [search, setSearch] = useState('');

  // Live counts keyed by lowercased ward label.
  const liveCounts = useMemo(() => {
    const m: Record<string, TenantBreakdownRow> = {};
    for (const r of liveRows) m[r.label.trim().toLowerCase()] = r;
    return m;
  }, [liveRows]);

  const countFor = (name: string) => {
    const key = name.trim().toLowerCase();
    // Try exact, then strip common suffixes (Division/Town Council) for fuzzy match.
    if (liveCounts[key]) return liveCounts[key].total;
    const stripped = key.replace(/\s+(division|town council|sub[- ]county|municipality)$/i, '').trim();
    return liveCounts[stripped]?.total ?? 0;
  };

  const q = search.trim().toLowerCase();
  const filtered = q ? areas.filter((a) => a.toLowerCase().includes(q)) : areas;
  const activeCount = areas.filter((a) => countFor(a) > 0).length;
  const totalTenants = areas.reduce((s, a) => s + countFor(a), 0);

  return (
    <div className="space-y-2">
      <Card className="p-3 flex flex-wrap items-center gap-2 bg-muted/20">
        <MapPin className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{districtName} District</span>
        <Badge variant="secondary" className="text-[10px]">
          {areas.length} administrative areas
        </Badge>
        {activeCount > 0 && (
          <Badge className="text-[10px] bg-purple-600 hover:bg-purple-600 text-white border-transparent">
            {activeCount} active · {totalTenants.toLocaleString()} tenants
          </Badge>
        )}
      </Card>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${districtName} areas…`}
          className="pl-8 pr-8 h-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {filtered.map((area) => {
          const count = countFor(area);
          const hasUsers = count > 0;
          return (
            <button key={area} onClick={() => onPickArea(area)} className="group text-left">
              <Card
                className={`p-2.5 h-full transition active:scale-[0.98] ${
                  hasUsers
                    ? 'bg-purple-50 border-purple-400 hover:border-purple-600 hover:shadow-sm dark:bg-purple-950/30 dark:border-purple-700'
                    : 'hover:border-primary hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin
                      className={`h-3.5 w-3.5 shrink-0 ${
                        hasUsers ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold truncate ${
                        hasUsers ? 'text-purple-900 dark:text-purple-100' : ''
                      }`}
                    >
                      {area}
                    </span>
                  </div>
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 ${
                      hasUsers
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-muted-foreground group-hover:text-primary'
                    }`}
                  />
                </div>
                {hasUsers && (
                  <p className="mt-1 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                    {count.toLocaleString()} tenant{count === 1 ? '' : 's'}
                  </p>
                )}
              </Card>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <Card className="py-8 text-center text-sm text-muted-foreground">
          No areas match your search.
        </Card>
      )}
    </div>
  );
}

function TenantTileGrid({
  rows, level, loading, onPick,
}: { rows: TenantBreakdownRow[]; level: string; loading: boolean; onPick: (r: TenantBreakdownRow) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (filter === 'linked' && r.occupied === 0) return false;
      if (filter === 'pending' && r.vacant === 0) return false;
      if (filter === 'revenue' && r.revenue_ugx <= 0) return false;
      return true;
    });
  }, [rows, search, filter]);
  const Toolbar = (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={LEVEL_PLACEHOLDER[level] ?? 'Search…'}
          className="pl-8 pr-8 h-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'linked', 'pending', 'revenue'] as QuickFilter[]).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'linked' ? 'Has linked' : f === 'pending' ? 'Has pending' : 'Has revenue'}
          </Button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Toolbar}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-[110px] animate-pulse bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <Card className="py-10 text-center text-sm text-muted-foreground">
        No {level === 'country' ? 'countries' : `${level}s`} with tenants yet.
      </Card>
    );
  }
  const Icon = LEVEL_ICON[level] ?? MapPin;
  return (
    <div className="space-y-2">
      {Toolbar}
      {filtered.length === 0 ? (
        <Card className="py-8 text-center text-sm text-muted-foreground">
          No matches. Try a different search or filter.
        </Card>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {filtered.map(r => {
        const linkedPct = r.total ? Math.round((r.occupied / r.total) * 100) : 0;
        return (
          <button key={r.key} onClick={() => onPick(r)} className="group text-left">
            <Card className="p-3 h-full hover:border-primary hover:shadow-md transition active:scale-[0.98]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <p className="font-semibold text-sm truncate">{r.label}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </div>
              <p className="mt-1 text-xl font-bold">{r.total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">tenants</p>
              <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">{r.occupied} linked</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-medium">{r.vacant} pending</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{linkedPct}% have landlord</span>
                {r.revenue_ugx > 0 && <span className="font-medium">{formatUGX(r.revenue_ugx)}</span>}
              </div>
            </Card>
          </button>
        );
      })}
      </div>
      )}
    </div>
  );
}

function TenantLeafList({ path }: { path: TenantBreadcrumbPath }) {
  const { data, isLoading } = useTenantsAtLeaf(path);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'linked' | 'pending' | 'photos'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(t => {
      if (q) {
        const hay = [t.tenant_name, t.tenant_phone, t.landlord_name, t.agent_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'linked' && !t.landlord_id) return false;
      if (filter === 'pending' && t.landlord_id) return false;
      if (filter === 'photos' && !(t.house_image_urls ?? []).some(Boolean)) return false;
      return true;
    });
  }, [data, search, filter]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!data || data.length === 0) {
    return <Card className="py-10 text-center text-sm text-muted-foreground">No tenants in this scope yet.</Card>;
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenant, phone, landlord or agent…"
          className="pl-8 pr-8 h-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'linked', 'pending', 'photos'] as const).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'linked' ? 'Linked' : f === 'pending' ? 'Pending' : 'Has photos'}
          </Button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted-foreground">
          {filtered.length} of {data.length} tenant{data.length === 1 ? '' : 's'}
        </span>
      </div>
      {filtered.length === 0 ? (
        <Card className="py-8 text-center text-sm text-muted-foreground">No tenants match.</Card>
      ) : (
        filtered.map(t => (
          <TenantCard key={t.tenant_id} t={t} expanded={openId === t.tenant_id} onToggle={() => setOpenId(openId === t.tenant_id ? null : t.tenant_id)} />
        ))
      )}
    </div>
  );
}

function TenantCard({ t, expanded, onToggle }: { t: TenantLeaf; expanded: boolean; onToggle: () => void }) {
  const initials = (t.tenant_name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const tenantImg = t.tenant_photo_url || t.tenant_avatar_url || undefined;
  const houseImgs = (t.house_image_urls ?? []).filter(Boolean);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const galleryImgs = tenantImg ? [tenantImg, ...houseImgs] : houseImgs;
  const openAt = (i: number) => (e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx(i); };

  return (
    <Card className="p-3 cursor-pointer hover:border-primary transition" onClick={onToggle}>
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={tenantImg} alt={t.tenant_name} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm truncate">{t.tenant_name}</p>
            <Badge variant={t.landlord_id ? 'default' : 'secondary'} className="text-[10px] shrink-0">
              {t.landlord_id ? 'Linked' : 'Pending'}
            </Badge>
          </div>
          {t.tenant_phone && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {t.tenant_phone}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {t.landlord_name && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{t.landlord_name}</span>}
            {t.agent_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.agent_name}</span>}
            {t.rent_amount && t.rent_amount > 0 && <span className="font-medium text-foreground">{formatUGX(t.rent_amount)}/mo</span>}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {t.country} · {t.region} · {t.district} · {t.ward}
          </div>
          {t.house_category && (
            <div className="text-xs">
              <span className="text-muted-foreground">House: </span>
              <span className="font-medium">{t.house_category}</span>
            </div>
          )}
          {houseImgs.length > 0 ? (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={openAt(tenantImg ? 1 : 0)}
                className="relative block w-full aspect-[16/10] rounded-lg overflow-hidden bg-muted group"
              >
                <img
                  src={houseImgs[0]}
                  alt={`House photo 1`}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                  loading="lazy"
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                  <Maximize2 className="h-3 w-3" />
                  {houseImgs.length} photo{houseImgs.length === 1 ? '' : 's'} · tap to zoom
                </div>
              </button>
              {houseImgs.length > 1 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {houseImgs.slice(1, 5).map((url, i) => {
                    const realIdx = (tenantImg ? 1 : 0) + (i + 1);
                    const isOverflow = i === 3 && houseImgs.length > 5;
                    return (
                      <button
                        key={realIdx}
                        type="button"
                        onClick={openAt(realIdx)}
                        className="relative block aspect-square rounded overflow-hidden bg-muted"
                      >
                        <img src={url} alt={`House photo ${i + 2}`} className="w-full h-full object-cover" loading="lazy" />
                        {isOverflow && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-xs font-semibold">
                            +{houseImgs.length - 5}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> No house photos uploaded yet.
            </p>
          )}

          <ImageZoomLightbox
            images={galleryImgs}
            startIndex={lightboxIdx}
            open={lightboxIdx !== null}
            onClose={() => setLightboxIdx(null)}
            altPrefix={t.tenant_name || 'Tenant'}
          />
        </div>
      )}
    </Card>
  );
}