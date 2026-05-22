import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Search, Gauge, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ACTIVE_RENT_STATUSES,
  AGENT_RENT_CAP_UGX,
  classifyAgent,
  type AgentCapacity,
} from '@/hooks/useAgentCapacityMap';

type AgentRow = {
  agent_id: string;
  name: string;
  phone: string | null;
  used: number;
  active_count: number;
  response_rate: number;          // 0..1 — last 7 days DRR
  responding_tenant_days: number;
  expected_tenant_days: number;
  paid_last_week: number;
  tier: AgentCapacity['tier'];
  per_tenant_max: number;
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
      // 1) Pull all active rent requests (drives exposure + expected daily collections)
      const { data: active } = await supabase
        .from('rent_requests')
        .select('id, agent_id, total_repayment, amount_repaid, daily_repayment')
        .in('status', ACTIVE_RENT_STATUSES)
        .not('agent_id', 'is', null);

      const exposureMap = new Map<string, { used: number; count: number }>();
      const activeIdToAgent = new Map<string, string>();
      (active || []).forEach((r: any) => {
        if (!r.agent_id) return;
        const owed = Math.max(
          (Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0),
          0,
        );
        const prev = exposureMap.get(r.agent_id) || { used: 0, count: 0 };
        exposureMap.set(r.agent_id, { used: prev.used + owed, count: prev.count + 1 });
        activeIdToAgent.set(r.id, r.agent_id);
      });

      // 2) Daily Response Rate — count distinct (rent × day) cells in the
      //    last 7 days where the tenant paid at least UGX 1. Also keep
      //    the UGX total as a secondary stat.
      const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const paidByAgent = new Map<string, number>();
      const respondingDaysByAgent = new Map<string, number>();
      const activeIds = Array.from(activeIdToAgent.keys());
      const BATCH_PAY = 200;
      for (let i = 0; i < activeIds.length; i += BATCH_PAY) {
        const slice = activeIds.slice(i, i + BATCH_PAY);
        const { data: pays } = await supabase
          .from('repayments')
          .select('rent_request_id, amount, created_at')
          .in('rent_request_id', slice)
          .gte('created_at', weekAgoISO);
        const dayKeyByRent = new Map<string, Set<string>>();
        (pays || []).forEach((p: any) => {
          const amt = Number(p.amount) || 0;
          const agentId = activeIdToAgent.get(p.rent_request_id);
          if (!agentId) return;
          paidByAgent.set(agentId, (paidByAgent.get(agentId) || 0) + amt);
          if (amt <= 0) return;
          const day = (p.created_at as string).slice(0, 10);
          let set = dayKeyByRent.get(p.rent_request_id);
          if (!set) { set = new Set(); dayKeyByRent.set(p.rent_request_id, set); }
          set.add(day);
        });
        dayKeyByRent.forEach((daySet, rentId) => {
          const agentId = activeIdToAgent.get(rentId);
          if (!agentId) return;
          respondingDaysByAgent.set(
            agentId,
            (respondingDaysByAgent.get(agentId) || 0) + daySet.size,
          );
        });
      }

      const agentIds = Array.from(exposureMap.keys());
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
        const paid_last_week = paidByAgent.get(id) || 0;
        const expected_tenant_days = exp.count * 7;
        const responding_tenant_days = Math.min(
          respondingDaysByAgent.get(id) || 0,
          expected_tenant_days,
        );
        const response_rate =
          expected_tenant_days > 0
            ? Math.min(1, responding_tenant_days / expected_tenant_days)
            : 0;
        const { tier, per_tenant_max } = classifyAgent(exp.count, response_rate);
        const prof = profileMap.get(id) || { name: id.slice(0, 8), phone: null };
        return {
          agent_id: id,
          name: prof.name,
          phone: prof.phone,
          used: exp.used,
          active_count: exp.count,
          response_rate,
          responding_tenant_days,
          expected_tenant_days,
          paid_last_week,
          tier,
          per_tenant_max,
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
              Tier = last 7 days' <strong>tenant response rate</strong> (any payment = a daily response) · Hard cap UGX{' '}
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
  const rateLabel = `${Math.round(row.response_rate * 100)}%`;
  const tierTone: Record<AgentCapacity['tier'], string> = {
    Positive:   'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    Fair:       'bg-amber-500/15 text-amber-700 border-amber-500/30',
    Bad:        'bg-orange-500/15 text-orange-700 border-orange-500/30',
    'Very Bad': 'bg-destructive/15 text-destructive border-destructive/30',
    Starter:    'bg-violet-500/15 text-violet-700 border-violet-500/30',
  };
  const tier = { label: row.tier, tone: tierTone[row.tier], max: row.per_tenant_max };

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
          Response <strong className="text-foreground">{rateLabel}</strong> · Per-tenant max{' '}
          <strong className="text-foreground font-mono">{formatUGX(tier.max)}</strong>
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
        Last 7d: <strong className="text-foreground">{row.responding_tenant_days}</strong> /{' '}
        <strong className="text-foreground">{row.expected_tenant_days}</strong> tenant-day responses
        {row.paid_last_week > 0 && (
          <> · <span className="text-muted-foreground">{formatUGX(row.paid_last_week)} total</span></>
        )}
      </div>
    </li>
  );
}

export default AgentRentCapacityPanel;