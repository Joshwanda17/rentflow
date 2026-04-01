import { useState } from 'react';
import {
  TrendingUp, Shield, Zap, Users, BadgeCheck, Rocket,
  Home, Wallet, ChevronLeft, ArrowUpRight, Coins,
  BarChart3, Lock, Clock, PieChart, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCurrency } from '@/hooks/useCurrency';
import { useWallet } from '@/hooks/useWallet';
import { TOTAL_SHARES, PRICE_PER_SHARE, POOL_PERCENT, VALUATIONS, UGX_PER_USD } from './constants';
import { hapticTap } from '@/lib/haptics';
import { toast } from 'sonner';

type PoolType = 'tenant' | 'angel';

// ─── Shared Amount Input ───
function AmountInput({
  amount,
  onAmountChange,
  onSliderChange,
  walletBalance,
  formatAmountCompact,
  exceedsBalance,
}: {
  amount: number;
  onAmountChange: (val: string) => void;
  onSliderChange: (val: number) => void;
  walletBalance: number;
  formatAmountCompact: (n: number) => string;
  exceedsBalance: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-muted/40 px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Wallet Balance
        </span>
        <span className="text-sm font-black text-foreground">
          {formatAmountCompact(walletBalance)}
        </span>
      </div>
      <label className="text-xs text-muted-foreground font-semibold block">Amount (UGX)</label>
      <Input
        type="text"
        inputMode="numeric"
        value={amount > 0 ? amount.toLocaleString() : ''}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder={`Min ${PRICE_PER_SHARE.toLocaleString()}`}
        className="text-lg font-bold h-12"
      />
      <Slider
        value={[amount]}
        onValueChange={([v]) => onSliderChange(v)}
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
  );
}

// ─── Tenant Preview ───
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
          <span className="text-muted-foreground">Deploy Speed</span>
          <span className="font-bold">24–72hrs</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Payout</span>
          <span className="font-bold">Monthly</span>
        </div>
      </div>
    </div>
  );
}

// ─── Angel Preview ───
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
          <div className="rounded-lg bg-primary/5 p-2 text-center">
            <p className="text-lg font-black text-primary">{shares}</p>
            <p className="text-[9px] text-muted-foreground font-medium">Shares</p>
          </div>
          <div className="rounded-lg bg-primary/5 p-2 text-center">
            <p className="text-lg font-black text-primary">{poolPct.toFixed(2)}%</p>
            <p className="text-[9px] text-muted-foreground font-medium">Pool %</p>
          </div>
          <div className="rounded-lg bg-primary/5 p-2 text-center">
            <p className="text-lg font-black text-primary">{companyPct.toFixed(4)}%</p>
            <p className="text-[9px] text-muted-foreground font-medium">Company %</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Future Value Estimates
          </p>
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
          <span className="text-muted-foreground">Horizon</span>
          <span className="font-bold">Long-term</span>
        </div>
      </div>
    </div>
  );
}

export function CapitalOpportunityEntry() {
  const { formatAmountCompact } = useCurrency();
  const { wallet } = useWallet();
  const walletBalance = wallet?.balance ?? 0;

  const [activeTab, setActiveTab] = useState<PoolType>('tenant');
  const [tenantAmount, setTenantAmount] = useState(0);
  const [angelAmount, setAngelAmount] = useState(0);

  const handleAmountChange = (pool: PoolType, val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
    const max = walletBalance > 0 ? walletBalance : 500_000_000;
    const value = !isNaN(num) ? Math.min(num, max) : 0;
    pool === 'tenant' ? setTenantAmount(value) : setAngelAmount(value);
  };

  const amount = activeTab === 'tenant' ? tenantAmount : angelAmount;
  const isValidAmount = amount >= PRICE_PER_SHARE;
  const exceedsBalance = walletBalance > 0 && amount > walletBalance;

  const handleInvest = (pool: PoolType) => {
    const amt = pool === 'tenant' ? tenantAmount : angelAmount;
    if (amt < PRICE_PER_SHARE) return;
    if (walletBalance > 0 && amt > walletBalance) return;

    hapticTap();
    toast.success(
      pool === 'tenant'
        ? `Tenant support of ${formatAmountCompact(amt)} committed (mock).`
        : `Angel pool investment of ${formatAmountCompact(amt)} committed (mock).`
    );
    pool === 'tenant' ? setTenantAmount(0) : setAngelAmount(0);
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-primary/10">
          <TrendingUp className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-foreground text-sm tracking-tight">Grow Your Capital</h3>
          <p className="text-[10px] text-muted-foreground font-medium leading-tight">
            Choose an investment pool below
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pb-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => { hapticTap(); setActiveTab(v as PoolType); }}
          className="w-full"
        >
          <TabsList className="w-full grid grid-cols-2 h-11 rounded-xl">
            <TabsTrigger value="tenant" className="rounded-lg text-xs font-bold gap-1.5">
              <Home className="h-3.5 w-3.5" /> Tenant Support
            </TabsTrigger>
            <TabsTrigger value="angel" className="rounded-lg text-xs font-bold gap-1.5">
              <Rocket className="h-3.5 w-3.5" /> Angel Pool
            </TabsTrigger>
          </TabsList>

          {/* ─── TENANT SUPPORT TAB ─── */}
          <TabsContent value="tenant" className="mt-3 space-y-3">
            {/* Info banner */}
            <div className="rounded-xl bg-success/5 border border-success/20 p-3">
              <p className="text-xs font-bold text-foreground">Fund verified rent requests</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Earn monthly returns from tenant repayments</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground font-medium">
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /> Up to 15%/mo</span>
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> 24–72hr deploy</span>
                <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Verified & insured</span>
              </div>
            </div>

            <AmountInput
              amount={tenantAmount}
              onAmountChange={(val) => handleAmountChange('tenant', val)}
              onSliderChange={setTenantAmount}
              walletBalance={walletBalance}
              formatAmountCompact={formatAmountCompact}
              exceedsBalance={walletBalance > 0 && tenantAmount > walletBalance}
            />

            <TenantPreview amount={tenantAmount} formatAmountCompact={formatAmountCompact} />

            <Button
              type="button"
              variant="success"
              onClick={() => handleInvest('tenant')}
              disabled={tenantAmount < PRICE_PER_SHARE || (walletBalance > 0 && tenantAmount > walletBalance)}
              className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
            >
              <Home className="h-4 w-4" /> Support Tenant
            </Button>

            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Capital Protected</span>
              <span>•</span>
              <span>Min: {formatAmountCompact(PRICE_PER_SHARE)}</span>
            </div>
          </TabsContent>

          {/* ─── ANGEL POOL TAB ─── */}
          <TabsContent value="angel" className="mt-3 space-y-3">
            {/* Info banner */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
              <p className="text-xs font-bold text-foreground">Own shares in Welile's future</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Early-stage equity — up to {POOL_PERCENT}% pool</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground font-medium">
                <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3 text-primary" /> Up to {POOL_PERCENT}% equity</span>
                <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Long-term</span>
                <span className="flex items-center gap-1"><Rocket className="h-3 w-3" /> Early-stage</span>
              </div>
            </div>

            <AmountInput
              amount={angelAmount}
              onAmountChange={(val) => handleAmountChange('angel', val)}
              onSliderChange={setAngelAmount}
              walletBalance={walletBalance}
              formatAmountCompact={formatAmountCompact}
              exceedsBalance={walletBalance > 0 && angelAmount > walletBalance}
            />

            <AngelPreview amount={angelAmount} formatAmountCompact={formatAmountCompact} />

            <Button
              type="button"
              onClick={() => handleInvest('angel')}
              disabled={angelAmount < PRICE_PER_SHARE || (walletBalance > 0 && angelAmount > walletBalance)}
              className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
            >
              <Rocket className="h-4 w-4" /> Invest in Angel Pool
            </Button>

            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Capital Protected</span>
              <span>•</span>
              <span>Min: {formatAmountCompact(PRICE_PER_SHARE)}</span>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
