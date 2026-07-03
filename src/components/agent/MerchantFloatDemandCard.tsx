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
        .select('amount, payout_method, mobile_money_provider, mobile_money_number, reason, assigned_cashout_agent_id, dispatched_at')
        .in('status', DEMAND_STATUSES)
        // Available to pay = unclaimed OR a claim that has already expired.
        .or(`assigned_cashout_agent_id.is.null,dispatched_at.lt.${cutoffIso}`)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as DemandRow[];
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
    }
    const totalNeeded = totalAmount + totalTelecom;
    const order: DemandChannel[] = ['mtn', 'airtel', 'momo_other', 'bank', 'cash'];
    const breakdown = order
      .map((ch) => ({ ch, ...buckets[ch] }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.amount - a.amount);
    return { breakdown, totalAmount, totalTelecom, totalNeeded, count };
  }, [rows]);

  const shortfall = Math.max(0, forecast.totalNeeded - (floatBalance || 0));
  const covered = !balanceLoading && shortfall === 0 && forecast.count > 0;

  const requestFloat = () => {
    const lines = forecast.breakdown.map(
      (b) => `${CHANNEL_META[b.ch].label}: ${b.count}× ${formatUGX(b.amount)}`,
    );
    const reason =
      `Float top-up for ${forecast.count} pending payout${forecast.count === 1 ? '' : 's'} ` +
      `(needs ${formatUGX(forecast.totalNeeded)}). Breakdown — ${lines.join('; ')}.`;
    const detail: RequestFloatDetail = { amount: shortfall, reason };
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
    <Card className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-transparent p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Gauge className="h-3.5 w-3.5 text-violet-600" /> Float demand forecast
        </div>
        <Badge variant="outline" className="gap-1 border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-700 dark:text-violet-300">
          <TrendingUp className="h-3 w-3" /> {forecast.count} payout{forecast.count === 1 ? '' : 's'} waiting
        </Badge>
      </div>

      {/* Headline: total float needed to clear the queue. */}
      <div className="mt-2">
        <p className="text-[11px] text-muted-foreground">Float needed to pay everyone now</p>
        <p className="text-2xl font-bold leading-tight tabular-nums text-violet-700 dark:text-violet-300">
          {formatUGX(forecast.totalNeeded)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatUGX(forecast.totalAmount)} payouts + {formatUGX(forecast.totalTelecom)} telecom fees
        </p>
      </div>

      {/* Coverage: current float vs shortfall to request. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <p className="text-[10px] text-muted-foreground">Your float now</p>
          <p className="text-sm font-semibold tabular-nums">{formatUGX(floatBalance)}</p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-2',
            covered
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5',
          )}
        >
          <p className="text-[10px] text-muted-foreground">
            {covered ? 'Coverage' : 'Request from CFO'}
          </p>
          <p
            className={cn(
              'flex items-center gap-1 text-sm font-semibold tabular-nums',
              covered ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
            )}
          >
            {covered ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Fully covered
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5" /> {formatUGX(shortfall)}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Request the shortfall straight from the CFO, pre-filled. */}
      {shortfall > 0 && (
        <Button
          size="sm"
          className="mt-2 w-full gap-1.5"
          onClick={requestFloat}
        >
          <PlusCircle className="h-4 w-4" />
          Request {formatUGX(shortfall)} float from CFO
        </Button>
      )}

      {/* Per-channel breakdown. */}
      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          By destination
        </p>
        {forecast.breakdown.map((b) => {
          const meta = CHANNEL_META[b.ch];
          const Icon = meta.icon;
          return (
            <div key={b.ch} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Icon className={cn('h-4 w-4 shrink-0', meta.tone)} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {b.count} request{b.count === 1 ? '' : 's'}
                    {b.telecom > 0 && ` · +${formatUGX(b.telecom)} fees`}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-xs font-semibold tabular-nums">{formatUGX(b.amount)}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Based on ROI cash-outs, landlord float payouts and commission withdrawals the CFO has released to users' wallets. Request enough float to cover the demand above.
      </p>
    </Card>
  );
}

export default MerchantFloatDemandCard;