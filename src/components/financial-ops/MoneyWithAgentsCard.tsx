import { Wallet, HandCoins, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useMerchantFloatPositions } from '@/hooks/useMerchantFloat';

/**
 * Money With Agents — the truth board that sits directly below ACTUAL MONEY.
 *
 * Left column of every row is what the merchant genuinely paid out of their own
 * phone (claimed + settled cash-outs). Right column is the real money Finance
 * actually sent them, recognised only from the extracted MTN/Airtel email feed.
 * The difference is either money the company owes the merchant, or company cash
 * still sitting in the merchant's hands.
 *
 * Read-only. Reimbursement itself still runs through the existing float /
 * requisition path.
 */
export function MoneyWithAgentsCard({ onOpenTimeline }: { onOpenTimeline?: () => void }) {
  const { data, isLoading, error } = useMerchantFloatPositions();

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
              MONEY WITH AGENTS
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Company money in merchant hands vs what we still owe them
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
            Company cash in agents' hands
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-warning break-all">
            {isLoading ? '—' : formatUGX(heldTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Sent before it was worked off by claims</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Owed to agents
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground break-all">
            {isLoading ? '—' : formatUGX(owedTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Claimed &amp; paid out, not yet reimbursed</p>
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
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.agentName || r.label || 'Merchant agent'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.agentPhone || '—'} · paid out {formatUGX(r.paidOut)} · received {formatUGX(r.reimbursed)}
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
                    {holding ? 'holding company cash' : 'we owe agent'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-primary/5 border border-primary/10 p-3 flex gap-2">
        <Wallet className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A merchant may only demand money they have already claimed and paid out. Real money sent is
          recognised from the extracted MTN/Airtel emails, so this board cannot be inflated by hand.
        </p>
      </div>
    </div>
  );
}
