import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Search, Gauge, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';

const ACTIVE_RENT_STATUSES = [
  'pending', 'agent_verified', 'tenant_ops_approved',
  'agent_ops_approved', 'landlord_ops_approved',
  'coo_approved', 'funded', 'repaying',
];
const AGENT_RENT_CAP_UGX = 100_000_000;

type AgentRow = {
  agent_id: string;
  name: string;
  phone: string | null;
  used: number;
  active_count: number;
  repayment_rate: number; // 0..1
};

export function AgentRentCapacityPanel({
  defaultLimit = 25,
  compact = false,
}: { defaultLimit?: number; compact?: boolean }) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-rent-capacity-fleet'],
    queryFn: async (): Promise<AgentRow[]> => {
      // 1) Pull all active rent requests (driver of exposure)
      const { data: active } = await supabase
        .from('rent_requests')
        .select('agent_id, total_repayment, amount_repaid')
        .in('status', ACTIVE_RENT_STATUSES)
        .not('agent_id', 'is', null);

      // 2) Pull repayment-rate history over last 180 days
      const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const { data: history } = await supabase
        .from('rent_requests')
        .select('agent_id, total_repayment, amount_repaid, created_at')
        .gte('created_at', since)
        .not('agent_id', 'is', null);

      const exposureMap = new Map<string, { used: number; count: number }>();
      (active || []).forEach((r: any) => {
        if (!r.agent_id) return;
        const owed = Math.max(
          (Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0),
          0,
        );
        const prev = exposureMap.get(r.agent_id) || { used: 0, count: 0 };
        exposureMap.set(r.agent_id, { used: prev.used + owed, count: prev.count + 1 });
      });

      const rateMap = new Map<string, { expected: number; paid: number }>();
      (history || []).forEach((r: any) => {
        if (!r.agent_id) return;
        const expected = Number(r.total_repayment) || 0;
        const paid = Number(r.amount_repaid) || 0;
        const prev = rateMap.get(r.agent_id) || { expected: 0, paid: 0 };
        rateMap.set(r.agent_id, {
          expected: prev.expected + expected,
          paid: prev.paid + paid,
        });
      });

      const agentIds = Array.from(new Set([
        ...exposureMap.keys(),
        ...rateMap.keys(),
      ]));
      if (agentIds.length === 0) return [];

      // 3) Batch fetch profiles
      const profileMap = new Map<string, { name: string; phone: string | null }>();
      const BATCH = 50;
      for (let i = 0; i < agentIds.length; i += BATCH) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', agentIds.slice(i, i + BATCH));
        (profs || []).forEach((p: any) => {
          profileMap.set(p.id, { name: p.full_name || 'Unknown', phone: p.phone });
        });
      }

      const rows: AgentRow[] = agentIds.map((id) => {
        const exp = exposureMap.get(id) || { used: 0, count: 0 };
        const rate = rateMap.get(id);
        const repayment_rate = rate && rate.expected > 0 ? rate.paid / rate.expected : 0;
        const prof = profileMap.get(id) || { name: id.slice(0, 8), phone: null };
        return {
          agent_id: id,
          name: prof.name,
          phone: prof.phone,
          used: exp.used,
          active_count: exp.count,
          repayment_rate,
        };
      });

      rows.sort((a, b) => b.used - a.used);
      return rows;
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data || [];
    return (data || []).filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.phone || '').toLowerCase().includes(term),
    );
  }, [data, search]);

  const visible = showAll ? filtered : filtered.slice(0, defaultLimit);

  // Aggregate KPIs
  const totalUsed = (data || []).reduce((s, r) => s + r.used, 0);
  const totalCap = (data || []).length * AGENT_RENT_CAP_UGX;
  const totalHeadroom = Math.max(totalCap - totalUsed, 0);
  const atRisk = (data || []).filter(
    (r) => r.used / AGENT_RENT_CAP_UGX >= 0.85,
  ).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 via-violet-500/5 to-transparent border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Gauge className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight">
              Agent Rent-Request Capacity
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Per-tenant limits scale with repayment rate · Hard cap UGX{' '}
              {formatUGX(AGENT_RENT_CAP_UGX)} per agent
            </p>
          </div>
        </div>

        {!compact && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <Kpi
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Fleet Exposure"
              value={formatUGX(totalUsed)}
              tone="text-primary"
            />
            <Kpi
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Total Headroom"
              value={formatUGX(totalHeadroom)}
              tone="text-emerald-600"
            />
            <Kpi
              icon={<Gauge className="h-3.5 w-3.5" />}
              label="Active Agents"
              value={(data || []).length.toLocaleString()}
              tone="text-violet-600"
            />
            <Kpi
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="At ≥85% cap"
              value={atRisk.toLocaleString()}
              tone={atRisk > 0 ? 'text-destructive' : 'text-muted-foreground'}
            />
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agent name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            Loading agent capacity…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No agents with active rent exposure.
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) => (
              <CapacityRow key={row.agent_id} row={row} />
            ))}
          </ul>
        )}

        {filtered.length > defaultLimit && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full text-xs font-semibold text-primary py-2 hover:underline"
          >
            {showAll
              ? 'Show fewer'
              : `Show all ${filtered.length.toLocaleString()} agents`}
          </button>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-2.5">
      <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground truncate">
        {value}
      </div>
    </div>
  );
}

function CapacityRow({ row }: { row: AgentRow }) {
  const pct = Math.min(100, Math.round((row.used / AGENT_RENT_CAP_UGX) * 100));
  const headroom = Math.max(AGENT_RENT_CAP_UGX - row.used, 0);
  const rateLabel = `${Math.round(row.repayment_rate * 100)}%`;
  const tier =
    row.repayment_rate >= 0.95
      ? { label: 'Premium', tone: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', max: 6_000_000 }
      : row.repayment_rate >= 0.8
      ? { label: 'Reliable', tone: 'bg-sky-500/15 text-sky-700 border-sky-500/30', max: 3_000_000 }
      : row.repayment_rate >= 0.6
      ? { label: 'Building', tone: 'bg-amber-500/15 text-amber-700 border-amber-500/30', max: 1_500_000 }
      : row.active_count === 0
      ? { label: 'Starter', tone: 'bg-violet-500/15 text-violet-700 border-violet-500/30', max: 500_000 }
      : { label: 'Defaulting', tone: 'bg-destructive/15 text-destructive border-destructive/30', max: 0 };

  const bar =
    pct >= 95 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <li className="rounded-xl border border-border bg-background p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{row.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {row.phone || '—'} · {row.active_count} active rent{row.active_count === 1 ? '' : 's'}
          </p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${tier.tone}`}>
          {tier.label}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums mb-1">
        <span className="text-muted-foreground">
          Used <span className="text-foreground">{formatUGX(row.used)}</span> / {formatUGX(AGENT_RENT_CAP_UGX)}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] mt-1.5">
        <span className="text-muted-foreground">
          Headroom <strong className="text-foreground font-mono">{formatUGX(headroom)}</strong>
        </span>
        <span className="text-muted-foreground">
          Repayment <strong className="text-foreground">{rateLabel}</strong> · Per-tenant max{' '}
          <strong className="text-foreground font-mono">{formatUGX(tier.max)}</strong>
        </span>
      </div>
    </li>
  );
}

export default AgentRentCapacityPanel;