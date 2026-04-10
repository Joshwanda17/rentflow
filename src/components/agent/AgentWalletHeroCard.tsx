import { useState } from 'react';
import { Wallet, ChevronRight, Shield, Users, Banknote, CreditCard } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';

interface AgentWalletHeroCardProps {
  floatBalance: number;
  commissionBalance: number;
  tenantsCount: number;
  totalEarnings: number;
  territory?: string;
}

export function AgentWalletHeroCard({
  floatBalance,
  commissionBalance,
  tenantsCount,
  totalEarnings,
  territory,
}: AgentWalletHeroCardProps) {
  const [showWallet, setShowWallet] = useState(false);
  const { formatAmount, formatAmountCompact } = useCurrency();

  return (
    <>
      <div className="portfolio-hero-card rounded-3xl p-5 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-white/[0.04] pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-64 h-[1px] bg-gradient-to-l from-transparent via-white/10 to-transparent pointer-events-none" />

        <div className="relative z-10 space-y-5">
          {/* Top Label Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white/15 backdrop-blur-sm">
                <CreditCard className="h-3.5 w-3.5 text-white/90" />
              </div>
              <span className="text-[11px] font-semibold text-white/70 uppercase tracking-[0.12em]">
                Agent Wallet
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">Active</span>
            </div>
          </div>

          {/* Main Balance — Tappable */}
          <button
            onClick={() => { hapticTap(); setShowWallet(true); }}
            className="w-full text-left group"
          >
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/60 mb-1.5 flex items-center gap-1.5">
              <Banknote className="h-3 w-3" />
              Total Balance
            </p>
            <div className="flex items-baseline gap-2 min-w-0 w-full">
              <p className="text-[clamp(1.1rem,4.5vw,2.25rem)] font-black tracking-tight leading-none text-white truncate w-full">
                {formatAmount(floatBalance + commissionBalance)}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="font-bold text-primary-foreground text-3xl">
                Withdrawable: {formatAmountCompact(commissionBalance)}
              </span>
            </div>
          </button>

          {/* Divider */}
          <div className="h-[1px] bg-white/10" />

          {/* Stats Grid — 3 columns */}
          <div className="grid grid-cols-3 gap-2">
            {/* Tenants */}
            <div className="portfolio-stat-cell-v2 rounded-xl px-2 py-3 text-center">
              <div className="flex items-center justify-center mb-1.5">
                <Users className="h-3.5 w-3.5 text-white/60" />
              </div>
              <p className="text-xl font-black leading-none text-white">{tenantsCount}</p>
              <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/50 mt-1.5">Tenants</p>
            </div>

            {/* Total Earnings */}
            <div className="portfolio-stat-cell-v2 rounded-xl px-1.5 py-3 text-center overflow-hidden">
              <div className="flex items-center justify-center mb-1.5">
                <Banknote className="h-3.5 w-3.5 text-emerald-400/80" />
              </div>
              <p className="text-sm font-black leading-none text-white truncate" title={formatAmount(totalEarnings)}>
                {formatAmountCompact(totalEarnings)}
              </p>
              <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/50 mt-1.5">Earned</p>
            </div>

            {/* Commission — Opens sheet */}
            <button
              onClick={() => { hapticTap(); setShowWallet(true); }}
              className="portfolio-stat-cell-v2 rounded-xl px-1.5 py-3 text-center overflow-hidden hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center mb-1.5">
                <Wallet className="h-3.5 w-3.5 text-emerald-400/80" />
              </div>
              <p className="text-sm font-black leading-none text-white truncate" title={formatAmount(commissionBalance)}>
                {formatAmountCompact(commissionBalance)}
              </p>
              <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/50 mt-1.5 flex items-center justify-center gap-0.5">
                Commission
                <ChevronRight className="h-2.5 w-2.5" />
              </p>
            </button>
          </div>

          {/* Trust Strip */}
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-white/40" />
              <span className="text-[9px] text-white/40 font-medium">Welile Agent</span>
            </div>
            {territory && (
              <span className="text-[9px] text-white/40 font-medium">{territory}</span>
            )}
          </div>
        </div>
      </div>

      {showWallet && <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />}
    </>
  );
}
