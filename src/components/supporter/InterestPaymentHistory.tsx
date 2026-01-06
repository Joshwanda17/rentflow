import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Calendar, Wallet, Sparkles, PiggyBank } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

interface InterestPayment {
  id: string;
  account_id: string;
  principal_amount: number;
  interest_amount: number;
  interest_rate: number;
  payment_month: string;
  credited_at: string;
  account_name?: string;
}

interface InterestPaymentHistoryProps {
  userId: string;
}

export function InterestPaymentHistory({ userId }: InterestPaymentHistoryProps) {
  const [payments, setPayments] = useState<InterestPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, [userId]);

  const fetchPayments = async () => {
    setLoading(true);
    
    // Fetch interest payments
    const { data: paymentsData, error } = await supabase
      .from('investment_interest_payments')
      .select('*')
      .eq('user_id', userId)
      .order('credited_at', { ascending: false });

    if (error) {
      console.error('Error fetching interest payments:', error);
      setLoading(false);
      return;
    }

    // Fetch account names
    const accountIds = [...new Set((paymentsData || []).map(p => p.account_id))];
    const { data: accounts } = await supabase
      .from('investment_accounts')
      .select('id, name')
      .in('id', accountIds);

    const accountMap = new Map((accounts || []).map(a => [a.id, a.name]));

    const enrichedPayments = (paymentsData || []).map(p => ({
      ...p,
      account_name: accountMap.get(p.account_id) || 'Unknown Account'
    }));

    setPayments(enrichedPayments);
    setLoading(false);
  };

  const totalInterestEarned = payments.reduce((sum, p) => sum + Number(p.interest_amount), 0);

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-success/5 via-background to-emerald-500/5">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-success/5 via-background to-emerald-500/5 backdrop-blur-xl shadow-xl">
        <div className="absolute top-0 right-0 w-32 sm:w-48 h-32 sm:h-48 bg-gradient-to-bl from-success/10 to-transparent rounded-full blur-3xl" />
        
        <CardHeader className="relative pb-2 sm:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <motion.div 
                className="p-2.5 rounded-xl bg-gradient-to-br from-success via-emerald-500 to-green-500 shadow-lg shadow-success/30"
                whileHover={{ scale: 1.05, rotate: -5 }}
              >
                <TrendingUp className="h-5 w-5 text-white" />
              </motion.div>
              <div>
                <CardTitle className="text-lg font-black tracking-tight">Interest Payments 💰</CardTitle>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">Your monthly 15% returns</p>
              </div>
            </div>
            
            {totalInterestEarned > 0 && (
              <div className="flex items-center gap-2 p-2 px-3 rounded-xl bg-success/10 border border-success/20">
                <Sparkles className="h-4 w-4 text-success" />
                <div>
                  <p className="text-[10px] text-success/70 uppercase font-semibold">Total Earned</p>
                  <p className="font-black text-success">{formatUGX(totalInterestEarned)}</p>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="relative">
          {payments.length === 0 ? (
            <div className="text-center py-10">
              <motion.div 
                className="p-4 rounded-full bg-gradient-to-br from-success/20 to-success/5 w-fit mx-auto mb-4"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <PiggyBank className="h-8 w-8 text-success/60" />
              </motion.div>
              <p className="text-foreground font-bold text-base">No interest payments yet 🌱</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">
                Fund your investment accounts and wait for monthly interest to be processed
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {payments.map((payment, index) => (
                <motion.div
                  key={payment.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 rounded-xl bg-gradient-to-r from-white/5 to-white/[0.02] border border-white/10 hover:border-success/30 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-success/10 group-hover:bg-success/20 transition-colors">
                        <Wallet className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{payment.account_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(payment.credited_at), 'MMM d, yyyy')}</span>
                          <span>•</span>
                          <span>{payment.payment_month}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-black text-success text-lg">+{formatUGX(payment.interest_amount)}</p>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <span className="text-[10px] text-muted-foreground">on {formatUGX(payment.principal_amount)}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success/10 text-success border-success/30">
                          {(Number(payment.interest_rate) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
