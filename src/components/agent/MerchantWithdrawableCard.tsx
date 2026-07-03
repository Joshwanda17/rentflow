import { useState } from 'react';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Wallet, ArrowUpRight } from 'lucide-react';
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
  const { withdrawableBalance, commissionBalance, isLoading } = useAgentBalances();
  const [showWithdraw, setShowWithdraw] = useState(false);

  const canWithdraw = !isLoading && withdrawableBalance > 0;

  return (
    <>
      <Card className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 text-emerald-600" /> Withdrawable Wallet
          </div>
          <p
            className={cn(
              'mt-1 text-2xl font-bold leading-tight tabular-nums text-emerald-700 dark:text-emerald-400',
            )}
          >
            {isLoading ? '—' : formatUGX(withdrawableBalance)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400/80">
            <Coins className="h-3 w-3" /> Commission earned · {formatUGX(commissionBalance)}
          </p>
        </div>

        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={!canWithdraw}
          onClick={() => setShowWithdraw(true)}
        >
          <ArrowUpRight className="h-4 w-4" />
          Withdraw
        </Button>
      </Card>

      <WithdrawFlow
        open={showWithdraw}
        onOpenChange={setShowWithdraw}
        availableBalance={withdrawableBalance}
      />
    </>
  );
}

export default MerchantWithdrawableCard;
