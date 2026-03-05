import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, CheckCircle2, Phone, Calendar, Clock, Hash, AlertCircle, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DepositFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance?: number;
}

const MERCHANT_CODES = {
  mtn: '090777',
  airtel: '4380664',
};

const MERCHANT_NAME = 'WELILE TECHNOLOGIES LIMITTED';

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000];

export default function DepositFlow({
  open,
  onOpenChange,
}: DepositFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'submitting' | 'success'>('form');
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', { 
      style: 'currency', 
      currency: 'UGX',
      minimumFractionDigits: 0 
    }).format(value);
  };

  const validateForm = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return false;
    }
    if (!transactionId.trim()) {
      toast.error('Please enter the transaction ID');
      return false;
    }
    if (!transactionDate) {
      toast.error('Please select the transaction date');
      return false;
    }
    if (!transactionTime) {
      toast.error('Please enter the transaction time');
      return false;
    }
    if (!reason.trim()) {
      toast.error('Please enter the reason for this deposit');
      return false;
    }

    // Validate date is not in the future and within last 7 days
    const txDate = new Date(`${transactionDate}T${transactionTime}`);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (txDate > now) {
      toast.error('Transaction date cannot be in the future');
      return false;
    }
    if (txDate < sevenDaysAgo) {
      toast.error('Transaction must be within the last 7 days');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    setStep('submitting');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to continue');
        setStep('form');
        return;
      }

      const txDateTime = new Date(`${transactionDate}T${transactionTime}`);
      const normalizedTxId = `TID${transactionId.trim().toUpperCase()}`;

      // Check for duplicate transaction ID using raw query to avoid type issues
      const { data: existingDeposits } = await supabase
        .from('deposit_requests')
        .select('id')
        .filter('transaction_id', 'eq', normalizedTxId);

      if (existingDeposits && existingDeposits.length > 0) {
        toast.error('This transaction ID has already been used');
        setStep('form');
        setIsSubmitting(false);
        return;
      }

      // manager_recorded_transactions table removed - skip auto-verify
      let autoVerified = false;
      const managerRecord: any = null;

      // Create deposit request - cast to any to handle new columns not yet in types
      const { error: depositError } = await supabase
        .from('deposit_requests')
        .insert({
          user_id: user.id,
          amount: parseFloat(amount),
          status: autoVerified ? 'approved' : 'pending',
          provider: provider,
          transaction_id: normalizedTxId,
          transaction_date: txDateTime.toISOString(),
          notes: reason.trim(),
        } as any);

      if (depositError) throw depositError;

      // If auto-verified, credit wallet immediately
      if (autoVerified && managerRecord) {
        // Update wallet balance
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', user.id)
          .single();

        if (wallet) {
          await supabase
            .from('wallets')
            .update({ balance: wallet.balance + parseFloat(amount) })
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('wallets')
            .insert({ user_id: user.id, balance: parseFloat(amount) });
        }

        // manager_recorded_transactions table removed - skip

        // Notification removed - table dropped

        toast.success('Deposit verified and added to your wallet!');
      } else {
        // Notification removed - table dropped

        toast.success('Deposit request submitted for verification');
      }

      setStep('success');
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast.error(error.message || 'Failed to submit deposit request');
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('form');
    setProvider('mtn');
    setAmount('');
    setTransactionId('');
    setTransactionDate('');
    setTransactionTime('');
    setReason('');
    onOpenChange(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Deposit to Wallet
          </DialogTitle>
        </DialogHeader>

        {step === 'success' ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold">Request Submitted!</h3>
            <p className="text-muted-foreground text-sm">
              Your deposit request is being verified. You'll receive a notification once it's approved.
            </p>
            <div className="space-y-2">
              <Button onClick={handleClose} className="w-full">Done</Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  handleClose();
                  navigate('/deposit-history');
                }}
              >
                <History className="h-4 w-4 mr-2" />
                View Deposit History
              </Button>
            </div>
          </div>
        ) : step === 'submitting' ? (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Submitting your deposit request...</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Instructions */}
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <h4 className="font-medium text-sm mb-2">How to deposit:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Dial *165# (MTN) or *185# (Airtel)</li>
                <li>Select "Pay Bill" or "Merchant Payment"</li>
                <li>Enter the merchant code below</li>
                <li>Enter amount and confirm</li>
                <li>Come back here and enter details</li>
              </ol>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <Label>Select Provider</Label>
              <RadioGroup 
                value={provider} 
                onValueChange={(v) => setProvider(v as 'mtn' | 'airtel')}
                className="grid grid-cols-2 gap-3"
              >
                <Label 
                  htmlFor="mtn" 
                  className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    provider === 'mtn' 
                      ? 'border-yellow-500 bg-yellow-500/10' 
                      : 'border-border hover:border-yellow-500/50'
                  }`}
                >
                  <RadioGroupItem value="mtn" id="mtn" className="sr-only" />
                  <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold text-xs">
                    MTN
                  </div>
                  <span className="font-medium">MTN MoMo</span>
                </Label>
                <Label 
                  htmlFor="airtel" 
                  className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    provider === 'airtel' 
                      ? 'border-red-500 bg-red-500/10' 
                      : 'border-border hover:border-red-500/50'
                  }`}
                >
                  <RadioGroupItem value="airtel" id="airtel" className="sr-only" />
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-xs">
                    AIR
                  </div>
                  <span className="font-medium">Airtel Money</span>
                </Label>
              </RadioGroup>
            </div>

            {/* Merchant Code Display */}
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground mb-1">Merchant Code for {provider.toUpperCase()}</p>
              <p className="text-2xl font-mono font-bold tracking-wider">
                {MERCHANT_CODES[provider]}
              </p>
              <p className="text-xs text-primary font-medium mt-1">
                {MERCHANT_NAME}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You'll see this name when making payment
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount Deposited (UGX)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="500"
                className="text-lg font-semibold"
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant={amount === String(amt) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAmount(String(amt))}
                  >
                    {formatCurrency(amt)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Transaction ID */}
            <div className="space-y-2">
              <Label htmlFor="txId" className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Transaction ID
              </Label>
                <div className="flex items-center rounded-lg border border-border overflow-hidden">
                  <span className="px-3 py-2 bg-muted text-muted-foreground font-mono text-sm font-semibold border-r border-border select-none">
                    TID
                  </span>
                  <Input
                    id="txId"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 123456789"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value.replace(/\D/g, ''))}
                    className="font-mono border-0 focus:ring-0 focus:ring-offset-0 rounded-l-none"
                  />
                </div>
              <p className="text-xs text-muted-foreground">
                Find this in your SMS confirmation from {provider.toUpperCase()}
              </p>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="txDate" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date
                </Label>
                <Input
                  id="txDate"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  min={sevenDaysAgo}
                  max={today}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="txTime" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Time
                </Label>
                <Input
                  id="txTime"
                  type="time"
                  value={transactionTime}
                  onChange={(e) => setTransactionTime(e.target.value)}
                />
              </div>
            </div>

            {/* Reason / Narration */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Reason / Narration *
              </Label>
              <Input
                id="reason"
                type="text"
                placeholder="e.g. Rent repayment, Access fee, Wallet top-up"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20">
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Please ensure all details match your mobile money SMS. Incorrect information may delay verification.
              </p>
            </div>

            {/* Submit */}
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Deposit Request'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
