import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gauge, Smartphone, Landmark, Banknote, TrendingUp, AlertTriangle, CheckCircle2, PlusCircle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { getTelecomSendingCharge } from '@/lib/cashoutCharges';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { REQUEST_FLOAT_EVENT, type RequestFloatDetail } from '@/components/agent/MerchantFloatRequestCard';

// Same statuses the payout queue treats as "still needs paying".
const DEMAND_STATUSES = ['pending', 'requested', 'manager_approved', 'cfo_approved', 'fin_ops_approved'];
const CLAIM_WINDOW_MS = 15 * 60 * 1000;

type DemandChannel = 'mtn' | 'airtel' | 'momo_other' | 'bank' | 'cash';

interface DemandRow {
  amount: number;
  payout_method: string | null;
  mobile_money_provider: string | null;
  mobile_money_number: string | null;
  reason: string | null;
  created_at: string;
}

interface NetworkStatus {
  is_merchant: boolean;
  total_demand: number;
  network_float: number;
  pending_requested: number;
  active_merchants: number;
  net_gap: number;
  fair_share: number;
}

const CHANNEL_META: Record<DemandChannel, { label: string; icon: typeof Smartphone; tone: string }> = {
  mtn: { label: 'MTN MoMo', icon: Smartphone, tone: 'text-amber-600' },
  airtel: { label: 'Airtel Money', icon: Smartphone, tone: 'text-red-600' },
  momo_other: { label: 'Other Mobile Money', icon: Smartphone, tone: 'text-sky-600' },
  bank: { label: 'Bank Transfer', icon: Landmark, tone: 'text-indigo-600' },
  cash: { label: 'Cash Pickup', icon: Banknote, tone: 'text-emerald-600' },
};

const norm = (v?: string | null) => String(v || '').toLowerCase();

function classifyChannel(r: DemandRow): DemandChannel {
  const method = norm(r.payout_method).replace(/[\s-]+/g, '_');
  const provider = norm(r.mobile_money_provider);
  if (method.includes('bank')) return 'bank';
  if (method.includes('cash') || method.includes('pickup')) return 'cash';
  // Anything mobile-money flavoured — split by provider.
  if (provider.includes('mtn') || method.includes('mtn')) return 'mtn';
  if (provider.includes('airtel') || method.includes('airtel')) return 'airtel';
  if (r.mobile_money_number || provider || method.includes('momo') || method.includes('mobile')) return 'momo_other';
  return 'cash';
}

/**
 * Float Demand Forecast for merchant (cash-out) agents.
 *
 * Reads every payout the CFO has released to users' wallets that is still
 * awaiting a merchant to pay it out (ROI cash-outs, landlord float payouts,
 * commission withdrawals, etc.) and tells the merchant EXACTLY how much float
 * they need to clear the queue — broken down by MTN, Airtel, other MoMo, bank
 * and cash — so they know how much to request from the CFO per day.
 */
export function MerchantFloatDemandCard() {
  const { floatBalance, isLoading: balanceLoading } = useAgentBalances();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['merchant-float-demand'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<DemandRow[]> => {
      const cutoffIso = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('amount, payout_method, mobile_money_provider, mobile_money_number, reason, created_at, assigned_cashout_agent_id, dispatched_at')
        .in('status', DEMAND_STATUSES)
        // Available to pay = unclaimed OR a claim that has already expired.
        .or(`assigned_cashout_agent_id.is.null,dispatched_at.lt.${cutoffIso}`)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as DemandRow[];
    },
  });

  // SHARED-POOL COORDINATION. The demand above is a single global queue that
  // EVERY active merchant agent sees. If each agent requested the full gap the
  // CFO would over-fund the network many times over. This server RPC returns
  // the network-wide truth (float already held + float already requested +
  // active merchant count) so we can show a fair per-agent share to request.
  const { data: net } = useQuery({
    queryKey: ['merchant-float-network'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<NetworkStatus> => {
      const { data, error } = await supabase.rpc('get_merchant_float_network_status');
      if (error) throw error;
      return (data ?? {}) as unknown as NetworkStatus;
    },
  });

  const forecast = useMemo(() => {
    const buckets: Record<DemandChannel, { count: number; amount: number; telecom: number }> = {
      mtn: { count: 0, amount: 0, telecom: 0 },
      airtel: { count: 0, amount: 0, telecom: 0 },
      momo_other: { count: 0, amount: 0, telecom: 0 },
      bank: { count: 0, amount: 0, telecom: 0 },
      cash: { count: 0, amount: 0, telecom: 0 },
    };
    let totalAmount = 0;
    let totalTelecom = 0;
    let count = 0;
    // Per-day timeline: date key → per-channel + totals.
    const dayMap = new Map<
      string,
      { channels: Record<DemandChannel, number>; total: number; telecom: number; count: number }
    >();
    const emptyChannels = (): Record<DemandChannel, number> => ({
      mtn: 0, airtel: 0, momo_other: 0, bank: 0, cash: 0,
    });
    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const ch = classifyChannel(r);
      // Telecom sending fee only applies to mobile-money channels the merchant fronts.
      const fee = ch === 'bank' || ch === 'cash' ? 0 : getTelecomSendingCharge(amt);
      buckets[ch].count += 1;
      buckets[ch].amount += amt;
      buckets[ch].telecom += fee;
      totalAmount += amt;
      totalTelecom += fee;
      count += 1;
      const dayKey = (r.created_at || '').slice(0, 10);
      if (dayKey) {
        let d = dayMap.get(dayKey);
        if (!d) {
          d = { channels: emptyChannels(), total: 0, telecom: 0, count: 0 };
          dayMap.set(dayKey, d);
        }
        d.channels[ch] += amt;
        d.total += amt;
        d.telecom += fee;
        d.count += 1;
      }
    }
    const totalNeeded = totalAmount + totalTelecom;
    const order: DemandChannel[] = ['mtn', 'airtel', 'momo_other', 'bank', 'cash'];
    const breakdown = order
      .map((ch) => ({ ch, ...buckets[ch] }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.amount - a.amount);
    // Newest day first so the most recent demand is on top.
    const days = Array.from(dayMap.entries())
      .map(([date, d]) => ({
        date,
        needed: d.total + d.telecom,
        total: d.total,
        telecom: d.telecom,
        count: d.count,
        channels: order
          .map((ch) => ({ ch, amount: d.channels[ch] }))
          .filter((c) => c.amount > 0),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return { breakdown, totalAmount, totalTelecom, totalNeeded, count, days };
  }, [rows]);

  // Network-wide (shared) coordination figures. Fall back gracefully to a
  // single-agent view (this agent alone) until the RPC resolves.
  const activeMerchants = Math.max(1, Number(net?.active_merchants ?? 1));
  const networkFloat = Number(net?.network_float ?? floatBalance ?? 0);
  const pendingRequested = Number(net?.pending_requested ?? 0);
  // Remaining true gap for the WHOLE network after subtracting float already
  // held and float already requested-but-not-yet-funded.
  const netGap = net
    ? Number(net.net_gap ?? 0)
    : Math.max(0, forecast.totalNeeded - (floatBalance || 0));
  // Fair amount THIS agent should request so the sum across all merchants
  // matches the gap instead of over-funding it.
  const fairShare = net ? Number(net.fair_share ?? 0) : netGap;
  const covered = !balanceLoading && netGap === 0 && forecast.count > 0;
  const needsAttention = netGap > 0;

  const requestFloat = () => {
    const lines = forecast.breakdown.map(
      (b) => `${CHANNEL_META[b.ch].label}: ${b.count}× ${formatUGX(b.amount)}`,
    );
    const reason =
      `Fair-share float top-up (1 of ${activeMerchants} merchant agents). ` +
      `Shared queue needs ${formatUGX(forecast.totalNeeded)}; network already holds ` +
      `${formatUGX(networkFloat)} float + ${formatUGX(pendingRequested)} requested. ` +
      `Remaining gap ${formatUGX(netGap)}. Breakdown — ${lines.join('; ')}.`;
    const detail: RequestFloatDetail = { amount: fairShare, reason };
    window.dispatchEvent(new CustomEvent(REQUEST_FLOAT_EVENT, { detail }));
  };

  const dayLabel = (date: string) => {
    const d = parseISO(date);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEE, d MMM');
  };

  const requestFloatForDay = (day: (typeof forecast.days)[number]) => {
    const dayShare = Math.ceil(day.needed / activeMerchants);
    const lines = day.channels.map((c) => `${CHANNEL_META[c.ch].label}: ${formatUGX(c.amount)}`);
    const reason =
      `Fair-share float top-up for ${dayLabel(day.date)} (1 of ${activeMerchants} merchant agents) — ` +
      `${day.count} payout${day.count === 1 ? '' : 's'}, day demand ${formatUGX(day.needed)}. ` +
      `Breakdown — ${lines.join('; ')}.`;
    const detail: RequestFloatDetail = { amount: dayShare, reason };
    window.dispatchEvent(new CustomEvent(REQUEST_FLOAT_EVENT, { detail }));
  };

  if (isLoading || balanceLoading) {
    return (
      <Card className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Gauge className="h-3.5 w-3.5 text-violet-600" /> Float demand forecast
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Calculating today's payout demand…</p>
      </Card>
    );
  }

  if (forecast.count === 0) {
    return (
      <Card className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Gauge className="h-3.5 w-3.5 text-violet-600" /> Float demand forecast
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No pending payouts right now — no extra float needed.
        </p>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'rounded-2xl border p-3.5',
        needsAttention
          ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent'
          : 'border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Gauge className="h-3.5 w-3.5 text-violet-600" /> Float demand forecast
        </div>
        {needsAttention ? (
          <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/15 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Needs attention
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-700 dark:text-violet-300">
            <TrendingUp className="h-3 w-3" /> {forecast.count} payout{forecast.count === 1 ? '' : 's'} waiting
          </Badge>
        )}
      </div>

      {/* Shared-pool low-float alert — network is under-funded for the queue. */}
      {needsAttention && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
            <p className="font-semibold">
              Network float short by {formatUGX(netGap)}
            </p>
            <p className="text-amber-700/90 dark:text-amber-400/90">
              Shared across {activeMerchants} merchant agent{activeMerchants === 1 ? '' : 's'}. Request only your fair share so the CFO isn't over-funded.
            </p>
          </div>
        </div>
      )}

      {/* Headline: total float needed to clear the SHARED queue. */}
      <div className="mt-2">
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" /> Shared queue · {activeMerchants} merchant agent{activeMerchants === 1 ? '' : 's'}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Float needed to pay everyone now</p>
        <p className="text-2xl font-bold leading-tight tabular-nums text-violet-700 dark:text-violet-300">
          {formatUGX(forecast.totalNeeded)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatUGX(forecast.totalAmount)} payouts + {formatUGX(forecast.totalTelecom)} telecom fees
        </p>
      </div>

      {/* Network coverage: already held + already requested vs remaining gap. */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <p className="text-[10px] text-muted-foreground">Network float</p>
          <p className="text-sm font-semibold tabular-nums">{formatUGX(networkFloat)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <p className="text-[10px] text-muted-foreground">Already requested</p>
          <p className="text-sm font-semibold tabular-nums">{formatUGX(pendingRequested)}</p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-2',
            covered ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5',
          )}
        >
          <p className="text-[10px] text-muted-foreground">Remaining gap</p>
          <p
            className={cn(
              'flex items-center gap-1 text-sm font-semibold tabular-nums',
              covered ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
            )}
          >
            {covered ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {formatUGX(netGap)}
          </p>
        </div>
      </div>

      {/* Your fair share — prevents every agent requesting the whole gap. */}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Your float now: <span className="font-medium text-foreground">{formatUGX(floatBalance)}</span>
      </p>
      {covered ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Network is fully funded — no float request needed right now.
        </p>
      ) : fairShare > 0 ? (
        <Button size="sm" className="mt-2 w-full gap-1.5" onClick={requestFloat}>
          <PlusCircle className="h-4 w-4" />
          Request your fair share · {formatUGX(fairShare)}
        </Button>
      ) : null}

      {/* Per-channel breakdown. */}
      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          By destination
        </p>
        {forecast.breakdown.map((b) => {
          const meta = CHANNEL_META[b.ch];
          const Icon = meta.icon;
          const uncovered = channelRisk[b.ch] || 0;
          const atRisk = uncovered > 0;
          return (
            <div
              key={b.ch}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5',
                atRisk ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/50 bg-background/40',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className={cn('h-4 w-4 shrink-0', meta.tone)} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-xs font-medium">
                    {meta.label}
                    {atRisk && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {b.count} request{b.count === 1 ? '' : 's'}
                    {b.telecom > 0 && ` · +${formatUGX(b.telecom)} fees`}
                    {atRisk && (
                      <span className="font-medium text-amber-700 dark:text-amber-400"> · short {formatUGX(uncovered)}</span>
                    )}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-xs font-semibold tabular-nums">{formatUGX(b.amount)}</p>
            </div>
          );
        })}
      </div>

      {/* Per-day forecast timeline. */}
      {forecast.days.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Per-day forecast
          </p>
          {forecast.days.map((day) => (
            <div key={day.date} className="rounded-lg border border-border/50 bg-background/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{dayLabel(day.date)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {day.count} payout{day.count === 1 ? '' : 's'}
                    {day.telecom > 0 && ` · +${formatUGX(day.telecom)} fees`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <p className="text-xs font-bold tabular-nums text-violet-700 dark:text-violet-300">
                    {formatUGX(day.needed)}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={() => requestFloatForDay(day)}
                  >
                    <PlusCircle className="h-3 w-3" /> Request
                  </Button>
                </div>
              </div>
              {/* Channel chips for the day. */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {day.channels.map((c) => {
                  const meta = CHANNEL_META[c.ch];
                  const Icon = meta.icon;
                  return (
                    <span
                      key={c.ch}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium"
                    >
                      <Icon className={cn('h-3 w-3', meta.tone)} />
                      {meta.label.split(' ')[0]} · {formatUGX(c.amount)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Based on ROI cash-outs, landlord float payouts and commission withdrawals the CFO has released to users' wallets. Request enough float to cover the demand above.
      </p>
    </Card>
  );
}

export default MerchantFloatDemandCard;