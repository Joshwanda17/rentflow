import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CFOWalletMission {
  monthLabel: string;
  intoWallets: number;
  outOfWallets: number;
  net: number;
  rangeStart: string;
  rangeEnd: string;
}

// Money into wallets (cash_in) vs money out of wallets (cash_out) for a given
// calendar month — a board-facing snapshot for the CFO mission card.
// Excludes admin/CFO reconciliation legs per the user-facing ledger filter.
async function sumWalletFlow(direction: 'cash_in' | 'cash_out', start: string, end: string) {
  const { data, error } = await supabase
    .from('general_ledger')
    .select('amount')
    .eq('ledger_scope', 'wallet')
    .eq('direction', direction)
    .gte('transaction_date', start)
    .lt('transaction_date', end)
    .neq('classification', 'admin_correction')
    .neq('category', 'system_balance_correction');
  if (error) throw error;
  return (data || []).reduce((acc, r: any) => acc + Number(r.amount || 0), 0);
}

export function useCFOWalletMission(year = 2026, monthIndex = 6 /* 0-based: July */) {
  const start = new Date(Date.UTC(year, monthIndex, 1)).toISOString();
  const end = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString();
  const monthLabel = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return useQuery<CFOWalletMission>({
    queryKey: ['cfo-wallet-mission', year, monthIndex],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [intoWallets, outOfWallets] = await Promise.all([
        sumWalletFlow('cash_in', start, end),
        sumWalletFlow('cash_out', start, end),
      ]);
      return {
        monthLabel,
        intoWallets,
        outOfWallets,
        net: intoWallets - outOfWallets,
        rangeStart: start,
        rangeEnd: end,
      };
    },
  });
}
