import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { PiggyBank, TrendingUp, Calendar, Repeat, ArrowUpRight, Sparkles, CalendarCheck, CircleDollarSign, Target } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format, formatDistanceToNow, differenceInDays, isPast, addDays } from 'date-fns';

interface InvestmentBreakdownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InvestmentEntry {
  id: string; code: string; amount: number; roi_percentage: number;
  roi_mode: string; total_earned: number; status: string; invested_at: string;
  duration_months: number; next_roi_date: string | null; maturity_date: string | null;
  payout_day: number | null; source: 'portfolio' | 'ledger';
}

export function InvestmentBreakdownSheet({ open, onOpenChange }: InvestmentBreakdownSheetProps) {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (open && user) fetchAll(); }, [open, user]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: byInvestor, error: e1 }, { data: byAgent, error: e2 }] = await Promise.all([
        supabase.from('investor_portfolios')
          .select('id, portfolio_code, investment_amount, roi_percentage, roi_mode, total_roi_earned, status, created_at, duration_months, next_roi_date, maturity_date, payout_day')
          .eq('investor_id', user.id).neq('status', 'cancelled').order('created_at', { ascending: false }),
        supabase.from('investor_portfolios')
          .select('id, portfolio_code, investment_amount, roi_percentage, roi_mode, total_roi_earned, status, created_at, duration_months, next_roi_date, maturity_date, payout_day')
          .eq('agent_id', user.id).neq('status', 'cancelled').order('created_at', { ascending: false }),
      ]);
      if (e1 || e2) { console.error(e1 || e2); setEntries([]); return; }
      const seen = new Set<string>();
      const result: InvestmentEntry[] = [];
      for (const p of [...(byInvestor || []), ...(byAgent || [])]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        result.push({
          id: p.id, code: p.portfolio_code, amount: Number(p.investment_amount),
          roi_percentage: Number(p.roi_percentage), roi_mode: p.roi_mode,
          total_earned: Number(p.total_roi_earned), status: p.status,
          invested_at: p.created_at, duration_months: p.duration_months,
          next_roi_date: p.next_roi_date, maturity_date: p.maturity_date,
          payout_day: (p as any).payout_day ?? null, source: 'portfolio',
        });
      }
      setEntries(result);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const totalInvested = entries.reduce((s, a) => s + a.amount, 0);
  const totalEarned = entries.reduce((s, a) => s + a.total_earned, 0);
  const expectedMonthly = entries.reduce((s, a) => s + a.amount * (a.roi_percentage / 100), 0);

  const statusConfig = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Active', cls: 'bg-success/10 text-success border-success/20', dot: 'bg-success' };
      case 'pending': case 'pending_activation': return { label: 'Pending', cls: 'bg-warning/10 text-warning border-warning/20', dot: 'bg-warning' };
      case 'matured': return { label: 'Matured', cls: 'bg-primary/10 text-primary border-primary/20', dot: 'bg-primary' };
      default: return { label: status, cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
    }
  };

  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#8b5cf6', '#ea580c'];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <SheetTitle className="text-base font-bold flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-primary" />
            My Support Accounts
            {!loading && entries.length > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground ml-auto">{entries.length}</span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Summary */}
        <div className="mx-5 my-3 rounded-xl border border-border/40 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <CircleDollarSign className="h-3.5 w-3.5 text-primary mx-auto mb-1 opacity-60" />
              <p className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-medium">Capital</p>
              <p className="text-[clamp(0.6rem,2.6vw,0.75rem)] font-extrabold text-foreground mt-0.5 truncate">{formatAmount(totalInvested)}</p>
            </div>
            <div>
              <ArrowUpRight className="h-3.5 w-3.5 text-success mx-auto mb-1 opacity-60" />
              <p className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-medium">Earned</p>
              <p className="text-[clamp(0.6rem,2.6vw,0.75rem)] font-extrabold text-success mt-0.5 truncate">{formatAmount(totalEarned)}</p>
            </div>
            <div>
              <Target className="h-3.5 w-3.5 text-primary mx-auto mb-1 opacity-60" />
              <p className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-medium">Monthly</p>
              <p className="text-[clamp(0.6rem,2.6vw,0.75rem)] font-extrabold text-foreground mt-0.5 truncate">{formatAmount(expectedMonthly)}</p>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(90vh-180px)] px-5 pb-8">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <PiggyBank className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No accounts yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Support a tenant to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, idx) => {
                const monthlyReturn = entry.amount * (entry.roi_percentage / 100);
                const isCompounding = entry.roi_mode === 'compound' || entry.roi_mode === 'monthly_compounding';
                const color = colors[idx % colors.length];
                const sc = statusConfig(entry.status);

                const now = new Date();
                const investedDate = new Date(entry.invested_at);
                let nextPayout: Date;
                if (entry.payout_day) {
                  nextPayout = new Date(now.getFullYear(), now.getMonth(), entry.payout_day);
                  if (nextPayout <= now) nextPayout = new Date(now.getFullYear(), now.getMonth() + 1, entry.payout_day);
                } else {
                  const THIRTY = 30 * 24 * 60 * 60 * 1000;
                  const cycles = Math.floor((now.getTime() - investedDate.getTime()) / THIRTY);
                  nextPayout = new Date(investedDate.getTime() + (cycles + 1) * THIRTY);
                }
                const maturity = entry.maturity_date ? new Date(entry.maturity_date) : null;
                const daysToNext = differenceInDays(nextPayout, now);

                const projectionRows: { month: number; date: Date; opening: number; earned: number; closing: number }[] = [];
                if (isCompounding) {
                  let bal = entry.amount;
                  for (let m = 1; m <= entry.duration_months; m++) {
                    const earned = bal * (entry.roi_percentage / 100);
                    const payoutDate = entry.payout_day
                      ? new Date(investedDate.getFullYear(), investedDate.getMonth() + m, entry.payout_day)
                      : addDays(investedDate, m * 30);
                    projectionRows.push({ month: m, date: payoutDate, opening: bal, earned, closing: bal + earned });
                    bal += earned;
                  }
                }
                const finalValue = projectionRows.length > 0 ? projectionRows[projectionRows.length - 1].closing : 0;
                const growthPct = entry.amount > 0 ? ((finalValue - entry.amount) / entry.amount * 100) : 0;

                return (
                  <div key={entry.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-3 p-3.5 pb-2.5">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-[11px] font-extrabold shrink-0"
                        style={{ backgroundColor: color }}>
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-bold text-foreground truncate">{entry.code}</p>
                          <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${sc.cls}`}>
                            <span className={`h-1 w-1 rounded-full ${sc.dot} mr-0.5`} />{sc.label}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(investedDate, { addSuffix: true })}</p>
                      </div>
                    </div>

                    {/* Capital + Return */}
                    <div className="px-3.5 pb-2.5 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <p className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-medium mb-0.5">Capital</p>
                        <p className="text-[clamp(0.7rem,3vw,0.85rem)] font-extrabold text-foreground leading-tight truncate">{formatAmount(entry.amount)}</p>
                      </div>
                      <div className="rounded-lg bg-success/5 border border-success/10 p-2.5">
                        <p className="text-[8px] text-success uppercase tracking-[0.1em] font-medium mb-0.5">
                          {isCompounding ? 'Month 1' : 'Per Month'}
                        </p>
                        <p className="text-[clamp(0.7rem,3vw,0.85rem)] font-extrabold text-success leading-tight truncate flex items-center gap-0.5">
                          <ArrowUpRight className="h-3 w-3 shrink-0" />{formatAmount(monthlyReturn)}
                        </p>
                        {isCompounding && <p className="text-[7px] text-muted-foreground mt-0.5">Grows monthly</p>}
                      </div>
                    </div>

                    {/* Next Payout */}
                    <div className="mx-3.5 mb-2.5 rounded-lg bg-primary/5 border border-primary/10 p-2.5 flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <CalendarCheck className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-medium">Next Payout</p>
                        <p className="text-[12px] font-bold text-foreground">{format(nextPayout, 'dd MMM yyyy')}</p>
                      </div>
                      {daysToNext >= 0 ? (
                        <div className="text-right shrink-0">
                          <p className="text-base font-extrabold text-primary leading-none">{daysToNext}</p>
                          <p className="text-[7px] text-muted-foreground font-medium uppercase">days</p>
                        </div>
                      ) : (
                        <Badge className="bg-warning/10 text-warning border-warning/20 text-[8px] shrink-0">Overdue</Badge>
                      )}
                    </div>

                    {/* Compound Projection */}
                    {isCompounding && projectionRows.length > 0 && (
                      <div className="mx-3.5 mb-2.5">
                        <Accordion type="single" collapsible>
                          <AccordionItem value="proj" className="border rounded-lg overflow-hidden bg-success/5 border-success/10">
                            <AccordionTrigger className="px-2.5 py-2 hover:no-underline">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Repeat className="h-3.5 w-3.5 text-success shrink-0" />
                                <div className="text-left min-w-0">
                                  <p className="text-[10px] font-bold text-foreground">Growth Projection</p>
                                  <p className="text-[8px] text-muted-foreground truncate">
                                    {formatAmount(entry.amount)} → {formatAmount(finalValue)} · +{growthPct.toFixed(0)}%
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="px-2.5 pb-2.5 space-y-1.5">
                                <div className="grid grid-cols-2 gap-1.5 mb-2">
                                  <div className="rounded-md bg-background/80 border p-2 text-center">
                                    <p className="text-[7px] text-muted-foreground uppercase">Earnings</p>
                                    <p className="text-[clamp(0.6rem,2.5vw,0.75rem)] font-extrabold text-success truncate">{formatAmount(finalValue - entry.amount)}</p>
                                  </div>
                                  <div className="rounded-md bg-background/80 border p-2 text-center">
                                    <p className="text-[7px] text-muted-foreground uppercase">Final</p>
                                    <p className="text-[clamp(0.6rem,2.5vw,0.75rem)] font-extrabold text-foreground truncate">{formatAmount(finalValue)}</p>
                                  </div>
                                </div>
                                {projectionRows.map((row) => {
                                  const isLast = row.month === projectionRows.length;
                                  const past = isPast(row.date);
                                  return (
                                    <div key={row.month}
                                      className={`rounded-md border p-2 ${isLast ? 'bg-success/10 border-success/15' : 'bg-background/80'}`}>
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-[9px] font-bold ${isLast ? 'text-success' : 'text-muted-foreground'}`}>M{row.month}</span>
                                          {past && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary">PAID</span>}
                                        </div>
                                        <span className="text-[9px] text-muted-foreground">{format(row.date, 'dd MMM yy')}</span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1">
                                        <div>
                                          <p className="text-[6px] text-muted-foreground uppercase">Open</p>
                                          <p className="text-[clamp(0.55rem,2.2vw,0.65rem)] font-bold text-foreground truncate">{formatAmount(row.opening)}</p>
                                        </div>
                                        <div>
                                          <p className="text-[6px] text-muted-foreground uppercase">Reward</p>
                                          <p className={`text-[clamp(0.55rem,2.2vw,0.65rem)] font-bold truncate ${isLast ? 'text-success' : 'text-success/80'}`}>+{formatAmount(row.earned)}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[6px] text-muted-foreground uppercase">Close</p>
                                          <p className="text-[clamp(0.55rem,2.2vw,0.65rem)] font-extrabold text-foreground truncate">{formatAmount(row.closing)}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    )}

                    {/* Tags */}
                    <div className="px-3.5 pb-2.5 flex flex-wrap gap-1">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/8 text-[9px] font-bold text-primary">
                        <TrendingUp className="h-2.5 w-2.5" />{entry.roi_percentage}%
                      </span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                        {isCompounding ? <Repeat className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                        {isCompounding ? 'Compound' : 'Simple'}
                      </span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                        <Calendar className="h-2.5 w-2.5" />{entry.duration_months}mo
                      </span>
                    </div>

                    {/* Timeline */}
                    <div className="bg-muted/20 border-t border-border/30 px-3.5 py-2.5 space-y-1.5">
                      {[
                        { dot: 'bg-primary', label: 'Started', value: format(investedDate, 'dd MMM yyyy') },
                        { dot: 'bg-primary/60', label: 'Cycle', value: entry.payout_day ? `${entry.payout_day}${['st','nd','rd'][entry.payout_day-1] || 'th'} monthly` : 'Every 30 days' },
                        { dot: 'bg-success', label: 'Earned', value: formatAmount(entry.total_earned), extra: 'text-success font-extrabold' },
                      ].map((t, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${t.dot} shrink-0`} />
                          <span className="text-[9px] text-muted-foreground font-medium w-11 shrink-0">{t.label}</span>
                          <span className={`text-[10px] font-semibold text-foreground truncate ${t.extra || ''}`}>{t.value}</span>
                        </div>
                      ))}
                      {maturity && (
                        <div className="flex items-center gap-2.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${isPast(maturity) ? 'bg-warning' : 'bg-muted-foreground/40'} shrink-0`} />
                          <span className="text-[9px] text-muted-foreground font-medium w-11 shrink-0">{isPast(maturity) ? 'Matured' : 'Matures'}</span>
                          <span className="text-[10px] font-semibold text-foreground">{format(maturity, 'dd MMM yyyy')}</span>
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
