import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, TrendingUp, Calendar, CheckCircle2, History, Clock, AlertTriangle } from 'lucide-react';
import { RepaymentHistoryDrawer } from './RepaymentHistoryDrawer';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInDays } from 'date-fns';

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
          <div className="text-center py-4">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
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
      {/* Summary Card - Always Visible */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Repayment Schedule
            </CardTitle>
            <RepaymentHistoryDrawer userId={userId} />
          </div>
          <CardDescription>
            Your rent repayment overview
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="font-mono font-bold text-primary">{formatUGX(totalPaid)}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Completed Loans</p>
              <p className="font-mono font-bold">{completedRequests.length}</p>
            </div>
          </div>

          {/* Active Request Progress */}
          {activeRequest && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Active Repayment</span>
                <Badge variant={paymentStatus === 'on-track' ? 'default' : 'destructive'} className="text-xs">
                  {paymentStatus === 'on-track' ? 'On Track' : 'Behind'}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress: {activeProgress.toFixed(0)}%</span>
                  <span>{formatUGX(activeRepaid)} / {formatUGX(Number(activeRequest.total_repayment))}</span>
                </div>
                <Progress value={activeProgress} className="h-2" />
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
            </div>
          )}

          {/* Recent Payments */}
          {allRepayments.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent Payments</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {allRepayments.slice(0, 3).map((payment) => (
                  <div 
                    key={payment.id}
                    className="flex items-center justify-between p-2 rounded bg-secondary/30 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span className="font-mono font-medium">{formatUGX(Number(payment.amount))}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
              {allRepayments.length > 3 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  +{allRepayments.length - 3} more payments
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}