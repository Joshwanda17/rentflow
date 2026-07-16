import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, ArrowUpRight, Zap } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import WithdrawFlow from '@/components/payments/WithdrawFlow';

/**
 * Withdrawable Wallet card for the merchant (cash-out) agent tab.
 *
 * Every confirmed payout credits a 0.5% commission into the agent's
 * WITHDRAWABLE bucket (general_ledger category `agent_commission_earned`).
 * This card surfaces that earned, spendable balance right next to the
 * "Available Float" card so the merchant can see and cash out what they
 * have earned. Float (company money) is never withdrawable and is shown
 * separately by MerchantFloatRequestCard.
 */
export function MerchantWithdrawableCard() {
  const { user } = useAuth();
  // Merchant's Available Commission = lifetime cashout-commission earned
  // minus commission already explicitly withdrawn. Same math the Commission
  // Summary uses, so the two figures always agree.
  const { data: withdrawableBalance = 0, isLoading } = useQuery({
    queryKey: ['merchant-available-commission', user?.id],
    enabled: !!user,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return 0;
      const [earnedRes, withdrawnRes] = await Promise.all([
        supabase
          .from('general_ledger')
          .select('amount')
          .eq('user_id', user.id)
          .eq('ledger_scope', 'wallet')
          .eq('direction', 'cash_in')
          .eq('category', 'agent_commission_earned')
          .like('reference_id', '%-cashout-commission'),
        supabase
          .from('general_ledger')
          .select('amount')
          .eq('user_id', user.id)
          .eq('ledger_scope', 'wallet')
          .eq('direction', 'cash_out')
          .in('category', ['agent_commission_withdrawal', 'agent_commission_used_for_rent']),
      ]);
      const earned = (earnedRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const withdrawn = (withdrawnRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      return Math.max(0, earned - withdrawn);
    },
  });
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [prefillMax, setPrefillMax] = useState(false);

  const canWithdraw = !isLoading && withdrawableBalance > 0;

  const openWithdraw = (max: boolean) => {
    setPrefillMax(max);
    setShowWithdraw(true);
  };

  return (
    <>
      <Card className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-emerald-600" /> Withdrawable Commission
            </div>
            <p
              className={cn(
                'mt-1 text-3xl font-black leading-tight tabular-nums text-emerald-700 dark:text-emerald-400',
              )}
            >
              {isLoading ? '—' : formatUGX(withdrawableBalance)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
              Available to withdraw now
            </p>
          </div>

          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={!canWithdraw}
            onClick={() => openWithdraw(false)}
          >
            <ArrowUpRight className="h-4 w-4" />
            Withdraw
          </Button>
        </div>

        {canWithdraw && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
            onClick={() => openWithdraw(true)}
          >
            <Zap className="h-3.5 w-3.5" />
            Withdraw All · {formatUGX(withdrawableBalance)}
          </Button>
        )}
      </Card>

      <WithdrawFlow
        open={showWithdraw}
        onOpenChange={setShowWithdraw}
        availableBalance={withdrawableBalance}
        initialAmount={prefillMax ? withdrawableBalance : undefined}
        defaultWithdrawalReason="Commission payout"
        trustAvailableBalance
      />
    </>
  );
}

export default MerchantWithdrawableCard;
