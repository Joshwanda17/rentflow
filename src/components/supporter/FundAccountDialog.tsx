import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, Sparkles, AlertCircle, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];

interface FundAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountId: string;
  walletBalance: number;
  currentBalance?: number;
  onFund: (accountId: string, amount: number) => Promise<void>;
  onDeposit?: () => void;
}

export function FundAccountDialog({ 
  open, 
  onOpenChange, 
  accountName, 
  accountId, 
  walletBalance,
  currentBalance = 0,
  onFund,
  onDeposit,
}: FundAccountDialogProps) {
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleFund = async () => {
    if (amount <= 0 || amount > walletBalance) return;
    
    setLoading(true);
    try {
      await onFund(accountId, amount);
      setAmount(0);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const isValid = amount > 0 && amount <= walletBalance;
  const remainingBalance = walletBalance - amount;
  const newPortfolioBalance = currentBalance + amount;
  const monthlyReturn = newPortfolioBalance * 0.15;
  const noFunds = walletBalance <= 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setAmount(0); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Top Up Investment
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 py-2">
          {/* Account Info */}
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground">Funding account</p>
            <p className="font-bold text-lg">{accountName}</p>
          </div>

          {/* Wallet Balance */}
          <div className="p-3 rounded-xl bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Wallet Balance</span>
              </div>
              <span className="font-bold">{formatUGX(walletBalance)}</span>
            </div>
            {amount > 0 && amount <= walletBalance && (
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">After top-up</span>
                <span className="text-xs font-bold text-muted-foreground">{formatUGX(remainingBalance)}</span>
              </div>
            )}
          </div>

          {/* No funds state */}
          {noFunds ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No funds in your wallet. Deposit money first to top up your investment.</span>
              </div>
              {onDeposit && (
                <Button onClick={() => { onOpenChange(false); onDeposit(); }} className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Deposit to Wallet
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Amount Input */}
              <div className="space-y-3">
                <Label>Amount to Top Up</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                    UGX
                  </span>
                  <Input
                    type="text"
                    value={amount > 0 ? amount.toLocaleString() : ''}
                    placeholder="Enter amount"
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                      setAmount(Math.max(0, value));
                    }}
                    className="pl-12 text-lg font-bold h-12 text-center"
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.filter(a => a <= walletBalance).map((qa) => (
                    <button
                      key={qa}
                      type="button"
                      onClick={() => setAmount(qa)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        amount === qa
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-foreground border-border/60 hover:bg-accent/40'
                      }`}
                    >
                      {formatUGX(qa)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAmount(walletBalance)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      amount === walletBalance
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-foreground border-border/60 hover:bg-accent/40'
                    }`}
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {amount > walletBalance && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <div>
                    <span>Insufficient wallet balance.</span>
                    {onDeposit && (
                      <button
                        type="button"
                        onClick={() => { onOpenChange(false); onDeposit(); }}
                        className="ml-1 text-primary font-medium hover:underline"
                      >
                        Deposit more
                      </button>
                    )}
                  </div>
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
                    <div className="p-3 rounded-xl bg-gradient-to-br from-success/10 to-emerald-500/10 border border-success/20 space-y-2">
                      {/* Current → New Portfolio Balance */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Current Portfolio</span>
                        <span className="text-sm font-bold">{formatUGX(currentBalance)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">After Top-up</span>
                        <span className="text-sm font-black text-success">{formatUGX(newPortfolioBalance)}</span>
                      </div>
                      {/* Projected return - small */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-success/15">
                        <span className="text-[10px] text-success/70 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Projected return (15%/mo)
                        </span>
                        <span className="text-xs font-bold text-success">{formatUGX(monthlyReturn)}/mo</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {!noFunds && (
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
                  Top Up {isValid ? formatUGX(amount) : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
