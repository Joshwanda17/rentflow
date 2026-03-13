import { useState, useEffect } from 'react';
import { LogOut, Clock, AlertTriangle, PauseCircle, CalendarCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

export function InvestmentWithdrawButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<{
    amount: number;
    status: string;
    earliest_process_date: string;
    created_at: string;
  } | null>(null);

  const amountNum = Number(amount) || 0;

  // Check for existing pending/approved withdrawal request
  useEffect(() => {
    if (!user) return;
    const fetchExisting = async () => {
      const { data } = await supabase
        .from('investment_withdrawal_requests' as any)
        .select('amount, status, earliest_process_date, created_at')
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && (data as any[]).length > 0) {
        setExistingRequest((data as any[])[0]);
      }
    };
    fetchExisting();
  }, [user]);

  const handleSubmit = async () => {
    if (!user || amountNum <= 0) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('investment_withdrawal_requests' as any)
        .insert({
          user_id: user.id,
          amount: amountNum,
          reason: reason.trim() || null,
          rewards_paused: true,
        } as any);

      if (error) throw error;

      const processDate = new Date();
      processDate.setDate(processDate.getDate() + 90);

      setExistingRequest({
        amount: amountNum,
        status: 'pending',
        earliest_process_date: processDate.toISOString(),
        created_at: new Date().toISOString(),
      });

      toast({
        title: '📋 Withdrawal Request Submitted',
        description: `Your request to withdraw ${formatUGX(amountNum)} has been submitted. Monthly rewards are now PAUSED. Payout after ${format(processDate, 'MMMM d, yyyy')}.`,
      });

      setAmount('');
      setReason('');
      setOpen(false);
    } catch (err: any) {
      console.error('[InvestmentWithdrawButton] Error:', err);
      toast({
        title: 'Request failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // If there's an active withdrawal request, show status instead of the button
  if (existingRequest) {
    const payoutDate = new Date(existingRequest.earliest_process_date);
    return (
      <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-amber-600" />
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
            Withdrawal In Progress
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-bold text-foreground">{formatUGX(existingRequest.amount)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="font-bold text-amber-600 capitalize">{existingRequest.status}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <CalendarCheck className="h-3.5 w-3.5" />
              Payout Date
            </span>
            <span className="font-bold text-foreground">{format(payoutDate, 'MMMM d, yyyy')}</span>
          </div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive font-semibold flex items-center gap-1.5">
            <PauseCircle className="h-3.5 w-3.5" />
            Monthly rewards are PAUSED until withdrawal is processed
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The platform is collecting rent from tenants to prepare your full lump-sum payout on the date above.
        </p>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full gap-2 rounded-xl font-bold h-10 text-sm border-border/60 text-muted-foreground"
      >
        <LogOut className="h-4 w-4" />
        Request Capital Withdrawal
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" stable>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-primary" />
              Investment Withdrawal
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 90-day notice info */}
            <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">90-Day Notice Period</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Investment withdrawals require a <span className="font-bold">90-day advance notice</span>. 
                Your request will be processed after the notice period ends.
              </p>
            </div>

            {/* Rewards pause warning */}
            <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 space-y-2">
              <div className="flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-bold text-destructive">Rewards Will Be Paused</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Once you submit this request, your <span className="font-bold">monthly 15% rewards will stop immediately</span>. 
                This allows the platform to collect rent from tenants to prepare your full lump-sum payout.
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground">Withdrawal Amount (UGX)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 500000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="text-lg font-bold h-12"
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground">Reason (optional)</label>
              <Textarea
                placeholder="Why are you withdrawing?"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="text-sm min-h-[60px]"
              />
            </div>

            {/* Processing date preview */}
            {amountNum > 0 && (
              <div className="px-4 py-3 rounded-xl bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-semibold">Payout Date</p>
                  <CalendarCheck className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-black text-foreground">
                  {format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'MMMM d, yyyy')}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  You will receive {formatUGX(amountNum)} as a lump-sum on or after this date.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 px-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground">
                Monthly rewards will <strong>stop immediately</strong> once this request is submitted. The platform will collect tenant repayments to prepare your payout.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={amountNum <= 0 || submitting}
              className="w-full gap-2 rounded-xl font-bold h-11"
            >
              {submitting ? 'Submitting…' : 'Submit Withdrawal Notice'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
