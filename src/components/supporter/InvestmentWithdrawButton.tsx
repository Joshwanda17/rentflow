import { useState } from 'react';
import { LogOut, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';

export function InvestmentWithdrawButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount) || 0;

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
        } as any);

      if (error) throw error;

      const processDate = new Date();
      processDate.setDate(processDate.getDate() + 90);

      toast({
        title: '📋 Withdrawal Request Submitted',
        description: `Your request to withdraw ${formatUGX(amountNum)} has been submitted. Processing after ${processDate.toLocaleDateString()}.`,
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

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full gap-2 rounded-xl font-bold h-10 text-sm border-border/60 text-muted-foreground"
      >
        <LogOut className="h-4 w-4" />
        Request Investment Withdrawal
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
              <div className="px-4 py-3 rounded-xl bg-muted/50 space-y-1">
                <p className="text-xs text-muted-foreground font-semibold">Earliest Processing Date</p>
                <p className="text-sm font-black text-foreground">
                  {new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('en-UG', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 px-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground">
                Management will review your request. Monthly rewards continue until the withdrawal is processed.
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
