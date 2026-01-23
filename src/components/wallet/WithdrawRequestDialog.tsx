import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ArrowDownToLine, Wallet, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface WithdrawRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance: number;
  onSuccess?: () => void;
}

export function WithdrawRequestDialog({ 
  open, 
  onOpenChange, 
  walletBalance,
  onSuccess 
}: WithdrawRequestDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    const MIN_WITHDRAWAL = 500;
    if (amount < MIN_WITHDRAWAL) {
      toast.error(`Minimum withdrawal is UGX ${MIN_WITHDRAWAL.toLocaleString()}`);
      return;
    }

    if (amount > walletBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          amount,
          status: 'pending'
        });

      if (error) throw error;

      setSuccess(true);
      toast.success('Withdrawal request submitted! 🎉');
      onSuccess?.();
    } catch (error: any) {
      console.error('Error submitting withdrawal request:', error);
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(0);
    setSuccess(false);
    onOpenChange(false);
  };

  const handleSliderChange = (value: number[]) => {
    setAmount(value[0]);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw Funds
          </DialogTitle>
          <DialogDescription>
            Withdraw to MTN or Airtel Mobile Money. Min: UGX 500
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Request Submitted! 🎉</h3>
              <p className="text-muted-foreground mt-1">
                Your withdrawal request for {formatCurrency(amount)} is pending approval.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-6 py-4">
              {/* Current Balance */}
              <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-primary/10">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                    <p className="font-bold text-lg">{formatCurrency(walletBalance)}</p>
                  </div>
                </div>
              </div>

              {walletBalance <= 0 ? (
                <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg text-warning">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">No funds available to withdraw</p>
                </div>
              ) : (
                <>
                  {/* Amount Input */}
                  <div className="space-y-3">
                    <Label htmlFor="amount">Amount to Withdraw</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="Min: UGX 500"
                      value={amount || ''}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      min={500}
                      max={walletBalance}
                      className="text-lg font-semibold"
                    />
                    
                    {/* Slider */}
                    <div className="pt-2">
                      <Slider
                        value={[amount]}
                        onValueChange={handleSliderChange}
                        max={walletBalance}
                        min={500}
                        step={500}
                        className="cursor-pointer"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>UGX 500</span>
                        <span>{formatCurrency(walletBalance)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {[0.25, 0.5, 0.75, 1].map((fraction) => {
                      const quickAmount = Math.floor(walletBalance * fraction);
                      return (
                        <Button
                          key={fraction}
                          variant={amount === quickAmount ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAmount(quickAmount)}
                          className="flex-1"
                        >
                          {fraction === 1 ? 'All' : `${fraction * 100}%`}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Summary */}
                  {amount > 0 && (
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <p className="text-sm text-muted-foreground mb-1">You will receive</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(amount)}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Remaining balance: {formatCurrency(walletBalance - amount)}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || amount < 500 || amount > walletBalance}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="h-4 w-4" />
                    Request Withdrawal
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}