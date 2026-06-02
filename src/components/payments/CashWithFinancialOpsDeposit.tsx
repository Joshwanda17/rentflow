import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import {
  Loader2, Building2, CheckCircle2, ShieldCheck, XCircle, Mail,
} from 'lucide-react';
import DepositStatusTracker from './DepositStatusTracker';

// Read the friendly `message` field our edge functions return on non-2xx.
async function readEdgeBody(error: any): Promise<any | null> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') return await ctx.json();
    if (ctx?.body) return typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
  } catch { /* ignore */ }
  return null;
}

interface CashWithFinancialOpsDepositProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const QUICK_AMOUNTS = [10000, 50000, 100000, 250000];

type Step = 'form' | 'code' | 'success';

/**
 * Cash-with-Financial-Ops deposit secured by a receipt code.
 *  1. The depositor enters the amount.
 *  2. The backend (cash-deposit-request-code) creates a PENDING deposit
 *     request and emails a one-time receipt code to the cash verifier
 *     (weliletenants@gmail.com). Financial Ops sees the email on their
 *     Email Extraction page and the pending row on Verify Deposit.
 *  3. After receiving the cash, Financial Ops reads the code back to the
 *     depositor, who enters it here.
 *  4. On a match (cash-deposit-verify-code) the deposit auto-approves and
 *     the wallet is credited instantly.
 */
export default function CashWithFinancialOpsDeposit({ open, onOpenChange, onSuccess }: CashWithFinancialOpsDepositProps) {
  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [creditedAmount, setCreditedAmount] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  // Confirms an intentional cancel of the blocking code-entry screen.
  const [confirmCancel, setConfirmCancel] = useState(false);

  const amountNum = parseFloat(amount);

  const reset = () => {
    setStep('form'); setAmount(''); setLoading(false); setDepositId(null);
    setCode(''); setCodeError(''); setCreditedAmount(0); setAttemptsLeft(null); setLocked(false);
    setConfirmCancel(false);
  };

  const close = () => { reset(); onOpenChange(false); };

  const handleRequestCode = async () => {
    if (!Number.isFinite(amountNum) || amountNum < 500) {
      toast.error('Enter a valid amount (minimum UGX 500)');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cash-deposit-request-code', {
        body: { amount: amountNum, deposit_purpose: 'personal_deposit' },
      });
      if (error) {
        const body = await readEdgeBody(error);
        toast.error(body?.message || body?.error || 'Could not start the deposit. Please try again.');
        return;
      }
      if (!data?.ok || !data?.deposit_request_id) {
        toast.error(data?.message || 'Could not start the deposit. Please try again.');
        return;
      }
      setDepositId(data.deposit_request_id);
      setCode('');
      setCodeError('');
      setLocked(false);
      setAttemptsLeft(null);
      setStep('code');
      toast.success('Request sent to Financial Ops. They will give you a code after receiving your cash.');
    } catch (e) {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const entered = code.trim();
    if (!depositId || entered.length < 4) {
      setCodeError('Enter the receipt code Financial Ops gave you.');
      return;
    }
    setLoading(true);
    setCodeError('');
    try {
      const { data, error } = await supabase.functions.invoke('cash-deposit-verify-code', {
        body: { deposit_request_id: depositId, code: entered },
      });
      if (error) {
        const body = await readEdgeBody(error);
        const msg = body?.message || body?.error || 'Could not verify the code.';
        const isLocked =
          body?.error === 'too_many_attempts' ||
          body?.error === 'expired' ||
          (typeof body?.attempts_remaining === 'number' && body.attempts_remaining <= 0);
        toast.error(msg);
        setCodeError(msg);
        if (typeof body?.attempts_remaining === 'number') setAttemptsLeft(body.attempts_remaining);
        if (isLocked) setLocked(true);
        return;
      }
      if (!data?.ok) {
        const msg = data?.message || 'That code is incorrect. Ask Financial Ops to read it again.';
        toast.error(msg);
        setCodeError(msg);
        return;
      }
      setCreditedAmount(Number(data.amount ?? amountNum));
      setStep('success');
      onSuccess?.();
    } catch (e) {
      const msg = 'Network error. Please try again.';
      toast.error(msg);
      setCodeError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent
        className={`max-w-md ${step === 'code' ? '[&>button.absolute]:hidden' : ''}`}
        onInteractOutside={(e) => { if (step === 'code') e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (step === 'code') e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Cash with Financial Ops
          </DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hand cash directly to the Welile Financial Ops desk. Enter the amount —
              we'll send a one-time code to Financial Ops. After they receive your cash,
              they'll read the code back to you to credit your wallet instantly.
            </p>

            <div className="space-y-2">
              <Label className="text-sm font-medium">How much?</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm pointer-events-none">UGX</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-2xl font-bold tabular-nums h-14 pl-14 pr-3"
                />
              </div>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {QUICK_AMOUNTS.map((amt) => (
                  <Button key={amt} type="button" variant={amount === String(amt) ? 'default' : 'outline'}
                    className="text-xs h-10 font-medium px-1" onClick={() => setAmount(String(amt))}>
                    {(amt / 1000) + 'k'}
                  </Button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-muted-foreground flex items-start gap-2">
              <Mail className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>A secure code is emailed to Financial Ops. Only enter the code <span className="font-semibold text-foreground">after</span> handing over your cash.</span>
            </div>

            <Button onClick={handleRequestCode} disabled={loading} className="w-full h-12 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Send deposit request
            </Button>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-4">
            <DepositStatusTracker
              stage={locked ? 'expired' : 'pending'}
              busyStage={loading ? 'verified' : null}
              timestamps={{ pendingAt: new Date().toISOString() }}
            />
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm">
              Your request for <span className="font-semibold">{formatUGX(amountNum)}</span> has been sent to Financial Ops.
              After you hand over the cash, ask them for the <span className="font-semibold">receipt code</span> and enter it below.
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Receipt code</Label>
              <Input
                placeholder="e.g. RCTXXXXXXX"
                value={code}
                disabled={loading || locked}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); if (codeError) setCodeError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleVerify(); }}
                className="font-mono text-lg tracking-wider h-12 text-center"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
              />
              {!locked && attemptsLeft !== null && attemptsLeft > 0 && (
                <p className="text-xs text-amber-600 font-medium text-center">
                  {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} left before this code locks.
                </p>
              )}
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying & crediting your wallet…
              </div>
            )}

            {locked && !loading && (
              <div className="w-full p-3 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2">
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{codeError || 'This code can no longer be used. Please start a new deposit.'}</span>
                </p>
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={reset}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Start a new deposit
                </Button>
              </div>
            )}

            {codeError && !loading && !locked && (
              <p className="text-sm text-destructive flex items-start gap-1.5">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{codeError}</span>
              </p>
            )}

            {!locked && (
              <Button onClick={() => void handleVerify()} disabled={loading || code.trim().length < 4} className="w-full h-12 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Verify code & credit wallet
              </Button>
            )}

            {!confirmCancel ? (
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => setConfirmCancel(true)}
                className="w-full h-10 text-muted-foreground hover:text-destructive"
              >
                Cancel deposit
              </Button>
            ) : (
              <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2">
                <p className="text-sm text-foreground text-center font-medium">
                  Cancel this deposit? You'll need to start again to deposit cash.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={loading}>
                    Keep waiting
                  </Button>
                  <Button variant="destructive" onClick={close} disabled={loading}>
                    Yes, cancel
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-center text-muted-foreground">
              This screen stays open until you enter the code or cancel.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <div>
              <p className="text-lg font-bold">{formatUGX(creditedAmount)} added</p>
              <p className="text-sm text-muted-foreground">Your cash deposit was verified and credited to your wallet.</p>
            </div>
            <DepositStatusTracker
              stage="approved"
              timestamps={{
                pendingAt: new Date().toISOString(),
                verifiedAt: new Date().toISOString(),
                approvedAt: new Date().toISOString(),
              }}
            />
            <Button onClick={close} className="w-full h-12">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
