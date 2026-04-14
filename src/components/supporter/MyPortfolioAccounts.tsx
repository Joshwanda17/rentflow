import { useState } from 'react';
import { useCapitalOpportunities, PortfolioRecord } from '@/hooks/useCapitalOpportunities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, PiggyBank, TrendingUp, Briefcase, Wallet, Sparkles, ArrowDownToLine, ChevronRight, ArrowUpRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { useMyAngelShares } from '@/hooks/useMyAngelShares';
import { useCurrency } from '@/hooks/useCurrency';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline'; dot: string }> = {
  active: { label: 'Active', variant: 'default', dot: 'bg-success animate-pulse' },
  pending: { label: 'Pending', variant: 'secondary', dot: 'bg-warning' },
  pending_approval: { label: 'Awaiting Approval', variant: 'outline', dot: 'bg-warning' },
};

function PortfolioRow({ p, onTap }: { p: PortfolioRecord; onTap: () => void }) {
  const roi = (Number(p.investment_amount) * Number(p.roi_percentage)) / 100;
  const cfg = statusConfig[p.status] || { label: p.status, variant: 'outline' as const, dot: 'bg-muted-foreground/40' };

  return (
    <button
      onClick={() => { hapticTap(); onTap(); }}
      className="w-full text-left active:scale-[0.98] transition-transform"
    >
      <Card className="p-3 flex items-center gap-3 border-border/60 hover:bg-accent/30 transition-colors">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <PiggyBank className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold truncate">{formatUGX(Number(p.investment_amount))}</span>
            <Badge variant={cfg.variant} className="text-[10px] shrink-0">{cfg.label}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-success" />
              {p.roi_percentage}% → {formatUGX(roi)}/mo
            </span>
          </div>
          {Number(p.total_roi_earned) > 0 && (
            <p className="text-[10px] text-success mt-0.5">
              Earned: {formatUGX(Number(p.total_roi_earned))}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </Card>
    </button>
  );
}

function PortfolioDetailSheet({ portfolio, open, onOpenChange }: { portfolio: PortfolioRecord | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!portfolio) return null;
  const amount = Number(portfolio.investment_amount);
  const roiPct = Number(portfolio.roi_percentage);
  const monthlyReturn = (amount * roiPct) / 100;
  const totalEarned = Number(portfolio.total_roi_earned);
  const totalValue = amount + totalEarned;
  const cfg = statusConfig[portfolio.status] || { label: portfolio.status, variant: 'outline' as const, dot: 'bg-muted-foreground/40' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-lg">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold">Investment Account</span>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-3">
          {/* Total Value */}
          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Value</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black">{formatUGX(totalValue)}</p>
              {totalEarned > 0 && (
                <span className="flex items-center gap-0.5 text-sm font-bold text-success">
                  <ArrowUpRight className="h-4 w-4" />
                  +{formatUGX(totalEarned)}
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/50 border border-border/60">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Invested</p>
              <p className="font-bold text-lg">{formatUGX(amount)}</p>
            </div>
            <div className="p-4 rounded-xl bg-success/10 border border-success/20">
              <p className="text-[10px] uppercase tracking-wider text-success/80 font-semibold mb-1">Monthly Return</p>
              <p className="font-bold text-lg text-success">{formatUGX(monthlyReturn)}</p>
            </div>
          </div>

          {/* ROI Rate */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">ROI Rate</span>
            <span className="text-sm font-black text-primary">{roiPct}% / month</span>
          </div>

          {/* Actions */}
          {portfolio.status === 'active' && (
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-deposit'));
                  onOpenChange(false);
                }}
                className="flex-1 h-11 font-semibold gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Top Up
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 font-semibold gap-2 border-primary/30"
                disabled
              >
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw
              </Button>
            </div>
          )}

          {/* How compound works hint */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Your capital earns <strong className="text-foreground">{roiPct}% monthly</strong>. Returns are credited automatically. You can top up anytime to grow your portfolio.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MyPortfolioAccounts() {
  const { portfolios, totalInvested, loading } = useCapitalOpportunities();
  const { hasShares, totalShares, companyOwnershipPct, totalInvested: angelInvested } = useMyAngelShares();
  const { formatAmount } = useCurrency();
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (portfolios.length === 0 && !hasShares) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-1 h-5 rounded-full bg-primary" />
        <h2 className="text-sm font-black text-foreground tracking-tight">My Investment Accounts</h2>
        <Badge variant="secondary" className="text-[10px] ml-auto">{portfolios.length + (hasShares ? 1 : 0)}</Badge>
      </div>

      <div className="space-y-2">
        {portfolios.map(p => (
          <PortfolioRow
            key={p.id}
            p={p}
            onTap={() => {
              setSelectedPortfolio(p);
              setShowDetail(true);
            }}
          />
        ))}

        {/* Angel Pool Shares row */}
        {hasShares && (
          <Card className="p-3 flex items-center gap-3 border-border/60 bg-[hsl(270,60%,97%)] dark:bg-[hsl(270,30%,15%)]">
            <div className="w-9 h-9 rounded-xl bg-[hsl(270,70%,50%)]/15 flex items-center justify-center shrink-0">
              <Briefcase className="h-4 w-4 text-[hsl(270,70%,50%)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold truncate">Angel Pool Shares</span>
                <Badge className="text-[10px] shrink-0 bg-[hsl(270,70%,50%)] text-white border-0">
                  {totalShares} shares
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px] text-muted-foreground">
                  Invested: {formatAmount(angelInvested)}
                </span>
                <span className="text-[11px] text-[hsl(270,70%,50%)] font-semibold">
                  {companyOwnershipPct.toFixed(4)}% equity
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>

      <PortfolioDetailSheet
        portfolio={selectedPortfolio}
        open={showDetail}
        onOpenChange={setShowDetail}
      />
    </div>
  );
}
