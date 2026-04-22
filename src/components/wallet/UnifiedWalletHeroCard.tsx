import { ReactNode } from 'react';
import { Wallet, ChevronRight, Shield, Home, TrendingUp, Rocket, PiggyBank, Coins } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';

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
  onOpenWallet,
  onHousesTap,
  onReturnTap,
  onDeployedTap,
  quickActions,
}: UnifiedWalletHeroCardProps) {
  const { formatAmount } = useCurrency();

  const handleOpenWallet = () => {
    hapticTap();
    onOpenWallet?.();
  };

  const showAgentSplit = role === 'agent' && (floatBalance !== undefined || commissionBalance !== undefined);

  return (
    <div className="w-full text-left portfolio-hero-card rounded-3xl p-6 relative overflow-hidden">
      {/* Subtle decorative circle */}
      <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-primary-foreground/[0.04] pointer-events-none" />

      <div className="relative z-10 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary-foreground/15 backdrop-blur-sm">
              <Wallet className="h-3.5 w-3.5 text-primary-foreground/90" />
            </div>
            <span className="text-[11px] font-semibold text-primary-foreground/60 uppercase tracking-[0.12em]">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-foreground/10 backdrop-blur-sm">
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
            <div className="grid grid-cols-2 gap-3">
              {/* Float section */}
              <div className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PiggyBank className="h-3 w-3 text-primary-foreground/50" />
                  <p className="text-[9px] uppercase tracking-[0.15em] font-semibold text-primary-foreground/50">Float</p>
                </div>
                <p className="text-lg font-black tracking-tight leading-none text-primary-foreground">
                  {formatAmount(floatBalance ?? 0)}
                </p>
                <p className="text-[9px] text-primary-foreground/40 mt-1 font-medium">Tenant collections · Pay Rent</p>
              </div>

              {/* Commission section */}
              <div className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Coins className="h-3 w-3 text-emerald-400/70" />
                  <p className="text-[9px] uppercase tracking-[0.15em] font-semibold text-emerald-300/70">Commission</p>
                </div>
                <p className="text-lg font-black tracking-tight leading-none text-primary-foreground">
                  {formatAmount(commissionBalance ?? 0)}
                </p>
                <p className="text-[9px] text-emerald-300/50 mt-1 font-medium">
                  Withdrawable: {formatAmount(commissionBalance ?? 0)}
                </p>
              </div>
            </div>

            {/* Total balance row */}
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary-foreground/40">Total Balance</span>
              <span className="text-sm font-black text-primary-foreground">{formatAmount(balance)}</span>
            </div>
          </button>
        ) : (
          /* Default: single Available Balance */
          <button
            onClick={handleOpenWallet}
            className="w-full text-left active:scale-[0.98] transition-transform"
          >
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary-foreground/50 mb-2">
              Available Balance
            </p>
            <p className="text-[clamp(1.6rem,6vw,2.5rem)] font-black tracking-tight leading-none text-primary-foreground">
              {formatAmount(balance)}
            </p>
          </button>
        )}

        {/* Supporter metric cards — individually tappable */}
        {role === 'supporter' && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { hapticTap(); onHousesTap?.(); }}
              className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-2.5 text-center active:scale-[0.95] transition-transform"
            >
              <Home className="h-3.5 w-3.5 text-primary-foreground/60 mx-auto mb-1" />
              <p className="text-[9px] uppercase tracking-wider text-primary-foreground/50 font-medium">Houses</p>
              <p className="text-sm font-black text-primary-foreground mt-0.5 font-mono tabular-nums">{houses ?? 0}</p>
            </button>
            <button
              onClick={() => { hapticTap(); onReturnTap?.(); }}
              className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-2.5 text-center active:scale-[0.95] transition-transform"
            >
              <TrendingUp className="h-3.5 w-3.5 text-primary-foreground/60 mx-auto mb-1" />
              <p className="text-[9px] uppercase tracking-wider text-primary-foreground/50 font-medium">Return/Mo</p>
              <p className="text-[11px] font-extrabold text-primary-foreground mt-0.5 font-mono tabular-nums truncate">{returnPerMonth ?? '—'}</p>
            </button>
            <button
              onClick={() => { hapticTap(); onDeployedTap?.(); }}
              className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-2.5 text-center active:scale-[0.95] transition-transform"
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

        {/* Footer — View Wallet link */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-primary-foreground/30" />
            <span className="text-[9px] text-primary-foreground/30 font-medium">{ROLE_TRUST[role]}</span>
          </div>
          <button
            onClick={handleOpenWallet}
            className="flex items-center gap-0.5 text-primary-foreground/40 active:text-primary-foreground/60 transition-colors"
          >
            <span className="text-[9px] font-medium">View Wallet</span>
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}