import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  Copy
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

const formVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 }
  },
};

// Helper: create an AbortSignal that times out after ms
function timeoutSignal(ms: number): AbortSignal {
  if ('timeout' in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

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
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety-net: force loading=false after 20s
  useEffect(() => {
    if (loading) {
      loadingTimerRef.current = setTimeout(() => {
        console.error('[DepositDialog] Safety-net: forcing loading=false after 20s');
        setLoading(false);
        toast.error('Request timed out. Please try again.');
      }, 20000);
    } else if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [loading]);

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

  const validateForm = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return false;
    }
    if (!transactionId.trim()) {
      toast.error('Please enter the transaction ID from your SMS');
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

    // Validate date is not in the future and within last 7 days (local time)
    const txDateOnly = new Date(transactionDate + 'T00:00:00');
    const todayDateOnly = new Date(today + 'T00:00:00');
    const sevenDaysAgoDate = new Date(sevenDaysAgo + 'T00:00:00');

    if (txDateOnly > todayDateOnly) {
      toast.error('Transaction date cannot be in the future');
      return false;
    }
    if (txDateOnly < sevenDaysAgoDate) {
      toast.error('Transaction must be within the last 7 days');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    if (!validateForm()) return;

    setLoading(true);

    try {
      const normalizedTxId = transactionId.trim().toUpperCase();

      console.log('[DepositDialog] Inserting deposit request for txn:', normalizedTxId);

      const { error: depositError } = await supabase
        .from('deposit_requests')
        .insert({
          user_id: user.id,
          amount: parseFloat(amount),
          status: 'pending' as string,
          provider: provider,
          transaction_id: normalizedTxId,
          transaction_date: `${transactionDate}T${transactionTime}:00`,
          notes: reason.trim(),
        });

      if (depositError) {
        if (
          depositError.code === '23505' ||
          depositError.message?.toLowerCase().includes('duplicate') ||
          depositError.message?.toLowerCase().includes('unique')
        ) {
          toast.error('This transaction ID has already been submitted');
          return;
        }
        throw depositError;
      }

      console.log('[DepositDialog] Deposit request submitted successfully');
      toast.success('Deposit request submitted for verification');

      setSuccess(true);
    } catch (error: any) {
      console.error('[DepositDialog] Deposit error:', error);
      toast.error(error.message || 'Failed to submit deposit request');
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
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto border-border/50 glass-card">
        <div className="absolute inset-0 bg-gradient-to-br from-success/5 via-transparent to-primary/5 pointer-events-none" />
        
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="py-8 flex flex-col items-center justify-center relative text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' as const, stiffness: 300, damping: 20, delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-semibold"
              >
                Request Submitted!
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground text-sm px-4"
              >
                Your deposit of {formatCurrency(parseFloat(amount || '0'))} is being verified
              </motion.p>
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
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <motion.div
                    className="p-2 rounded-lg bg-success/10"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
                  >
                    <Plus className="h-5 w-5 text-success" />
                  </motion.div>
                  Deposit Money
                </DialogTitle>
                <DialogDescription>
                  Pay via mobile money and enter your transaction details below
                </DialogDescription>
              </DialogHeader>

              <motion.form 
                onSubmit={handleSubmit} 
                className="space-y-4 mt-4"
                variants={formVariants}
                initial="hidden"
                animate="visible"
              >
                {/* How to deposit instructions */}
                <motion.div variants={itemVariants} className="p-3 bg-primary/10 rounded-lg border border-primary/20">
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
                </motion.div>

                {/* Provider Selection */}
                <motion.div variants={itemVariants} className="space-y-2">
                  <Label>Select Provider</Label>
                  <RadioGroup 
                    value={provider} 
                    onValueChange={(v) => setProvider(v as 'mtn' | 'airtel')}
                    className="grid grid-cols-2 gap-3"
                  >
                    <Label 
                      htmlFor="mtn-wallet" 
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
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
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
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
                </motion.div>

                {/* Merchant Code Display */}
                <motion.div 
                  variants={itemVariants} 
                  className="p-4 bg-muted rounded-lg text-center space-y-1"
                >
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
                </motion.div>

                {/* Amount */}
                <motion.div variants={itemVariants} className="space-y-2">
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
                    className="bg-background/50 border-border/50 focus:border-primary/50 transition-all text-lg font-medium"
                    min="500"
                    required
                  />
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    Quick amounts
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((amt, index) => (
                      <motion.div
                        key={amt}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 + index * 0.05 }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          type="button"
                          variant={amount === amt.toString() ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAmount(amt.toString())}
                          className="transition-all"
                        >
                          {formatCurrency(amt)}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* Transaction ID */}
                <motion.div variants={itemVariants} className="space-y-2">
                  <Label htmlFor="txId" className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    Transaction ID (Required)
                  </Label>
                  <Input
                    id="txId"
                    type="text"
                    placeholder="e.g. MP123456789"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                    className="bg-background/50 border-border/50 focus:border-primary/50 font-mono uppercase"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in your SMS confirmation from {provider.toUpperCase()}
                  </p>
                </motion.div>

                {/* Date and Time */}
                <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
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
                </motion.div>

                {/* Reason / Narration */}
                <motion.div variants={itemVariants} className="space-y-2">
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
                </motion.div>

                {/* Warning */}
                <motion.div 
                  variants={itemVariants}
                  className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20"
                >
                  <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Please ensure all details match your mobile money SMS. Incorrect information may delay verification.
                  </p>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Button 
                    type="submit" 
                    disabled={loading} 
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
                </motion.div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
