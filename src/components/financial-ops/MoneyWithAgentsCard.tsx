import { useState } from 'react';
import { Wallet, HandCoins, ArrowRightLeft, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useMerchantFloatPositions, MerchantFloatPosition } from '@/hooks/useMerchantFloat';
import { MerchantReconcileDialog } from './MerchantReconcileDialog';
import { MerchantFloatStatementDialog } from './MerchantFloatStatementDialog';
import { MerchantOwnMoneyReviewPanel } from './MerchantOwnMoneyReviewPanel';

/**
 * Money With Agents — shows how much company money is still sitting with each
 * agent, and how much the company still owes each agent.
 *
 * Left side: what the agent actually paid out from their own phone (mobile money
 * cash-outs we can see). Right side: the real money Finance sent them, confirmed
 * from MTN/Airtel payment emails. If the agent paid out more than we sent them,
 * we owe them. If we sent them more than they paid out, they are holding our
 * cash.
 *
 * Read-only. Paying back still runs through the existing float path.
 */
export function MoneyWithAgentsCard({ onOpenTimeline }: { onOpenTimeline?: () => void }) {
  const { data, isLoading, error } = useMerchantFloatPositions();
  const [reconciling, setReconciling] = useState<MerchantFloatPosition | null>(null);
  const [statementFor, setStatementFor] = useState<MerchantFloatPosition | null>(null);

  const rows = (data ?? []).filter((r) => r.paidOut > 0 || r.reimbursed > 0 || r.companyCashWithAgent > 0);
  const heldTotal = rows.reduce((s, r) => s + r.companyCashWithAgent, 0);
  const owedTotal = rows.reduce((s, r) => s + r.owedToAgent, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
            <HandCoins className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              MONEY WITH MERCHANT AGENTS
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Our cash sitting on their phones vs money they already spent for us
            </p>
          </div>
        </div>
        {onOpenTimeline && (
          <button
            type="button"
            onClick={onOpenTimeline}
            className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Settlement timeline
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Our cash still on their phones
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-warning break-all">
            {isLoading ? '—' : formatUGX(heldTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            We already sent them this money and they have not used it yet
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Money we must send back to them
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground break-all">
            {isLoading ? '—' : formatUGX(owedTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            They used their own phone money to pay our customers. We have not refunded them yet.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            This board is only visible to finance roles.
          </p>
        </div>
      )}

      {!error && (
        <div className="mt-4 border-t border-border pt-3 space-y-2">
          {isLoading && <p className="text-xs text-muted-foreground">Loading merchant positions…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">No merchant activity in the current window.</p>
          )}
          {rows.map((r) => {
            const holding = r.companyCashWithAgent > 0;
            return (
              <div
                key={r.deskId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 min-w-0"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setStatementFor(r)}
                    className="text-sm font-medium text-foreground truncate hover:text-primary hover:underline text-left w-full"
                  >
                    {r.agentName || r.label || 'Merchant agent'}
                  </button>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.agentPhone || '—'} · they paid out {formatUGX(r.paidOut)} · we paid them back {formatUGX(r.reimbursed)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`font-mono text-sm font-bold tabular-nums ${
                      holding ? 'text-warning' : 'text-foreground'
                    }`}
                  >
                    {formatUGX(holding ? r.companyCashWithAgent : r.owedToAgent)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {holding ? 'our money still on their phone' : 'we must send this back to them'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setReconciling(r)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                  >
                    <SlidersHorizontal className="h-3 w-3" /> Fix balance
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-primary/5 border border-primary/10 p-3 flex gap-2">
        <Wallet className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A merchant agent can only ask for a refund of money they have already sent out from their
          own phone. We refund it only after we see the MTN or Airtel message proving what they
          paid. If the two figures do not match, the gap must be corrected with a written reason.
        </p>
      </div>

      <div className="mt-2 rounded-xl bg-warning/5 border border-warning/20 p-3 flex gap-2">
        <ArrowRightLeft className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">How to pay them:</span> send the money to
          the merchant agent's float number using MTN or Airtel only. The MTN/Airtel confirmation
          message is read automatically and the real money on our side goes down on its own — never
          adjust these figures by hand. Financial Ops pays merchant agents only, never customers:
          customer withdrawal requests are claimed and paid out by merchant agents.
        </p>
      </div>

      <MerchantReconcileDialog
        position={reconciling}
        open={!!reconciling}
        onOpenChange={(v) => !v && setReconciling(null)}
      />

      <MerchantFloatStatementDialog
        position={statementFor}
        open={!!statementFor}
        onOpenChange={(v) => !v && setStatementFor(null)}
      />

      <div className="mt-4">
        <MerchantOwnMoneyReviewPanel />
      </div>
    </div>
  );
}
