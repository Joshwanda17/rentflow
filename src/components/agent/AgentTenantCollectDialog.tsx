import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Banknote, AlertCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface AgentTenantCollectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: { id: string; full_name: string; phone: string } | null;
  rentRequestId: string;
  outstandingBalance: number;
  onSuccess?: () => void;
}

type PaymentMethod = 'cash' | 'mobile_money';

export function AgentTenantCollectDialog({
  open, onOpenChange, tenant, rentRequestId, outstandingBalance, onSuccess,
}: AgentTenantCollectDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoPayerName, setMomoPayerName] = useState('');
  const [momoTxnId, setMomoTxnId] = useState('');
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Airtel'>('MTN');

  useEffect(() => {
    if (open) {
      setAmount(0);
      setNotes('');
      setPaymentMethod('cash');
      setMomoPhone(tenant?.phone || '');
      setMomoPayerName('');
      setMomoTxnId('');
    }
  }, [open, tenant]);

  const isValid =
    amount >= 500 &&
    amount <= outstandingBalance &&
    (paymentMethod === 'cash' || (momoPhone.trim().length >= 10 && momoTxnId.trim().length >= 3));

  const handleCollect = async () => {
    if (!user || !isValid || !tenant) return;
    setLoading(true);
    try {
      // Generate tracking ID
      const txnId = `COL-${Date.now().toString(36).toUpperCase()}`;

      // Get float info for cash payments
      let floatBefore = 0;
      let floatAfter = 0;
      if (paymentMethod === 'cash') {
        const { data: floatData } = await supabase
          .from('agent_float_limits')
          .select('collected_today, float_limit')
          .eq('agent_id', user.id)
          .maybeSingle();
        if (floatData) {
          floatBefore = floatData.collected_today || 0;
          floatAfter = floatBefore + amount;
          if (floatAfter > floatData.float_limit) {
            toast.error('Float limit exceeded', {
              description: `Limit: ${formatUGX(floatData.float_limit)}, Used today: ${formatUGX(floatBefore)}`,
            });
            setLoading(false);
            return;
          }
        }
      }

      // Insert collection record
      const { data: collection, error: colError } = await supabase.from('agent_collections').insert({
        agent_id: user.id,
        tenant_id: tenant.id,
        amount,
        payment_method: paymentMethod,
        tracking_id: txnId,
        momo_phone: paymentMethod === 'mobile_money' ? momoPhone.trim() : null,
        momo_payer_name: paymentMethod === 'mobile_money' ? momoPayerName.trim() : null,
        momo_transaction_id: paymentMethod === 'mobile_money' ? momoTxnId.trim() : null,
        momo_provider: paymentMethod === 'mobile_money' ? momoProvider : null,
        notes: notes.trim() || `Collected from tenant profile`,
        float_before: paymentMethod === 'cash' ? floatBefore : 0,
        float_after: paymentMethod === 'cash' ? floatAfter : 0,
      } as any).select('id').single();

      if (colError) throw colError;

      // Update float counter for cash
      if (paymentMethod === 'cash') {
        await supabase
          .from('agent_float_limits')
          .update({ collected_today: floatAfter })
          .eq('agent_id', user.id);
      }

      // Fire SMS notification (fire-and-forget)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .single();

      supabase.functions.invoke('inngest-send-sms', {
        body: {
          tenant_name: tenant.full_name,
          tenant_phone: tenant.phone,
          agent_name: profile?.full_name || 'Agent',
          agent_phone: profile?.phone || '',
          amount,
          payment_mode: paymentMethod,
          tracking_id: txnId,
          date: format(new Date(), 'dd MMM yyyy'),
          collection_id: collection?.id,
        },
      }).catch(() => {});

      toast.success('Payment collected!', {
        description: `${formatUGX(amount)} from ${tenant.full_name} — Ref: ${txnId}`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error('Collection failed', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-5 w-5 text-success" />
            Collect from {tenant.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Outstanding balance */}
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Still Owes</p>
            <p className="text-xl font-bold text-destructive font-mono">{formatUGX(outstandingBalance)}</p>
          </div>

          {/* Payment method toggle */}
          <div>
            <Label className="text-xs mb-1.5 block">Payment Method</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all ${
                  paymentMethod === 'cash'
                    ? 'bg-success text-success-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <Banknote className="h-4 w-4" />
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod('mobile_money')}
                className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all ${
                  paymentMethod === 'mobile_money'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <Smartphone className="h-4 w-4" />
                Mobile Money
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <Label className="text-xs">Amount (UGX) *</Label>
            <Input
              type="number"
              placeholder="e.g. 13000"
              value={amount || ''}
              onChange={e => setAmount(Number(e.target.value))}
              min={500}
              max={outstandingBalance}
              className="h-12 text-lg font-mono font-bold"
              style={{ fontSize: '18px' }}
            />
            {amount > outstandingBalance && (
              <div className="flex items-center gap-1.5 mt-1">
                <AlertCircle className="h-3 w-3 text-destructive" />
                <p className="text-[10px] text-destructive">Cannot exceed what they owe</p>
              </div>
            )}
            {amount > 0 && amount <= outstandingBalance && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Remaining after: <span className="font-mono font-bold">{formatUGX(outstandingBalance - amount)}</span>
              </p>
            )}
          </div>

          {/* Quick amount buttons */}
          <div className="flex gap-2 flex-wrap">
            {[outstandingBalance, Math.ceil(outstandingBalance / 2), 10000, 20000, 50000]
              .filter((v, i, arr) => v > 0 && v <= outstandingBalance && arr.indexOf(v) === i)
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
                  {val === outstandingBalance ? 'Full' : formatUGX(val)}
                </button>
              ))}
          </div>

          {/* Mobile money fields */}
          {paymentMethod === 'mobile_money' && (
            <div className="space-y-2 rounded-xl bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMomoProvider('MTN')}
                  className={`h-10 rounded-lg text-xs font-bold ${momoProvider === 'MTN' ? 'bg-yellow-400 text-black' : 'bg-muted'}`}
                  style={{ touchAction: 'manipulation' }}
                >MTN</button>
                <button
                  onClick={() => setMomoProvider('Airtel')}
                  className={`h-10 rounded-lg text-xs font-bold ${momoProvider === 'Airtel' ? 'bg-red-500 text-white' : 'bg-muted'}`}
                  style={{ touchAction: 'manipulation' }}
                >Airtel</button>
              </div>
              <div>
                <Label className="text-[10px]">Sender Phone *</Label>
                <Input
                  value={momoPhone}
                  onChange={e => setMomoPhone(e.target.value)}
                  placeholder="256..."
                  className="h-10"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <Label className="text-[10px]">Sender Name</Label>
                <Input
                  value={momoPayerName}
                  onChange={e => setMomoPayerName(e.target.value)}
                  placeholder="Name on MoMo"
                  className="h-10"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <Label className="text-[10px]">Transaction ID *</Label>
                <Input
                  value={momoTxnId}
                  onChange={e => setMomoTxnId(e.target.value)}
                  placeholder="e.g. PP240416..."
                  className="h-10"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              placeholder="e.g. Collected at tenant's shop"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={300}
              rows={2}
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full h-12 text-base font-bold"
            onClick={handleCollect}
            disabled={!isValid || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
            Collect {formatUGX(amount || 0)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
