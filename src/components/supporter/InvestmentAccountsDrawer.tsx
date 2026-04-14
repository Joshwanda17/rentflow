import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCapitalOpportunities, PortfolioRecord } from '@/hooks/useCapitalOpportunities';
import { useMyAngelShares } from '@/hooks/useMyAngelShares';
import { useCurrency } from '@/hooks/useCurrency';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, PiggyBank, TrendingUp, Briefcase, Wallet, Sparkles, ArrowDownToLine, ChevronRight, ArrowUpRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-lg">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Investment Account</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-3">
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

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">ROI Rate</span>
            <span className="text-sm font-black text-primary">{roiPct}% / month</span>
          </div>

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
              <Button variant="outline" className="flex-1 h-11 font-semibold gap-2 border-primary/30" disabled>
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw
              </Button>
            </div>
          )}

          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Your capital earns <strong className="text-foreground">{roiPct}% monthly</strong>. Returns are credited automatically. Top up anytime to grow your portfolio.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface InvestmentAccountsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'accounts' | 'angel';
}

export function InvestmentAccountsDrawer({ open, onOpenChange, defaultTab = 'accounts' }: InvestmentAccountsDrawerProps) {
  const { portfolios, totalInvested, loading } = useCapitalOpportunities();
  const { hasShares, totalShares, companyOwnershipPct, totalInvested: angelInvested, poolOwnershipPct, records, valuations } = useMyAngelShares();
  const { formatAmount } = useCurrency();
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <span className="text-base font-black">My Investments</span>
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <Tabs defaultValue={defaultTab} className="space-y-4">
              <TabsList className="w-full grid grid-cols-2 h-10">
                <TabsTrigger value="accounts" className="text-xs font-bold" type="button">
                  Support Accounts
                </TabsTrigger>
                <TabsTrigger value="angel" className="text-xs font-bold" type="button">
                  Angel Shares
                </TabsTrigger>
              </TabsList>

              {/* Support Accounts Tab */}
              <TabsContent value="accounts" className="space-y-3 mt-0">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : portfolios.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
                      <PiggyBank className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-semibold">No investment accounts yet</p>
                    <p className="text-xs text-muted-foreground">Fund an opportunity to create your first account</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Deployed</p>
                      <p className="text-2xl font-black">{formatUGX(totalInvested)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{portfolios.length} active account{portfolios.length !== 1 ? 's' : ''}</p>
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
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Angel Shares Tab */}
              <TabsContent value="angel" className="space-y-3 mt-0">
                {!hasShares ? (
                  <div className="py-10 text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-[hsl(270,70%,50%)]/10 flex items-center justify-center mx-auto">
                      <Briefcase className="h-6 w-6 text-[hsl(270,70%,50%)]/50" />
                    </div>
                    <p className="text-sm font-semibold">No angel shares yet</p>
                    <p className="text-xs text-muted-foreground">Invest in the angel pool to own company equity</p>
                  </div>
                ) : (
                  <>
                    {/* Angel summary */}
                    <div className="p-4 rounded-2xl bg-[hsl(270,60%,97%)] dark:bg-[hsl(270,30%,15%)] border border-[hsl(270,70%,50%)]/20">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Angel Investment</p>
                      <p className="text-2xl font-black">{formatAmount(angelInvested)}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-[hsl(270,70%,50%)] font-semibold">{totalShares} shares</span>
                        <span className="text-[11px] text-muted-foreground">{companyOwnershipPct.toFixed(4)}% equity</span>
                        <span className="text-[11px] text-muted-foreground">{poolOwnershipPct.toFixed(2)}% pool</span>
                      </div>
                    </div>

                    {/* Valuations */}
                    {valuations.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Your Share Value At</p>
                        {valuations.map(v => (
                          <Card key={v.label} className="p-3 border-border/60">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">{v.label}</p>
                                <p className="text-[10px] text-muted-foreground/60">Company: ${(v.value / 1_000_000).toFixed(1)}M</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-[hsl(270,70%,50%)]">${v.myValue.toFixed(2)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatUGX(v.myValueUGX)}</p>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Investment records */}
                    {records.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Transaction History</p>
                        {records.map(r => (
                          <Card key={r.id} className="p-3 border-border/60">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-bold">{r.shares} shares</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold">{formatAmount(r.amount)}</p>
                                <Badge
                                  variant={r.status === 'confirmed' ? 'default' : 'secondary'}
                                  className="text-[9px]"
                                >
                                  {r.status}
                                </Badge>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <PortfolioDetailSheet
        portfolio={selectedPortfolio}
        open={showDetail}
        onOpenChange={setShowDetail}
      />
    </>
  );
}
