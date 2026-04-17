import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, ArrowUpFromLine, Banknote, CreditCard, Search, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AgentDetailDialog } from './AgentDetailDialog';

type AgentBalanceRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  territory: string | null;
  withdrawable: number;
  float: number;
  advance: number;
  total: number;
};

type SortKey = 'total' | 'withdrawable' | 'float' | 'advance' | 'name';

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : Math.round(n).toLocaleString();

export function AgentBalancesPanel() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-balances'],
    queryFn: async (): Promise<AgentBalanceRow[]> => {
      // 1. Get ALL agent user_ids using range pagination (PostgREST caps each request at 1000 rows)
      const ROLE_PAGE = 1000;
      const allRoleRows: { user_id: string }[] = [];
      let from = 0;
      // Hard cap of 50k agents to prevent runaway loops
      while (from < 50000) {
        const { data, error } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'agent')
          .range(from, from + ROLE_PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRoleRows.push(...data);
        if (data.length < ROLE_PAGE) break;
        from += ROLE_PAGE;
      }
      const ids = [...new Set(allRoleRows.map((r) => r.user_id))];
      if (ids.length === 0) return [];

      // 2. Batch fetch wallets + profiles (100 at a time to stay under PostgREST IN limits)
      const BATCH = 100;
      const wallets: any[] = [];
      const profiles: any[] = [];
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const [wRes, pRes] = await Promise.all([
          supabase
            .from('wallets')
            .select('user_id, withdrawable_balance, float_balance, advance_balance, balance')
            .in('user_id', slice),
          supabase
            .from('profiles')
            .select('id, full_name, phone, territory')
            .in('id', slice),
        ]);
        if (wRes.data) wallets.push(...wRes.data);
        if (pRes.data) profiles.push(...pRes.data);
      }

      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const rows: AgentBalanceRow[] = ids.map((id) => {
        const w = wallets.find((x) => x.user_id === id);
        const p = profileMap.get(id);
        const withdrawable = Number(w?.withdrawable_balance ?? 0);
        const floatBal = Number(w?.float_balance ?? 0);
        const advance = Number(w?.advance_balance ?? 0);
        return {
          user_id: id,
          full_name: p?.full_name ?? null,
          phone: p?.phone ?? null,
          territory: p?.territory ?? null,
          withdrawable,
          float: floatBal,
          advance,
          total: withdrawable + floatBal + advance,
        };
      });
      return rows;
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let rows = q
      ? data.filter(
          (r) =>
            (r.full_name || '').toLowerCase().includes(q) ||
            (r.phone || '').toLowerCase().includes(q) ||
            (r.territory || '').toLowerCase().includes(q),
        )
      : data;
    rows = [...rows].sort((a, b) => {
      if (sortKey === 'name') return (a.full_name || '').localeCompare(b.full_name || '');
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    return rows;
  }, [data, search, sortKey]);

  const totals = useMemo(() => {
    const base = { withdrawable: 0, float: 0, advance: 0, total: 0, count: 0, withFloat: 0, withWithdrawable: 0, withAdvance: 0 };
    if (!data) return base;
    for (const r of data) {
      base.withdrawable += r.withdrawable;
      base.float += r.float;
      base.advance += r.advance;
      base.total += r.total;
      base.count += 1;
      if (r.float > 0) base.withFloat += 1;
      if (r.withdrawable > 0) base.withWithdrawable += 1;
      if (r.advance > 0) base.withAdvance += 1;
    }
    return base;
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Aggregate breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard
          label="Total Held"
          value={fmt(totals.total)}
          sub={`${totals.count} agents`}
          icon={Wallet}
          tone="bg-primary/10 text-primary"
        />
        <SummaryCard
          label="Withdrawable"
          value={fmt(totals.withdrawable)}
          sub={`${totals.withWithdrawable} agents > 0`}
          icon={ArrowUpFromLine}
          tone="bg-emerald-500/10 text-emerald-600"
        />
        <SummaryCard
          label="Float (Ops)"
          value={fmt(totals.float)}
          sub={`${totals.withFloat} agents > 0`}
          icon={Banknote}
          tone="bg-blue-500/10 text-blue-600"
        />
        <SummaryCard
          label="Advance"
          value={fmt(totals.advance)}
          sub={`${totals.withAdvance} agents > 0`}
          icon={CreditCard}
          tone="bg-amber-500/10 text-amber-700"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agent by name, phone, or territory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(['total', 'withdrawable', 'float', 'advance', 'name'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-colors',
                sortKey === k
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {k === 'name' ? 'A-Z' : k}
            </button>
          ))}
        </div>
      </div>

      {/* Table / list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No agents match your search.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Agent</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Withdrawable</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Float</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Advance</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.user_id} onClick={() => setOpenAgentId(r.user_id)} className="hover:bg-muted/30 transition-colors cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground hover:text-primary">{r.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.phone || 'No phone'}
                          {r.territory ? ` · ${r.territory}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                        {fmt(r.withdrawable)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-blue-700">
                        {fmt(r.float)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                        {fmt(r.advance)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map((r) => (
                <div key={r.user_id} onClick={() => setOpenAgentId(r.user_id)} className="p-3 space-y-2 active:bg-muted/40 cursor-pointer transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{r.full_name || '—'}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {r.phone || 'No phone'}
                        {r.territory ? ` · ${r.territory}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                      <div className="text-sm font-bold tabular-nums">{fmt(r.total)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <BucketChip label="Withdraw" value={fmt(r.withdrawable)} tone="bg-emerald-500/10 text-emerald-700" />
                    <BucketChip label="Float" value={fmt(r.float)} tone="bg-blue-500/10 text-blue-700" />
                    <BucketChip label="Advance" value={fmt(r.advance)} tone="bg-amber-500/10 text-amber-700" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
        <TrendingUp className="h-3 w-3" />
        Tap any agent to see full 360° profile. Balances reflect cached wallet buckets.
      </p>

      <AgentDetailDialog
        agentId={openAgentId}
        open={!!openAgentId}
        onOpenChange={(o) => !o && setOpenAgentId(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('p-1.5 rounded-lg', tone)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function BucketChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn('rounded-lg px-2 py-1.5 text-center', tone)}>
      <div className="text-[9px] uppercase tracking-wider font-semibold opacity-80">{label}</div>
      <div className="text-xs font-bold tabular-nums">{value}</div>
    </div>
  );
}
