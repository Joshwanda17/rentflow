import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FundAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountId: string;
  walletBalance: number;
  onFund: (accountId: string, amount: number) => Promise<void>;
}

export function FundAccountDialog({ 
  open, 
  onOpenChange, 
  accountName, 
  accountId, 
  walletBalance,
  onFund 
}: FundAccountDialogProps) {
  const [amount, setAmount] = useState(10000);
  const [loading, setLoading] = useState(false);

  const handleFund = async () => {
    if (amount <= 0 || amount > walletBalance) return;
    
    setLoading(true);
    try {
      await onFund(accountId, amount);
      setAmount(10000);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const maxAmount = Math.min(walletBalance, 200000000000); // Max 200B
  const isValid = amount > 0 && amount <= walletBalance;
  const monthlyReturn = amount * 0.15;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Fund Investment Account
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 py-2">
          {/* Account Info */}
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground">Funding account</p>
            <p className="font-bold text-lg">{accountName}</p>
          </div>

          {/* Wallet Balance */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Wallet Balance</span>
            </div>
            <span className="font-bold">{formatUGX(walletBalance)}</span>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <Label>Amount to Transfer</Label>
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
            
            {walletBalance > 0 && (
              <>
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
                    onClick={() => setAmount(walletBalance)}
                    className="text-primary font-medium hover:underline"
                  >
                    Max
                  </button>
                  <span>{formatUGX(maxAmount)}</span>
                </div>
              </>
            )}
          </div>

          {/* Insufficient Balance Warning */}
          {amount > walletBalance && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Insufficient wallet balance</span>
            </div>
          )}

          {/* ROI Preview */}
          <AnimatePresence mode="wait">
            {isValid && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 rounded-xl bg-gradient-to-br from-success/10 to-emerald-500/10 border border-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-success" />
                    <span className="text-sm font-bold text-success">Expected Monthly Return</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatUGX(amount)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xl font-black text-success">{formatUGX(monthlyReturn)}</span>
                    <span className="text-xs text-success/70">/month</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleFund} 
            disabled={!isValid || loading}
            className="gap-2 bg-gradient-to-r from-primary to-violet-500"
          >
            {loading ? (
              'Processing...'
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                Fund Account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}