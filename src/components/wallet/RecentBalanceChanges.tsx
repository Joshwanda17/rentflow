import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface LedgerEntry {
  id: string;
  direction: string;
  amount: number;
  category: string;
  description: string | null;
  transaction_date: string;
}

const formatUGX = (amount: number) =>
  `UGX ${amount.toLocaleString('en-UG')}`;

const categoryLabel = (category: string): string => {
  const map: Record<string, string> = {
    wallet_withdrawal: 'Withdrawal',
    agent_commission: 'Commission',
    agent_commission_payout: 'Commission',
    referral_bonus: 'Referral Bonus',
    opening_balance: 'Opening Balance',
    wallet_deposit: 'Deposit',
    rent_repayment: 'Rent Charge',
    auto_charge: 'Auto-Charge',
    wallet_transfer: 'Transfer',
  };
  return map[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

export function RecentBalanceChanges() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchRecent = async () => {
      // Get entries from last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('general_ledger')
        .select('id, direction, amount, category, description, transaction_date')
        .eq('user_id', user.id)
        .gte('transaction_date', since)
        .order('transaction_date', { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        setEntries(data);
        setDismissed(false);
      }
    };

    fetchRecent();
  }, [user]);

  if (dismissed || entries.length === 0) return null;

  const hasDeductions = entries.some(e => e.direction === 'cash_out');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-2"
      >
        <div className={`rounded-xl border px-3 py-2 ${
          hasDeductions 
            ? 'bg-destructive/5 border-destructive/20' 
            : 'bg-success/5 border-success/20'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Last 24h Activity
            </p>
            <button 
              onClick={() => setDismissed(true)}
              className="p-0.5 rounded-full hover:bg-muted/50 transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-1">
            {entries.map((entry) => {
              const isOut = entry.direction === 'cash_out';
              return (
                <div key={entry.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`p-1 rounded-full shrink-0 ${isOut ? 'bg-destructive/15' : 'bg-success/15'}`}>
                      {isOut ? (
                        <ArrowDownRight className="h-2.5 w-2.5 text-destructive" />
                      ) : (
                        <ArrowUpRight className="h-2.5 w-2.5 text-success" />
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {categoryLabel(entry.category)}
                    </span>
                  </div>
                  <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                    isOut ? 'text-destructive' : 'text-success'
                  }`}>
                    {isOut ? '-' : '+'}{formatUGX(entry.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
