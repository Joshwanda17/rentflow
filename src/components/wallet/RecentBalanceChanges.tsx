import { useState, useEffect } from 'react';

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
    <div className="mt-2 animate-fade-in">
      <div className={`rounded-xl border px-3 py-2 ${
        hasDeductions 
          ? 'bg-primary-foreground/10 border-primary-foreground/20' 
          : 'bg-primary-foreground/10 border-primary-foreground/20'
      }`}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/70">
            Last 24h Activity
          </p>
          <button 
            onClick={() => setDismissed(true)}
            className="p-0.5 rounded-full hover:bg-primary-foreground/20 transition-colors"
          >
            <X className="h-3 w-3 text-primary-foreground/60" />
          </button>
        </div>
        <div className="space-y-1">
          {entries.map((entry) => {
            const isOut = entry.direction === 'cash_out';
            return (
              <div key={entry.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`p-1 rounded-full shrink-0 ${isOut ? 'bg-red-400/20' : 'bg-green-400/20'}`}>
                    {isOut ? (
                      <ArrowDownRight className="h-2.5 w-2.5 text-red-300" />
                    ) : (
                      <ArrowUpRight className="h-2.5 w-2.5 text-green-300" />
                    )}
                  </div>
                  <span className="text-[11px] text-primary-foreground/80 truncate">
                    {categoryLabel(entry.category)}
                  </span>
                </div>
                <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                  isOut ? 'text-red-300' : 'text-green-300'
                }`}>
                  {isOut ? '-' : '+'}{formatUGX(entry.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
