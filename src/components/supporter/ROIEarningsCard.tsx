import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  TrendingUp, 
  Calendar, 
  Wallet, 
  ChevronRight,
  History,
  Clock,
  CheckCircle2,
  Gift,
  Sparkles,
  BarChart3
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';

interface ROIPayment {
  id: string;
  payment_proof_id: string;
  rent_amount: number;
  roi_amount: number;
  payment_number: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  created_at: string;
}

interface PaymentProofSummary {
  id: string;
  amount: number;
  status: string;
  verified_at: string;
  next_roi_due_date: string | null;
  total_roi_paid: number;
  roi_payments_count: number;
  landlord?: {
    name: string;
  };
}

export function ROIEarningsCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [roiPayments, setRoiPayments] = useState<ROIPayment[]>([]);
  const [paymentProofs, setPaymentProofs] = useState<PaymentProofSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // supporter_roi_payments and landlord_payment_proofs tables removed - stub
      setRoiPayments([]);
      setPaymentProofs([]);
    } catch (error) {
      console.error('Error fetching ROI data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalEarned = roiPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.roi_amount, 0);

  const pendingPayments = roiPayments.filter(p => p.status === 'pending');
  const paidPayments = roiPayments.filter(p => p.status === 'paid');

  // Find next payment date
  const nextPayment = paymentProofs
    .filter(p => p.next_roi_due_date)
    .sort((a, b) => new Date(a.next_roi_due_date!).getTime() - new Date(b.next_roi_due_date!).getTime())[0];

  const expectedMonthlyROI = paymentProofs.reduce((sum, p) => sum + Math.round(p.amount * 0.15), 0);

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-success/10 via-background to-primary/5">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (paymentProofs.length === 0 && roiPayments.length === 0) {
    return null; // Don't show if no ROI activity
  }

  return (
    <>
      <Card className="border-0 bg-gradient-to-br from-success/10 via-background to-primary/5 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              ROI Earnings
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs gap-1"
              onClick={() => navigate('/supporter-earnings')}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Full Dashboard
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Total Earned */}
          <div className="text-center py-3 rounded-xl bg-success/10 border border-success/20">
            <p className="text-xs text-muted-foreground mb-1">Total ROI Earned</p>
            <p className="text-3xl font-black text-success">{formatUGX(totalEarned)}</p>
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-success" />
              <span>{paidPayments.length} payments received</span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">Monthly Expected</p>
              <p className="text-lg font-bold text-primary">{formatUGX(expectedMonthlyROI)}</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">Active Fundings</p>
              <p className="text-lg font-bold">{paymentProofs.length}</p>
            </div>
          </div>

          {/* Next Payment */}
          {nextPayment && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Next ROI Payment</span>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {formatDistanceToNow(new Date(nextPayment.next_roi_due_date!), { addSuffix: true })}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {formatUGX(Math.round(nextPayment.amount * 0.15))} from {nextPayment.landlord?.name || 'landlord payment'}
              </p>
            </div>
          )}

          {/* Recent Payments Preview */}
          {paidPayments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Recent Payments</p>
              {paidPayments.slice(0, 2).map(payment => (
                <div 
                  key={payment.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-full bg-success/20">
                      <Gift className="h-3 w-3 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Payment #{payment.payment_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.paid_at ? format(new Date(payment.paid_at), 'MMM d, yyyy') : 'Processing'}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-success">+{formatUGX(payment.roi_amount)}</span>
                </div>
              ))}
              {paidPayments.length > 2 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-xs"
                  onClick={() => setShowHistory(true)}
                >
                  View all {paidPayments.length} payments
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              ROI Payment History
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-success/10">
                <p className="text-lg font-bold text-success">{formatUGX(totalEarned)}</p>
                <p className="text-xs text-muted-foreground">Earned</p>
              </div>
              <div className="p-2 rounded-lg bg-muted">
                <p className="text-lg font-bold">{paidPayments.length}</p>
                <p className="text-xs text-muted-foreground">Payments</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <p className="text-lg font-bold text-primary">{paymentProofs.length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>

            {/* Payment List */}
            <ScrollArea className="h-[350px]">
              {roiPayments.length === 0 ? (
                <div className="text-center py-8">
                  <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground">No ROI payments yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your first payment will arrive 30 days after verification
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {roiPayments.map(payment => (
                    <Card key={payment.id} className="border-border/50">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${
                              payment.status === 'paid' ? 'bg-success/20' : 'bg-warning/20'
                            }`}>
                              {payment.status === 'paid' ? (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              ) : (
                                <Clock className="h-4 w-4 text-warning" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">ROI Payment #{payment.payment_number}</p>
                              <p className="text-xs text-muted-foreground">
                                From {formatUGX(payment.rent_amount)} funding
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${payment.status === 'paid' ? 'text-success' : ''}`}>
                              {payment.status === 'paid' ? '+' : ''}{formatUGX(payment.roi_amount)}
                            </p>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                payment.status === 'paid' 
                                  ? 'bg-success/10 text-success border-success/30' 
                                  : 'bg-warning/10 text-warning border-warning/30'
                              }`}
                            >
                              {payment.status === 'paid' ? 'Paid' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {payment.paid_at 
                              ? `Paid on ${format(new Date(payment.paid_at), 'MMM d, yyyy')}`
                              : `Due ${format(new Date(payment.due_date), 'MMM d, yyyy')}`
                            }
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
