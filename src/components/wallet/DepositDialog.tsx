import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Loader2, 
  Plus, 
  Coins, 
  CheckCircle2, 
  Sparkles, 
  Phone, 
  Clock, 
  Hash,
  Calendar,
  AlertCircle,
  History,
  Copy,
  XCircle
} from 'lucide-react';

interface DepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MERCHANT_CODES = {
  mtn: '090777',
  airtel: '4380664',
};

const MERCHANT_NAME = 'WELILE TECHNOLOGIES LIMITTED';

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000];

export function DepositDialog({ open, onOpenChange }: DepositDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [transactionId, setTransactionId] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [txIdStatus, setTxIdStatus] = useState<'idle' | 'checking' | 'valid' | 'duplicate'>('idle');
  const txIdCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced duplicate check — only matches first 5 chars of transaction_id
  const checkTransactionId = useCallback(async (txId: string) => {
    const normalized = txId.trim().toUpperCase();
    if (normalized.length < 5) {
      setTxIdStatus('idle');
      return;
    }
    setTxIdStatus('checking');
    try {
      const prefix = normalized.substring(0, 5);
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('transaction_id')
        .ilike('transaction_id', `${prefix}%`)
        .limit(10);
      if (error) {
        setTxIdStatus('idle');
        return;
      }
      // Check if any existing transaction_id shares the same first 5 chars
      const isDuplicate = data?.some(row => 
        row.transaction_id?.toUpperCase().startsWith(prefix)
      );
      setTxIdStatus(isDuplicate ? 'duplicate' : 'valid');
    } catch {
      setTxIdStatus('idle');
    }
  }, []);

  const handleTransactionIdChange = (value: string) => {
    const upper = value.toUpperCase();
    setTransactionId(upper);
    setTxIdStatus('idle');
    if (txIdCheckRef.current) clearTimeout(txIdCheckRef.current);
    if (upper.trim().length >= 5) {
      txIdCheckRef.current = setTimeout(() => checkTransactionId(upper), 600);
    }
  };

  useEffect(() => {
    return () => {
      if (txIdCheckRef.current) clearTimeout(txIdCheckRef.current);
    };
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Use LOCAL date to avoid UTC offset issues (e.g. Uganda UTC+3)
  const pad = (n: number) => n.toString().padStart(2, '0');
  const nowLocal = new Date();
  const today = `${nowLocal.getFullYear()}-${pad(nowLocal.getMonth() + 1)}-${pad(nowLocal.getDate())}`;
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = `${sevenAgo.getFullYear()}-${pad(sevenAgo.getMonth() + 1)}-${pad(sevenAgo.getDate())}`;

  const copyMerchantCode = async () => {
    try {
      await navigator.clipboard.writeText(MERCHANT_CODES[provider]);
      setCopiedCode(true);
      toast.success(`Merchant code ${MERCHANT_CODES[provider]} copied!`);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    // Quick local validation only — no re-checking DB
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { toast.error('Please enter a valid amount'); return; }
    if (!transactionId.trim()) { toast.error('Please enter the transaction ID'); return; }
    if (!transactionDate) { toast.error('Please select the date'); return; }
    if (!transactionTime) { toast.error('Please enter the time'); return; }
    if (!reason.trim()) { toast.error('Please enter the reason'); return; }
    if (txIdStatus === 'duplicate') { toast.error('This transaction ID already exists'); return; }

    setLoading(true);

    try {
      const { error: depositError } = await supabase
        .from('deposit_requests')
        .insert({
          user_id: user.id,
          amount: amountNum,
          status: 'pending' as string,
          provider: provider,
          transaction_id: transactionId.trim().toUpperCase(),
          transaction_date: `${transactionDate}T${transactionTime}:00`,
          notes: reason.trim(),
        });

      if (depositError) throw depositError;

      toast.success('Deposit request submitted!');
      setSuccess(true);
    } catch (error: any) {
      if (error?.code === '23505') {
        toast.error('This transaction ID has already been submitted');
        setTxIdStatus('duplicate');
      } else {
        toast.error(error.message || 'Failed to submit deposit request');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setAmount('');
      setProvider('mtn');
      setTransactionId('');
      setTransactionDate('');
      setTransactionTime('');
      setReason('');
      setSuccess(false);
      setTxIdStatus('idle');
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent stable className="sm:max-w-md max-h-[90vh] overflow-y-auto border-border/50">
        {success ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="text-lg font-semibold">Request Submitted!</p>
            <p className="text-muted-foreground text-sm px-4">
              Your deposit of {formatCurrency(parseFloat(amount || '0'))} is being verified
            </p>
            <div className="space-y-2 w-full px-4">
              <Button onClick={() => handleClose(false)} className="w-full">Done</Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  handleClose(false);
                  navigate('/deposit-history');
                }}
              >
                <History className="h-4 w-4 mr-2" />
                View Deposit History
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-success/10">
                  <Plus className="h-5 w-5 text-success" />
                </div>
                Deposit Money
              </DialogTitle>
              <DialogDescription>
                Pay via mobile money and enter your transaction details below
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* How to deposit instructions */}
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  How to deposit:
                </h4>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Dial *165# (MTN) or *185# (Airtel)</li>
                  <li>Select "Pay Bill" or "Merchant Payment"</li>
                  <li>Enter the merchant code shown below</li>
                  <li>Enter amount and confirm with PIN</li>
                  <li>Come back here and enter your transaction details</li>
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
                    htmlFor="mtn-wallet" 
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors touch-manipulation ${
                      provider === 'mtn' 
                        ? 'border-yellow-500 bg-yellow-500/10' 
                        : 'border-border hover:border-yellow-500/50'
                    }`}
                  >
                    <RadioGroupItem value="mtn" id="mtn-wallet" className="sr-only" />
                    <div className="w-7 h-7 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold text-xs">
                      MTN
                    </div>
                    <span className="font-medium text-sm">MTN MoMo</span>
                  </Label>
                  <Label 
                    htmlFor="airtel-wallet" 
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors touch-manipulation ${
                      provider === 'airtel' 
                        ? 'border-red-500 bg-red-500/10' 
                        : 'border-border hover:border-red-500/50'
                    }`}
                  >
                    <RadioGroupItem value="airtel" id="airtel-wallet" className="sr-only" />
                    <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-xs">
                      AIR
                    </div>
                    <span className="font-medium text-sm">Airtel Money</span>
                  </Label>
                </RadioGroup>
              </div>

              {/* Merchant Code Display */}
              <div className="p-4 bg-muted rounded-lg text-center space-y-1">
                <p className="text-xs text-muted-foreground">Merchant Code for {provider.toUpperCase()}</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-2xl font-mono font-bold tracking-wider">
                    {MERCHANT_CODES[provider]}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={copyMerchantCode}
                    className="h-8 w-8 p-0"
                  >
                    {copiedCode ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-primary font-medium">{MERCHANT_NAME}</p>
                <p className="text-xs text-muted-foreground">You'll see this name when making payment</p>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="flex items-center gap-2">
                  <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                  Amount Deposited (UGX)
                </Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-background/50 border-border/50 focus:border-primary/50 transition-colors text-lg font-medium"
                  min="500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Quick amounts
                </Label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant={amount === amt.toString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAmount(amt.toString())}
                    >
                      {formatCurrency(amt)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Transaction ID */}
              <div className="space-y-2">
                <Label htmlFor="txId" className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  Transaction ID (Required)
                </Label>
                <Input
                  id="txId"
                  type="text"
                  placeholder="e.g. MP123456789"
                  value={transactionId}
                  onChange={(e) => handleTransactionIdChange(e.target.value)}
                  className={`bg-background/50 font-mono uppercase transition-colors ${
                    txIdStatus === 'valid' 
                      ? 'border-success focus:border-success' 
                      : txIdStatus === 'duplicate' 
                        ? 'border-destructive focus:border-destructive' 
                        : 'border-border/50 focus:border-primary/50'
                  }`}
                  required
                />
                {txIdStatus === 'checking' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking transaction ID...
                  </p>
                )}
                {txIdStatus === 'valid' && (
                  <p className="text-xs text-success flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Transaction ID is valid
                  </p>
                )}
                {txIdStatus === 'duplicate' && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <XCircle className="h-3.5 w-3.5" />
                    This transaction ID has already been submitted
                  </p>
                )}
                {txIdStatus === 'idle' && (
                  <p className="text-xs text-muted-foreground">
                    Find this in your SMS confirmation from {provider.toUpperCase()}
                  </p>
                )}
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="txDate" className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Date
                  </Label>
                  <Input
                    id="txDate"
                    type="date"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    min={sevenDaysAgo}
                    max={today}
                    className="bg-background/50 border-border/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="txTime" className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Time
                  </Label>
                  <Input
                    id="txTime"
                    type="time"
                    value={transactionTime}
                    onChange={(e) => setTransactionTime(e.target.value)}
                    className="bg-background/50 border-border/50"
                    required
                  />
                </div>
              </div>

              {/* Reason / Narration */}
              <div className="space-y-2">
                <Label htmlFor="deposit-reason" className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  Reason / Narration *
                </Label>
                <Input
                  id="deposit-reason"
                  type="text"
                  placeholder="e.g. Rent repayment, Access fee, Wallet top-up"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-background/50 border-border/50 focus:border-primary/50"
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

              <Button 
                type="submit" 
                disabled={loading || txIdStatus === 'duplicate' || txIdStatus === 'checking'} 
                className="w-full gap-2"
                size="lg"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Submit Deposit Request
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
