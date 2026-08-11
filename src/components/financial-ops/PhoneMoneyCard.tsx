import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Smartphone, Info } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';

/**
 * Phone Money — the real balance sitting on the merchant MTN/Airtel lines
 * (parsed from the balance in each provider SMS) plus verified cash that has
 * been collected via deposit codes but not yet marked as banked.
 *
 * No target/ratio comparison — this card is purely "where is the float right now".
 */
export function PhoneMoneyCard() {
  const autoRefresh = useFinOpsAutoRefresh();

  const { data: phone, isLoading: phoneLoading } = useQuery({
    queryKey: ['finops-phone-money-lines'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_phone_platform_reconciliation' as any);
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        mtn: Number(d.mtn_balance ?? 0),
        airtel: Number(d.airtel_balance ?? 0),
        totalFloat: Number(d.total_float ?? 0),
      };
    },
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  // Cash at hand is role-gated inside the RPC; a denied call simply renders 0
  // rather than breaking the card for staff without finance roles.
  const { data: cash, isLoading: cashLoading } = useQuery({
    queryKey: ['finops-cash-at-hand-total'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cash_at_hand_total' as any);
      if (error) throw error;
      const d = (data ?? {}) as any;
      return { total: Number(d.cash_at_hand_total ?? 0), count: Number(d.verified_count ?? 0) };
    },
    retry: false,
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  const loading = phoneLoading || cashLoading;
  const mtn = phone?.mtn ?? 0;
  const airtel = phone?.airtel ?? 0;
  const cashAtHand = cash?.total ?? 0;
  const total = (phone?.totalFloat ?? 0) + cashAtHand;

  const rows = [
    { label: 'MTN Money', amount: mtn, dot: 'bg-yellow-400' },
    { label: 'Airtel Money', amount: airtel, dot: 'bg-red-500' },
    { label: 'Cash at Hand', amount: cashAtHand, dot: 'bg-emerald-500' },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 min-w-0 flex flex-col h-full">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          ACTUAL MONEY
        </p>
      </div>

      <p className="mt-4 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-foreground break-all">
        {loading ? '—' : formatUGX(total)}
      </p>

      <div className="mt-4 pt-4 border-t border-border space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.dot}`} />
              <span className="text-sm text-foreground truncate">{r.label}</span>
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground shrink-0">
              {loading ? '—' : formatUGX(r.amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <div className="mt-4 rounded-xl bg-primary/5 border border-primary/10 p-3 flex gap-2">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This represents the total float available on mobile money lines and cash awaiting banking.
        </p>
      </div>
    </div>
  );
}
