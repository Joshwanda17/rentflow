import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, TrendingUp, ArrowUpRight, Sparkles, ArrowDownToLine, Calendar, DollarSign } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { InvestmentAccount } from './InvestmentAccountCard';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';

interface AccountDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InvestmentAccount | null;
  onFund?: () => void;
  onWithdraw?: () => void;
}

interface InterestPayment {
  id: string;
  payment_month: string;
  principal_amount: number;
  interest_amount: number;
  interest_rate: number;
  credited_at: string;
}

export function AccountDetailsDialog({ open, onOpenChange, account, onFund, onWithdraw }: AccountDetailsDialogProps) {
  const [interestHistory, setInterestHistory] = useState<InterestPayment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && account) {
      fetchInterestHistory();
    }
  }, [open, account]);

  const fetchInterestHistory = async () => {
    if (!account) return;
    setLoading(true);
    
    // investment_interest_payments table removed - stub
    setInterestHistory([]);
    setLoading(false);
  };

  if (!account) return null;

  const totalValue = account.balance + account.returns;
  const roi = account.invested > 0 ? ((account.returns / account.invested) * 100) : 0;
  const totalInterestEarned = interestHistory.reduce((sum, p) => sum + p.interest_amount, 0);

  const colorSchemes: Record<string, { gradient: string; iconBg: string; accent: string }> = {
    blue: { gradient: 'from-blue-600/20 to-cyan-500/10', iconBg: 'from-blue-500 to-cyan-400', accent: 'text-blue-400' },
    green: { gradient: 'from-emerald-600/20 to-green-500/10', iconBg: 'from-emerald-500 to-green-400', accent: 'text-emerald-400' },
    purple: { gradient: 'from-purple-600/20 to-violet-500/10', iconBg: 'from-purple-500 to-violet-400', accent: 'text-purple-400' },
    orange: { gradient: 'from-orange-600/20 to-amber-500/10', iconBg: 'from-orange-500 to-amber-400', accent: 'text-orange-400' },
    pink: { gradient: 'from-pink-600/20 to-rose-500/10', iconBg: 'from-pink-500 to-rose-400', accent: 'text-pink-400' },
  };

  const scheme = colorSchemes[account.color] || colorSchemes.purple;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${scheme.iconBg} shadow-lg`}>
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold">{account.name}</span>
              <div className="flex items-center gap-2 mt-1">
                {account.status === 'approved' && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-success/20 text-success border-0">
                    Approved
                  </Badge>
                )}
                {account.status === 'pending' && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-warning/20 text-warning border-0">
                    Pending
                  </Badge>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Total Value Card */}
          <motion.div 
            className={`p-5 rounded-2xl bg-gradient-to-br ${scheme.gradient} backdrop-blur`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Total Value</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black">{formatUGX(totalValue)}</p>
              {roi > 0 && (
                <span className="flex items-center gap-0.5 text-sm font-bold text-success">
                  <ArrowUpRight className="h-4 w-4" />
                  {roi.toFixed(1)}%
                </span>
              )}
            </div>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/50 border">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Balance</p>
              </div>
              <p className="font-bold text-lg">{formatUGX(account.balance)}</p>
            </div>
            <div className="p-4 rounded-xl bg-success/10 border border-success/20">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-success" />
                <p className="text-xs text-success/80 uppercase tracking-wider font-semibold">Interest Earned</p>
              </div>
              <p className="font-bold text-lg text-success">{formatUGX(totalInterestEarned)}</p>
            </div>
          </div>

          {/* Action Buttons */}
          {account.status === 'approved' && (
            <div className="flex gap-3">
              <Button 
                onClick={() => {
                  onOpenChange(false);
                  onFund?.();
                }} 
                className="flex-1 h-11 font-semibold bg-gradient-to-r from-primary to-primary/80"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Fund Account
              </Button>
              <Button 
                onClick={() => {
                  onOpenChange(false);
                  onWithdraw?.();
                }} 
                variant="outline"
                className="flex-1 h-11 font-semibold border-primary/30 hover:bg-primary/10"
                disabled={account.balance <= 0}
              >
                <ArrowDownToLine className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            </div>
          )}

          {/* Interest Payment History */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Interest Payment History
            </h3>
            
            {loading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
            ) : interestHistory.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm bg-muted/30 rounded-lg">
                No interest payments yet
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {interestHistory.map((payment, index) => (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                  >
                    <div>
                      <p className="text-sm font-medium">{payment.payment_month}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(payment.credited_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-success">+{formatUGX(payment.interest_amount)}</p>
                      <p className="text-xs text-muted-foreground">{payment.interest_rate}% rate</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
