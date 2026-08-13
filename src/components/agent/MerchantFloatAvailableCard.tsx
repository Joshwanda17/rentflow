import { useState } from 'react';
import {
  Wallet, AlertTriangle, Hand, Smartphone, BadgeCheck, HandCoins, Signal, Flag, ChevronDown,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { Button } from '@/components/ui/button';
import { MerchantBalanceDisputeDialog } from './MerchantBalanceDisputeDialog';
import { useMyBalanceDisputes } from '@/hooks/useMerchantBalanceDisputes';
import {
  useMerchantPayoutFloat,
  useMerchantFloatPositions,
  useMerchantOutOfPocket,
  useMerchantOutOfPocketRows,
} from '@/hooks/useMerchantFloat';

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
  const { data: oop } = useMerchantOutOfPocket();
  const { data: oopRows } = useMerchantOutOfPocketRows();
  const { data: myDisputes } = useMyBalanceDisputes();
  const [disputeOpen, setDisputeOpen] = useState(false);

  const mine = positions?.[0];
  const owed = mine?.owedToAgent ?? 0;
  const holding = mine?.companyCashWithAgent ?? 0;
  const pending = (myDisputes ?? []).filter((d) => d.status === 'open' || d.status === 'reviewing');
  const lastAnswered = (myDisputes ?? []).find((d) => d.status === 'resolved' || d.status === 'rejected');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <section className="space-y-3">
      {/* Headline: the only number a merchant needs before claiming. */}
      <div className="rounded-3xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold">Company money you can send out</h3>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-foreground break-all">
          {isLoading ? '—' : formatUGX(pool?.availableFloat ?? 0)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every payout you send reduces this. If a request is bigger than what is left, send it anyway —
          your own money is recorded and paid back.
        </p>
      </div>

      {/* Three plain money answers. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">We owe you</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400 break-all">
            {formatUGX(owed + (oop?.owedToAgent ?? 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">You have sent</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-foreground break-all">
            {formatUGX(mine?.paidOut ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Charges today</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-foreground break-all">
            {formatUGX(oop?.telecomToday ?? 0)}
          </p>
        </div>
      </div>

      {holding > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-foreground">
            <span className="font-bold">{formatUGX(holding)}</span> of company cash is already with you.
            Clear it by claiming and paying requests.
          </p>
        </div>
      )}

      {/* Everything else folds away — merchants open it only when they check figures. */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 p-3.5 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HandCoins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Your own money & charges
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
        </button>

        {detailsOpen && (
          <div className="space-y-3 border-t border-border/60 p-3.5">
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Your own money used — we pay this back
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400 break-all">
                {formatUGX(oop?.owedToAgent ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {(oop?.pendingCount ?? 0)} payout{(oop?.pendingCount ?? 0) === 1 ? '' : 's'} waiting to be paid back
                {(oop?.reimbursedTotal ?? 0) > 0 && ` · ${formatUGX(oop!.reimbursedTotal)} already paid back`}
              </p>
              {!!oopRows?.length && (
                <ul className="mt-2 space-y-1.5">
                  {oopRows.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ·{' '}
                        {r.kind === 'telecom' ? 'Sending charge' : `Payout ${formatUGX(r.payoutAmount)}`}
                      </span>
                      <span className="font-semibold text-foreground shrink-0 tabular-nums">
                        {formatUGX(r.shortfallAmount)}
                        {r.status === 'reimbursed' && ' ✓'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border/60 pt-3">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Signal className="h-3.5 w-3.5 text-primary" /> What MTN / Airtel charge you to send
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: 'Today', value: oop?.telecomToday ?? 0 },
                  { label: 'This month', value: oop?.telecomMonth ?? 0 },
                  { label: 'All time', value: oop?.telecomTotal ?? 0 },
                ].map((c) => (
                  <div key={c.label}>
                    <p className="text-[11px] text-muted-foreground">{c.label}</p>
                    <p className="text-sm font-bold tabular-nums text-foreground break-all">{formatUGX(c.value)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Paid from company money when there is enough, otherwise added to what we owe you.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* How it works — folded by default, plain three steps. */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5">
        <button
          type="button"
          onClick={() => setHelpOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 p-3.5 text-left"
        >
          <span className="text-sm font-semibold text-primary">How paying out works</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-primary transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
        </button>
        {helpOpen && (
          <ol className="space-y-2.5 border-t border-primary/20 p-3.5">
            <li className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
              <Hand className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <span><span className="font-semibold">Claim</span> a request under “To pay”. No waiting for approval.</span>
            </li>
            <li className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
              <Smartphone className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <span><span className="font-semibold">Send the money</span> from your MTN or Airtel line and attach the proof.</span>
            </li>
            <li className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <span><span className="font-semibold">Get paid back</span> — Finance sends money to your line and the provider message clears it automatically.</span>
            </li>
          </ol>
        )}
      </div>

      {/* Report a wrong figure to Financial Ops. */}
      <Button variant="outline" className="w-full gap-2" onClick={() => setDisputeOpen(true)}>
        <Flag className="h-4 w-4" /> These figures are not what I have
      </Button>
      {pending.length > 0 && (
        <p className="text-xs font-medium text-warning">
          {pending.length} request{pending.length === 1 ? '' : 's'} with Finance right now.
        </p>
      )}
      {pending.length === 0 && lastAnswered && (
        <p className="text-xs text-muted-foreground">
          Last request {lastAnswered.status === 'resolved' ? 'was fixed' : 'was not accepted'}
          {lastAnswered.resolutionNote ? ` — ${lastAnswered.resolutionNote}` : ''}.
        </p>
      )}

      <MerchantBalanceDisputeDialog
        open={disputeOpen}
        onOpenChange={setDisputeOpen}
        deskId={mine?.deskId ?? null}
        amounts={{
          owed_to_agent: owed,
          company_cash_with_agent: holding,
          paid_out: mine?.paidOut ?? 0,
          out_of_pocket: oop?.owedToAgent ?? 0,
          float_available: pool?.availableFloat ?? 0,
        }}
      />
    </section>
  );
}
