import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Banknote, AlertCircle, CheckCircle2, Wallet, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgentLandlordFloat } from '@/hooks/useAgentLandlordFloat';
import { formatUGX } from '@/lib/rentCalculations';
import { CommissionCelebration } from './CommissionCelebration';

interface AgentTenantCollectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: { id: string; full_name: string; phone: string } | null;
  rentRequestId: string;
  outstandingBalance: number;
  onSuccess?: () => void;
}

export function AgentTenantCollectDialog({
  open, onOpenChange, tenant, rentRequestId, outstandingBalance, onSuccess,
}: AgentTenantCollectDialogProps) {
  const { user } = useAuth();
  const { floatBalance, refetch: refetchBalances } = useAgentLandlordFloat(user?.id);
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{ commission: number; amount: number } | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(0);
      setNotes('');
      setResult(null);
      setConfirming(false);
      refetchBalances();
    }
  }, [open]);

  const maxAllowable = Math.max(0, Math.min(outstandingBalance, floatBalance));
  const canAllocate = floatBalance >= 100 && outstandingBalance >= 100;
  const isValid = amount >= 100 && amount <= maxAllowable;

  // Auto-suggest amount when dialog opens and float is available
  useEffect(() => {
    if (open && amount === 0 && maxAllowable >= 100) {
      setAmount(maxAllowable);
    }
  }, [open, maxAllowable]);

  const handleAllocate = async () => {
    if (!user || !isValid || !tenant) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('agent_allocate_tenant_payment', {
        p_agent_id: user.id,
        p_tenant_id: tenant.id,
        p_rent_request_id: rentRequestId,
        p_amount: amount,
        p_notes: notes.trim() || null,
      });

      if (error) throw error;

      const res = data as any;
      if (!res.success) {
        toast.error('Allocation failed', { description: res.error });
        setLoading(false);
        return;
      }

      setResult(res);
      setConfirming(false);
      refetchBalances();

      // 🎉 Trigger commission celebration — pure UI, no DB calls
      // Source priority: API response → fallback to client-side 10% estimate
      const earnedCommission = Number(res?.commission?.credited_commission)
        || Math.round(amount * 0.10);
      if (earnedCommission > 0) {
        setCelebrationData({ commission: earnedCommission, amount });
        setCelebrationOpen(true);
      }

      toast.success('Payment allocated!', {
        description: `${formatUGX(amount)} moved from float for ${tenant.full_name}`,
      });
    } catch (err: any) {
      toast.error('Allocation failed', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (result) onSuccess?.();
    onOpenChange(false);
  };

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading && !confirming) handleClose(); }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-5 w-5 text-success" />
            Pay for {tenant.full_name}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          /* ───── Success View ───── */
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h3 className="text-lg font-bold">Payment Allocated!</h3>
              <p className="text-xs text-muted-foreground">Ref: {result.tracking_id}</p>
            </div>

            <div className="bg-muted/30 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono font-bold">{formatUGX(result.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tenant</span>
                <span className="font-semibold">{tenant.full_name}</span>
              </div>
              <div className="border-t border-border/40 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Float Before</span>
                  <span className="font-mono">{formatUGX(result.float_before)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Float After</span>
                  <span className="font-mono font-bold">{formatUGX(result.float_after)}</span>
                </div>
              </div>
              <div className="border-t border-border/40 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Still Owes</span>
                  <span className={`font-mono font-bold ${result.outstanding_remaining > 0 ? 'text-destructive' : 'text-success'}`}>
                    {result.outstanding_remaining > 0 ? formatUGX(result.outstanding_remaining) : 'Fully Paid ✓'}
                  </span>
                </div>
              </div>
              {result.commission && (
                <div className="border-t border-border/40 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /> Commission Earned</span>
                    <span className="font-mono font-bold text-success">
                      {formatUGX(result.commission?.credited_commission || Math.round(result.amount * 0.10))}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">10% instantly credited to your commission wallet</p>
                </div>
              )}
              {result.commission_balance !== undefined && (
                <div className="border-t border-border/40 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">🔒 Commission Untouched</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatUGX(result.commission_balance)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Float-only deduction — commission compartment preserved.</p>
                </div>
              )}
            </div>

            <Button onClick={handleClose} className="w-full h-12 font-bold">Done</Button>
          </div>
        ) : (
          /* ───── Allocation Form ───── */
          <div className="space-y-3">
            {/* Float balance */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center gap-3">
              <Wallet className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Operations Float</p>
                <p className="text-lg font-bold font-mono text-primary">{formatUGX(floatBalance)}</p>
              </div>
            </div>

            {/* Outstanding balance */}
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{tenant.full_name} Owes</p>
              <p className="text-xl font-bold text-destructive font-mono">{formatUGX(outstandingBalance)}</p>
            </div>

            {!canAllocate && floatBalance < 100 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">Your operations float is empty. Top it up before paying tenant rent.</p>
              </div>
            )}

            {canAllocate && floatBalance < outstandingBalance && (
              <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-xl p-3">
                <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning-foreground">
                  You can pay up to <span className="font-mono font-bold">{formatUGX(maxAllowable)}</span> right now (limited by your float). The tenant will still owe the rest.
                </p>
              </div>
            )}

            {/* Amount */}
            <div>
              <Label className="text-xs">Amount (UGX) *</Label>
              <Input
                type="number"
                placeholder="e.g. 13000"
                value={amount || ''}
                onChange={e => setAmount(Number(e.target.value))}
                min={100}
                max={maxAllowable}
                className="h-12 text-lg font-mono font-bold"
                style={{ fontSize: '18px' }}
              />
              {amount > outstandingBalance && (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <p className="text-[10px] text-destructive">Cannot exceed what they owe</p>
                </div>
              )}
              {amount > floatBalance && amount <= outstandingBalance && (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <p className="text-[10px] text-destructive">Exceeds your float balance</p>
                </div>
              )}
              {amount > 0 && amount <= maxAllowable && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground">
                    Remaining debt: <span className="font-mono font-bold">{formatUGX(outstandingBalance - amount)}</span>
                  </p>
                  <p className="text-[10px] text-success font-semibold">
                    Commission: +{formatUGX(Math.round(amount * 0.10))} (10%)
                  </p>
                </div>
              )}
            </div>

            {/* Quick amount buttons — always clamped to maxAllowable */}
            <div className="flex gap-2 flex-wrap">
              {Array.from(new Set([
                maxAllowable,
                Math.min(maxAllowable, Math.ceil(outstandingBalance / 2)),
                Math.min(maxAllowable, 10000),
                Math.min(maxAllowable, 20000),
                Math.min(maxAllowable, 50000),
              ]))
                .filter(v => v >= 100)
                .slice(0, 4)
                .map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      amount === val ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground'
                    }`}
                    style={{ touchAction: 'manipulation', minHeight: '36px' }}
                  >
                    {val === maxAllowable && val < outstandingBalance ? `Max ${formatUGX(val)}` : val === outstandingBalance ? 'Full' : formatUGX(val)}
                  </button>
                ))}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                placeholder="e.g. Month of April rent"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>

            {/* Submit → opens confirmation */}
            <Button
              className="w-full h-12 text-base font-bold"
              onClick={() => setConfirming(true)}
              disabled={!isValid || loading}
            >
              <Banknote className="h-4 w-4 mr-2" />
              Review {formatUGX(amount || 0)}
            </Button>
          </div>
        )}
      </DialogContent>

      {/* ───── Confirmation Sub-Dialog (nested, properly portaled) ───── */}
      <Dialog open={confirming} onOpenChange={(o) => { if (!loading) setConfirming(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-warning" />
              Confirm Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">
              Double-check the amount before allocating. This cannot be undone.
            </p>

            <div className="bg-muted/40 rounded-xl p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tenant</span>
                <span className="font-bold">{tenant.full_name}</span>
              </div>
              <div className="flex justify-between items-baseline border-t border-border/40 pt-2.5">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono font-black text-2xl text-primary">{formatUGX(amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Float after</span>
                <span className="font-mono">{formatUGX(floatBalance - amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tenant still owes</span>
                <span className="font-mono">{formatUGX(outstandingBalance - amount)}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-border/40 pt-2">
                <span className="text-success font-semibold">Your commission (10%)</span>
                <span className="font-mono font-bold text-success">+{formatUGX(Math.round(amount * 0.10))}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setConfirming(false)}
                disabled={loading}
              >
                Edit
              </Button>
              <Button
                className="flex-1 h-12 font-bold"
                onClick={handleAllocate}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🎉 Commission Celebration — pure UI, no DB calls */}
      {celebrationData && (
        <CommissionCelebration
          open={celebrationOpen}
          onOpenChange={setCelebrationOpen}
          commissionAmount={celebrationData.commission}
          paymentAmount={celebrationData.amount}
          tenantName={tenant.full_name}
        />
      )}
    </Dialog>
  );
}
