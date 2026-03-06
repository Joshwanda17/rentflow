import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { Loader2, CheckCircle2, ArrowDownCircle, AlertCircle, Smartphone, Building2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface AgentDepositCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AgentDepositCashDialog({ open, onOpenChange, onSuccess }: AgentDepositCashDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'mtn' | 'airtel' | 'bank'>('mtn');
  const [transactionId, setTransactionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    setAmount(''); setMethod('mtn'); setTransactionId(''); setSuccess(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!transactionId.trim() || transactionId.trim().length < 8) {
      toast({ title: 'Enter a valid transaction/reference ID (min 8 chars)', variant: 'destructive' });
      return;
    }

    setLoading(true);

    // Reset float capacity: reduce collected_today by deposit amount (or set to 0)
    const { data: floatData } = await supabase
      .from('agent_float_limits')
      .select('collected_today')
      .eq('agent_id', profile.id)
      .maybeSingle();

    if (floatData) {
      const newCollected = Math.max(0, floatData.collected_today - amountNum);
      await supabase
        .from('agent_float_limits')
        .update({ collected_today: newCollected, updated_at: new Date().toISOString() })
        .eq('agent_id', profile.id);
    }

    setLoading(false);
    setSuccess(true);
    toast({ title: 'Deposit recorded! Float capacity restored.' });
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-success" />
            Deposit Collected Cash
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold">Deposit Received!</h3>
            <p className="text-sm text-muted-foreground">{formatUGX(parseFloat(amount))}</p>
            <p className="text-sm font-medium text-success">Float Capacity Restored</p>
            <Button onClick={handleClose} className="w-full h-12">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (UGX)</Label>
              <Input
                type="number"
                placeholder="e.g. 200000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12"
                min="1"
              />
            </div>

            <div className="space-y-3">
              <Label>Deposit Method</Label>
              <RadioGroup value={method} onValueChange={(v) => setMethod(v as any)} className="space-y-2">
                {[
                  { value: 'mtn', label: 'MTN MoMo Merchant', icon: Smartphone, color: 'text-yellow-600', code: '090777' },
                  { value: 'airtel', label: 'Airtel Money Merchant', icon: Smartphone, color: 'text-red-600', code: '4380664' },
                  { value: 'bank', label: 'Bank Deposit Reference', icon: Building2, color: 'text-blue-600', code: '' },
                ].map(opt => (
                  <Label
                    key={opt.value}
                    htmlFor={`deposit-${opt.value}`}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      method === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <RadioGroupItem value={opt.value} id={`deposit-${opt.value}`} className="sr-only" />
                    <opt.icon className={`h-5 w-5 ${opt.color}`} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{opt.label}</p>
                      {opt.code && <p className="text-xs text-muted-foreground">{opt.code}</p>}
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Transaction / Reference ID</Label>
              <Input
                type="text"
                placeholder="e.g. TID12345678"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                className="h-12 font-mono uppercase"
                maxLength={30}
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                From your mobile money SMS or bank deposit slip
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1 h-12">Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1 h-12">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Deposit'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
