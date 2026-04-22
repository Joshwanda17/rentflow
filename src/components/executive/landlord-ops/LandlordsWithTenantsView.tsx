import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Loader2, Users, Search, CheckCircle2, Clock, ChevronDown, ChevronRight,
  Phone, Building2, AlertTriangle, UserX,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'paid' | 'pending' | 'empty';

const PAID_STATUSES = new Set(['funded', 'disbursed', 'repaying', 'completed']);
const PENDING_STATUSES = new Set([
  'pending', 'agent_verified', 'tenant_ops_approved', 'landlord_ops_approved', 'coo_approved',
]);

interface RentRow {
  id: string;
  tenant_id: string;
  landlord_id: string | null;
  rent_amount: number | null;
  status: string;
  created_at: string;
}

interface TenantRow {
  tenant_id: string;
  name: string;
  phone: string | null;
  amount: number;
  status: 'paid' | 'pending';
  latestAt: string;
  requestCount: number;
}

interface LandlordGroup {
  landlord_id: string | null; // null = no landlord
  name: string;
  phone: string | null;
  tenants: TenantRow[];
  paidCount: number;
  pendingCount: number;
  totalAmount: number;
}

function classify(status: string): 'paid' | 'pending' | null {
  if (PAID_STATUSES.has(status)) return 'paid';
  if (PENDING_STATUSES.has(status)) return 'pending';
  return null;
}

export function LandlordsWithTenantsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['landlord-ops-landlords-tenants'],
    queryFn: async () => {
      // 1. ALL landlords (paginated — 325+ records)
      const PAGE = 1000;
      const allLandlords: { id: string; name: string; phone: string | null; tenant_id: string | null; monthly_rent: number | null }[] = [];
      let offset = 0;
      let more = true;
      while (more) {
        const { data: ll, error } = await supabase
          .from('landlords')
          .select('id, name, phone, tenant_id, monthly_rent')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (ll && ll.length > 0) {
          allLandlords.push(...(ll as any));
          offset += PAGE;
          more = ll.length === PAGE;
        } else {
          more = false;
        }
      }
      const landlordMap = new Map<string, { id: string; name: string; phone: string | null }>();
      allLandlords.forEach(l => landlordMap.set(l.id, { id: l.id, name: l.name, phone: l.phone }));

      // 2. ALL rent_requests (paginated — for tenant + status data)
      const allRR: RentRow[] = [];
      offset = 0;
      more = true;
      while (more) {
        const { data: rrs, error } = await supabase
          .from('rent_requests')
          .select('id, tenant_id, landlord_id, rent_amount, status, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (rrs && rrs.length > 0) {
          allRR.push(...(rrs as any));
          offset += PAGE;
          more = rrs.length === PAGE;
        } else {
          more = false;
        }
      }
      const validRows = allRR.filter(r => classify(r.status) !== null);

      // 3. House-listing tenant linkage (landlord_id -> tenant_id) — covers landlords with tenants but no rent_request yet
      const landlordIds = allLandlords.map(l => l.id);
      const houseLinks: { landlord_id: string; tenant_id: string }[] = [];
      for (let i = 0; i < landlordIds.length; i += 200) {
        const { data: hl } = await supabase
          .from('house_listings')
          .select('landlord_id, tenant_id')
          .in('landlord_id', landlordIds.slice(i, i + 200))
          .not('tenant_id', 'is', null);
        if (hl) houseLinks.push(...(hl as any));
      }

      // 4. Tenant profiles for everything we have so far
      const tenantIds = new Set<string>();
      validRows.forEach(r => r.tenant_id && tenantIds.add(r.tenant_id));
      houseLinks.forEach(h => h.tenant_id && tenantIds.add(h.tenant_id));
      allLandlords.forEach(l => l.tenant_id && tenantIds.add(l.tenant_id));
      const tenantMap = new Map<string, { id: string; full_name: string | null; phone: string | null }>();
      const tIdArr = [...tenantIds];
      for (let i = 0; i < tIdArr.length; i += 200) {
        const { data: tt } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', tIdArr.slice(i, i + 200));
        for (const t of tt || []) tenantMap.set(t.id, t as any);
      }

      return { allLandlords, validRows, landlordMap, tenantMap, houseLinks };
    },
    staleTime: 60_000,
  });

  const groups: LandlordGroup[] = useMemo(() => {
    if (!data) return [];
    const { allLandlords, validRows, landlordMap, tenantMap, houseLinks } = data;

    // Initialize bucket for EVERY landlord (so all 325+ appear, even without tenants)
    const map = new Map<string, Map<string, TenantRow>>();
    for (const l of allLandlords) {
      map.set(l.id, new Map());
    }
    map.set('__none__', new Map());

    // 1. Add tenants from rent_requests (with status + amount)
    for (const r of validRows) {
      const status = classify(r.status)!;
      const lkey = r.landlord_id && landlordMap.has(r.landlord_id) ? r.landlord_id : '__none__';
      const tenantBucket = map.get(lkey)!;
      const t = tenantMap.get(r.tenant_id);
      const amt = Number(r.rent_amount ?? 0);
      const existing = tenantBucket.get(r.tenant_id);
      if (existing) {
        existing.amount += amt;
        existing.requestCount += 1;
        if (new Date(r.created_at) > new Date(existing.latestAt)) {
          existing.latestAt = r.created_at;
          existing.status = status;
        }
      } else {
        tenantBucket.set(r.tenant_id, {
          tenant_id: r.tenant_id,
          name: t?.full_name || 'Unknown Tenant',
          phone: t?.phone || null,
          amount: amt,
          status,
          latestAt: r.created_at,
          requestCount: 1,
        });
      }
    }

    // 2. Add tenants from house_listings (no rent_request yet → pending, amount 0)
    for (const h of houseLinks) {
      if (!h.landlord_id || !h.tenant_id) continue;
      const lkey = landlordMap.has(h.landlord_id) ? h.landlord_id : '__none__';
      const tenantBucket = map.get(lkey)!;
      if (tenantBucket.has(h.tenant_id)) continue; // already from rent_requests
      const t = tenantMap.get(h.tenant_id);
      tenantBucket.set(h.tenant_id, {
        tenant_id: h.tenant_id,
        name: t?.full_name || 'Unknown Tenant',
        phone: t?.phone || null,
        amount: 0,
        status: 'pending',
        latestAt: new Date(0).toISOString(),
        requestCount: 0,
      });
    }

    // 3. Add tenants from landlords.tenant_id direct linkage
    for (const l of allLandlords) {
      if (!l.tenant_id) continue;
      const tenantBucket = map.get(l.id)!;
      if (tenantBucket.has(l.tenant_id)) continue;
      const t = tenantMap.get(l.tenant_id);
      tenantBucket.set(l.tenant_id, {
        tenant_id: l.tenant_id,
        name: t?.full_name || 'Unknown Tenant',
        phone: t?.phone || null,
        amount: Number(l.monthly_rent || 0),
        status: 'pending',
        latestAt: new Date(0).toISOString(),
        requestCount: 0,
      });
    }

    const out: LandlordGroup[] = [];
    for (const [lkey, tenantBucket] of map.entries()) {
      const tenants = Array.from(tenantBucket.values()).sort(
        (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
      );
      const paidCount = tenants.filter(t => t.status === 'paid').length;
      const pendingCount = tenants.filter(t => t.status === 'pending').length;
      const totalAmount = tenants.reduce((s, t) => s + t.amount, 0);

      if (lkey === '__none__') {
        if (tenants.length === 0) continue; // skip empty no-landlord bucket
        out.push({
          landlord_id: null,
          name: 'No Landlord Linked',
          phone: null,
          tenants, paidCount, pendingCount, totalAmount,
        });
      } else {
        const ll = landlordMap.get(lkey);
        out.push({
          landlord_id: lkey,
          name: ll?.name || 'Unknown Landlord',
          phone: ll?.phone || null,
          tenants, paidCount, pendingCount, totalAmount,
        });
      }
    }

    // sort: landlords with tenants first (by paid count desc, then tenant count desc), empty landlords next, no-landlord last
    return out.sort((a, b) => {
      if (a.landlord_id === null) return 1;
      if (b.landlord_id === null) return -1;
      if (a.tenants.length === 0 && b.tenants.length > 0) return 1;
      if (b.tenants.length === 0 && a.tenants.length > 0) return -1;
      if (b.paidCount !== a.paidCount) return b.paidCount - a.paidCount;
      return b.tenants.length - a.tenants.length;
    });
  }, [data]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map(g => {
        // filter by status
        let tenants = g.tenants;
        if (statusFilter === 'empty') {
          // only landlords with no tenants
          if (g.tenants.length > 0) return null;
        } else if (statusFilter === 'paid' || statusFilter === 'pending') {
          tenants = tenants.filter(t => t.status === statusFilter);
          if (tenants.length === 0) return null;
        }
        // filter by search across landlord & tenant
        if (q) {
          const landlordHit =
            g.name.toLowerCase().includes(q) ||
            (g.phone || '').toLowerCase().includes(q);
          if (!landlordHit) {
            tenants = tenants.filter(t =>
              t.name.toLowerCase().includes(q) ||
              (t.phone || '').toLowerCase().includes(q)
            );
            if (tenants.length === 0 && g.tenants.length > 0) return null;
          }
        }
        const paidCount = tenants.filter(t => t.status === 'paid').length;
        const pendingCount = tenants.filter(t => t.status === 'pending').length;
        const totalAmount = tenants.reduce((s, t) => s + t.amount, 0);
        return { ...g, tenants, paidCount, pendingCount, totalAmount };
      })
      .filter((g): g is LandlordGroup => g !== null);
  }, [groups, search, statusFilter]);

  // KPIs over unfiltered groups
  const kpis = useMemo(() => {
    const linkedLandlords = groups.filter(g => g.landlord_id !== null).length;
    const emptyLandlords = groups.filter(g => g.landlord_id !== null && g.tenants.length === 0).length;
    const allTenants = groups.flatMap(g => g.tenants);
    return {
      landlords: linkedLandlords,
      empty: emptyLandlords,
      tenants: allTenants.length,
      paid: allTenants.filter(t => t.status === 'paid').length,
      pending: allTenants.filter(t => t.status === 'pending').length,
    };
  }, [groups]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Building2 className="h-5 w-5 text-sky-600" />
        Landlords & Tenants
      </h2>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Landlords</p>
            <p className="text-base font-bold mt-1">{kpis.landlords}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tenants</p>
            <p className="text-base font-bold mt-1">{kpis.tenants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</p>
            <p className="text-base font-bold mt-1 text-success">{kpis.paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
            <p className="text-base font-bold mt-1 text-amber-600">{kpis.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Empty</p>
            <p className="text-base font-bold mt-1 text-muted-foreground">{kpis.empty}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search landlord or tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(['all', 'paid', 'pending', 'empty'] as StatusFilter[]).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
              className="text-xs h-8 shrink-0"
            >
              {s === 'all' ? 'All' : s === 'paid' ? '✓ Paid only' : s === 'pending' ? '⏳ Pending only' : '🏚 Empty only'}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No landlords or tenants found for these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(g => {
            const key = g.landlord_id || '__none__';
            const isOpen = !!expanded[key];
            const isNoLandlord = g.landlord_id === null;
            return (
              <Card
                key={key}
                className={cn(
                  'overflow-hidden',
                  isNoLandlord && 'border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20'
                )}
              >
                <button
                  onClick={() => setExpanded(s => ({ ...s, [key]: !s[key] }))}
                  className="w-full text-left p-3 active:bg-muted/50 transition-colors min-h-[64px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate flex items-center gap-1.5">
                        {isNoLandlord ? (
                          <UserX className="h-4 w-4 text-amber-600 shrink-0" />
                        ) : (
                          <Building2 className="h-4 w-4 text-sky-600 shrink-0" />
                        )}
                        {g.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {g.phone && (
                          <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{g.phone}</span>
                        )}
                        <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{g.tenants.length} tenant{g.tenants.length === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold font-mono text-sm">{formatUGX(g.totalAmount)}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {g.paidCount > 0 && (
                          <Badge className="bg-success/10 text-success border-success/30 text-[10px] px-1.5 py-0 h-4">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{g.paidCount}
                          </Badge>
                        )}
                        {g.pendingCount > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-400/60 text-amber-700 dark:text-amber-400">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />{g.pendingCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-2 text-[11px] text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-3 space-y-2">
                    {isNoLandlord && (
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-100/60 dark:bg-amber-950/40 border border-amber-300/60">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-800 dark:text-amber-300">
                          These tenants don't have a landlord on file. Reach out and link them to fix attribution.
                        </p>
                      </div>
                    )}
                    {!isNoLandlord && g.tenants.length === 0 && (
                      <div className="flex items-start gap-2 p-3 rounded bg-muted/40 border border-dashed border-muted-foreground/30">
                        <UserX className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[11px] text-muted-foreground">
                          No tenants linked to this landlord yet. Use Tenant Matching to attach a tenant.
                        </p>
                      </div>
                    )}
                    {g.tenants.map(t => (
                      <div key={t.tenant_id} className="border rounded-lg p-2.5 bg-background flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{t.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {t.phone && (
                              <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{t.phone}</span>
                            )}
                            {t.requestCount > 1 && (
                              <span>· {t.requestCount} requests</span>
                            )}
                            {t.requestCount === 0 && (
                              <span>· no rent request</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold font-mono text-sm">{formatUGX(t.amount)}</p>
                          {t.status === 'paid' ? (
                            <Badge className="bg-success/10 text-success border-success/30 text-[10px] mt-0.5">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" />Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] mt-0.5 border-amber-400/60 text-amber-700 dark:text-amber-400">
                              <Clock className="h-3 w-3 mr-0.5" />Pending
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}