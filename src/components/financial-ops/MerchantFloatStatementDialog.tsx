import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowDownLeft, ArrowUpRight, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { MerchantFloatPosition, useMerchantFloatStatement } from '@/hooks/useMerchantFloat';
import { Button } from '@/components/ui/button';
import { downloadAuditPdf } from '@/lib/pdfAuditReport';

const CATEGORY_LABELS: Record<string, string> = {
  agent_float_deposit: 'Float sent to agent',
  agent_float_settlement: 'Paid out / telecom charge',
  agent_float_return: 'Float returned to company',
};

function label(category: string) {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

/**
 * Statement of one merchant agent's float movement — money we sent them and
 * money that left their float as payouts / telecom charges, with the balance
 * after each line. Read-only.
 */
export function MerchantFloatStatementDialog({
  position,
  open,
  onOpenChange,
}: {
  position: MerchantFloatPosition | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading, error } = useMerchantFloatStatement(position?.agentId, open);

  if (!position) return null;

  const rows = data ?? [];
  const inTotal = rows.filter((r) => r.direction === 'cash_in').reduce((s, r) => s + r.amount, 0);
  const outTotal = rows.filter((r) => r.direction === 'cash_out').reduce((s, r) => s + r.amount, 0);
  const balance = rows.length ? rows[0].runningBalance : 0;

  const handleDownloadPdf = async () => {
    const name = position.agentName || position.label || 'Merchant agent';
    await downloadAuditPdf(
      `merchant_float_statement_${(position.agentPhone || name).replace(/[^\w]+/g, '_')}`,
      ['Date', 'Movement', 'Details', 'In (UGX)', 'Out (UGX)', 'Balance (UGX)'],
      rows.map((r) => [
        format(new Date(r.date), 'yyyy-MM-dd HH:mm'),
        label(r.category),
        r.description || r.referenceId || '—',
        r.direction === 'cash_in' ? formatUGX(r.amount) : '',
        r.direction === 'cash_out' ? formatUGX(r.amount) : '',
        formatUGX(r.runningBalance),
      ]),
      {
        title: `${name} — Float Statement`,
        subtitle: `${position.agentPhone || '—'} · company float movement`,
        footerLabel: 'Welile FinOps — Merchant float statement',
        kpis: [
          { label: 'Float sent in', value: formatUGX(inTotal) },
          { label: 'Float used', value: formatUGX(outTotal) },
          { label: 'Float left', value: formatUGX(balance) },
        ],
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {position.agentName || position.label || 'Merchant agent'} — float statement
          </DialogTitle>
          <DialogDescription className="text-xs">
            {position.agentPhone || '—'} · every movement of the company float this agent holds
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={isLoading || rows.length === 0}
            onClick={handleDownloadPdf}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" /> Download PDF
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Float sent in</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-success break-all">{formatUGX(inTotal)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Float used</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-destructive break-all">{formatUGX(outTotal)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Float left</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-foreground break-all">{formatUGX(balance)}</p>
          </div>
        </div>

        <div className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
          {isLoading && <p className="p-4 text-xs text-muted-foreground">Loading statement…</p>}
          {error && (
            <p className="p-4 text-xs text-muted-foreground">
              This statement is only visible to finance roles.
            </p>
          )}
          {!isLoading && !error && rows.length === 0 && (
            <p className="p-4 text-xs text-muted-foreground">No float movement recorded for this agent yet.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 min-w-0">
              <div
                className={`p-1.5 rounded-lg shrink-0 ${
                  r.direction === 'cash_in' ? 'bg-success/10' : 'bg-destructive/10'
                }`}
              >
                {r.direction === 'cash_in' ? (
                  <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{label(r.category)}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {r.description || r.referenceId || '—'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    r.direction === 'cash_in' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {r.direction === 'cash_in' ? '+' : '-'}
                  {formatUGX(r.amount)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(r.date), 'MMM d, HH:mm')} · bal {formatUGX(r.runningBalance)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}