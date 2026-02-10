import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, ArrowRight, AlertCircle, ArrowDownToLine } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WithdrawAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountId: string;
  accountBalance: number;
  onWithdraw: (accountId: string, amount: number) => Promise<void>;
}

export function WithdrawAccountDialog({ 
  open, 
  onOpenChange, 
  accountName, 
  accountId, 
  accountBalance,
  onWithdraw 
}: WithdrawAccountDialogProps) {
  const [amount, setAmount] = useState(10000);
  const [loading, setLoading] = useState(false);

  const handleWithdraw = async () => {
    if (amount <= 0 || amount > accountBalance) return;
    
    setLoading(true);
    try {
      await onWithdraw(accountId, amount);
      setAmount(10000);
      onOpenChange(false);
      // Note: The parent component should show the approval pending message
    } finally {
      setLoading(false);
    }
  };

  const maxAmount = accountBalance;
  const isValid = amount > 0 && amount <= accountBalance && accountBalance > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw to Wallet
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-5 py-4">
          {/* Account Info */}
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground">Withdrawing from</p>
            <p className="font-bold text-lg">{accountName}</p>
          </div>

          {/* Account Balance */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Account Balance</span>
            </div>
            <span className="font-bold">{formatUGX(accountBalance)}</span>
          </div>

          {accountBalance > 0 ? (
            <>
              {/* Amount Input */}
              <div className="space-y-3">
                <Label>Amount to Withdraw</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                    UGX
                  </span>
                  <Input
                    type="text"
                    value={amount.toLocaleString()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                      setAmount(Math.max(0, Math.min(value, maxAmount)));
                    }}
                    className="pl-12 text-lg font-bold h-12 text-center"
                  />
                </div>
                
                <Slider
                  value={[amount]}
                  onValueChange={([value]) => setAmount(value)}
                  min={1000}
                  max={maxAmount}
                  step={1000}
                  className="py-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>UGX 1,000</span>
                  <button 
                    type="button"
                    onClick={() => setAmount(accountBalance)}
                    className="text-primary font-medium hover:underline"
                  >
                    Max
                  </button>
                  <span>{formatUGX(maxAmount)}</span>
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {amount > accountBalance && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Insufficient account balance</span>
                </div>
              )}

              {/* Transfer Preview */}
              <AnimatePresence mode="wait">
                {isValid && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-violet-500/10 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold text-primary">Transfer to Wallet</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{accountName}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xl font-black text-primary">{formatUGX(amount)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-muted/50 text-muted-foreground text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>This account has no balance to withdraw</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleWithdraw} 
            disabled={!isValid || loading}
            className="gap-2 bg-gradient-to-r from-primary to-violet-500"
          >
            {loading ? (
              'Processing...'
            ) : (
              <>
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
