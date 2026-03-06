import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { PiggyBank, TrendingUp, Calendar, Repeat, ArrowUpRight, Sparkles, Clock, CircleDollarSign, CalendarCheck, Target } from 'lucide-react';
import { format, formatDistanceToNow, differenceInDays, isPast } from 'date-fns';

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

  const statusConfig = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Active', class: 'bg-success/15 text-success border-success/30', dot: 'bg-success' };
      case 'pending': case 'pending_activation': return { label: 'Pending', class: 'bg-warning/15 text-warning border-warning/30', dot: 'bg-warning' };
      case 'matured': return { label: 'Matured', class: 'bg-primary/15 text-primary border-primary/30', dot: 'bg-primary' };
      default: return { label: status, class: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
    }
  };

  const accentColors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#8b5cf6', '#ea580c', '#0d9488', '#6d28d9', '#be185d', '#4f46e5'];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0">
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="text-lg font-black flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            My Investments
            {!loading && accounts.length > 0 && (
              <span className="text-xs font-bold text-muted-foreground ml-auto">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Aggregate summary */}
        <div className="mx-5 mb-3 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/15 p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <CircleDollarSign className="h-4 w-4 text-primary mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Capital</p>
              <p className="text-sm font-black text-foreground mt-0.5 break-all">{formatAmount(totalInvested)}</p>
            </div>
            <div>
              <ArrowUpRight className="h-4 w-4 text-success mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Earned</p>
              <p className="text-sm font-black text-success mt-0.5 break-all">{formatAmount(totalEarned)}</p>
            </div>
            <div>
              <Target className="h-4 w-4 text-primary mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Expected/mo</p>
              <p className="text-sm font-black text-foreground mt-0.5 break-all">{formatAmount(expectedMonthly)}</p>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(90vh-200px)] px-5 pb-8">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-44 w-full rounded-2xl" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <PiggyBank className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No investment accounts yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Support a tenant to create your first account</p>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account, idx) => {
                const monthlyReturn = Number(account.investment_amount) * (Number(account.roi_percentage) / 100);
                const isCompounding = account.roi_mode === 'compound';
                const color = accentColors[idx % accentColors.length];
                const sc = statusConfig(account.status);
                const nextPayout = account.next_roi_date ? new Date(account.next_roi_date) : null;
                const maturity = account.maturity_date ? new Date(account.maturity_date) : null;
                const daysToNext = nextPayout ? differenceInDays(nextPayout, new Date()) : null;
                const investedDate = new Date(account.created_at);

                return (
                  <div
                    key={account.id}
                    className="rounded-2xl border bg-card overflow-hidden shadow-sm"
                  >
                    {/* Color accent bar + header */}
                    <div className="flex items-center gap-3 p-4 pb-3" style={{ borderLeft: `4px solid ${color}` }}>
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {(idx + 1).toString().padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-foreground">{account.portfolio_code}</p>
                          <Badge variant="outline" className={`text-[9px] font-bold ${sc.class}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} mr-1`} />
                            {sc.label}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Invested {formatDistanceToNow(investedDate, { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    {/* Capital & Expected return */}
                    <div className="px-4 pb-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/50 p-3">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Capital</p>
                        <p className="text-lg font-black text-foreground break-all">{formatAmount(account.investment_amount)}</p>
                      </div>
                      <div className="rounded-xl bg-success/5 border border-success/10 p-3">
                        <p className="text-[10px] text-success font-semibold uppercase tracking-wider mb-0.5">Expected / month</p>
                        <p className="text-lg font-black text-success break-all flex items-center gap-1">
                          <ArrowUpRight className="h-4 w-4 shrink-0" />
                          {formatAmount(monthlyReturn)}
                        </p>
                      </div>
                    </div>

                    {/* Next payout highlight */}
                    {nextPayout && (
                      <div className="mx-4 mb-3 rounded-xl bg-primary/8 border border-primary/15 p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                          <CalendarCheck className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Next Payout</p>
                          <p className="text-sm font-black text-foreground">
                            {format(nextPayout, 'dd MMM yyyy')}
                          </p>
                        </div>
                        {daysToNext !== null && daysToNext >= 0 && (
                          <div className="text-right">
                            <p className="text-lg font-black text-primary">{daysToNext}</p>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase">days</p>
                          </div>
                        )}
                        {daysToNext !== null && daysToNext < 0 && (
                          <Badge className="bg-warning/15 text-warning border-warning/30 text-[9px] font-bold">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        <TrendingUp className="h-3 w-3" />
                        {account.roi_percentage}% ROI
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {isCompounding ? <Repeat className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                        {isCompounding ? 'Compounding' : 'Simple'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {account.duration_months} months
                      </span>
                    </div>

                    {/* Timeline footer */}
                    <div className="bg-muted/30 border-t px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          <div className="w-0.5 h-5 bg-border" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-semibold">Invested on</span>
                          <span className="text-[11px] font-bold text-foreground">
                            {format(investedDate, 'dd MMM yyyy · hh:mm a')}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full bg-success" />
                          <div className="w-0.5 h-5 bg-border" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-semibold">Total earned so far</span>
                          <span className="text-[11px] font-black text-success">
                            {formatAmount(account.total_roi_earned)}
                          </span>
                        </div>
                      </div>

                      {maturity && (
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`h-2 w-2 rounded-full ${isPast(maturity) ? 'bg-warning' : 'bg-muted-foreground/40'}`} />
                          </div>
                          <div className="flex-1 flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              {isPast(maturity) ? 'Matured on' : 'Matures on'}
                            </span>
                            <span className="text-[11px] font-bold text-foreground">
                              {format(maturity, 'dd MMM yyyy')}
                            </span>
                          </div>
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
