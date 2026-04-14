import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCapitalOpportunities, PortfolioRecord } from '@/hooks/useCapitalOpportunities';
import { useMyAngelShares } from '@/hooks/useMyAngelShares';
import { useCurrency } from '@/hooks/useCurrency';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, PiggyBank, TrendingUp, Briefcase, Wallet, Sparkles,
  ArrowDownToLine, ChevronRight, ArrowUpRight, RefreshCw, Calendar, Clock, Hash
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDateOnlyForDisplay } from '@/lib/portfolioDates';
import { hapticTap } from '@/lib/haptics';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'muted'; dot: string }> = {
  active: { label: 'Active', variant: 'success', dot: 'bg-success animate-pulse' },
  pending: { label: 'Pending', variant: 'warning', dot: 'bg-warning' },
  pending_approval: { label: 'Awaiting Approval', variant: 'warning', dot: 'bg-warning' },
  matured: { label: 'Matured', variant: 'default', dot: 'bg-primary' },
  withdrawn: { label: 'Withdrawn', variant: 'muted', dot: 'bg-muted-foreground/40' },
};

function PortfolioRow({ p, onTap }: { p: PortfolioRecord; onTap: () => void }) {
  const roi = (Number(p.investment_amount) * Number(p.roi_percentage)) / 100;
  const cfg = statusConfig[p.status] || { label: p.status, variant: 'outline' as const, dot: 'bg-muted-foreground/40' };
  const name = p.account_name || p.portfolio_code || 'Investment Account';

  return (
    <button
      onClick={() => { hapticTap(); onTap(); }}
      className="w-full text-left active:scale-[0.98] transition-transform"
    >
      <Card className="p-3.5 flex items-center gap-3 border-border/60 hover:bg-accent/30 transition-colors">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <PiggyBank className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold truncate">{name}</span>
            <Badge variant={cfg.variant} size="sm" className="shrink-0">{cfg.label}</Badge>
          </div>
          {p.portfolio_code && (
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 flex items-center gap-1">
              <Hash className="h-2.5 w-2.5" />{p.portfolio_code}
            </p>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-semibold">{formatUGX(Number(p.investment_amount))}</span>
            <span className="text-[11px] text-success font-semibold flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
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

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-xs font-bold text-foreground">{value}</span>
    </div>
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
  const name = portfolio.account_name || portfolio.portfolio_code || 'Investment Account';
  const isActive = portfolio.status === 'active';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-lg">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <span className="text-base font-black block truncate">{name}</span>
              <div className="flex items-center gap-2 mt-0.5">
                {portfolio.portfolio_code && (
                  <span className="text-[10px] font-mono text-muted-foreground">{portfolio.portfolio_code}</span>
                )}
                <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          {/* Total Value Hero */}
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

          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/50 border border-border/60">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Principal</p>
              <p className="font-bold text-lg">{formatUGX(amount)}</p>
            </div>
            <div className="p-4 rounded-xl bg-success/10 border border-success/20">
              <p className="text-[10px] uppercase tracking-wider text-success/80 font-semibold mb-1">Monthly Return</p>
              <p className="font-bold text-lg text-success">{formatUGX(monthlyReturn)}</p>
            </div>
          </div>

          {/* Detail Rows */}
          <div className="rounded-xl border border-border/60 px-3.5">
            <DetailRow label="ROI Rate" value={`${roiPct}% / month`} icon={TrendingUp} />
            <DetailRow label="Total ROI Earned" value={formatUGX(totalEarned)} icon={Wallet} />
            {portfolio.roi_mode && (
              <DetailRow label="ROI Mode" value={portfolio.roi_mode} icon={RefreshCw} />
            )}
            {portfolio.duration_months && (
              <DetailRow label="Duration" value={`${portfolio.duration_months} months`} icon={Clock} />
            )}
            {portfolio.maturity_date && (
              <DetailRow label="Maturity Date" value={formatDateOnlyForDisplay(portfolio.maturity_date)} icon={Calendar} />
            )}
            {portfolio.next_roi_date && (
              <DetailRow label="Next ROI Date" value={formatDateOnlyForDisplay(portfolio.next_roi_date)} icon={Calendar} />
            )}
            {portfolio.funded_at && (
              <DetailRow label="Funded" value={formatDateOnlyForDisplay(portfolio.funded_at)} icon={Calendar} />
            )}
            <DetailRow
              label="Auto-Reinvest"
              value={portfolio.auto_reinvest ? 'Enabled' : 'Disabled'}
              icon={RefreshCw}
            />
          </div>

          {/* Action Buttons */}
          {isActive && (
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
                variant="soft"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-compound', { detail: { portfolioId: portfolio.id } }));
                  onOpenChange(false);
                }}
                className="flex-1 h-11 font-semibold gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Compound
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-withdrawal', {
                    detail: { portfolioId: portfolio.id, portfolioCode: portfolio.portfolio_code }
                  }));
                  onOpenChange(false);
                }}
                className="flex-1 h-11 font-semibold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw
              </Button>
            </div>
          )}

          {/* Info Hint */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Your capital earns <strong className="text-foreground">{roiPct}% monthly</strong>. Returns are credited automatically each cycle. Top up anytime to grow your portfolio.
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
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <span className="text-base font-black">My Investments</span>
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-4 pt-3 shrink-0">
              <TabsList className="w-full grid grid-cols-2 h-10">
                <TabsTrigger value="accounts" className="text-xs font-bold" type="button">
                  Support Accounts
                </TabsTrigger>
                <TabsTrigger value="angel" className="text-xs font-bold" type="button">
                  Angel Shares
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 pb-6 pt-3">
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
                      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Deployed</p>
                        <p className="text-2xl font-black">{formatUGX(totalInvested)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{portfolios.length} account{portfolios.length !== 1 ? 's' : ''}</p>
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
                      <div className="p-4 rounded-2xl bg-[hsl(270,60%,97%)] dark:bg-[hsl(270,30%,15%)] border border-[hsl(270,70%,50%)]/20">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Angel Investment</p>
                        <p className="text-2xl font-black">{formatAmount(angelInvested)}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-[hsl(270,70%,50%)] font-semibold">{totalShares} shares</span>
                          <span className="text-[11px] text-muted-foreground">{companyOwnershipPct.toFixed(4)}% equity</span>
                          <span className="text-[11px] text-muted-foreground">{poolOwnershipPct.toFixed(2)}% pool</span>
                        </div>
                      </div>

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
              </div>
            </ScrollArea>
          </Tabs>
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
