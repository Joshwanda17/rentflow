import { ReactNode } from 'react';
import { Wallet, ChevronRight, Shield, Home, TrendingUp, Rocket, PiggyBank, Coins, Sparkles, Clock } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/hooks/useAuth';
import { usePayrollGrowth } from '@/hooks/usePayrollGrowth';
import { useAvailableBalance } from '@/hooks/useAvailableBalance';

export type WalletRole = 'agent' | 'tenant' | 'supporter' | 'landlord';

interface UnifiedWalletHeroCardProps {
  balance: number;
  role: WalletRole;
  secondaryLabel?: string;
  secondaryValue?: string;
  houses?: number;
  returnPerMonth?: string;
  deployed?: string;
  /** Agent-specific: float (locked) and commission (earned) */
  floatBalance?: number;
  commissionBalance?: number;
  withdrawableBalance?: number;
  /** Agent-specific: withdrawable funds NOT classified as commission (CFO admin credits etc.) */
  otherBalance?: number;
  /** Callback when user taps balance area or "View Wallet" */
  onOpenWallet?: () => void;
  /** Supporter metric card taps */
  onHousesTap?: () => void;
  onReturnTap?: () => void;
  onDeployedTap?: () => void;
  /** Optional quick action buttons rendered below the balance */
  quickActions?: ReactNode;
}

const ROLE_LABELS: Record<WalletRole, string> = {
  agent: 'Agent Wallet',
  tenant: 'Rent Wallet',
  supporter: 'PARTNER WALLET',
  landlord: 'Owner Wallet',
};

const ROLE_TRUST: Record<WalletRole, string> = {
  agent: 'Welile Agent',
  tenant: 'Welile Tenant',
  supporter: 'Capital Protected',
  landlord: 'Welile Property Owner',
};

export function UnifiedWalletHeroCard({
  balance,
  role,
  secondaryLabel,
  secondaryValue,
  houses,
  returnPerMonth,
  deployed,
  floatBalance,
  commissionBalance,
  withdrawableBalance,
  otherBalance,
  onOpenWallet,
  onHousesTap,
  onReturnTap,
  onDeployedTap,
  quickActions,
}: UnifiedWalletHeroCardProps) {
  const { formatAmount } = useCurrency();
  const { user } = useAuth();
  const payrollGrowth = usePayrollGrowth(user?.id);
  // Strict ledger-backed available balance (subtracts pending withdrawal_requests).
  // Used for the headline so the wallet never shows money already promised to an
  // in-flight withdrawal. Cached `balance` prop is shown as a smaller "Total" line.
  const { available: ledgerAvailable, walletCached, loading: availableLoading } =
    useAvailableBalance(user?.id);
  const showAgentSplit = role === 'agent' && (floatBalance !== undefined || commissionBalance !== undefined);
  // Only override the headline for non-agent split layouts (agent split has its
  // own dedicated Withdrawable cell that already uses withdrawableBalance prop).
  const useStrictHeadline = !showAgentSplit && !availableLoading;
  const headlineBalance = useStrictHeadline ? ledgerAvailable : balance;
  const pendingHold = useStrictHeadline
    ? Math.max(0, Math.min(walletCached || 0, balance) - ledgerAvailable)
    : 0;

  const handleOpenWallet = () => {
    hapticTap();
    onOpenWallet?.();
  };

  return (
    <div className="w-full text-left portfolio-hero-card rounded-3xl p-6 relative overflow-hidden">
      {/* Decorative elements for depth and text clarity */}
      <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-primary-foreground/[0.06] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-primary-foreground/[0.04] pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-64 h-[1px] bg-gradient-to-l from-transparent via-primary-foreground/10 to-transparent pointer-events-none" />

      <div className="relative z-10 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary-foreground/15 backdrop-blur-sm">
              <Wallet className="h-3.5 w-3.5 text-primary-foreground/90" />
            </div>
            <span className="text-[11px] font-semibold text-primary-foreground/80 uppercase tracking-[0.12em]">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-foreground/15 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">Active</span>
          </div>
        </div>

        {/* Agent Float & Commission split */}
        {showAgentSplit ? (
          <button
            onClick={handleOpenWallet}
            className="w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Float section */}
              <div className="bg-primary-foreground/15 rounded-xl p-3 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PiggyBank className="h-3 w-3 text-primary-foreground/50" />
                  <p className="text-[9px] uppercase tracking-[0.15em] font-semibold text-primary-foreground/50">Float</p>
                </div>
                <p className="text-lg font-black tracking-tight leading-none text-primary-foreground whitespace-nowrap">
                  {formatAmount(floatBalance ?? 0)}
                </p>
                <p className="text-[9px] text-primary-foreground/40 mt-1 font-medium">Tenant collections · Pay Rent</p>
              </div>

              {/* Withdrawable section — STRICT ledger-backed value only.
                  Must NEVER display commissionBalance here: commission is
                  earnings history, not necessarily currently withdrawable. */}
              <div className="bg-primary-foreground/15 rounded-xl p-3 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Coins className="h-3 w-3 text-emerald-400/70" />
                  <p className="text-[9px] uppercase tracking-[0.15em] font-semibold text-emerald-300/70">Withdrawable</p>
                </div>
                <p className="text-lg font-black tracking-tight leading-none text-primary-foreground whitespace-nowrap">
                  {formatAmount(withdrawableBalance ?? 0)}
                </p>
                <p className="text-[9px] text-emerald-300/50 mt-1 font-medium">
                  Available to withdraw
                </p>
              </div>
            </div>

            {/* Total balance row */}
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary-foreground/40">Total Balance</span>
              <span className="text-sm font-black text-primary-foreground">{formatAmount(balance)}</span>
            </div>
            <p className="mt-2 px-1 text-[10px] text-primary-foreground/40 font-medium">
              Tap to see how your money moves in and out
            </p>
          </button>
        ) : (
          /* Default: single Available Balance */
          <button
            onClick={handleOpenWallet}
            className="w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="bg-primary-foreground/[0.10] rounded-2xl p-4 border border-primary-foreground/[0.06]">
              <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-primary-foreground/75 mb-2 flex items-center gap-1.5">
                <Wallet className="h-3 w-3" />
                Withdrawable Balance
              </p>
              <p className="text-[clamp(1.75rem,6.5vw,2.75rem)] font-black tracking-tight leading-none text-primary-foreground drop-shadow-sm">
                {formatAmount(headlineBalance)}
              </p>
              {pendingHold > 0 && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-300/20">
                  <Clock className="h-3 w-3 text-amber-300" />
                  <span className="text-[10px] font-semibold text-amber-200">
                    {formatAmount(pendingHold)} pending withdrawal
                  </span>
                </div>
              )}
              {pendingHold > 0 && (
                <p className="text-[10px] text-primary-foreground/50 mt-1.5">
                  Wallet total: <span className="font-semibold text-primary-foreground/80">{formatAmount(balance)}</span>
                </p>
              )}
              <p className="mt-2.5 text-[10px] text-primary-foreground/40 font-medium">
                Tap to see how your money moves in and out
              </p>
            </div>
          </button>
        )}

        {/* Supporter metric cards — individually tappable */}
        {role === 'supporter' && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { hapticTap(); onHousesTap?.(); }}
              className="bg-primary-foreground/15 rounded-xl p-2.5 text-center active:scale-[0.95] transition-transform"
            >
              <Home className="h-3.5 w-3.5 text-primary-foreground/60 mx-auto mb-1" />
              <p className="text-[9px] uppercase tracking-wider text-primary-foreground/50 font-medium">Houses</p>
              <p className="text-sm font-black text-primary-foreground mt-0.5 font-mono tabular-nums">{houses ?? 0}</p>
            </button>
            <button
              onClick={() => { hapticTap(); onReturnTap?.(); }}
              className="bg-primary-foreground/15 rounded-xl p-2.5 text-center active:scale-[0.95] transition-transform"
            >
              <TrendingUp className="h-3.5 w-3.5 text-primary-foreground/60 mx-auto mb-1" />
              <p className="text-[9px] uppercase tracking-wider text-primary-foreground/50 font-medium">Return/Mo</p>
              <p className="text-[11px] font-extrabold text-primary-foreground mt-0.5 font-mono tabular-nums truncate">{returnPerMonth ?? '—'}</p>
            </button>
            <button
              onClick={() => { hapticTap(); onDeployedTap?.(); }}
              className="bg-primary-foreground/15 rounded-xl p-2.5 text-center active:scale-[0.95] transition-transform"
            >
              <Rocket className="h-3.5 w-3.5 text-primary-foreground/60 mx-auto mb-1" />
              <p className="text-[9px] uppercase tracking-wider text-primary-foreground/50 font-medium">Deployed</p>
              <p className="text-[11px] font-extrabold text-primary-foreground mt-0.5 font-mono tabular-nums truncate">{deployed ?? '—'}</p>
            </button>
          </div>
        )}

        {secondaryLabel && secondaryValue && !showAgentSplit && (
          <div className="flex items-center justify-between pt-1 border-t border-primary-foreground/[0.08]">
            <span className="text-[11px] text-primary-foreground/50 font-medium">{secondaryLabel}</span>
            <span className="text-[11px] text-primary-foreground/70 font-bold">{secondaryValue}</span>
          </div>
        )}

        {/* Quick Actions slot */}
        {quickActions}

        {/* Payroll Growth Bonus indicator — only renders for staff with active un-withdrawn payroll */}
        {payrollGrowth && (() => {
          // Never claim more is "parked" than the user actually has in their wallet.
          // Withdrawals reduce the real balance immediately; the payroll_growth_balances
          // FIFO consumer may lag (or, for historical rows, never ran), so we cap the
          // displayed parked amount at the current withdrawable balance.
          const realWithdrawable = useStrictHeadline
            ? Math.max(0, ledgerAvailable)
            : Math.max(0, walletCached ?? balance ?? 0);
          const displayedParked = Math.min(payrollGrowth.currentBalance, realWithdrawable);
          // If the user has withdrawn everything, hide the indicator entirely —
          // there is nothing left to grow.
          if (displayedParked <= 0) return null;
          const displayedEarned = displayedParked >= payrollGrowth.currentBalance
            ? payrollGrowth.accruedGrowth
            : Math.round(payrollGrowth.accruedGrowth * (displayedParked / payrollGrowth.currentBalance));
          return (
          <div className="rounded-xl bg-gradient-to-r from-amber-500/15 to-emerald-500/15 border border-amber-300/20 px-3 flex items-start gap-2 py-[12px]">
            <Sparkles className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber-200/90">
                Balance growing · {(payrollGrowth.dailyRate * 100).toFixed(1)}% / day
              </p>
              <p className="text-[10px] text-primary-foreground/70 mt-0.5">
                <span className="font-bold text-primary-foreground">{formatAmount(displayedParked)}</span>
                <span className="text-primary-foreground/50"> parked · </span>
                <span className="font-semibold text-emerald-300">+{formatAmount(displayedEarned)}</span>
                <span className="text-primary-foreground/50"> earned</span>
              </p>
            </div>
          </div>
          );
        })()}

        {/* Footer — View Wallet link */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-primary-foreground/30" />
            <span className="text-[9px] text-primary-foreground/30 font-medium">{ROLE_TRUST[role]}</span>
          </div>
          <button
            onClick={handleOpenWallet}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 active:scale-95 text-primary-foreground font-semibold text-sm shadow-lg ring-2 ring-primary-foreground/40 animate-bell-glow transition-all overflow-hidden group"
          >
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent transition-transform duration-1000 ease-out" />
            <span className="relative">View Wallet</span>
            <ChevronRight className="relative h-4 w-4 animate-pulse" />
          </button>
        </div>
      </div>
    </div>
  );
}