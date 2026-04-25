import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  PendingBatch,
  channelLabel,
  rejectBatchAsFinOps,
  verifyBatchAsFinOps,
} from '@/lib/fieldDepositBatches';
import { FieldDepositAuditTrail } from './FieldDepositAuditTrail';

interface Props {
  batch: PendingBatch | null;
  open: boolean;
  onClose: () => void;
  onResolved: () => void;
}

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
const COMMISSION_RATE = 0.10; // mirrors process_verified_field_deposit RPC

export function FieldDepositVerifyDialog({ batch, open, onClose, onResolved }: Props) {
  const [proof, setProof] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'verify' | 'reject' | null>(null);

  const taggedTotal = useMemo(
    () => batch?.items.reduce((s, i) => s + Number(i.amount || 0), 0) ?? 0,
    [batch],
  );
  const surplus = batch ? Math.max(0, Number(batch.declared_total || 0) - taggedTotal) : 0;
  const totalCommission = useMemo(
    () =>
      batch?.items.reduce(
        (s, i) => s + Math.round(Number(i.amount || 0) * COMMISSION_RATE),
        0,
      ) ?? 0,
    [batch],
  );

  const proofMatches = useMemo(() => {
    if (!batch?.proof_reference || !proof) return false;
    return norm(proof) === norm(batch.proof_reference);
  }, [proof, batch?.proof_reference]);

  const handleVerify = async () => {
    if (!batch) return;
    if (!proofMatches) {
      toast.error('Proof does not match. Re-enter the exact reference.');
      return;
    }
    setBusy('verify');
    try {
      const res = await verifyBatchAsFinOps(batch.id, proof.trim());
      const r = res?.result ?? {};
      toast.success(
        `Verified. Allocated ${formatUGX(Number(r.total_allocated ?? 0))} · commission ${formatUGX(Number(r.total_commission ?? 0))}`,
      );
      setProof('');
      onResolved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Verification failed');
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!batch) return;
    if (reason.trim().length < 4) {
      toast.error('Please provide a clear rejection reason');
      return;
    }
    setBusy('reject');
    try {
      await rejectBatchAsFinOps(batch.id, reason.trim());
      toast.success('Batch rejected. Agent has been notified.');
      setReason('');
      onResolved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Rejection failed');
    } finally {
      setBusy(null);
    }
  };

  if (!batch) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : null)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Verify Field Deposit</DialogTitle>
          <DialogDescription>
            Confirm the proof matches what the agent submitted. Verification credits float, allocates rent, and pays commission.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span className="font-medium">
                  {batch.agent_name ?? batch.agent_id.slice(0, 8)}
                  {batch.agent_phone ? ` · ${batch.agent_phone}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Channel</span>
                <span className="font-medium">{channelLabel(batch.channel)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Declared total</span>
                <span className="font-mono font-semibold">{formatUGX(Number(batch.declared_total))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tagged to tenants</span>
                <span className="font-mono">{formatUGX(taggedTotal)}</span>
              </div>
              {surplus > 0 && (
                <div className="flex justify-between text-warning">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Surplus → unallocated float
                  </span>
                  <span className="font-mono">{formatUGX(surplus)}</span>
                </div>
              )}
              {batch.proof_submitted_at && (
                <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span>Proof submitted</span>
                  <span>{format(new Date(batch.proof_submitted_at), 'MMM d, HH:mm')}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                {batch.items.length} tagged collection{batch.items.length === 1 ? '' : 's'}
              </div>
              <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                {batch.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{it.tenant_name ?? '—'}</div>
                      {it.tenant_phone && (
                        <div className="text-xs text-muted-foreground">{it.tenant_phone}</div>
                      )}
                    </div>
                    <div className="font-mono text-sm">{formatUGX(Number(it.amount))}</div>
                  </div>
                ))}
                {batch.items.length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                    No tenants tagged. Surplus will sit as unallocated agent float.
                  </div>
                )}
              </div>
            </div>

            {/* Commission breakdown — recorded as platform expense on verify */}
            {batch.items.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
                  <span>Commission breakdown ({Math.round(COMMISSION_RATE * 100)}% per repayment)</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    Recorded as expense
                  </span>
                </div>
                <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                  {batch.items.map((it) => {
                    const amt = Number(it.amount || 0);
                    const comm = Math.round(amt * COMMISSION_RATE);
                    return (
                      <div
                        key={`comm-${it.id}`}
                        className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 text-sm"
                      >
                        <div className="truncate">
                          <span className="font-medium">{it.tenant_name ?? '—'}</span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {formatUGX(amt)}
                        </div>
                        <div className="font-mono text-sm text-success min-w-[90px] text-right">
                          +{formatUGX(comm)}
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 text-sm bg-muted/40">
                    <div className="font-semibold">Total commission expense</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatUGX(taggedTotal)}
                    </div>
                    <div className="font-mono font-semibold text-success min-w-[90px] text-right">
                      +{formatUGX(totalCommission)}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  On verify, each tenant repayment credits the agent wallet and books a matching{' '}
                  <span className="font-medium text-foreground">agent commission expense</span> to the platform ledger.
                </p>
              </div>
            )}

            {/* Verify */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Re-enter proof reference to verify
              </Label>
              <Input
                placeholder="MTN TID, Airtel Ref, Bank Ref or Cash Receipt #"
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                disabled={busy !== null}
                className="font-mono"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Agent submitted:{' '}
                  <span className="font-mono text-foreground">{batch.proof_reference ?? '—'}</span>
                </span>
                {proof && (
                  <Badge variant={proofMatches ? 'default' : 'destructive'} className="text-[10px]">
                    {proofMatches ? 'Match' : 'Mismatch'}
                  </Badge>
                )}
              </div>
            </div>

            {/* Reject */}
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Reject this batch
              </Label>
              <Textarea
                placeholder="Reason (e.g. proof not found in MTN portal, amount mismatch)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy !== null}
                rows={2}
              />
            </div>

            <FieldDepositAuditTrail batchId={batch.id} />
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={busy !== null || reason.trim().length < 4}
            className="sm:mr-auto"
          >
            {busy === 'reject' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
            Reject
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy !== null}>
            Close
          </Button>
          <Button onClick={handleVerify} disabled={busy !== null || !proofMatches}>
            {busy === 'verify' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Verify & credit float
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}