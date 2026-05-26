import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, MapPin, Loader2, Home, Users, Wallet, UserCheck, Sparkles, Search, Calendar as CalendarIcon, X, Filter } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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
};

const fmt = (n: number) => new Intl.NumberFormat().format(n);

export function GeographicCoveragePanel() {
  const [country, setCountry] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [roles, setRoles] = useState<RoleKey[]>([...ALL_ROLES]);

  const p_from = fromDate ? fromDate.toISOString() : null;
  const p_to = toDate ? new Date(toDate.getTime() + 86_399_000).toISOString() : null; // include end-of-day
  const p_roles = roles.length === ALL_ROLES.length ? null : roles;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['geo-coverage', country, district, city, p_from, p_to, p_roles?.join(',') ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_geo_user_coverage', {
        p_country: country,
        p_district: district,
        p_city: city,
        p_from,
        p_to,
        p_roles,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

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
    queryKey: ['funded-tenants-at', country, district, city, drillOpen, p_from, p_to],
    enabled: drillOpen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_funded_tenants_at', {
        p_country: country,
        p_district: district,
        p_city: city,
        p_from,
        p_to,
        p_limit: 500,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as FundedTenant[];
    },
    staleTime: 30_000,
  });

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Geographic Coverage
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button onClick={reset} className="hover:text-primary underline-offset-2 hover:underline">All countries</button>
            {country && (<><ChevronRight className="h-3 w-3" /><button onClick={() => { setDistrict(null); setCity(null); }} className="hover:text-primary">{country}</button></>)}
            {district && (<><ChevronRight className="h-3 w-3" /><button onClick={() => setCity(null)} className="hover:text-primary">{district}</button></>)}
            {city && (<><ChevronRight className="h-3 w-3" /><span className="text-foreground font-medium">{city}</span></>)}
            {(country || district || city) && (
              <Button size="sm" variant="ghost" className="h-6 px-2 ml-1" onClick={back}>Back</Button>
            )}
          </div>
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
            <div className="p-6 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No records in this area.</div>
          ) : (
            filteredRows.map((r) => (
              <button
                key={r.bucket}
                onClick={() => onRowClick(r.bucket)}
                disabled={currentLevel === 'city' || r.bucket === 'Unknown'}
                className="w-full grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-accent/40 disabled:hover:bg-transparent disabled:cursor-default border-t text-left items-center"
              >
                <div className="col-span-4 font-medium flex items-center gap-1 truncate">
                  {r.bucket}
                  {currentLevel !== 'city' && r.bucket !== 'Unknown' && (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="col-span-1 text-right tabular-nums">{fmt(Number(r.tenants))}</div>
                <div className="col-span-2 text-right tabular-nums">{fmt(Number(r.landlords))}</div>
                <div className="col-span-1 text-right tabular-nums">{fmt(Number(r.funders))}</div>
                <div className="col-span-1 text-right tabular-nums">{fmt(Number(r.agents))}</div>
                <div className="col-span-3 text-right">
                  {Number(r.funded_tenants) > 0 ? (
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {fmt(Number(r.funded_tenants))}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
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
              Scope: {[country, district, city].filter(Boolean).join(' › ') || 'All locations'}
            </p>
          </SheetHeader>
          {loadingFunded ? (
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
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
                Showing {fundedTenants.length} record{fundedTenants.length === 1 ? '' : 's'} (max 500).
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
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

function labelFor(level: 'country' | 'district' | 'city') {
  if (level === 'country') return 'Country';
  if (level === 'district') return 'District';
  return 'City / Town';
}