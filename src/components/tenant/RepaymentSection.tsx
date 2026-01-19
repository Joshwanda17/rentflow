import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, TrendingUp, Calendar, CheckCircle2, Clock, AlertTriangle, XCircle, CalendarDays } from 'lucide-react';
import { RepaymentHistoryDrawer } from './RepaymentHistoryDrawer';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInDays, format, eachDayOfInterval, isSameDay, startOfDay } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface RepaymentSectionProps {
  userId: string;
  activeRequest?: RentRequest;
  repayments?: Repayment[];
  onRepaymentSuccess?: () => void;
}

interface DayStatus {
  date: Date;
  status: 'paid' | 'missed' | 'upcoming' | 'today';
  amount?: number;
}

export default function RepaymentSection({ 
  userId, 
  activeRequest: propActiveRequest, 
  repayments: propRepayments,
  onRepaymentSuccess 
}: RepaymentSectionProps) {
  const [loading, setLoading] = useState(true);
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);

  // Fetch all rent requests and repayments for this tenant
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const [requestsRes, repaymentsRes] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('id, rent_amount, duration_days, total_repayment, daily_repayment, status, created_at, disbursed_at')
          .eq('tenant_id', userId)
          .in('status', ['disbursed', 'completed', 'approved', 'funded'])
          .order('created_at', { ascending: false }),
        supabase
          .from('repayments')
          .select('*')
          .eq('tenant_id', userId)
          .order('payment_date', { ascending: false })
      ]);

      if (requestsRes.data) setRentRequests(requestsRes.data);
      if (repaymentsRes.data) setRepayments(repaymentsRes.data);
      
      setLoading(false);
    };

    fetchData();
  }, [userId]);

  // Use props if provided, otherwise use fetched data
  const allRepayments = propRepayments || repayments;
  const activeRequest = propActiveRequest || rentRequests.find(r => r.status === 'disbursed');
  const completedRequests = rentRequests.filter(r => r.status === 'completed');

  // Calculate totals across all requests
  const totalPaid = allRepayments.reduce((sum, r) => sum + Number(r.amount), 0);
  const activeRequestRepayments = activeRequest 
    ? allRepayments.filter(r => r.rent_request_id === activeRequest.id)
    : [];
  const activeRepaid = activeRequestRepayments.reduce((sum, r) => sum + Number(r.amount), 0);
  const activeRemaining = activeRequest ? Number(activeRequest.total_repayment) - activeRepaid : 0;
  const activeProgress = activeRequest ? (activeRepaid / Number(activeRequest.total_repayment)) * 100 : 0;

  // Calculate days and status for active request
  const daysElapsed = activeRequest?.disbursed_at 
    ? differenceInDays(new Date(), new Date(activeRequest.disbursed_at))
    : 0;
  const expectedPayments = activeRequest ? daysElapsed * Number(activeRequest.daily_repayment) : 0;
  const paymentStatus = activeRepaid >= expectedPayments ? 'on-track' : 'behind';

  // Generate schedule with paid/missed/upcoming days
  const scheduleData = useMemo(() => {
    if (!activeRequest?.disbursed_at) return { days: [], paidDays: 0, missedDays: 0, upcomingDays: 0 };

    const startDate = startOfDay(new Date(activeRequest.disbursed_at));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + activeRequest.duration_days - 1);
    const today = startOfDay(new Date());

    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Get payments grouped by date
    const paymentsByDate = new Map<string, number>();
    activeRequestRepayments.forEach(payment => {
      const dateKey = format(new Date(payment.payment_date), 'yyyy-MM-dd');
      paymentsByDate.set(dateKey, (paymentsByDate.get(dateKey) || 0) + Number(payment.amount));
    });

    let paidDays = 0;
    let missedDays = 0;
    let upcomingDays = 0;

    const days: DayStatus[] = allDays.map(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const paidAmount = paymentsByDate.get(dateKey) || 0;
      const isToday = isSameDay(day, today);
      const isPast = day < today && !isToday;

      if (paidAmount >= Number(activeRequest.daily_repayment)) {
        paidDays++;
        return { date: day, status: 'paid' as const, amount: paidAmount };
      } else if (isToday) {
        return { date: day, status: 'today' as const, amount: paidAmount };
      } else if (isPast) {
        missedDays++;
        return { date: day, status: 'missed' as const, amount: paidAmount };
      } else {
        upcomingDays++;
        return { date: day, status: 'upcoming' as const };
      }
    });

    return { days, paidDays, missedDays, upcomingDays };
  }, [activeRequest, activeRequestRepayments]);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Repayment Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  // No requests at all
  if (rentRequests.length === 0 && !propActiveRequest) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Repayment Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">
              No repayment schedule yet. Submit a rent request to get started.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schedule" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4 mt-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-success mb-1" />
              <p className="text-xl font-bold text-success">{scheduleData.paidDays}</p>
              <p className="text-xs text-muted-foreground">Paid Days</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
              <XCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
              <p className="text-xl font-bold text-destructive">{scheduleData.missedDays}</p>
              <p className="text-xs text-muted-foreground">Missed Days</p>
            </div>
            <div className="p-3 rounded-lg bg-muted border border-border text-center">
              <Calendar className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xl font-bold">{scheduleData.upcomingDays}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </div>

          {/* Active Request Progress */}
          {activeRequest && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Active Loan</CardTitle>
                  <Badge variant={paymentStatus === 'on-track' ? 'default' : 'destructive'} className="text-xs">
                    {paymentStatus === 'on-track' ? 'On Track' : 'Behind'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress: {activeProgress.toFixed(0)}%</span>
                    <span>{formatUGX(activeRepaid)} / {formatUGX(Number(activeRequest.total_repayment))}</span>
                  </div>
                  <Progress value={activeProgress} className="h-3" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 p-2 rounded bg-secondary/50">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <span className="text-muted-foreground">Daily: </span>
                      <span className="font-mono font-medium">{formatUGX(Number(activeRequest.daily_repayment))}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 p-2 rounded bg-secondary/50">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <span className="text-muted-foreground">Left: </span>
                      <span className="font-mono font-medium">{formatUGX(activeRemaining)}</span>
                    </div>
                  </div>
                </div>

                {paymentStatus === 'behind' && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">
                      You're behind by {formatUGX(expectedPayments - activeRepaid)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Day-by-Day Calendar Grid */}
          {activeRequest && scheduleData.days.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Payment Calendar
                </CardTitle>
                <CardDescription className="text-xs">
                  {activeRequest.duration_days} day repayment period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1.5">
                  {scheduleData.days.map((day, index) => (
                    <div
                      key={index}
                      className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs p-1 ${
                        day.status === 'paid' 
                          ? 'bg-success/20 text-success border border-success/30' 
                          : day.status === 'missed'
                          ? 'bg-destructive/20 text-destructive border border-destructive/30'
                          : day.status === 'today'
                          ? 'bg-primary/20 text-primary border-2 border-primary ring-2 ring-primary/20'
                          : 'bg-muted/50 text-muted-foreground border border-border/50'
                      }`}
                    >
                      <span className="font-medium">{format(day.date, 'd')}</span>
                      {day.status === 'paid' && <CheckCircle2 className="h-3 w-3 mt-0.5" />}
                      {day.status === 'missed' && <XCircle className="h-3 w-3 mt-0.5" />}
                      {day.status === 'today' && <span className="text-[10px]">Today</span>}
                    </div>
                  ))}
                </div>
                
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-success/20 border border-success/30" />
                    <span className="text-muted-foreground">Paid</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
                    <span className="text-muted-foreground">Missed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-primary/20 border-2 border-primary" />
                    <span className="text-muted-foreground">Today</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-muted/50 border border-border/50" />
                    <span className="text-muted-foreground">Upcoming</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="font-mono font-bold text-primary text-lg">{formatUGX(totalPaid)}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Completed Loans</p>
              <p className="font-mono font-bold text-lg">{completedRequests.length}</p>
            </div>
          </div>

          {/* Payment History List */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Payment History</CardTitle>
                <RepaymentHistoryDrawer userId={userId} />
              </div>
            </CardHeader>
            <CardContent>
              {allRepayments.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allRepayments.slice(0, 10).map((payment) => (
                    <div 
                      key={payment.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </div>
                        <div>
                          <p className="font-mono font-semibold">{formatUGX(Number(payment.amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">Paid</Badge>
                    </div>
                  ))}
                  {allRepayments.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{allRepayments.length - 10} more payments
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground text-sm">No payments recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}