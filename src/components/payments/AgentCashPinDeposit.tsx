import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Banknote, Phone, CheckCircle2, ShieldCheck, ChevronLeft } from 'lucide-react';

// Read the friendly `message` field our edge functions return on non-2xx.
async function readEdgeMessage(error: any, fallback: string): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      return body?.message || body?.error || fallback;
    }
    if (ctx?.body) {
      const body = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
      return body?.message || body?.error || fallback;
    }
  } catch { /* ignore */ }
  return error?.message || fallback;
}

interface AgentCashPinDepositProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const QUICK_AMOUNTS = [10000, 50000, 100000, 250000];

type Step = 'form' | 'pin' | 'success';

/**
 * Cash-with-agent deposit secured by a 4-digit code.
 *  1. The depositor enters the amount + the agent's phone number.
 *  2. The backend resolves the agent, checks their float, and shows a
 *     4-digit code on the AGENT'S dashboard.
 *  3. The agent reads the code back after taking the cash.
 *  4. The depositor enters the code → their withdrawable wallet is credited
 *     and the agent's operational float is debited by the same amount.
 */
export default function AgentCashPinDeposit({ open, onOpenChange, onSuccess }: AgentCashPinDepositProps) {
  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('');
  const [pin, setPin] = useState('');
  const [creditedAmount, setCreditedAmount] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const reset = () => {
    setStep('form'); setAmount(''); setAgentPhone(''); setLoading(false);
    setSessionId(null); setAgentName(''); setPin(''); setCreditedAmount(0); setExpiresAt(null);
  };

  const close = () => { reset(); onOpenChange(false); };

  const amountNum = parseFloat(amount);

  // Tick the countdown while the depositor is on the PIN step.
  useEffect(() => {
    if (step !== 'pin' || !expiresAt) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [step, expiresAt]);

  const secsLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
    : null;
  const expired = secsLeft !== null && secsLeft <= 0;
  const countdownLabel =
    secsLeft === null
      ? ''
      : `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}`;

  const handleCreate = async () => {
    if (!Number.isFinite(amountNum) || amountNum < 500) {
      toast.error('Enter a valid amount (minimum UGX 500)');
      return;
    }
    if (agentPhone.replace(/\D/g, '').length < 9) {
      toast.error("Enter the agent's phone number");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-cash-deposit-create', {
        body: { amount: amountNum, agent_phone: agentPhone.trim() },
      });
      if (error) {
        toast.error(await readEdgeMessage(error, 'Could not start the deposit'));
        return;
      }
      if (!data?.ok) {
        toast.error(data?.message || 'Could not start the deposit');
        return;
      }
      setSessionId(data.session_id);
      setAgentName(data.agent_name || 'the agent');
      setExpiresAt(data.expires_at ?? null);
      setNow(Date.now());
      setStep('pin');
    } catch (e) {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (code: string) => {
    if (!sessionId || code.length !== 4) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-cash-deposit-confirm', {
        body: { session_id: sessionId, pin: code },
      });
      if (error) {
        toast.error(await readEdgeMessage(error, 'Could not confirm the code'));
        setPin('');
        return;
      }
      if (!data?.ok) {
        toast.error(data?.message || 'Incorrect code');
        setPin('');
        return;
      }
      setCreditedAmount(Number(data.amount ?? amountNum));
      setStep('success');
      onSuccess?.();
    } catch (e) {
      toast.error('Network error. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            Cash with agent
          </DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hand cash to a Welile agent and get it instantly in your wallet. Enter the amount and the agent's phone number.
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

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Agent's phone number
              </Label>
              <Input
                type="tel"
                inputMode="tel"
                placeholder="e.g. 0772 123 456"
                value={agentPhone}
                onChange={(e) => setAgentPhone(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <Button onClick={handleCreate} disabled={loading} className="w-full h-12 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Get confirmation code
            </Button>
          </div>
        )}

        {step === 'pin' && (
          <div className="space-y-4">
            <button onClick={() => { setStep('form'); setPin(''); }} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-sm">
              A 4-digit code is now showing on <span className="font-semibold">{agentName}</span>'s dashboard.
              After you hand over <span className="font-semibold">{formatUGX(amountNum)}</span>, ask the agent to
              read the code and enter it below.
            </div>
            {secsLeft !== null && (
              <div
                className={`flex items-center justify-center gap-1.5 text-xs font-medium ${
                  expired ? 'text-destructive' : secsLeft <= 60 ? 'text-amber-600' : 'text-muted-foreground'
                }`}
              >
                {expired ? (
                  <>This code has expired — start a new cash deposit.</>
                ) : (
                  <>Code expires in <span className="tabular-nums font-semibold">{countdownLabel}</span></>
                )}
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <Label className="text-sm font-medium">Enter the 4-digit code</Label>
              <InputOTP maxLength={4} value={pin} disabled={expired || loading} onChange={(v) => { setPin(v); if (v.length === 4) void handleConfirm(v); }}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                  <Loader2 className="h-4 w-4 animate-spin" /> Crediting your wallet…
                </div>
              )}
              {expired && !loading && (
                <Button variant="outline" size="sm" className="mt-1" onClick={() => { setStep('form'); setPin(''); setExpiresAt(null); }}>
                  Start a new deposit
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <div>
              <p className="text-lg font-bold">{formatUGX(creditedAmount)} added</p>
              <p className="text-sm text-muted-foreground">The amount is now in your withdrawable wallet.</p>
            </div>
            <Button onClick={close} className="w-full h-12">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}