import { useState, useEffect } from 'react';
import { LogOut, Clock, PauseCircle, CalendarCheck, Phone, Building2, Banknote, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';

type PayoutMode = 'cash' | 'mtn' | 'airtel' | 'bank';

const PAYOUT_OPTIONS: { value: PayoutMode; label: string; icon: string; color: string }[] = [
  { value: 'mtn', label: 'MTN MoMo', icon: '📱', color: 'border-yellow-400 bg-yellow-400/10' },
  { value: 'airtel', label: 'Airtel Money', icon: '📱', color: 'border-red-400 bg-red-400/10' },
  { value: 'bank', label: 'Bank', icon: '🏦', color: 'border-blue-400 bg-blue-400/10' },
  { value: 'cash', label: 'Cash', icon: '💵', color: 'border-green-400 bg-green-400/10' },
];

export function InvestmentWithdrawButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<{
    amount: number;
    status: string;
    earliest_process_date: string;
    created_at: string;
  } | null>(null);

  // Payout state
  const [payoutMode, setPayoutMode] = useState<PayoutMode | null>(null);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const amountNum = Number(amount) || 0;

  useEffect(() => {
    if (!user) return;
    const fetchExisting = async () => {
      const { data } = await supabase
        .from('investment_withdrawal_requests' as any)
        .select('amount, status, earliest_process_date, created_at')
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && (data as any[]).length > 0) {
        setExistingRequest((data as any[])[0]);
      }
    };
    fetchExisting();
  }, [user]);

  const isPayoutValid = () => {
    if (!payoutMode) return false;
    if (payoutMode === 'mtn' || payoutMode === 'airtel')
      return momoNumber.trim().length >= 9 && momoName.trim().length >= 2;
    if (payoutMode === 'bank')
      return !!bankName && bankAccountName.trim().length >= 2 && bankAccountNumber.trim().length >= 5;
    return true;
  };

  const handleSubmit = async () => {
    if (!user || amountNum <= 0 || !isPayoutValid()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('investment_withdrawal_requests' as any)
        .insert({
          user_id: user.id,
          amount: amountNum,
          reason: reason.trim() || null,
          rewards_paused: true,
        } as any);

      if (error) throw error;

      const processDate = new Date();
      processDate.setDate(processDate.getDate() + 90);

      setExistingRequest({
        amount: amountNum,
        status: 'pending',
        earliest_process_date: processDate.toISOString(),
        created_at: new Date().toISOString(),
      });

      toast({
        title: '📋 Withdrawal Request Submitted',
        description: `Your request to withdraw ${formatUGX(amountNum)} has been submitted. Monthly rewards are now PAUSED. Payout after ${format(processDate, 'MMMM d, yyyy')}.`,
      });

      setAmount('');
      setReason('');
      setPayoutMode(null);
      setMomoNumber('');
      setMomoName('');
      setBankName('');
      setBankAccountName('');
      setBankAccountNumber('');
      setOpen(false);
    } catch (err: any) {
      console.error('[InvestmentWithdrawButton] Error:', err);
      toast({
        title: 'Request failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Active withdrawal request status
  if (existingRequest) {
    const payoutDate = new Date(existingRequest.earliest_process_date);
    return (
      <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-amber-600" />
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Withdrawal In Progress</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-bold text-foreground">{formatUGX(existingRequest.amount)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="font-bold text-amber-600 capitalize">{existingRequest.status}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <CalendarCheck className="h-3.5 w-3.5" />
              Payout Date
            </span>
            <span className="font-bold text-foreground">{format(payoutDate, 'MMMM d, yyyy')}</span>
          </div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive font-semibold flex items-center gap-1.5">
            <PauseCircle className="h-3.5 w-3.5" />
            Monthly rewards are PAUSED until withdrawal is processed
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The platform is collecting rent from tenants to prepare your full lump-sum payout on the date above.
        </p>
      </div>
    );
  }

  const handleClose = () => {
    setOpen(false);
    setPayoutMode(null);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full gap-2 rounded-xl font-bold h-10 text-sm border-border/60 text-muted-foreground"
      >
        <LogOut className="h-4 w-4" />
        Request Capital Withdrawal
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
        <DialogContent className="max-w-sm max-h-[92vh] overflow-y-auto p-0" stable>
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-primary" />
              Capital Withdrawal
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 pb-5 space-y-4">
            {/* ── PAYOUT METHOD (always first) ── */}
            <div className="space-y-2.5">
              <Label className="text-sm font-bold">How do you want your money?</Label>
              <div className="grid grid-cols-4 gap-2">
                {PAYOUT_OPTIONS.map((opt) => {
                  const selected = payoutMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPayoutMode(prev => prev === opt.value ? null : opt.value)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-3 min-h-[72px] transition-all active:scale-95 ${
                        selected
                          ? `${opt.color} ring-2 ring-primary shadow-md`
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      }`}
                    >
                      {selected && (
                        <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />
                      )}
                      <span className="text-xl leading-none">{opt.icon}</span>
                      <span className="text-[10px] font-bold mt-1.5 text-center leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── INLINE PAYOUT DETAILS ── */}
            <AnimatePresence mode="wait">
              {payoutMode && (
                <motion.div
                  key={payoutMode}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pt-1">
                    {(payoutMode === 'mtn' || payoutMode === 'airtel') && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">
                            {payoutMode === 'mtn' ? 'MTN' : 'Airtel'} Number
                          </Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="tel"
                              inputMode="tel"
                              placeholder="e.g. 0770 123 456"
                              value={momoNumber}
                              onChange={(e) => setMomoNumber(e.target.value)}
                              className="h-11 pl-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Registered Name</Label>
                          <Input
                            placeholder="e.g. JOHN DOE"
                            value={momoName}
                            onChange={(e) => setMomoName(e.target.value)}
                            className="h-11"
                          />
                        </div>
                      </>
                    )}

                    {payoutMode === 'bank' && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Bank</Label>
                          <Select value={bankName} onValueChange={setBankName}>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select bank…" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {UGANDA_BANKS.map((b) => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Account Holder</Label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="e.g. JOHN DOE"
                              value={bankAccountName}
                              onChange={(e) => setBankAccountName(e.target.value)}
                              className="h-11 pl-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Account Number</Label>
                          <div className="relative">
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="e.g. 9030012345678"
                              value={bankAccountNumber}
                              onChange={(e) => setBankAccountNumber(e.target.value)}
                              className="h-11 pl-10"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {payoutMode === 'cash' && (
                      <div className="p-3 rounded-xl bg-success/5 border border-success/20">
                        <p className="text-xs font-bold mb-1">💵 Cash Collection</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-[11px]">
                          <li>Submit your request below</li>
                          <li>A manager will approve it</li>
                          <li>Visit the nearest agent shop with your ID</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── REST OF FORM (only after payout is valid) ── */}
            {isPayoutValid() && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 border-t border-border pt-4"
              >
                {/* 90-day notice */}
                <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">90-Day Notice Period</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Withdrawals require <span className="font-bold">90 days notice</span>. Rewards pause immediately.
                  </p>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-bold">Withdrawal Amount (UGX)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 500000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="text-lg font-bold h-12"
                  />
                </div>

                {/* Reason */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Reason (optional)</Label>
                  <Textarea
                    placeholder="Why are you withdrawing?"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="text-sm min-h-[50px]"
                  />
                </div>

                {/* Payout date preview */}
                {amountNum > 0 && (
                  <div className="px-3 py-2.5 rounded-xl bg-muted/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-semibold">Payout Date</p>
                      <CalendarCheck className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm font-black text-foreground">
                      {format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'MMMM d, yyyy')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      You will receive {formatUGX(amountNum)} on or after this date.
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Monthly rewards will <strong>stop immediately</strong> once submitted.
                  </p>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={amountNum <= 0 || submitting}
                  className="w-full gap-2 rounded-xl font-bold h-12"
                >
                  {submitting ? 'Submitting…' : 'Submit Withdrawal Notice'}
                </Button>
              </motion.div>
            )}

            {/* Disabled state hint */}
            {!payoutMode && (
              <Button disabled className="w-full h-12 rounded-xl font-bold text-sm opacity-50">
                Select a payout method above
              </Button>
            )}
            {payoutMode && !isPayoutValid() && (
              <Button disabled className="w-full h-12 rounded-xl font-bold text-sm opacity-50">
                Complete payout details above
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
