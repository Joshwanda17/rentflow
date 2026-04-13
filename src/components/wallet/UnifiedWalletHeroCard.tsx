import { useState } from 'react';
import { Wallet, ChevronRight, Shield, Home, TrendingUp, Rocket } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';

export type WalletRole = 'agent' | 'tenant' | 'supporter' | 'landlord';

interface UnifiedWalletHeroCardProps {
  /** The main balance from wallets.balance */
  balance: number;
  /** Role determines the secondary label */
  role: WalletRole;
  /** Role-specific secondary amount (commission for agent, rent due for tenant, etc.) */
  secondaryLabel?: string;
  secondaryValue?: string;
  /** Supporter-specific metrics */
  houses?: number;
  returnPerMonth?: string;
  deployed?: string;
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
}: UnifiedWalletHeroCardProps) {
  const [showWallet, setShowWallet] = useState(false);
  const { formatAmount } = useCurrency();

  return (
    <>
      <button
        onClick={() => { hapticTap(); setShowWallet(true); }}
        className="w-full text-left portfolio-hero-card rounded-3xl p-6 relative overflow-hidden active:scale-[0.98] transition-transform"
      >
        {/* Subtle decorative circle */}
        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-white/[0.04] pointer-events-none" />

        <div className="relative z-10 space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white/15 backdrop-blur-sm">
                <Wallet className="h-3.5 w-3.5 text-white/90" />
              </div>
              <span className="text-[11px] font-semibold text-white/60 uppercase tracking-[0.12em]">
                {ROLE_LABELS[role]}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">Active</span>
            </div>
          </div>

          {/* Available Balance — primary focus */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/50 mb-2">
              Available Balance
            </p>
            <p className="text-[clamp(1.6rem,6vw,2.5rem)] font-black tracking-tight leading-none text-white">
              {formatAmount(balance)}
            </p>
          </div>

          {/* Supporter metric cards */}
          {role === 'supporter' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 text-center">
                <Home className="h-3.5 w-3.5 text-white/60 mx-auto mb-1" />
                <p className="text-[9px] uppercase tracking-wider text-white/50 font-medium">Houses</p>
                <p className="text-sm font-black text-white mt-0.5 font-mono tabular-nums">{houses ?? 0}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 text-center">
                <TrendingUp className="h-3.5 w-3.5 text-white/60 mx-auto mb-1" />
                <p className="text-[9px] uppercase tracking-wider text-white/50 font-medium">Return/Mo</p>
                <p className="text-[11px] font-extrabold text-white mt-0.5 font-mono tabular-nums truncate">{returnPerMonth ?? '—'}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 text-center">
                <Rocket className="h-3.5 w-3.5 text-white/60 mx-auto mb-1" />
                <p className="text-[9px] uppercase tracking-wider text-white/50 font-medium">Deployed</p>
                <p className="text-[11px] font-extrabold text-white mt-0.5 font-mono tabular-nums truncate">{deployed ?? '—'}</p>
              </div>
            </div>
          )}

          {secondaryLabel && secondaryValue && (
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.08]">
              <span className="text-[11px] text-white/50 font-medium">{secondaryLabel}</span>
              <span className="text-[11px] text-white/70 font-bold">{secondaryValue}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-white/30" />
              <span className="text-[9px] text-white/30 font-medium">{ROLE_TRUST[role]}</span>
            </div>
            <div className="flex items-center gap-0.5 text-white/40">
              <span className="text-[9px] font-medium">View Wallet</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </button>

      {showWallet && <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />}
    </>
  );
}
