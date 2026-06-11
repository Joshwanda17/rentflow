import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Phone, Users, UserPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { getEffectiveRentRequestAmounts } from '@/lib/rentRequestAmounts';
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

  useEffect(() => {
    if (!user) return;
    fetchTenants();
  }, [user]);

  const fetchTenants = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: referredData } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, created_at')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      const referredTenants = referredData || [];
      const referredIds = new Set(referredTenants.map((t: any) => t.id));

      const { data: referralRows } = await supabase
        .from('referrals')
        .select('referred_id')
        .eq('referrer_id', user.id);

      const { data: agentRequests } = await supabase
        .from('rent_requests')
        .select('tenant_id')
        .eq('agent_id', user.id);

      // Sub-agents are NOT tenants — exclude anyone linked to this agent as a
      // sub-agent so they don't bleed into the tenant list.
      const { data: subAgentRows } = await supabase
        .from('agent_subagents')
        .select('sub_agent_id')
        .eq('parent_agent_id', user.id);
      const subAgentIds = new Set(
        (subAgentRows || []).map((r: any) => r.sub_agent_id).filter(Boolean) as string[],
      );

      const extraIds = [
        ...(referralRows || []).map((r: any) => r.referred_id),
        ...(agentRequests || []).map((r: any) => r.tenant_id),
      ].filter((id: string) => id && !referredIds.has(id) && !subAgentIds.has(id));

      let extraTenants: Tenant[] = [];
      if (extraIds.length > 0) {
        const uniqueIds = [...new Set(extraIds)];
        const { data: extraData } = await supabase
          .from('profiles')
          .select('id, full_name, phone, email, created_at')
          .in('id', uniqueIds);
        extraTenants = (extraData || []) as Tenant[];
      }

      const merged = new Map<string, Tenant>();
      const allowedReferred = referredTenants.filter((t: any) => !subAgentIds.has(t.id));
      for (const t of [...allowedReferred, ...extraTenants]) {
        merged.set(t.id, t);
      }
      const tenantList = Array.from(merged.values());
      setTenants(tenantList);

      if (tenantList.length > 0) {
        const tenantIds = tenantList.map((t) => t.id);
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('tenant_id, total_repayment, amount_repaid, status, registration_type')
          .in('tenant_id', tenantIds)
          .or('status.in.(pending,approved,funded,disbursed,repaying,completed),registration_type.eq.outstanding_balance');

        const balances: Record<string, number> = {};
        const activeIds = new Set<string>();
        (rentRequests || []).forEach((rr: any) => {
          const effective = getEffectiveRentRequestAmounts(rr);
          const owing = effective.totalRepayment - (rr.amount_repaid || 0);
          // A tenant only truly OWES once Welile has funded/disbursed the rent.
          // In-review (pending/approved) and cancelled/rejected duplicates must
          // never inflate the outstanding balance — only count real debt:
          // disbursed cycles (funded/disbursed/repaying) + genuine carried-over
          // outstanding_balance rows.
          const isDebt =
            ['funded', 'disbursed', 'repaying'].includes(rr.status || '') ||
            rr.registration_type === 'outstanding_balance';
          if (isDebt) {
            balances[rr.tenant_id] = (balances[rr.tenant_id] || 0) + Math.max(0, owing);
          }
          if (rr.status !== 'completed') activeIds.add(rr.tenant_id);
        });
        setTenantBalances(balances);
        setActiveTenantIds(activeIds);
      }
    } finally {
      setLoading(false);
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
  }, [tenants, search, activeFilter, tenantBalances]);

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
          processed.map((tenant) => {
            const balance = tenantBalances[tenant.id] || 0;
            const hasDebt = balance > 0;
            const initial = (tenant.full_name?.trim()?.charAt(0) || tenant.phone?.charAt(0) || '?').toUpperCase();
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
                  }`}
                >
                  {initial}
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
          })
        )}
      </div>
    </div>
  );
}
