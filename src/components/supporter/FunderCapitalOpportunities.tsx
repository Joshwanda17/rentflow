import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import {
  TrendingUp, Shield, Zap, Users, BadgeCheck, Rocket,
  Home, Wallet, ChevronLeft, ArrowUpRight, Coins,
  BarChart3, Lock, Clock, PieChart, ChevronRight,
  Building, CircleDollarSign, UserCheck, MapPin, ArrowDownToLine, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCurrency } from '@/hooks/useCurrency';
import { useWallet } from '@/hooks/useWallet';
import { useCapitalOpportunities } from '@/hooks/useCapitalOpportunities';
import { TOTAL_SHARES, PRICE_PER_SHARE, POOL_PERCENT, VALUATIONS, UGX_PER_USD } from '@/components/angel-pool/constants';
import { hapticTap } from '@/lib/haptics';
import { toast } from 'sonner';
import { FundRentDialog } from './FundRentDialog';
import { InvestmentWithdrawButton } from './InvestmentWithdrawButton';
import { InvestmentSelectionSheet, type PoolType } from '@/components/angel-pool/InvestmentSelectionSheet';

type ViewState = 'default' | 'investing' | 'committed';

// ─── Amount Input ───
function AmountInput({
  amount, onAmountChange, onSliderChange, walletBalance, formatAmountCompact, exceedsBalance,
}: {
  amount: number; onAmountChange: (val: string) => void; onSliderChange: (val: number) => void;
  walletBalance: number; formatAmountCompact: (n: number) => string; exceedsBalance: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-muted/40 px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Wallet Balance
        </span>
        <span className="text-sm font-black text-foreground">{formatAmountCompact(walletBalance)}</span>
      </div>
      <label className="text-xs text-muted-foreground font-semibold block">Amount (UGX)</label>
      <Input
        type="text" inputMode="numeric"
        value={amount > 0 ? amount.toLocaleString() : ''}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder={`Min ${PRICE_PER_SHARE.toLocaleString()}`}
        className="text-lg font-bold h-12"
      />
      <Slider value={[amount]} onValueChange={([v]) => onSliderChange(v)} min={0}
        max={walletBalance > 0 ? walletBalance : 50_000_000} step={PRICE_PER_SHARE} className="mt-1" />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span><span>{formatAmountCompact(walletBalance > 0 ? walletBalance : 50_000_000)}</span>
      </div>
      {exceedsBalance && <p className="text-[11px] text-destructive font-medium">Amount exceeds your wallet balance</p>}
    </div>
  );
}

function TenantPreview({ amount, formatAmountCompact }: { amount: number; formatAmountCompact: (n: number) => string }) {
  if (amount <= 0) return null;
  const monthlyReturn = amount * 0.15;
  const dailyReturn = amount * 0.005;
  return (
    <div className="space-y-2 pt-2">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Investment Preview</p>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5"><Coins className="h-3 w-3" /> Investment</span>
          <span className="font-black text-foreground">{formatAmountCompact(amount)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> Monthly Return (15%)</span>
          <span className="font-black text-success">+{formatAmountCompact(monthlyReturn)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5"><ArrowUpRight className="h-3 w-3" /> Daily Return</span>
          <span className="font-bold text-foreground">+{formatAmountCompact(dailyReturn)}/day</span>
        </div>
        <div className="h-px bg-border/60" />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Deploy Speed</span><span className="font-bold">24–72hrs</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Payout</span><span className="font-bold">Monthly</span>
        </div>
      </div>
    </div>
  );
}

function AngelPreview({ amount, formatAmountCompact }: { amount: number; formatAmountCompact: (n: number) => string }) {
  if (amount <= 0) return null;
  const shares = Math.floor(amount / PRICE_PER_SHARE);
  const poolPct = (shares / TOTAL_SHARES) * 100;
  const companyPct = (POOL_PERCENT / TOTAL_SHARES) * shares;
  return (
    <div className="space-y-2 pt-2">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Investment Preview</p>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2.5">
        <div className="grid grid-cols-3 gap-2 pb-2">
          {[{ val: shares, label: 'Shares' }, { val: `${poolPct.toFixed(2)}%`, label: 'Pool %' }, { val: `${companyPct.toFixed(4)}%`, label: 'Company %' }].map(m => (
            <div key={m.label} className="rounded-lg bg-primary/5 p-2 text-center">
              <p className="text-lg font-black text-primary">{m.val}</p>
              <p className="text-[9px] text-muted-foreground font-medium">{m.label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Future Value Estimates</p>
          {VALUATIONS.map((v) => {
            const futureVal = (companyPct / 100) * v.value * UGX_PER_USD;
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
          <span className="text-muted-foreground">Horizon</span><span className="font-bold">Long-term</span>
        </div>
      </div>
    </div>
  );
}

// ═══ DEFAULT GATEWAY CARD ═══
function DefaultEntryCard({
  onOpenSelection, formatAmountCompact, activeDemand,
}: {
  onOpenSelection: () => void; formatAmountCompact: (n: number) => string; activeDemand: number;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
      <div className="px-5 pt-5 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-base tracking-tight leading-tight">
              Put Your Capital to Work
            </h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Verified opportunities. Structured returns. Choose your path.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 border border-border/40 px-4 py-3 text-center">
          <p className="text-2xl font-black text-foreground tracking-tight">
            {formatAmountCompact(activeDemand)}
          </p>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">
            Active Capital Demand
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
            <BadgeCheck className="h-3 w-3 text-success" /> Verified
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
            <Shield className="h-3 w-3 text-primary" /> Insured
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
            <Users className="h-3 w-3" /> Active Network
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
            <Lock className="h-3 w-3" /> Structured
          </span>
        </div>

        <Button
          onClick={() => { hapticTap(); onOpenSelection(); }}
          className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
        >
          <Rocket className="h-4 w-4" /> Explore Investment Options
          <ChevronRight className="h-4 w-4 ml-auto" />
        </Button>
      </div>
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export function FunderCapitalOpportunities() {
  const { formatAmountCompact } = useCurrency();
  const { wallet } = useWallet();
  const walletBalance = wallet?.balance ?? 0;
  const { portfolioCount, totalInvested, opportunitySummary, loading } = useCapitalOpportunities();

  // Determine initial view based on portfolio data
  const [viewState, setViewState] = useState<ViewState>('default');
  const [initialized, setInitialized] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PoolType>('tenant');
  const [angelAmount, setAngelAmount] = useState(0);
  const [showFundDialog, setShowFundDialog] = useState(false);

  // Once data loads, decide initial state
  useEffect(() => {
    if (!loading && !initialized) {
      setViewState(portfolioCount >= 1 ? 'committed' : 'default');
      setInitialized(true);
    }
  }, [loading, initialized, portfolioCount]);

  const activeDemand = opportunitySummary?.total_rent_requested ?? 0;

  const handleAngelAmountChange = (val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
    const max = walletBalance > 0 ? walletBalance : 500_000_000;
    setAngelAmount(!isNaN(num) ? Math.min(num, max) : 0);
  };

  const [investLoading, setInvestLoading] = useState(false);

  const handleAngelInvest = useCallback(async () => {
    if (angelAmount < PRICE_PER_SHARE) return;
    if (walletBalance > 0 && angelAmount > walletBalance) return;
    hapticTap();
    setInvestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('angel-pool-invest', {
        body: { amount: angelAmount },
      });
      if (error) {
        const msg = await extractFromErrorObject(error, 'Investment failed. Please try again.');
        toast.error(msg);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(
        `🎉 ${data.shares} shares secured! Ref: ${data.reference_id}`,
        { description: `Pool ownership: ${data.pool_ownership_percent.toFixed(4)}%` }
      );
      setAngelAmount(0);
      window.dispatchEvent(new CustomEvent('supporter-contribution-changed'));
      window.dispatchEvent(new CustomEvent('wallet-balance-changed'));
    } catch (err: any) {
      toast.error(err?.message || 'Investment failed');
    } finally {
      setInvestLoading(false);
    }
  }, [angelAmount, walletBalance]);

  const handlePoolSelect = (pool: PoolType) => {
    setActiveTab(pool);
    setViewState('investing');
  };

  if (loading || !initialized) {
    return <div className="h-48 rounded-2xl bg-muted/50 animate-pulse" />;
  }

  // ─── COMMITTED STATE (existing investor) ───
  if (viewState === 'committed') {
    const summary = opportunitySummary;
    return (
      <>
        <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
          <div className="px-5 pt-5 pb-1">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Capital Opportunities</p>
          </div>
          <div className="px-5 pb-4">
            <Tabs value={activeTab} onValueChange={(v) => { hapticTap(); setActiveTab(v as PoolType); }} className="w-full">
              <TabsList variant="pills" className="w-full grid grid-cols-2 gap-2">
                <TabsTrigger value="tenant" variant="pills"
                  className="rounded-full text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Home className="h-3.5 w-3.5" /> Tenant Support
                  {portfolioCount >= 1 && (
                    <Check className="h-3.5 w-3.5 text-white" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="angel" variant="pills"
                  className="rounded-full text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Rocket className="h-3.5 w-3.5" /> Angel Pool
                </TabsTrigger>
              </TabsList>

              {/* ─── TENANT SUPPORT TAB ─── */}
              <TabsContent value="tenant" className="mt-3 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">Rent Requests</p>
                      <p className="text-[10px] text-muted-foreground">Rent demand from our agent network</p>
                    </div>
                  </div>
                  <Badge variant="success" size="sm" className="uppercase tracking-wider text-[9px] font-bold">
                    Active
                  </Badge>
                </div>

                {/* Total Rent Demand */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Total Rent Demand</p>
                  <p className="text-3xl font-black text-foreground tracking-tight mt-0.5">
                    {formatAmountCompact(summary?.total_rent_requested ?? 0)}
                  </p>
                  <p className="text-[10px] text-primary font-medium mt-1 flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Welile is turning rent into an asset
                  </p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Building, value: (summary?.total_requests ?? 0).toLocaleString(), label: 'Active Requests' },
                    { icon: UserCheck, value: (summary?.total_landlords ?? 0).toLocaleString(), label: 'Verified Landlords' },
                    { icon: MapPin, value: (summary?.total_agents ?? 0).toLocaleString(), label: 'Field Agents' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
                      <s.icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                      <p className="text-lg font-black text-foreground">{s.value}</p>
                      <p className="text-[9px] text-muted-foreground font-medium">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Key metrics */}
                <div className="space-y-2">
                  {[
                    { icon: TrendingUp, label: 'Monthly Return', value: 'Up to 15%', valueClass: 'text-success font-black' },
                    { icon: Rocket, label: 'Deployment Speed', value: '24–72 hours', valueClass: 'font-bold' },
                    { icon: CircleDollarSign, label: 'Payouts', value: 'Monthly to wallet', valueClass: 'font-bold' },
                    { icon: Shield, label: 'Risk Control', value: 'Verified & insured', valueClass: 'font-bold' },
                  ].map(m => (
                    <div key={m.label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <m.icon className="h-3.5 w-3.5" /> {m.label}
                      </span>
                      <span className={m.valueClass}>{m.value}</span>
                    </div>
                  ))}
                </div>

                {/* CTAs */}
                <Button
                  onClick={() => { hapticTap(); setShowFundDialog(true); }}
                  className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2 uppercase tracking-wide"
                >
                  Support Tenant <ChevronRight className="h-4 w-4" />
                </Button>
                <InvestmentWithdrawButton />

                {/* Footer */}
                <div className="text-center space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3 inline mr-1" />Avg. cycle: 30 days · Min: UGX {PRICE_PER_SHARE.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
                    Returns are projected based on historical performance. Capital is deployed into verified rent facilitation agreements managed by Welile with reserve protection.
                  </p>
                </div>
              </TabsContent>

              {/* ─── ANGEL POOL TAB ─── */}
              <TabsContent value="angel" className="mt-3 space-y-3">
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs font-bold text-foreground">Own shares in Welile's future</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Early-stage equity — up to {POOL_PERCENT}% pool</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground font-medium">
                    <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3 text-primary" /> Up to {POOL_PERCENT}% equity</span>
                    <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Long-term</span>
                    <span className="flex items-center gap-1"><Rocket className="h-3 w-3" /> Early-stage</span>
                  </div>
                </div>
                <AmountInput amount={angelAmount} onAmountChange={handleAngelAmountChange}
                  onSliderChange={setAngelAmount} walletBalance={walletBalance} formatAmountCompact={formatAmountCompact}
                  exceedsBalance={walletBalance > 0 && angelAmount > walletBalance} />
                <AngelPreview amount={angelAmount} formatAmountCompact={formatAmountCompact} />
                <Button type="button" onClick={handleAngelInvest}
                  disabled={investLoading || angelAmount < PRICE_PER_SHARE || (walletBalance > 0 && angelAmount > walletBalance)}
                  className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2">
                  <Rocket className="h-4 w-4" /> {investLoading ? 'Processing…' : 'Fund Angel Pool'}
                </Button>
                <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Capital Protected</span>
                  <span>•</span><span>Min: {formatAmountCompact(PRICE_PER_SHARE)}</span>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Fund Dialog for tenant support */}
        {opportunitySummary && (
          <FundRentDialog
            open={showFundDialog}
            onOpenChange={setShowFundDialog}
            summary={opportunitySummary}
          />
        )}
      </>
    );
  }

  // ─── DEFAULT STATE (new investor) ───
  if (viewState === 'default') {
    return (
      <>
        <DefaultEntryCard
          onOpenSelection={() => setSheetOpen(true)}
          formatAmountCompact={formatAmountCompact}
          activeDemand={activeDemand}
        />
        <InvestmentSelectionSheet open={sheetOpen} onOpenChange={setSheetOpen} onSelect={handlePoolSelect} />
      </>
    );
  }

  // ─── INVESTING STATE (after selection from gateway) ───
  return (
    <>
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <div className="px-5 pt-4 pb-3 flex items-center gap-2.5">
          <button onClick={() => { hapticTap(); setViewState('default'); }}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted/60 transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="p-2 rounded-xl bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-sm tracking-tight">Grow Your Capital</h3>
            <p className="text-[10px] text-muted-foreground font-medium leading-tight">Choose an investment pool below</p>
          </div>
        </div>

        <div className="px-5 pb-4">
          <Tabs value={activeTab} onValueChange={(v) => { hapticTap(); setActiveTab(v as PoolType); }} className="w-full">
            <TabsList variant="pills" className="w-full grid grid-cols-2 gap-2">
              <TabsTrigger value="tenant" variant="pills"
                className="rounded-full text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Home className="h-3.5 w-3.5" /> Tenant Support
              </TabsTrigger>
              <TabsTrigger value="angel" variant="pills"
                className="rounded-full text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Rocket className="h-3.5 w-3.5" /> Angel Pool
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tenant" className="mt-3 space-y-3">
              <div className="rounded-xl bg-success/5 border border-success/20 p-3">
                <p className="text-xs font-bold text-foreground">Fund verified rent requests</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Earn monthly returns from tenant repayments</p>
              </div>
              <Button
                onClick={() => { hapticTap(); setShowFundDialog(true); }}
                variant="success"
                className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
              >
                <Home className="h-4 w-4" /> Support Tenant
              </Button>
            </TabsContent>

            <TabsContent value="angel" className="mt-3 space-y-3">
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-bold text-foreground">Own shares in Welile's future</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Early-stage equity — up to {POOL_PERCENT}% pool</p>
              </div>
              <AmountInput amount={angelAmount} onAmountChange={handleAngelAmountChange}
                onSliderChange={setAngelAmount} walletBalance={walletBalance} formatAmountCompact={formatAmountCompact}
                exceedsBalance={walletBalance > 0 && angelAmount > walletBalance} />
              <AngelPreview amount={angelAmount} formatAmountCompact={formatAmountCompact} />
              <Button type="button" onClick={handleAngelInvest}
                disabled={investLoading || angelAmount < PRICE_PER_SHARE || (walletBalance > 0 && angelAmount > walletBalance)}
                className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2">
                <Rocket className="h-4 w-4" /> {investLoading ? 'Processing…' : 'Fund Angel Pool'}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {opportunitySummary && (
        <FundRentDialog
          open={showFundDialog}
          onOpenChange={setShowFundDialog}
          summary={opportunitySummary}
        />
      )}
    </>
  );
}
