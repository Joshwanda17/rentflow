import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { PiggyBank, TrendingUp, Calendar, Repeat, ArrowUpRight, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

interface InvestmentBreakdownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PortfolioAccount {
  id: string;
  portfolio_code: string;
  investment_amount: number;
  roi_percentage: number;
  roi_mode: string;
  total_roi_earned: number;
  status: string;
  created_at: string;
  duration_months: number;
  next_roi_date: string | null;
  maturity_date: string | null;
}

export function InvestmentBreakdownSheet({ open, onOpenChange }: InvestmentBreakdownSheetProps) {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && user) {
      fetchAccounts();
    }
  }, [open, user]);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('investor_portfolios')
        .select('id, portfolio_code, investment_amount, roi_percentage, roi_mode, total_roi_earned, status, created_at, duration_months, next_roi_date, maturity_date')
        .eq('investor_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAccounts(data);
      }
    } catch (e) {
      console.error('[InvestmentBreakdown] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const totalInvested = accounts.reduce((s, a) => s + Number(a.investment_amount), 0);
  const totalEarned = accounts.reduce((s, a) => s + Number(a.total_roi_earned), 0);
  const expectedMonthly = accounts.reduce((s, a) => s + Number(a.investment_amount) * (Number(a.roi_percentage) / 100), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success/15 text-success border-success/30';
      case 'pending': case 'pending_activation': return 'bg-warning/15 text-warning border-warning/30';
      case 'matured': return 'bg-primary/15 text-primary border-primary/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-lg font-black flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            Investment Accounts
          </SheetTitle>
        </SheetHeader>

        {/* Summary strip */}
        <div className="mx-5 mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-primary/10 p-3 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invested</p>
            <p className="text-sm font-black text-foreground mt-0.5">{formatAmount(totalInvested)}</p>
          </div>
          <div className="rounded-2xl bg-success/10 p-3 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earned</p>
            <p className="text-sm font-black text-success mt-0.5">{formatAmount(totalEarned)}</p>
          </div>
          <div className="rounded-2xl bg-accent p-3 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly</p>
            <p className="text-sm font-black text-foreground mt-0.5">{formatAmount(expectedMonthly)}</p>
          </div>
        </div>

        <ScrollArea className="h-[calc(85vh-180px)] px-5 pb-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <PiggyBank className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No investment accounts yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Support a tenant to create your first account</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account, idx) => {
                const monthlyReturn = Number(account.investment_amount) * (Number(account.roi_percentage) / 100);
                const isCompounding = account.roi_mode === 'compound';

                return (
                  <div
                    key={account.id}
                    className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center text-primary-foreground font-black text-sm"
                          style={{ backgroundColor: ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#8b5cf6'][idx % 6] }}
                        >
                          {(idx + 1).toString().padStart(2, '0')}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground leading-tight">{account.portfolio_code}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(account.created_at), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] font-bold ${statusColor(account.status)}`}>
                        {account.status === 'active' ? 'Active' : account.status === 'pending_activation' ? 'Pending' : account.status}
                      </Badge>
                    </div>

                    {/* Amount & ROI */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Capital</p>
                        <p className="text-base font-black text-foreground">{formatAmount(account.investment_amount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Monthly Return</p>
                        <p className="text-base font-black text-success flex items-center gap-1">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          {formatAmount(monthlyReturn)}
                        </p>
                      </div>
                    </div>

                    {/* Tags row */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        <TrendingUp className="h-3 w-3" />
                        {account.roi_percentage}% ROI
                      </span>
                      {isCompounding && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-600">
                          <Repeat className="h-3 w-3" />
                          Compounding
                        </span>
                      )}
                      {!isCompounding && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                          <Sparkles className="h-3 w-3" />
                          Simple
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {account.duration_months}mo
                      </span>
                    </div>

                    {/* Earned & Next payout */}
                    <div className="flex items-center justify-between pt-1 border-t">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground font-semibold">Earned:</span>
                        <span className="text-xs font-black text-success">{formatAmount(account.total_roi_earned)}</span>
                      </div>
                      {account.next_roi_date && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-semibold">Next payout:</span>
                          <span className="text-xs font-bold text-foreground">
                            {format(new Date(account.next_roi_date), 'dd MMM')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
