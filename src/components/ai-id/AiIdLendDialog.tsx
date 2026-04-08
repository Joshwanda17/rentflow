import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Banknote,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Calendar,
  ShieldCheck,
  User,
  Info,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetAiId: string;
  maxAmount: number;
}

type RepaymentFrequency = 'daily' | 'weekly' | 'monthly';

const AGENT_FEE_RATE = 0.05; // 5%

export function AiIdLendDialog({ open, onOpenChange, targetAiId, maxAmount }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [frequency, setFrequency] = useState<RepaymentFrequency>('daily');
  const [durationDays, setDurationDays] = useState('90');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerId, setBorrowerId] = useState('');
  const [resolving, setResolving] = useState(false);
  const [insuranceAccepted, setInsuranceAccepted] = useState(false);

  // Resolve AI ID to get borrower name on open
  useEffect(() => {
    if (!open || !targetAiId) return;
    let cancelled = false;
    (async () => {
      setResolving(true);
      try {
        const { data: resolvedId } = await supabase.rpc('resolve_welile_ai_id', { ai_id: targetAiId });
        if (!resolvedId || cancelled) { setResolving(false); return; }
        setBorrowerId(resolvedId as string);
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', resolvedId as string)
          .maybeSingle();
        if (!cancelled) setBorrowerName(profile?.full_name || 'Unknown User');
      } catch { /* ignore */ }
      if (!cancelled) setResolving(false);
    })();
    return () => { cancelled = true; };
  }, [open, targetAiId]);

  const lendAmount = parseInt(amount) || 0;
  const lenderInterest = parseFloat(interestRate) || 0;
  const days = parseInt(durationDays) || 90;
  const agentFee = Math.round(lendAmount * AGENT_FEE_RATE);
  const lenderReturn = Math.round(lendAmount * (lenderInterest / 100));
  const totalBorrowerRepayment = lendAmount + agentFee + lenderReturn;

  const getPaymentCount = () => {
    if (frequency === 'daily') return days;
    if (frequency === 'weekly') return Math.ceil(days / 7);
    return Math.ceil(days / 30);
  };

  const paymentCount = getPaymentCount();
  const perPayment = paymentCount > 0 ? Math.ceil(totalBorrowerRepayment / paymentCount) : 0;

  const handleLend = async () => {
    if (!user || !borrowerId) return;
    if (lendAmount <= 0) { toast.error('Enter a valid amount'); return; }
    if (lendAmount > maxAmount) { toast.error(`Maximum is ${formatUGX(maxAmount)}`); return; }
    if (borrowerId === user.id) { toast.error('You cannot facilitate yourself'); return; }

    setLoading(true);
    try {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!wallet || wallet.balance < lendAmount) {
        toast.error('Insufficient wallet balance');
        setLoading(false);
        return;
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);

      const { error: loanError } = await supabase.from('user_loans').insert({
        borrower_id: borrowerId,
        lender_id: user.id,
        amount: lendAmount,
        interest_rate: lenderInterest + AGENT_FEE_RATE * 100,
        total_repayment: totalBorrowerRepayment,
        due_date: dueDate.toISOString().split('T')[0],
        repayment_frequency: frequency,
        ai_insurance_accepted: true,
        ai_insurance_accepted_at: new Date().toISOString(),
      });

      if (loanError) {
        if (loanError.message?.includes('policy')) {
          toast.error('You do not have permission to facilitate');
        } else {
          toast.error('Failed to create facilitation');
          console.error('Loan error:', loanError);
        }
        setLoading(false);
        return;
      }

      // Transfer funds via edge function (ledger-based, trigger handles wallet balance)
      const { error: transferError } = await supabase.functions.invoke('wallet-transfer', {
        body: {
          recipient_id: borrowerId,
          amount: lendAmount,
          description: `AI ID facilitation to ${borrowerName} (${targetAiId})`,
        },
      });

      if (transferError) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(transferError, 'Transfer failed');
        toast.error(msg);
        setLoading(false);
        return;
      }

      setSuccess(true);
      toast.success('Facilitation completed!');
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setInterestRate('');
    setFrequency('daily');
    setDurationDays('90');
    setSuccess(false);
    setStep(1);
    setBorrowerName('');
    setBorrowerId('');
    setInsuranceAccepted(false);
    onOpenChange(false);
  };

  const canProceedStep1 = lendAmount > 0 && lendAmount <= maxAmount && borrowerId;
  const canProceedStep2 = frequency && days > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Facilitate via Wallet
          </DialogTitle>
          <DialogDescription>
            {targetAiId} · Max {formatUGX(maxAmount)}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {!success && (
          <div className="flex items-center gap-1 justify-center pb-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s === step ? 'w-8 bg-primary' : s < step ? 'w-6 bg-primary/40' : 'w-6 bg-muted'
                }`}
              />
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-lg">Facilitation Complete!</h3>
              <p className="text-sm text-muted-foreground">
                {formatUGX(lendAmount)} sent to {borrowerName}
              </p>

              <div className="text-left space-y-2 bg-muted/50 rounded-lg p-4 text-sm">
                <h4 className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Repayment Summary</h4>
                <div className="flex justify-between"><span>Capital</span><span className="font-medium">{formatUGX(lendAmount)}</span></div>
                <div className="flex justify-between"><span>Your Return ({lenderInterest}%)</span><span className="font-medium">{formatUGX(lenderReturn)}</span></div>
                <div className="flex justify-between"><span>Agent Fee (5%)</span><span className="font-medium">{formatUGX(agentFee)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Repayment</span><span>{formatUGX(totalBorrowerRepayment)}</span></div>
                <div className="flex justify-between text-primary"><span>Frequency</span><span className="capitalize">{frequency} × {paymentCount} payments</span></div>
                <div className="flex justify-between"><span>Per Payment</span><span className="font-medium">{formatUGX(perPayment)}</span></div>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-3 text-left">
                <div className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Your capital of {formatUGX(lendAmount)} is 100% recoverable.
                    Welile's Operational Assurance protects your facilitation.
                  </p>
                </div>
              </div>

              <Button onClick={handleClose} className="w-full">Done</Button>
            </motion.div>

          ) : step === 1 ? (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {/* Borrower info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Facilitating for</p>
                  <p className="font-semibold">{resolving ? 'Loading...' : borrowerName || targetAiId}</p>
                  <p className="text-xs text-muted-foreground">{targetAiId}</p>
                </div>
              </div>

              {/* Deposit instructions */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Smartphone className="h-3 w-3" /> Top Up Your Wallet First
                </h4>
                <div className="grid gap-2">
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30">
                    <p className="font-bold text-sm text-amber-800 dark:text-amber-300">MTN Mobile Money</p>
                    <p className="text-xs mt-1 text-amber-700 dark:text-amber-400">
                      Merchant Code: <span className="font-mono font-bold">123456</span>
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                      Dial *165*3# → Merchant Payment → Enter code → Amount → Confirm
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30">
                    <p className="font-bold text-sm text-red-800 dark:text-red-300">Airtel Money</p>
                    <p className="text-xs mt-1 text-red-700 dark:text-red-400">
                      Merchant Code: <span className="font-mono font-bold">654321</span>
                    </p>
                    <p className="text-[10px] text-red-600 dark:text-red-500 mt-0.5">
                      Dial *185*9# → Pay Bill → Merchant ID → Amount → PIN → Confirm
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <Label className="text-xs">Facilitation Amount (UGX)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Up to ${formatUGX(maxAmount)}`}
                  max={maxAmount}
                  className="h-12 text-lg font-bold"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">Cancel</Button>
                <Button onClick={() => setStep(2)} disabled={!canProceedStep1} className="flex-1 gap-1">
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>

          ) : step === 2 ? (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {/* Repayment frequency */}
              <div className="space-y-2">
                <Label className="text-xs">Repayment Frequency</Label>
                <RadioGroup value={frequency} onValueChange={(v) => setFrequency(v as RepaymentFrequency)} className="grid grid-cols-3 gap-2">
                  {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                    <Label
                      key={f}
                      className={`flex items-center justify-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all text-sm capitalize ${
                        frequency === f ? 'border-primary bg-primary/5 font-semibold' : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <RadioGroupItem value={f} className="sr-only" />
                      {f}
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="90"
                  className="h-10"
                />
              </div>

              {/* Lender interest */}
              <div className="space-y-1.5">
                <Label className="text-xs">Your Service Fee % (optional)</Label>
                <Input
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="e.g. 2"
                  max={20}
                  className="h-10"
                />
                <p className="text-[10px] text-muted-foreground">This is your optional return on the facilitation</p>
              </div>

              {/* Fee breakdown preview */}
              {lendAmount > 0 && (
                <div className="space-y-1 text-sm bg-muted/50 rounded-lg p-3 border border-border/50">
                  <div className="flex justify-between"><span className="text-muted-foreground">Capital</span><span>{formatUGX(lendAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Your Return ({lenderInterest}%)</span><span>{formatUGX(lenderReturn)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Agent Fee (5%)</span><span>{formatUGX(agentFee)}</span></div>
                  <div className="flex justify-between border-t pt-1 font-semibold"><span>Borrower Pays</span><span>{formatUGX(totalBorrowerRepayment)}</span></div>
                  <div className="flex justify-between text-xs text-primary">
                    <span>{paymentCount} {frequency} payments</span>
                    <span>{formatUGX(perPayment)} each</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!canProceedStep2} className="flex-1 gap-1">
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>

          ) : step === 3 ? (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Welile AI Insurance
              </h4>

              <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-emerald-800 dark:text-emerald-300">100% Capital Protection</p>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Welile AI Insurance</p>
                  </div>
                </div>
                
                <div className="space-y-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <p>By proceeding, you acknowledge and agree:</p>
                  <ul className="space-y-1.5 ml-3">
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                      <span>Your capital of <strong>{formatUGX(lendAmount)}</strong> is 100% protected by Welile AI Insurance</span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                      <span>Welile is a technology platform — not a financial lender. We use AI and data to verify trust</span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                      <span>A Welile Agent will verify the borrower and earn 5% for collection services</span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                      <span>Welile's Operational Assurance includes agent replacement rights for unverified defaults</span>
                    </li>
                  </ul>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30 transition-colors">
                <input
                  type="checkbox"
                  checked={insuranceAccepted}
                  onChange={(e) => setInsuranceAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border accent-emerald-600"
                />
                <span className="text-xs leading-relaxed">
                  I accept the <strong>Welile AI Insurance</strong> terms and understand that Welile is a technology platform facilitating trust verification, not a financial institution.
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1 gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={() => setStep(4)} disabled={!insuranceAccepted} className="flex-1 gap-1">
                  Review <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>

          ) : step === 4 ? (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h4 className="font-semibold text-sm">Confirm Facilitation</h4>

              {/* Summary card */}
              <div className="space-y-2 bg-muted/50 rounded-lg p-4 text-sm border border-border/50">
                <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-medium">{borrowerName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">AI ID</span><span className="font-mono text-xs">{targetAiId}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Capital Sent</span><span className="font-bold text-base">{formatUGX(lendAmount)}</span></div>
                <div className="border-t my-1" />
                <div className="flex justify-between"><span className="text-muted-foreground">Your Return ({lenderInterest}%)</span><span>{formatUGX(lenderReturn)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Agent Earns (5%)</span><span>{formatUGX(agentFee)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total Repayment</span><span>{formatUGX(totalBorrowerRepayment)}</span></div>
                <div className="flex justify-between text-primary">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Schedule</span>
                  <span className="capitalize">{frequency} × {paymentCount}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Per Payment</span><span className="font-medium">{formatUGX(perPayment)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{days} days</span></div>
              </div>

              {/* Capital recovery assurance */}
              <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-3">
                <div className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">100% Capital Recovery Assured</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5">
                      Welile's Operational Assurance ensures your facilitation capital of {formatUGX(lendAmount)} is fully recoverable, backed by agent replacement rights and tenant verification.
                    </p>
                  </div>
                </div>
              </div>

              {/* Repayment method for borrower */}
              <div className="rounded-lg border border-border/50 p-3">
                <div className="flex gap-2 mb-2">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground">
                    The borrower will repay via MTN (Merchant: <span className="font-mono font-bold">123456</span>) or Airtel (Merchant: <span className="font-mono font-bold">654321</span>) into Welile Technologies. Payments auto-distribute to your wallet and the agent.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(3)} className="flex-1 gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={handleLend} disabled={loading} className="flex-1 gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Confirm & Send
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
