import { useState } from 'react';
import {
  TrendingUp, Shield, Zap, Users, BadgeCheck, Rocket,
  Plus, Settings, Home, Wallet, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/hooks/useCurrency';
import { InvestmentSelectionSheet, type PoolType } from './InvestmentSelectionSheet';
import { hapticTap } from '@/lib/haptics';

export function CapitalOpportunityEntry() {
  const { formatAmountCompact } = useCurrency();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedPool, setSelectedPool] = useState<PoolType | null>(null);

  // Mock invested state
  const mockTenantInvestment = 2_500_000;
  const mockTenantReturn = mockTenantInvestment * 0.15;
  const mockAngelInvestment = 5_000_000;
  const mockAngelShares = Math.floor(mockAngelInvestment / 20_000);

  const handleSelect = (pool: PoolType) => {
    hapticTap();
    setSelectedPool(pool);
  };

  const handleReset = () => {
    setSelectedPool(null);
  };

  // ─── POST-SELECTION: ACTIVE INVESTMENT STATE ───
  if (selectedPool) {
    const isTenant = selectedPool === 'tenant';
    const investedAmount = isTenant ? mockTenantInvestment : mockAngelInvestment;

    return (
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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
                Active Investment
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-[9px] px-2 py-0.5 border-success/40 text-success bg-success/5 font-bold uppercase tracking-wider"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success mr-1 animate-pulse" />
            Active
          </Badge>
        </div>

        {/* Investment value */}
        <div className="px-5 pb-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
            Current Value
          </p>
          <p className="text-2xl sm:text-3xl font-black text-foreground mt-1">
            {formatAmountCompact(investedAmount)}
          </p>
        </div>

        {/* Key metric */}
        <div className="px-5 pb-4">
          <div className="rounded-xl bg-muted/50 px-4 py-3 flex items-center justify-between">
            {isTenant ? (
              <>
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Monthly Return
                </span>
                <span className="text-sm font-black text-success">
                  +{formatAmountCompact(mockTenantReturn)}/mo
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> Shares Owned
                </span>
                <span className="text-sm font-black text-primary">{mockAngelShares} shares</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 space-y-2">
          <Button className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2">
            <Plus className="h-4 w-4" />
            Add More Funds
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full h-11 rounded-2xl text-sm font-semibold gap-2"
          >
            <Settings className="h-4 w-4" />
            Manage Investment
          </Button>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" /> Capital Protected
          </span>
          <span>•</span>
          <span>{isTenant ? '15% monthly' : '8% equity pool'}</span>
        </div>
      </div>
    );
  }

  // ─── DEFAULT STATE: PERSUASIVE ENTRY CARD ───
  return (
    <>
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
        {/* Header */}
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

        {/* Highlight metric */}
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

        {/* Trust indicators */}
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

        {/* Primary CTA */}
        <div className="px-5 pb-4">
          <Button
            onClick={() => { hapticTap(); setSheetOpen(true); }}
            className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
          >
            <Rocket className="h-4 w-4" />
            Explore Opportunities
          </Button>
        </div>

        {/* Footer */}
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
