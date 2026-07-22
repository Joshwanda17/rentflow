import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Wallet,
  PiggyBank,
  Landmark,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ChevronRight,
  Banknote,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Timer,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface Props {
  agentId: string;
  withdrawableBalance: number;
  floatBalance: number;
  pendingCount: number;
  pendingCommission: number;
  handlesCash: boolean;
  onOpenCashPayouts: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
  onViewWallet: () => void;
}

/**
 * Merchant-only dashboard home. Replaces the standard agent home for users
 * with an active `cashout_agents` row. Layout:
 *   • Bento wallet card (Float + Withdrawable + Total)
 *   • Quick-action cluster (Deposit / Withdraw / Transfer)
 *   • Merchant Payouts CTA (live unclaimed queue)
 *   • Quick insights (7-day volume, success rate, avg ticket, pending commission)
 */
export function MerchantDashboardHome({
  agentId,
  withdrawableBalance,
  floatBalance,
  pendingCount,
  pendingCommission,
  handlesCash,
  onOpenCashPayouts,
  onDeposit,
  onWithdraw,
  onTransfer,
  onViewWallet,
}: Props) {
  const total = withdrawableBalance + floatBalance;

  // 7-day merchant activity — read-only, cached 60s.
  const { data: insights } = useQuery({
    queryKey: ['merchant-home-insights', agentId],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('withdrawal_notification_log')
        .select('amount, response')
        .eq('recipient_id', agentId)
        .eq('channel', 'push')
        .gte('created_at', since)
        .limit(1000);
      const rows = data ?? [];
      const accepted = rows.filter((r: any) => r.response === 'accepted');
      const decided = rows.filter((r: any) =>
        ['accepted', 'ignored', 'expired', 'superseded'].includes(r.response),
      );
      const volume = accepted.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const successRate = decided.length
        ? Math.round((accepted.length / decided.length) * 100)
        : null;
      const avg = accepted.length ? Math.round(volume / accepted.length) : 0;
      return {
        volume,
        successRate,
        avg,
        acceptedCount: accepted.length,
      };
    },
  });

  const successPct = insights?.successRate ?? null;

  return (
    <div className="space-y-5">
      {/* Wallet Bento — primary hero */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl shadow-indigo-500/20"
        style={{
          background:
            'linear-gradient(135deg, hsl(238 74% 60%) 0%, hsl(270 80% 62%) 100%)',
        }}
      >
        <Wallet className="absolute -right-4 -top-2 h-40 w-40 opacity-[0.08]" />
        <div className="relative z-10">
          <div className="mb-5 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 backdrop-blur-md">
              <Wallet className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Merchant Wallet
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/20 px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/80" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                Active
              </span>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3">
            <BentoBalance
              icon={<PiggyBank className="h-4 w-4" />}
              label="Float"
              value={floatBalance}
              hint="Payouts pool"
            />
            <BentoBalance
              icon={<Landmark className="h-4 w-4" />}
              label="Withdrawable"
              value={withdrawableBalance}
              hint="Instant payout"
            />
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-white/15 pt-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                Total Balance
              </p>
              <p className="mt-0.5 truncate text-2xl font-bold tabular-nums">
                {formatUGX(total)}
              </p>
            </div>
            <button
              onClick={() => {
                hapticTap();
                onViewWallet();
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-600 shadow-lg transition-all active:scale-95"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              View Wallet
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.section>

      {/* Quick actions */}
      <section className="grid grid-cols-3 gap-3">
        <QuickAction
          icon={<ArrowDownToLine className="h-5 w-5" />}
          label="Deposit"
          onClick={onDeposit}
        />
        <QuickAction
          icon={<ArrowUpFromLine className="h-5 w-5" />}
          label="Withdraw"
          onClick={onWithdraw}
        />
        <QuickAction
          icon={<ArrowLeftRight className="h-5 w-5" />}
          label="Transfer"
          onClick={onTransfer}
        />
      </section>

      {/* Merchant Payouts CTA */}
      <motion.button
        onClick={() => {
          hapticTap();
          onOpenCashPayouts();
        }}
        whileTap={{ scale: 0.97 }}
        className="relative w-full overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-500 to-orange-500 p-5 text-left shadow-xl shadow-amber-500/20"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.8s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md">
              <Banknote className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-white">Merchant Payouts</p>
              <div className="mt-1 flex items-center gap-2">
                {pendingCount > 0 ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                    </span>
                    <p className="truncate text-xs text-white/90">
                      {pendingCount} unclaimed {pendingCount === 1 ? 'request' : 'requests'} waiting
                    </p>
                  </>
                ) : (
                  <p className="truncate text-xs text-white/90">
                    MoMo · Bank{handlesCash ? ' · Cash' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md">
            Open
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </motion.button>

      {/* Quick Insights */}
      <section className="rounded-3xl border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">Quick Insights</h3>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Last 7 days
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InsightTile
            label="Volume"
            value={formatUGX(insights?.volume ?? 0)}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            accent="bg-emerald-500"
            progress={insights?.volume ? Math.min(100, Math.round((insights.volume / 5_000_000) * 100)) : 0}
          />
          <InsightTile
            label="Avg Ticket"
            value={formatUGX(insights?.avg ?? 0)}
            icon={<Banknote className="h-3.5 w-3.5" />}
            accent="bg-indigo-500"
            progress={insights?.avg ? Math.min(100, Math.round((insights.avg / 200_000) * 100)) : 0}
          />
          <InsightTile
            label="Success Rate"
            value={successPct === null ? '—' : `${successPct}%`}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            accent={successPct !== null && successPct >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}
            progress={successPct ?? 0}
          />
          <InsightTile
            label="Pending Comm."
            value={formatUGX(pendingCommission ?? 0)}
            icon={<Timer className="h-3.5 w-3.5" />}
            accent="bg-amber-500"
            progress={pendingCommission ? Math.min(100, Math.round((pendingCommission / 50_000) * 100)) : 0}
          />
        </div>
      </section>
    </div>
  );
}

function BentoBalance({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-lg transition-all active:scale-[0.98]">
      <div className="mb-2.5 flex items-center gap-1.5 opacity-80">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="truncate text-lg font-bold tabular-nums leading-tight">
        {formatUGX(value)}
      </p>
      <p className="mt-1 truncate text-[10px] opacity-60">{hint}</p>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        hapticTap();
        onClick();
      }}
      className="group flex flex-col items-center justify-center gap-2.5 rounded-3xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 active:scale-95"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform group-active:rotate-6">
        {icon}
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
        {label}
      </span>
    </button>
  );
}

function InsightTile({
  label,
  value,
  icon,
  accent,
  progress,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  progress: number;
}) {
  return (
    <div className="rounded-2xl bg-muted/40 p-3.5">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="truncate text-base font-bold tabular-nums text-foreground">{value}</p>
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-background/80">
        <div
          className={cn('h-full rounded-full transition-all', accent)}
          style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}

export default MerchantDashboardHome;