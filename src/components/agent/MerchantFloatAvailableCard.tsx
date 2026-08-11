import { Wallet, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useMerchantPayoutFloat, useMerchantFloatPositions } from '@/hooks/useMerchantFloat';

/**
 * Float available to pay out — the shared company payout pool (all withdrawable
 * wallet balances + agent landlord payout float, less payouts already claimed
 * and not yet settled), plus this merchant's own settlement position.
 *
 * Read-only display. Claiming and settling behave exactly as before.
 */
export function MerchantFloatAvailableCard() {
  const { data: pool, isLoading } = useMerchantPayoutFloat();
  const { data: positions } = useMerchantFloatPositions();

  const mine = positions?.[0];
  const owed = mine?.owedToAgent ?? 0;
  const holding = mine?.companyCashWithAgent ?? 0;

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">Float available to pay out</h3>
      </div>

      <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground break-all">
        {isLoading ? '—' : formatUGX(pool?.availableFloat ?? 0)}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Shared company pool. Claim a request, pay it out, and it reduces here.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Finance owes you
          </p>
          <p className="mt-1 font-mono text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 break-all">
            {formatUGX(owed)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            You have paid out
          </p>
          <p className="mt-1 font-mono text-base font-bold tabular-nums text-foreground break-all">
            {formatUGX(mine?.paidOut ?? 0)}
          </p>
        </div>
      </div>

      {holding > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-foreground">
            <span className="font-bold">{formatUGX(holding)}</span> of company cash is in your hands —
            money sent to you before you claimed payouts. Work it off by claiming and paying requests.
          </p>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        You may only demand money you have already claimed and paid out. Real money sent to your MTN or
        Airtel line is recognised automatically from the provider messages.
      </p>
    </section>
  );
}
