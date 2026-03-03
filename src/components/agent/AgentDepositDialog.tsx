import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowDownCircle, Smartphone, AlertCircle, Calendar, Clock, Info } from 'lucide-react';

interface AgentDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AgentDepositDialog({ open, onOpenChange, onSuccess }: AgentDepositDialogProps) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [transactionId, setTransactionId] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    details?: {
      total_deposited: number;
      auto_repayment: number;
      agent_commission: number;
      to_landlord: number;
      to_wallet: number;
      user_name: string;
    };
  } | null>(null);
  const { toast } = useToast();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', { 
      style: 'currency', 
      currency: 'UGX',
      minimumFractionDigits: 0 
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone.trim() || !amount.trim()) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    if (!transactionId.trim()) {
      toast({ 
        title: 'Transaction ID Required', 
        description: `Please enter the ${provider.toUpperCase()} transaction ID from the customer's payment`,
        variant: 'destructive' 
      });
      return;
    }

    // Validate transaction ID format
    const trimmedTxnId = transactionId.trim().toUpperCase();
    if (trimmedTxnId.length < 8) {
      toast({ 
        title: 'Invalid Transaction ID', 
        description: 'Transaction ID must be at least 8 characters',
        variant: 'destructive' 
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    if (!narration.trim()) {
      toast({ title: 'Reason / Narration is required', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('agent-deposit', {
        body: { 
          user_phone: phone.trim(), 
          amount: amountNum,
          provider: provider,
          transaction_id: trimmedTxnId
        },
      });

      if (error) throw error;

      setResult({ success: true, details: data.details });
      toast({ title: 'Deposit successful!' });
      onSuccess?.();
    } catch (error: any) {
      toast({ 
        title: 'Deposit failed', 
        description: error.message || 'Please try again',
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhone('');
    setAmount('');
    setProvider('mtn');
    setTransactionId('');
    setTransactionDate('');
    setTransactionTime('');
    setNarration('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-success" />
            Process Customer Deposit
          </DialogTitle>
        </DialogHeader>

        {result?.success ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center mb-3">
                <ArrowDownCircle className="h-8 w-8 text-success" />
              </div>
              <h3 className="text-lg font-semibold">Deposit Complete!</h3>
              <p className="text-muted-foreground">{result.details?.user_name}</p>
            </div>

            <div className="space-y-2 bg-secondary/50 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Deposited</span>
                <span className="font-mono font-semibold">{formatCurrency(result.details?.total_deposited || 0)}</span>
              </div>
              
              {(result.details?.auto_repayment || 0) > 0 && (
                <>
                  <div className="border-t pt-2 mt-2">
                    <p className="text-sm text-muted-foreground mb-2">Auto Rent Repayment:</p>
                    <div className="flex justify-between text-sm">
                      <span>To Landlord</span>
                      <span className="font-mono">{formatCurrency(result.details?.to_landlord || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-success">
                      <span>Your Commission (5%)</span>
                      <span className="font-mono">+{formatCurrency(result.details?.agent_commission || 0)}</span>
                    </div>
                  </div>
                </>
              )}
              
              {(result.details?.to_wallet || 0) > 0 && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">To Customer Wallet</span>
                  <span className="font-mono">{formatCurrency(result.details?.to_wallet || 0)}</span>
                </div>
              )}
            </div>

            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Customer Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g. 0700123456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (UGX)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                min="1"
                className="h-12"
              />
            </div>

            {/* Payment Provider Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Payment Provider
              </Label>
              <RadioGroup
                value={provider}
                onValueChange={(v) => setProvider(v as 'mtn' | 'airtel')}
                className="grid grid-cols-2 gap-3"
                disabled={loading}
              >
                <Label
                  htmlFor="mtn"
                  className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    provider === 'mtn'
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : 'border-border hover:border-yellow-500/50'
                  }`}
                >
                  <RadioGroupItem value="mtn" id="mtn" className="sr-only" />
                  <div className="text-center">
                    <div className="font-bold text-yellow-600">MTN</div>
                    <div className="text-xs text-muted-foreground">090777</div>
                  </div>
                </Label>
                <Label
                  htmlFor="airtel"
                  className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    provider === 'airtel'
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-border hover:border-red-500/50'
                  }`}
                >
                  <RadioGroupItem value="airtel" id="airtel" className="sr-only" />
                  <div className="text-center">
                    <div className="font-bold text-red-600">Airtel</div>
                    <div className="text-xs text-muted-foreground">4380664</div>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* Transaction ID */}
            <div className="space-y-2">
              <Label htmlFor="transactionId" className="flex items-center gap-2">
                Transaction ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="transactionId"
                type="text"
                placeholder={provider === 'mtn' ? 'e.g. 12345678901' : 'e.g. CI240125...'}
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                disabled={loading}
                className="h-12 font-mono uppercase"
                maxLength={30}
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Enter the transaction ID from the customer's {provider.toUpperCase()} payment confirmation SMS
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Find this in your SMS confirmation from {provider.toUpperCase()}
            </p>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="txnDate" className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5" />
                  Date
                </Label>
                <Input
                  id="txnDate"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="txnTime" className="flex items-center gap-1.5 text-sm">
                  <Clock className="h-3.5 w-3.5" />
                  Time
                </Label>
                <Input
                  id="txnTime"
                  type="time"
                  value={transactionTime}
                  onChange={(e) => setTransactionTime(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>
            </div>

            {/* Reason / Narration */}
            <div className="space-y-2">
              <Label htmlFor="narration" className="flex items-center gap-1.5 text-sm">
                <Info className="h-3.5 w-3.5" />
                Reason / Narration <span className="text-destructive">*</span>
              </Label>
              <Input
                id="narration"
                type="text"
                placeholder="e.g. Rent repayment, Access fee, Wallet top-up"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                disabled={loading}
                className="h-12"
                maxLength={200}
              />
            </div>

            {/* Warning */}
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Please ensure all details match your mobile money SMS. Incorrect information may delay verification.
              </p>
            </div>

            <div className="bg-secondary/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                💡 If customer has an active rent repayment, the deposit will automatically be applied with your 5% commission deducted.
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1 h-12" disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-12" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Process Deposit'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
