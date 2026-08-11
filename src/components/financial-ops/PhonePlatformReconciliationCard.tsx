import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Smartphone, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';

interface PhoneMoneyCardProps {
  /**
   * Compact mode (Overview) shows just the hero number plus the MTN/Airtel/
   * Cash-at-Hand breakdown. Full mode (Reconciliation tool tab) additionally
   * shows each mobile-money line's "last SMS seen" timestamp.
   */
  compact?: boolean;
}

interface PhoneMoneyData {
  mtnBalance: number;
  mtnLastSmsAt: string | null;
  airtelBalance: number;
  airtelLastSmsAt: string | null;
  totalFloat: number;
  cashAtHand: number;
}

export function PhonePlatformReconciliationCard({ compact = false }: PhoneMoneyCardProps) {
  const autoRefresh = useFinOpsAutoRefresh();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finops-phone-money'],
    queryFn: async (): Promise<PhoneMoneyData> => {
      const [phoneRes, cashRes] = await Promise.all([
        supabase.rpc('get_phone_platform_reconciliation' as any),
        supabase.rpc('get_cash_at_hand_total' as any),
      ]);
      if (phoneRes.error) throw phoneRes.error;
      if (cashRes.error) throw cashRes.error;
      const p = phoneRes.data as any;
      const c = cashRes.data as any;
      return {
        mtnBalance: Number(p?.mtn_balance ?? 0),
        mtnLastSmsAt: p?.mtn_last_sms_at ?? null,
        airtelBalance: Number(p?.airtel_balance ?? 0),
        airtelLastSmsAt: p?.airtel_last_sms_at ?? null,
        totalFloat: Number(p?.total_float ?? 0),
        cashAtHand: Number(c?.cash_at_hand_total ?? 0),
      };
    },
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  const heroTotal = (data?.totalFloat ?? 0) + (data?.cashAtHand ?? 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
          Phone Money
        </p>
      </div>

      {isError ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Couldn't load merchant-line balances. Try again shortly.
        </p>
      ) : (
        <>
          <p className="text-2xl sm:text-3xl font-black tabular-nums text-foreground break-all">
            {isLoading ? '—' : formatUGX(heroTotal)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Mobile money float plus cash awaiting banking
          </p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 border border-border p-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full bg-warning shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">MTN Money</p>
                  {!compact && (
                    <p className="text-[10px] text-muted-foreground">
                      {isLoading
                        ? '—'
                        : data?.mtnLastSmsAt
                          ? `Last SMS ${formatDistanceToNow(new Date(data.mtnLastSmsAt), { addSuffix: true })}`
                          : 'No balance SMS yet'}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold tabular-nums text-foreground shrink-0">
                {isLoading ? '—' : formatUGX(data?.mtnBalance ?? 0)}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 border border-border p-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Airtel Money</p>
                  {!compact && (
                    <p className="text-[10px] text-muted-foreground">
                      {isLoading
                        ? '—'
                        : data?.airtelLastSmsAt
                          ? `Last SMS ${formatDistanceToNow(new Date(data.airtelLastSmsAt), { addSuffix: true })}`
                          : 'No balance SMS yet'}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold tabular-nums text-foreground shrink-0">
                {isLoading ? '—' : formatUGX(data?.airtelBalance ?? 0)}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 border border-border p-3">
              <div className="flex items-center gap-2 min-w-0">
                <Banknote className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cash at Hand</p>
              </div>
              <p className="text-sm font-bold tabular-nums text-foreground shrink-0">
                {isLoading ? '—' : formatUGX(data?.cashAtHand ?? 0)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground">
            Total float available on mobile money lines and cash from verified deposits not yet banked.
          </p>
        </>
      )}
    </div>
  );
}
