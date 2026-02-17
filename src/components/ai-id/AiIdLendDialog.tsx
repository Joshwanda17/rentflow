import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Banknote, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetAiId: string;
  maxAmount: number;
}

export function AiIdLendDialog({ open, onOpenChange, targetAiId, maxAmount }: Props) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleLend = async () => {
    if (!user) return;
    const lendAmount = parseInt(amount);
    if (!lendAmount || lendAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (lendAmount > maxAmount) {
      toast.error(`Maximum amount is ${formatUGX(maxAmount)}`);
      return;
    }

    setLoading(true);
    try {
      // Resolve AI ID to user_id
      const { data: resolvedId, error: resolveError } = await supabase.rpc('resolve_welile_ai_id', { ai_id: targetAiId });
      if (resolveError || !resolvedId) {
        toast.error('Could not resolve AI ID');
        setLoading(false);
        return;
      }

      const borrowerId = resolvedId as string;
      if (borrowerId === user.id) {
        toast.error('You cannot lend to yourself');
        setLoading(false);
        return;
      }

      // Check wallet balance
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!wallet || wallet.balance < lendAmount) {
        toast.error('Insufficient wallet balance');
        setLoading(false);
        return;
      }

      // Single DB write: create loan
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 90);
      const totalRepayment = Math.round(lendAmount * 1.05); // 5% service fee

      const { error: loanError } = await supabase.from('user_loans').insert({
        borrower_id: borrowerId,
        lender_id: user.id,
        amount: lendAmount,
        interest_rate: 5,
        total_repayment: totalRepayment,
        due_date: dueDate.toISOString().split('T')[0],
      });

      if (loanError) {
        if (loanError.message?.includes('policy')) {
          toast.error('You do not have permission to lend');
        } else {
          toast.error('Failed to create facilitation');
          console.error('Loan error:', loanError);
        }
        setLoading(false);
        return;
      }

      // Deduct from wallet
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance - lendAmount })
        .eq('user_id', user.id);

      // Credit borrower wallet
      const { data: borrowerWallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', borrowerId)
        .maybeSingle();

      if (borrowerWallet) {
        await supabase
          .from('wallets')
          .update({ balance: borrowerWallet.balance + lendAmount })
          .eq('user_id', borrowerId);
      }

      setSuccess(true);
      toast.success('Facilitation completed!');
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Facilitate via Wallet
          </DialogTitle>
          <DialogDescription>
            Facilitation for {targetAiId} · Max {formatUGX(maxAmount)}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-lg">Facilitation Complete!</h3>
              <p className="text-sm text-muted-foreground">{formatUGX(parseInt(amount))} sent to {targetAiId}</p>
              <Button onClick={handleClose}>Done</Button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (UGX)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Up to ${formatUGX(maxAmount)}`}
                  max={maxAmount}
                  className="h-12 text-lg font-bold"
                />
              </div>

              <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    This is a voluntary facilitation through the Welile Wallet. 
                    Welile does not guarantee repayment. The recipient's trust tier 
                    and payment history are informational only.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleLend} disabled={loading || !amount} className="gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Facilitate
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
