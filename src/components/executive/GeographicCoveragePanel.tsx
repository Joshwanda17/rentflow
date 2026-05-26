import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, MapPin, Loader2, Home, Users, Wallet, UserCheck, Sparkles, Search, Calendar as CalendarIcon, X, Filter, Globe2, ArrowLeft, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type RoleKey = 'tenant' | 'landlord' | 'funder' | 'agent';
const ALL_ROLES: RoleKey[] = ['tenant', 'landlord', 'funder', 'agent'];

type Row = {
  level: 'country' | 'district' | 'city';
  bucket: string;
  tenants: number;
  landlords: number;
  funders: number;
  agents: number;
  funded_tenants: number;
  total_buckets?: number;
};

type FundedTenant = {
  tenant_id: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_country: string | null;
  tenant_district: string | null;
  tenant_city: string | null;
  landlord_id: string | null;
  landlord_name: string | null;
  latest_status: string | null;
  latest_rent_amount: number | null;
  rent_request_id: string | null;
  total_count?: number;
};

const fmt = (n: number) => new Intl.NumberFormat().format(n);
const PAGE_SIZE = 50;
const DRILL_PAGE_SIZE = 100;

export function GeographicCoveragePanel() {
  const [country, setCountry] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [roles, setRoles] = useState<RoleKey[]>([...ALL_ROLES]);
  const [page, setPage] = useState(0);
  const [drillPage, setDrillPage] = useState(0);

  const p_from = fromDate ? fromDate.toISOString() : null;
  const p_to = toDate ? new Date(toDate.getTime() + 86_399_000).toISOString() : null; // include end-of-day
  const p_roles = roles.length === ALL_ROLES.length ? null : roles;

  // Reset pagination on any scope/filter change
  useEffect(() => { setPage(0); }, [country, district, city, p_from, p_to, p_roles?.join(','), search]);
  useEffect(() => { setDrillPage(0); }, [country, district, city, p_from, p_to]);

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['geo-coverage', country, district, city, p_from, p_to, p_roles?.join(',') ?? 'all', page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_geo_user_coverage', {
        p_country: country,
        p_district: district,
        p_city: city,
        p_from,
        p_to,
        p_roles,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    // Matches the 5-minute server-side cache TTL
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });

  const totalBuckets = Number(rows[0]?.total_buckets ?? rows.length);
  const totalPages = Math.max(1, Math.ceil(totalBuckets / PAGE_SIZE));

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.bucket.toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.tenants += Number(r.tenants) || 0;
        acc.landlords += Number(r.landlords) || 0;
        acc.funders += Number(r.funders) || 0;
        acc.agents += Number(r.agents) || 0;
        acc.funded += Number(r.funded_tenants) || 0;
        return acc;
      },
      { tenants: 0, landlords: 0, funders: 0, agents: 0, funded: 0 },
    );
  }, [filteredRows]);

  const currentLevel: 'country' | 'district' | 'city' =
    !country ? 'country' : !district ? 'district' : 'city';

  const onRowClick = (bucket: string) => {
    if (bucket === 'Unknown') return;
    if (currentLevel === 'country') setCountry(bucket);
    else if (currentLevel === 'district') setDistrict(bucket);
    else setCity(bucket);
  };

  const reset = () => { setCountry(null); setDistrict(null); setCity(null); };
  const back = () => {
    if (city) setCity(null);
    else if (district) setDistrict(null);
    else if (country) setCountry(null);
  };

  // Funded-tenant drill (loaded only when sheet opens)
  const { data: fundedTenants = [], isLoading: loadingFunded } = useQuery({
    queryKey: ['funded-tenants-at', country, district, city, drillOpen, p_from, p_to, drillPage],
    enabled: drillOpen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_funded_tenants_at', {
        p_country: country,
        p_district: district,
        p_city: city,
        p_from,
        p_to,
        p_limit: DRILL_PAGE_SIZE,
        p_offset: drillPage * DRILL_PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as FundedTenant[];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });

  const fundedTotal = Number(fundedTenants[0]?.total_count ?? fundedTenants.length);
  const drillTotalPages = Math.max(1, Math.ceil(fundedTotal / DRILL_PAGE_SIZE));

  const toggleRole = (r: RoleKey) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const clearFilters = () => {
    setSearch('');
    setFromDate(undefined);
    setToDate(undefined);
    setRoles([...ALL_ROLES]);
  };

  const activeFilterCount =
    (search ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (roles.length !== ALL_ROLES.length ? 1 : 0);

  const scopeLabel = [country, district, city].filter(Boolean).join(' › ') || 'All countries';
  const nextLevelLabel = currentLevel === 'country' ? 'district' : currentLevel === 'district' ? 'city / town' : null;

  return (
    <TooltipProvider delayDuration={200}>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Geographic Coverage
            {isFetching && !isLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Refreshing" />
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {(country || district || city) && (
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={back}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => refetch()} aria-label="Refresh">
                  <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh data</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* Breadcrumb trail */}
        <div className="mt-2 flex items-center gap-1 text-xs flex-wrap">
          <button
            onClick={reset}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded hover:bg-accent transition-colors',
              !country ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground',
            )}
          >
            <Globe2 className="h-3 w-3" /> All countries
          </button>
          {country && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => { setDistrict(null); setCity(null); }}
                className={cn(
                  'px-2 py-1 rounded hover:bg-accent transition-colors',
                  !district ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {country}
              </button>
            </>
          )}
          {district && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => setCity(null)}
                className={cn(
                  'px-2 py-1 rounded hover:bg-accent transition-colors',
                  !city ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {district}
              </button>
            </>
          )}
          {city && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="px-2 py-1 rounded bg-accent text-foreground font-medium">{city}</span>
            </>
          )}
          {nextLevelLabel && filteredRows.length > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              Click a row to drill into {nextLevelLabel}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={`Search ${labelFor(currentLevel).toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-7"
            />
          </div>

          <DateRangePopover
            label="From"
            date={fromDate}
            onChange={setFromDate}
          />
          <DateRangePopover
            label="To"
            date={toDate}
            onChange={setToDate}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Roles
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {roles.length}/{ALL_ROLES.length}
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={roles.includes(r)}
                    onChange={() => toggleRole(r)}
                    className="h-4 w-4"
                  />
                  {r}s
                </label>
              ))}
              <div className="border-t mt-1 pt-1 flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setRoles([...ALL_ROLES])}>All</Button>
                <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setRoles([])}>None</Button>
              </div>
            </PopoverContent>
          </Popover>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Totals bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Tenants" value={totals.tenants} icon={<Users className="h-3.5 w-3.5" />} />
          <Stat label="Landlords" value={totals.landlords} icon={<Home className="h-3.5 w-3.5" />} />
          <Stat label="Funders" value={totals.funders} icon={<Wallet className="h-3.5 w-3.5" />} />
          <Stat label="Agents" value={totals.agents} icon={<UserCheck className="h-3.5 w-3.5" />} />
          <button
            onClick={() => setDrillOpen(true)}
            disabled={totals.funded === 0}
            className="rounded-md border bg-primary/5 hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed p-2 text-left transition-colors"
          >
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
              <Sparkles className="h-3 w-3 text-primary" /> Funded tenants
            </div>
            <div className="text-base font-semibold text-primary">{fmt(totals.funded)}</div>
            <div className="text-[10px] text-muted-foreground">click to view</div>
          </button>
        </div>

        {/* Breakdown by next level */}
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
            <div className="col-span-4">{labelFor(currentLevel)}</div>
            <div className="col-span-1 text-right">Tenants</div>
            <div className="col-span-2 text-right">Landlords</div>
            <div className="col-span-1 text-right">Funders</div>
            <div className="col-span-1 text-right">Agents</div>
            <div className="col-span-3 text-right">Funded tenants</div>
          </div>
          {isLoading ? (
            <div role="status" aria-label="Loading geographic coverage">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-3 border-t items-center">
                  <div className="col-span-4"><Skeleton className="h-4 w-2/3" /></div>
                  <div className="col-span-1"><Skeleton className="h-4 w-full" /></div>
                  <div className="col-span-2"><Skeleton className="h-4 w-full" /></div>
                  <div className="col-span-1"><Skeleton className="h-4 w-full" /></div>
                  <div className="col-span-1"><Skeleton className="h-4 w-full" /></div>
                  <div className="col-span-3"><Skeleton className="h-4 w-1/2 ml-auto" /></div>
                </div>
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No records in this area.</div>
          ) : (
            filteredRows.map((r) => {
              const total = Number(r.tenants) + Number(r.landlords) + Number(r.funders) + Number(r.agents);
              const isDrillable = currentLevel !== 'city' && r.bucket !== 'Unknown';
              return (
                <Tooltip key={r.bucket}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onRowClick(r.bucket)}
                      disabled={!isDrillable}
                      className="w-full grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-accent/40 disabled:hover:bg-transparent disabled:cursor-default border-t text-left items-center"
                    >
                      <div className="col-span-4 font-medium flex items-center gap-1 truncate">
                        {r.bucket}
                        {isDrillable && (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <CountCell value={r.tenants} label="tenant" bucket={r.bucket} className="col-span-1" />
                      <CountCell value={r.landlords} label="landlord" bucket={r.bucket} className="col-span-2" />
                      <CountCell value={r.funders} label="funder" bucket={r.bucket} className="col-span-1" />
                      <CountCell value={r.agents} label="agent" bucket={r.bucket} className="col-span-1" />
                      <div className="col-span-3 text-right">
                        {Number(r.funded_tenants) > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="bg-primary/10 text-primary cursor-help">
                                {fmt(Number(r.funded_tenants))}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div className="font-semibold">{fmt(Number(r.funded_tenants))} funded tenant{Number(r.funded_tenants) === 1 ? '' : 's'}</div>
                                <div className="text-muted-foreground mt-0.5">in {r.bucket}</div>
                                <div className="text-muted-foreground mt-0.5">Landlord received a Welile rent disbursement.</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">0</span>
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <div className="text-xs space-y-1">
                      <div className="font-semibold">{r.bucket}</div>
                      <div className="text-muted-foreground">{fmt(total)} total user{total === 1 ? '' : 's'} in this {currentLevel}</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 border-t">
                        <span className="text-muted-foreground">Tenants</span><span className="text-right tabular-nums">{fmt(Number(r.tenants))}</span>
                        <span className="text-muted-foreground">Landlords</span><span className="text-right tabular-nums">{fmt(Number(r.landlords))}</span>
                        <span className="text-muted-foreground">Funders</span><span className="text-right tabular-nums">{fmt(Number(r.funders))}</span>
                        <span className="text-muted-foreground">Agents</span><span className="text-right tabular-nums">{fmt(Number(r.agents))}</span>
                        <span className="text-muted-foreground">Funded</span><span className="text-right tabular-nums text-primary">{fmt(Number(r.funded_tenants))}</span>
                      </div>
                      {isDrillable && (
                        <div className="text-[10px] text-muted-foreground pt-1 italic">Click to drill into {nextLevelLabel}</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })
          )}
        </div>

        {/* Coverage pagination */}
        {totalBuckets > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              Showing <span className="tabular-nums font-medium text-foreground">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalBuckets)}</span> of {fmt(totalBuckets)}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
              <span className="px-2 tabular-nums">{page + 1} / {totalPages}</span>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page + 1 >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Funded tenant drill-through */}
      <Sheet open={drillOpen} onOpenChange={setDrillOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Tenants whose landlord was funded
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Scope: {scopeLabel}
            </p>
          </SheetHeader>
          {loadingFunded ? (
            <div className="mt-4 border rounded-md" role="status" aria-label="Loading funded tenants">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-3 border-t first:border-t-0 items-center">
                  <div className="col-span-4 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <div className="col-span-3"><Skeleton className="h-4 w-full" /></div>
                  <div className="col-span-3"><Skeleton className="h-3 w-full" /></div>
                  <div className="col-span-2"><Skeleton className="h-5 w-16 ml-auto" /></div>
                </div>
              ))}
            </div>
          ) : fundedTenants.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No funded tenants in this area.</div>
          ) : (
            <div className="mt-4 border rounded-md">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                <div className="col-span-4">Tenant</div>
                <div className="col-span-3">Landlord</div>
                <div className="col-span-3">Location</div>
                <div className="col-span-2 text-right">Status</div>
              </div>
              {fundedTenants.map((t) => (
                <div key={`${t.tenant_id}-${t.landlord_id}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-t items-center">
                  <div className="col-span-4">
                    <div className="font-medium truncate">{t.tenant_name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{t.tenant_phone || ''}</div>
                  </div>
                  <div className="col-span-3 truncate">{t.landlord_name || '—'}</div>
                  <div className="col-span-3 text-xs text-muted-foreground truncate">
                    {[t.tenant_city, t.tenant_district, t.tenant_country].filter(Boolean).join(', ')}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge variant="outline" className="text-[10px]">{t.latest_status}</Badge>
                  </div>
                </div>
              ))}
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                Showing {drillPage * DRILL_PAGE_SIZE + 1}–{Math.min((drillPage + 1) * DRILL_PAGE_SIZE, fundedTotal)} of {fmt(fundedTotal)}
              </div>
            </div>
          )}
          {fundedTotal > DRILL_PAGE_SIZE && (
            <div className="flex items-center justify-end gap-1 mt-3">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={drillPage === 0 || loadingFunded} onClick={() => setDrillPage((p) => Math.max(0, p - 1))}>Prev</Button>
              <span className="px-2 text-xs tabular-nums">{drillPage + 1} / {drillTotalPages}</span>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={drillPage + 1 >= drillTotalPages || loadingFunded} onClick={() => setDrillPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
    </TooltipProvider>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">{icon}{label}</div>
      <div className="text-base font-semibold tabular-nums">{fmt(value)}</div>
    </div>
  );
}

function CountCell({
  value,
  label,
  bucket,
  className,
}: {
  value: number;
  label: string;
  bucket: string;
  className?: string;
}) {
  const n = Number(value) || 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('text-right tabular-nums cursor-help', className)}>{fmt(n)}</div>
      </TooltipTrigger>
      <TooltipContent>
        <span className="text-xs">{fmt(n)} {label}{n === 1 ? '' : 's'} in {bucket}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function labelFor(level: 'country' | 'district' | 'city') {
  if (level === 'country') return 'Country';
  if (level === 'district') return 'District';
  return 'City / Town';
}

function DateRangePopover({
  label,
  date,
  onChange,
}: {
  label: string;
  date: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5', !date && 'text-muted-foreground')}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {date ? `${label}: ${format(date, 'PP')}` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
        {date && (
          <div className="p-2 border-t">
            <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => onChange(undefined)}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}