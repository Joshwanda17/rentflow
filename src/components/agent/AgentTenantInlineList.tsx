import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Phone, Users, UserPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { AgentDailyCapacityStrip } from '@/components/agent/AgentDailyCapacityStrip';

interface Tenant {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
}

interface AgentTenantInlineListProps {
  onOpenTenantSheet: (tenantId?: string) => void;
  onAddTenant: () => void;
}

export function AgentTenantInlineList({ onOpenTenantSheet, onAddTenant }: AgentTenantInlineListProps) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'owing'>('all');
  const [activeTenantIds, setActiveTenantIds] = useState<Set<string>>(new Set());
  const [tenantBalances, setTenantBalances] = useState<Record<string, number>>({});
  const [tenantAvatars, setTenantAvatars] = useState<Record<string, string>>({});
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const fetchSeqRef = useRef(0);
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!user) return;
    fetchTenants();
  }, [user]);

  const fetchTenants = async () => {
    if (!user) return;
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_agent_tenants_overview', {
        p_today_start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      });
      if (error) throw error;
      if (seq !== fetchSeqRef.current) return;

      const rows = (data || []) as any[];
      const tenantList: Tenant[] = rows.map((row) => ({
        id: row.id,
        full_name: row.full_name || 'Tenant',
        phone: row.phone || '',
        email: row.email || '',
        created_at: row.created_at,
      }));
      setTenants(tenantList);

      const balances: Record<string, number> = {};
      const activeIds = new Set<string>();
      rows.forEach((row) => {
        balances[row.id] = Number(row.balance || 0);
        const statuses = ((row.statuses || []) as string[]).filter(Boolean);
        if (statuses.some((status) => status !== 'completed')) activeIds.add(row.id);
      });
      setTenantBalances(balances);
      setActiveTenantIds(activeIds);

      // Fetch passport / avatar photos for the tenant list (fallback to initials on missing/broken).
      const ids = tenantList.map((t) => t.id);
      if (ids.length > 0) {
        const { data: photoRows } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', ids);
        if (seq === fetchSeqRef.current) {
          const map: Record<string, string> = {};
          (photoRows || []).forEach((r: any) => {
            if (r?.avatar_url) map[r.id] = r.avatar_url as string;
          });
          setTenantAvatars(map);
        }
      } else {
        setTenantAvatars({});
      }
    } catch (err) {
      console.error('Failed to fetch inline tenants:', err);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = search.replace(/\D+/g, '');
    let list = tenants.filter((t) => {
      if (!q) return true;
      const phoneDigits = (t.phone || '').replace(/\D+/g, '');
      return (
        t.full_name.toLowerCase().includes(q) ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits))
      );
    });
    if (activeFilter === 'active') {
      list = list.filter((t) => activeTenantIds.has(t.id));
    } else if (activeFilter === 'owing') {
      list = list.filter((t) => (tenantBalances[t.id] || 0) > 0);
    }
    list.sort((a, b) => {
      const ba = tenantBalances[a.id] || 0;
      const bb = tenantBalances[b.id] || 0;
      if (ba !== bb) return bb - ba;
      return a.full_name.localeCompare(b.full_name);
    });
    return list;
  }, [tenants, search, activeFilter, tenantBalances, activeTenantIds]);

  // Reset pagination whenever the filtered result set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, activeFilter, tenants]);

  const visible = useMemo(() => processed.slice(0, visibleCount), [processed, visibleCount]);

  const activeCount = useMemo(
    () => tenants.filter((t) => activeTenantIds.has(t.id)).length,
    [tenants, activeTenantIds]
  );
  const owingCount = useMemo(
    () => tenants.filter((t) => (tenantBalances[t.id] || 0) > 0).length,
    [tenants, tenantBalances]
  );

  // Source-of-truth total outstanding: sum of per-tenant (deduped) balances
  // across only tenants whose aggregate outstanding > 0 — mirrors the COO
  // "Tenants With Balances" methodology so agents see the same figure.
  const totalOutstanding = useMemo(
    () =>
      tenants.reduce((sum, t) => {
        const bal = tenantBalances[t.id] || 0;
        return bal > 0 ? sum + bal : sum;
      }, 0),
    [tenants, tenantBalances]
  );

  return (
    <div className="space-y-4">
      {/* Daily capacity — how am I doing today & can I still post rents */}
      <AgentDailyCapacityStrip />

      {/* Outstanding summary — deduped per tenant, only owing > 0 (matches COO) */}
      {!loading && owingCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-full bg-rose-100 p-1.5 shrink-0">
              <AlertCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-rose-700 leading-none">
                {owingCount} {owingCount === 1 ? 'tenant' : 'tenants'} owing
              </p>
              <p className="text-[11px] text-rose-600/80 mt-0.5">Total outstanding balance</p>
            </div>
          </div>
          <p className="text-lg font-black font-mono text-rose-700 tabular-nums shrink-0">
            {formatUGX(totalOutstanding)}
          </p>
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 rounded-xl bg-muted/40 border-2 border-solid border-primary/30 focus-visible:ring-1 focus-visible:ring-primary/30 text-base"
            style={{ fontSize: '16px' }}
            aria-label="Search tenants"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-base p-1"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setActiveFilter('all')}
            className={`py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2 ${
              activeFilter === 'all'
                ? 'bg-background shadow-sm text-foreground border-2 border-primary/30'
                : 'text-muted-foreground bg-muted/50'
            }`}
            style={{ touchAction: 'manipulation', minHeight: '64px' }}
          >
            <Users className="h-5 w-5" />
            All
            <span className="text-sm font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
              {tenants.length}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter('active')}
            className={`py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2 ${
              activeFilter === 'active'
                ? 'bg-emerald-50 shadow-sm text-emerald-700 border-2 border-emerald-300'
                : 'text-muted-foreground bg-muted/50'
            }`}
            style={{ touchAction: 'manipulation', minHeight: '64px' }}
          >
            <CheckCircle2 className="h-5 w-5" />
            Active
            <span className="text-sm font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter('owing')}
            className={`py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2 ${
              activeFilter === 'owing'
                ? 'bg-rose-50 shadow-sm text-rose-700 border-2 border-rose-300'
                : 'text-muted-foreground bg-muted/50'
            }`}
            style={{ touchAction: 'manipulation', minHeight: '64px' }}
          >
            <AlertCircle className="h-5 w-5" />
            Owing
            <span className="text-sm font-mono px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">
              {owingCount}
            </span>
          </button>
        </div>
      </div>

      {/* Tenant List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : processed.length === 0 ? (
          <div className="text-center py-16 space-y-5">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/30" />
            <p className="text-base text-muted-foreground">
              {search
                ? `No results for "${search}"`
                : activeFilter === 'active'
                  ? 'No active tenants'
                  : activeFilter === 'owing'
                    ? 'No tenants owing'
                    : 'No tenants yet'}
            </p>
            {!search && (
              <Button
                onClick={onAddTenant}
                className="h-14 px-8 text-lg font-bold rounded-2xl gap-2"
              >
                <UserPlus className="h-6 w-6" />
                Add Tenant
              </Button>
            )}
          </div>
        ) : (
          <>
          {visible.map((tenant) => {
            const balance = tenantBalances[tenant.id] || 0;
            const hasDebt = balance > 0;
            const initial = (tenant.full_name?.trim()?.charAt(0) || tenant.phone?.charAt(0) || '?').toUpperCase();
            const photoUrl = tenantAvatars[tenant.id];
            const showPhoto = !!photoUrl && !failedAvatars.has(tenant.id);
            return (
              <button
                key={tenant.id}
                onClick={() => onOpenTenantSheet(tenant.id)}
                className="w-full flex items-center gap-5 p-5 rounded-3xl bg-card border-2 border-border/60 active:scale-[0.97] transition-all text-left touch-manipulation shadow-sm hover:shadow-md"
                style={{ touchAction: 'manipulation', minHeight: '104px' }}
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-2xl font-bold ${
                    hasDebt ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  } overflow-hidden`}
                >
                  {showPhoto ? (
                    <img
                      src={photoUrl}
                      alt={tenant.full_name || 'Tenant'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() =>
                        setFailedAvatars((prev) => {
                          if (prev.has(tenant.id)) return prev;
                          const next = new Set(prev);
                          next.add(tenant.id);
                          return next;
                        })
                      }
                    />
                  ) : (
                    initial
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg truncate">
                    {tenant.full_name?.trim() || 'Tenant'}
                  </p>
                  {tenant.phone && (
                    <p className="text-base text-muted-foreground flex items-center gap-1.5 truncate mt-1">
                      <Phone className="h-4 w-4 shrink-0" />
                      {tenant.phone}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold uppercase tracking-wide ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {hasDebt ? 'Owing' : 'Paid up'}
                  </p>
                  <p className={`font-bold font-mono text-xl ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {hasDebt ? formatUGX(balance) : 'UGX 0'}
                  </p>
                </div>
              </button>
            );
          })}
          {processed.length > visibleCount && (
            <Button
              variant="outline"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full h-14 text-base font-bold rounded-2xl"
            >
              Load more ({processed.length - visibleCount} remaining)
            </Button>
          )}
          </>
        )}
      </div>
    </div>
  );
}
