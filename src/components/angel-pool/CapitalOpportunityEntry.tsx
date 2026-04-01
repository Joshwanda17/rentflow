import { useState } from 'react';
import {
  TrendingUp, Shield, Zap, Users, BadgeCheck, Rocket,
  Home, Wallet, ChevronLeft, ArrowUpRight, Coins
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useCurrency } from '@/hooks/useCurrency';
import { useWallet } from '@/hooks/useWallet';
import { InvestmentSelectionSheet, type PoolType } from './InvestmentSelectionSheet';
import { TOTAL_SHARES, PRICE_PER_SHARE, POOL_PERCENT, VALUATIONS, UGX_PER_USD } from './constants';
import { hapticTap } from '@/lib/haptics';

export function CapitalOpportunityEntry() {
  const { formatAmountCompact } = useCurrency();
  const { wallet } = useWallet();
  const walletBalance = wallet?.balance ?? 0;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedPool, setSelectedPool] = useState<PoolType | null>(null);
  const [amount, setAmount] = useState(0);

  const handleSelect = (pool: PoolType) => {
    hapticTap();
    setSelectedPool(pool);
    setAmount(0);
  };

  const handleBack = () => {
    setSelectedPool(null);
    setAmount(0);
  };

  const handleAmountChange = (val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) setAmount(Math.min(num, walletBalance > 0 ? walletBalance : 500_000_000));
    else setAmount(0);
  };

  // ─── Angel Pool calculations ───
  const angelShares = Math.floor(amount / PRICE_PER_SHARE);
  const poolOwnership = (angelShares / TOTAL_SHARES) * 100;
  const companyOwnership = (POOL_PERCENT / TOTAL_SHARES) * angelShares;

  // ─── Tenant Pool calculations ───
  const tenantMonthlyReturn = amount * 0.15;
  const tenantDailyReturn = amount * 0.005;

  const isValidAmount = amount >= PRICE_PER_SHARE;
  const exceedsBalance = walletBalance > 0 && amount > walletBalance;

  // ─── POST-SELECTION: INVESTMENT ENTRY WITH LIVE PREVIEW ───
  if (selectedPool) {
    const isTenant = selectedPool === 'tenant';

    return (
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
        {/* Header with back */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleBack}
              className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted active:scale-95 transition-all min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className={`p-2 rounded-xl ${isTenant ? 'bg-success/10' : 'bg-primary/10'}`}>
              {isTenant
                ? <Home className="h-4 w-4 text-success" />
                : <Rocket className="h-4 w-4 text-primary" />
              }
            </div>
            <div>
              <h3 className="font-black text-foreground text-sm tracking-tight">
                {isTenant ? 'Tenant Support Pool' : 'Angel Pool'}
              </h3>
              <p className="text-[10px] text-muted-foreground font-medium leading-tight">
                Enter investment amount
              </p>
            </div>
          </div>
        </div>

        {/* Wallet balance indicator */}
        <div className="px-5 pb-3">
          <div className="rounded-xl bg-muted/40 px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Wallet Balance
            </span>
            <span className="text-sm font-black text-foreground">
              {formatAmountCompact(walletBalance)}
            </span>
          </div>
        </div>

        {/* Amount input */}
        <div className="px-5 pb-3 space-y-2">
          <label className="text-xs text-muted-foreground font-semibold block">
            Amount (UGX)
          </label>
          <Input
            type="text"
            inputMode="numeric"
            value={amount > 0 ? amount.toLocaleString() : ''}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={`Min ${PRICE_PER_SHARE.toLocaleString()}`}
            className="text-lg font-bold h-12"
          />
          <Slider
            value={[amount]}
            onValueChange={([v]) => setAmount(v)}
            min={0}
            max={walletBalance > 0 ? walletBalance : 50_000_000}
            step={PRICE_PER_SHARE}
            className="mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>{formatAmountCompact(walletBalance > 0 ? walletBalance : 50_000_000)}</span>
          </div>
          {exceedsBalance && (
            <p className="text-[11px] text-destructive font-medium">
              Amount exceeds your wallet balance
            </p>
          )}
        </div>

        {/* ─── LIVE PREVIEW ─── */}
        {amount > 0 && (
          <div className="px-5 pb-4 space-y-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
              Investment Preview
            </p>

            {isTenant ? (
              /* Tenant Pool Preview */
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Coins className="h-3 w-3" /> Investment
                  </span>
                  <span className="font-black text-foreground">{formatAmountCompact(amount)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" /> Monthly Return (15%)
                  </span>
                  <span className="font-black text-success">+{formatAmountCompact(tenantMonthlyReturn)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ArrowUpRight className="h-3 w-3" /> Daily Return
                  </span>
                  <span className="font-bold text-foreground">+{formatAmountCompact(tenantDailyReturn)}/day</span>
                </div>
                <div className="h-px bg-border/60" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Deploy Speed</span>
                  <span className="font-bold">24–72hrs</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Payout</span>
                  <span className="font-bold">Monthly</span>
                </div>
              </div>
            ) : (
              /* Angel Pool Preview */
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2.5">
                <div className="grid grid-cols-3 gap-2 pb-2">
                  <div className="rounded-lg bg-primary/5 p-2 text-center">
                    <p className="text-lg font-black text-primary">{angelShares}</p>
                    <p className="text-[9px] text-muted-foreground font-medium">Shares</p>
                  </div>
                  <div className="rounded-lg bg-primary/5 p-2 text-center">
                    <p className="text-lg font-black text-primary">{poolOwnership.toFixed(2)}%</p>
                    <p className="text-[9px] text-muted-foreground font-medium">Pool %</p>
                  </div>
                  <div className="rounded-lg bg-primary/5 p-2 text-center">
                    <p className="text-lg font-black text-primary">{companyOwnership.toFixed(4)}%</p>
                    <p className="text-[9px] text-muted-foreground font-medium">Company %</p>
                  </div>
                </div>

                {/* Future value at valuations */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Future Value Estimates
                  </p>
                  {VALUATIONS.map((v) => {
                    const futureVal = (companyOwnership / 100) * v.value * UGX_PER_USD;
                    return (
                      <div key={v.label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">At {v.label} valuation</span>
                        <span className="font-black text-success">{formatAmountCompact(futureVal)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="h-px bg-border/60" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Equity Pool</span>
                  <span className="font-bold text-primary">Up to {POOL_PERCENT}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Horizon</span>
                  <span className="font-bold">Long-term</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="px-5 pb-4">
          <Button
            disabled={!isValidAmount || exceedsBalance}
            className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
          >
            {isTenant ? (
              <><Home className="h-4 w-4" /> Support Tenant</>
            ) : (
              <><Rocket className="h-4 w-4" /> Invest in Angel Pool</>
            )}
          </Button>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" /> Capital Protected
          </span>
          <span>•</span>
          <span>Min: {formatAmountCompact(PRICE_PER_SHARE)}</span>
        </div>
      </div>
    );
  }

  // ─── DEFAULT STATE: PERSUASIVE ENTRY CARD ───
  return (
    <>
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-black text-foreground text-sm tracking-tight">
                Grow Your Capital
              </h3>
              <p className="text-[10px] text-muted-foreground font-medium leading-tight">
                Choose verified, structured investment opportunities
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
            Active Opportunity Size
          </p>
          <p className="text-2xl sm:text-3xl font-black text-foreground mt-1">
            USh 1.2B<span className="text-lg text-muted-foreground font-bold">+</span>
          </p>
          <p className="text-[11px] text-primary font-semibold mt-1">
            🚀 Capital demand is growing — invest early
          </p>
        </div>

        <div className="px-5 pb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground font-medium">
            <span className="flex items-center gap-1">
              <BadgeCheck className="h-3 w-3 text-success" /> Verified
            </span>
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-primary" /> Insured
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-warning" /> 24hr Deploy
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 text-muted-foreground" /> Active Network
            </span>
          </div>
        </div>

        <div className="px-5 pb-4">
          <Button
            onClick={() => { hapticTap(); setSheetOpen(true); }}
            className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
          >
            <Rocket className="h-4 w-4" />
            Explore Opportunities
          </Button>
        </div>

        <div className="px-5 pb-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span>2 pools available</span>
          <span>•</span>
          <span>From USh 20K</span>
        </div>
      </div>

      <InvestmentSelectionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSelect={handleSelect}
      />
    </>
  );
}
