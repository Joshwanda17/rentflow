import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { formatUGX } from '@/lib/rentCalculations';
import { 
  History, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar,
  TrendingUp,
  Clock
} from 'lucide-react';
import { format, differenceInDays, isBefore } from 'date-fns';

interface RentRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  total_repayment: number;
  daily_repayment: number;
  status: string;
  created_at: string;
  disbursed_at: string | null;
}

interface Repayment {
  id: string;
  amount: number;
  payment_date: string;
  created_at: string;
  rent_request_id: string;
}

interface RepaymentHistoryDrawerProps {
  userId: string;
}

export function RepaymentHistoryDrawer({ userId }: RepaymentHistoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsResult, paymentsResult] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('*')
        .eq('tenant_id', userId)
        .in('status', ['disbursed', 'completed'])
        .order('created_at', { ascending: false }),
      supabase
        .from('repayments')
        .select('*')
        .eq('tenant_id', userId)
        .order('payment_date', { ascending: false })
    ]);
    
    setRentRequests(requestsResult.data || []);
    setRepayments(paymentsResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, userId]);

  // Calculate missed payments for active (disbursed) requests
  const calculateMissedPayments = (request: RentRequest) => {
    if (request.status !== 'disbursed' || !request.disbursed_at) return null;

    const disbursedDate = new Date(request.disbursed_at);
    const today = new Date();
    const daysElapsed = differenceInDays(today, disbursedDate);
    
    const requestRepayments = repayments.filter(r => r.rent_request_id === request.id);
    const totalRepaid = requestRepayments.reduce((sum, r) => sum + Number(r.amount), 0);
    const expectedPayments = daysElapsed * Number(request.daily_repayment);
    
    const missedAmount = Math.max(0, expectedPayments - totalRepaid);
    const missedDays = Math.floor(missedAmount / Number(request.daily_repayment));
    
    return {
      missedDays,
      missedAmount,
      totalRepaid,
      remainingBalance: Number(request.total_repayment) - totalRepaid,
      progressPercent: (totalRepaid / Number(request.total_repayment)) * 100
    };
  };

  const activeRequests = rentRequests.filter(r => r.status === 'disbursed');
  const completedRequests = rentRequests.filter(r => r.status === 'completed');
  const totalMissedPayments = activeRequests.reduce((total, request) => {
    const stats = calculateMissedPayments(request);
    return total + (stats?.missedDays || 0);
  }, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 text-xs h-8 px-2.5 border-primary/20 hover:border-primary/40 hover:bg-primary/5"
        >
          <History className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Payments</span>
          {totalMissedPayments > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px] ml-0.5">
              {totalMissedPayments}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Repayment History
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(85vh-80px)] pr-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-lg border border-border">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-6 w-24 mb-3" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Missed Payments Summary */}
              {totalMissedPayments > 0 && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h3 className="font-semibold text-destructive">Missed Payments</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You have missed approximately {totalMissedPayments} day(s) of payments. 
                    Please catch up to stay on track.
                  </p>
                </div>
              )}

              {/* Active Requests */}
              {activeRequests.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Active Repayments
                  </h3>
                  {activeRequests.map((request) => {
                    const stats = calculateMissedPayments(request);
                    const requestRepayments = repayments.filter(r => r.rent_request_id === request.id);
                    
                    return (
                      <div 
                        key={request.id} 
                        className="p-4 rounded-xl border border-border bg-card"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(request.created_at), 'MMM d, yyyy')}
                          </span>
                          {stats && stats.missedDays > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {stats.missedDays} days behind
                            </Badge>
                          ) : (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              On track
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Total to repay</span>
                            <span className="font-mono font-medium">
                              {formatUGX(Number(request.total_repayment))}
                            </span>
                          </div>
                          {stats && (
                            <>
                              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${stats.progressPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Paid: {formatUGX(stats.totalRepaid)}</span>
                                <span>Remaining: {formatUGX(stats.remainingBalance)}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Recent payments for this request */}
                        {requestRepayments.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">Recent payments:</p>
                            <div className="space-y-1.5">
                              {requestRepayments.slice(0, 3).map((payment) => (
                                <div 
                                  key={payment.id}
                                  className="flex items-center justify-between text-sm py-1 px-2 rounded bg-secondary/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    <span className="font-mono">{formatUGX(Number(payment.amount))}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(payment.payment_date), 'MMM d')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Completed Requests */}
              {completedRequests.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                  </h3>
                  {completedRequests.map((request) => {
                    const requestRepayments = repayments.filter(r => r.rent_request_id === request.id);
                    const totalRepaid = requestRepayments.reduce((sum, r) => sum + Number(r.amount), 0);
                    
                    return (
                      <div 
                        key={request.id} 
                        className="p-4 rounded-xl border border-border bg-card/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(request.created_at), 'MMM d, yyyy')}
                          </span>
                          <Badge variant="outline" className="text-success border-success/30">
                            Completed
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Amount repaid</span>
                          <span className="font-mono font-medium text-success">
                            {formatUGX(totalRepaid)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All Payments History */}
              {repayments.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    All Payments
                  </h3>
                  <div className="space-y-2">
                    {repayments.slice(0, 20).map((payment) => (
                      <div 
                        key={payment.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </div>
                          <div>
                            <p className="font-mono font-medium">{formatUGX(Number(payment.amount))}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(payment.payment_date), 'MMMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {rentRequests.length === 0 && repayments.length === 0 && (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-medium text-muted-foreground mb-1">No repayment history</h3>
                  <p className="text-sm text-muted-foreground/70">
                    Your payment history will appear here once you start making repayments.
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
