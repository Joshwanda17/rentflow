import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, TrendingUp, Calendar, CheckCircle2 } from 'lucide-react';

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
  activeRequest: RentRequest | undefined;
  repayments: Repayment[];
  onRepaymentSuccess: () => void;
}

export default function RepaymentSection({ 
  userId, 
  activeRequest, 
  repayments,
  onRepaymentSuccess 
}: RepaymentSectionProps) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (!activeRequest || activeRequest.status !== 'disbursed') {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Repayments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {!activeRequest 
              ? "No active rent request. Submit a request to get started."
              : "Your rent request is being processed. You can make repayments once the funds have been disbursed to your landlord."
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalRepaid = repayments
    .filter(r => r.rent_request_id === activeRequest.id)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const remainingBalance = Number(activeRequest.total_repayment) - totalRepaid;
  const progressPercent = (totalRepaid / Number(activeRequest.total_repayment)) * 100;
  const daysElapsed = activeRequest.disbursed_at 
    ? Math.floor((Date.now() - new Date(activeRequest.disbursed_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const expectedPayments = daysElapsed * Number(activeRequest.daily_repayment);
  const paymentStatus = totalRepaid >= expectedPayments ? 'on-track' : 'behind';

  const handleSubmitRepayment = async () => {
    const paymentAmount = parseFloat(amount);
    
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount',
        variant: 'destructive'
      });
      return;
    }

    if (paymentAmount > remainingBalance) {
      toast({
        title: 'Amount Exceeds Balance',
        description: `Maximum payment amount is ${formatUGX(remainingBalance)}`,
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);

    try {
      // Insert repayment
      const { error: repaymentError } = await supabase
        .from('repayments')
        .insert({
          rent_request_id: activeRequest.id,
          tenant_id: userId,
          amount: paymentAmount
        });

      if (repaymentError) throw repaymentError;

      // Record platform transaction (tenant_repayment)
      await supabase
        .from('platform_transactions')
        .insert({
          rent_request_id: activeRequest.id,
          user_id: userId,
          amount: paymentAmount,
          direction: 'inflow',
          transaction_type: 'tenant_repayment',
          description: `Tenant repayment of ${formatUGX(paymentAmount)}`
        });

      // Check if fully repaid
      if (paymentAmount >= remainingBalance) {
        await supabase
          .from('rent_requests')
          .update({ status: 'completed' })
          .eq('id', activeRequest.id);
      }

      toast({
        title: 'Payment Recorded',
        description: `Successfully recorded payment of ${formatUGX(paymentAmount)}`
      });

      setAmount('');
      onRepaymentSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const requestRepayments = repayments.filter(r => r.rent_request_id === activeRequest.id);

  return (
    <div className="space-y-4">
      {/* Repayment Progress Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Repayment Progress
          </CardTitle>
          <CardDescription>
            Track your daily repayment progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progressPercent.toFixed(1)}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Paid: {formatUGX(totalRepaid)}</span>
              <span>Remaining: {formatUGX(remainingBalance)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Daily Target</p>
              <p className="font-mono font-semibold">{formatUGX(Number(activeRequest.daily_repayment))}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className={`font-semibold ${paymentStatus === 'on-track' ? 'text-success' : 'text-warning'}`}>
                {paymentStatus === 'on-track' ? 'On Track' : 'Behind Schedule'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Make Payment Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Make a Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount (UGX)</Label>
            <Input
              id="amount"
              type="number"
              placeholder={`Suggested: ${Number(activeRequest.daily_repayment).toLocaleString()}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              max={remainingBalance}
            />
            <p className="text-xs text-muted-foreground">
              Remaining balance: {formatUGX(remainingBalance)}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(String(activeRequest.daily_repayment))}
            >
              Daily ({formatUGX(Number(activeRequest.daily_repayment))})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(String(remainingBalance))}
            >
              Full Balance
            </Button>
          </div>

          <Button 
            onClick={handleSubmitRepayment} 
            disabled={submitting || !amount}
            className="w-full"
          >
            {submitting ? 'Processing...' : 'Record Payment'}
          </Button>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requestRepayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {requestRepayments.map((payment) => (
                <div 
                  key={payment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <div>
                      <p className="font-medium font-mono">{formatUGX(Number(payment.amount))}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.payment_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
