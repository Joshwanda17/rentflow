import { useState } from 'react';
import { Wallet, ChevronRight, Shield, ArrowUpRight, Home, CreditCard } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';

interface TenantWalletHeroCardProps {
  walletBalance: number;
  rentDue: number;
  dueDate?: Date;
  landlordName?: string;
}

export function TenantWalletHeroCard({
  walletBalance,
  rentDue,
  dueDate,
  landlordName,
}: TenantWalletHeroCardProps) {
  const [showWallet, setShowWallet] = useState(false);
  const { formatAmount, formatAmountCompact } = useCurrency();

  const daysUntilDue = dueDate
    ? Math.max(0, Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const coverage = rentDue > 0 ? Math.min(100, Math.round((walletBalance / rentDue) * 100)) : 100;

  return (
    <>
      <div className="portfolio-hero-card rounded-3xl p-5 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary-foreground/[0.06] pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-primary-foreground/[0.04] pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-64 h-[1px] bg-gradient-to-l from-transparent via-primary-foreground/10 to-transparent pointer-events-none" />

        <div className="relative z-10 space-y-5">
          {/* Top Label Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary-foreground/15 backdrop-blur-sm">
                <CreditCard className="h-3.5 w-3.5 text-primary-foreground/90" />
              </div>
              <span className="text-[11px] font-semibold text-primary-foreground/70 uppercase tracking-[0.12em]">
                Rent Wallet
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-foreground/10 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">Active</span>
            </div>
          </div>

          {/* Main Balance — Tappable */}
          <button
            onClick={() => { hapticTap(); setShowWallet(true); }}
            className="w-full text-left group"
          >
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary-foreground/60 mb-1.5 flex items-center gap-1.5">
              <Wallet className="h-3 w-3" />
              Total Balance
            </p>
            <div className="flex items-baseline gap-2 min-w-0 w-full">
              <p className="text-[clamp(1.1rem,4.5vw,2.25rem)] font-black tracking-tight leading-none text-primary-foreground truncate w-full">
                {formatAmount(walletBalance)}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-medium text-primary-foreground/50">
                Used for Rent: {formatAmountCompact(rentDue)}
              </span>
            </div>
            {rentDue > 0 && walletBalance >= rentDue && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/20">
                  <ArrowUpRight className="h-3 w-3 text-emerald-300" />
                  <span className="text-[11px] font-bold text-emerald-300">
                    Ready to pay
                  </span>
                </div>
              </div>
            )}
          </button>

          {/* Divider */}
          <div className="h-[1px] bg-primary-foreground/10" />

          {/* Stats Grid — 3 columns */}
          <div className="grid grid-cols-3 gap-2">
            {/* Rent Due */}
            <div className="portfolio-stat-cell-v2 rounded-xl px-2 py-3 text-center overflow-hidden">
              <div className="flex items-center justify-center mb-1.5">
                <Home className="h-3.5 w-3.5 text-primary-foreground/60" />
              </div>
              <p className="text-sm font-black leading-none text-primary-foreground truncate" title={formatAmount(rentDue)}>
                {formatAmountCompact(rentDue)}
              </p>
              <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-primary-foreground/50 mt-1.5">Rent Due</p>
            </div>

            {/* Days Left */}
            <div className="portfolio-stat-cell-v2 rounded-xl px-1.5 py-3 text-center">
              <div className="flex items-center justify-center mb-1.5">
                <CreditCard className="h-3.5 w-3.5 text-amber-400/80" />
              </div>
              <p className="text-xl font-black leading-none text-primary-foreground">{daysUntilDue}</p>
              <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-primary-foreground/50 mt-1.5">Days Left</p>
            </div>

            {/* Coverage */}
            <button
              onClick={() => { hapticTap(); setShowWallet(true); }}
              className="portfolio-stat-cell-v2 rounded-xl px-1.5 py-3 text-center hover:bg-primary-foreground/20 active:scale-95 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center mb-1.5">
                <Wallet className="h-3.5 w-3.5 text-emerald-400/80" />
              </div>
              <p className={`text-lg font-black leading-none ${coverage >= 100 ? 'text-emerald-300' : coverage >= 50 ? 'text-amber-300' : 'text-primary-foreground'}`}>
                {coverage}%
              </p>
              <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-primary-foreground/50 mt-1.5 flex items-center justify-center gap-0.5">
                Coverage
                <ChevronRight className="h-2.5 w-2.5" />
              </p>
            </button>
          </div>

          {/* Trust Strip */}
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-primary-foreground/40" />
              <span className="text-[9px] text-primary-foreground/40 font-medium">
                {landlordName ? `Paying: ${landlordName}` : 'Welile Tenant'}
              </span>
            </div>
            <span className="text-[9px] text-primary-foreground/40 font-medium">
              {dueDate ? `Due: ${dueDate.toLocaleDateString()}` : ''}
            </span>
          </div>
        </div>
      </div>

      {showWallet && <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />}
    </>
  );
}
