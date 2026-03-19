import { useState, useEffect } from 'react';
import { WithdrawalStepTracker } from './WithdrawalStepTracker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownToLine, Wallet, Loader2, CheckCircle, AlertCircle, Phone, Building2, Banknote, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';

interface WithdrawRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance: number;
  onSuccess?: () => void;
}

type PayoutMode = 'mtn' | 'airtel' | 'bank' | 'cash';

const WORKING_HOURS = {
  start: 8,
  end: 17,
  saturdayEnd: 13,
};

const checkWorkingHours = (): { isOpen: boolean; message: string; nextOpen: string } => {
  const now = new Date();
  const utcOffset = now.getTimezoneOffset() * 60000;
  const eatOffset = 3 * 60 * 60000;
  const eatTime = new Date(now.getTime() + utcOffset + eatOffset);
  const day = eatTime.getDay();
  const hour = eatTime.getHours();

  if (day === 0) return { isOpen: false, message: 'Withdrawals are not available on Sundays', nextOpen: 'Monday at 8:00 AM' };
  if (day === 6) {
    if (hour < WORKING_HOURS.start) return { isOpen: false, message: 'Withdrawals open at 8:00 AM on Saturdays', nextOpen: 'Today at 8:00 AM' };
    if (hour >= WORKING_HOURS.saturdayEnd) return { isOpen: false, message: 'Withdrawals closed for today (Saturday ends at 1:00 PM)', nextOpen: 'Monday at 8:00 AM' };
    return { isOpen: true, message: '', nextOpen: '' };
  }
  if (hour < WORKING_HOURS.start) return { isOpen: false, message: 'Withdrawals open at 8:00 AM', nextOpen: 'Today at 8:00 AM' };
  if (hour >= WORKING_HOURS.end) {
    const nextDay = day === 5 ? 'Monday' : 'Tomorrow';
    return { isOpen: false, message: 'Withdrawals closed for today (ends at 5:00 PM)', nextOpen: `${nextDay} at 8:00 AM` };
  }
  return { isOpen: true, message: '', nextOpen: '' };
};

const PAYOUT_OPTIONS: { value: PayoutMode; label: string; icon: string; color: string }[] = [
  { value: 'mtn', label: 'MTN MoMo', icon: '📱', color: 'border-yellow-400 bg-yellow-400/10' },
  { value: 'airtel', label: 'Airtel Money', icon: '📱', color: 'border-red-400 bg-red-400/10' },
  { value: 'bank', label: 'Bank', icon: '🏦', color: 'border-blue-400 bg-blue-400/10' },
  { value: 'cash', label: 'Cash', icon: '💵', color: 'border-green-400 bg-green-400/10' },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(value);

export function WithdrawRequestDialog({ open, onOpenChange, walletBalance, onSuccess }: WithdrawRequestDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [workingHoursStatus, setWorkingHoursStatus] = useState(checkWorkingHours());
  const [hasWithdrawnToday, setHasWithdrawnToday] = useState(false);
  const [_checkingDailyLimit, setCheckingDailyLimit] = useState(false);

  // Payout state
  const [payoutMode, setPayoutMode] = useState<PayoutMode | null>(null);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [fetchingProfile, setFetchingProfile] = useState(false);

  useEffect(() => {
    if (open) setWorkingHoursStatus(checkWorkingHours());
  }, [open]);

  // Check daily limit
  useEffect(() => {
    const checkDailyLimit = async () => {
      if (!user || !open) return;
      setCheckingDailyLimit(true);
      try {
        const todayEAT = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
        const startOfDay = new Date(todayEAT.getFullYear(), todayEAT.getMonth(), todayEAT.getDate()).toISOString();
        const endOfDay = new Date(todayEAT.getFullYear(), todayEAT.getMonth(), todayEAT.getDate() + 1).toISOString();
        const { data } = await supabase
          .from('withdrawal_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .gte('created_at', startOfDay)
          .lt('created_at', endOfDay)
          .limit(1);
        setHasWithdrawnToday((data?.length ?? 0) > 0);
      } catch (e) {
        console.warn('Could not check daily withdrawal limit', e);
      } finally {
        setCheckingDailyLimit(false);
      }
    };
    checkDailyLimit();
  }, [user, open]);

  // Fetch saved mobile money details
  useEffect(() => {
    const fetchSavedNumber = async () => {
      if (!user || !open) return;
      setFetchingProfile(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('mobile_money_number, mobile_money_provider')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.mobile_money_number) {
          setMomoNumber(profile.mobile_money_number);
          const p = profile.mobile_money_provider as PayoutMode;
          if (p === 'mtn' || p === 'airtel') {
            setPayoutMode(p);
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setFetchingProfile(false);
      }
    };
    fetchSavedNumber();
  }, [user, open]);

  const isPayoutValid = () => {
    if (!payoutMode) return false;
    if (payoutMode === 'mtn' || payoutMode === 'airtel') {
      const ugandaPhoneRegex = /^(0[0-9]{9}|\+256[0-9]{9})$/;
      return ugandaPhoneRegex.test(momoNumber.trim()) && momoName.trim().length >= 2;
    }
    if (payoutMode === 'bank')
      return !!bankName && bankAccountName.trim().length >= 2 && bankAccountNumber.trim().length >= 5;
    return true; // cash
  };

  const MIN_BALANCE = 5000;
  const meetsMinBalance = walletBalance >= MIN_BALANCE;
  const isFormValid = meetsMinBalance && !hasWithdrawnToday && amount >= 500 && amount <= walletBalance && isPayoutValid() && workingHoursStatus.isOpen;

  const handleSubmit = async () => {
    if (!user) { toast.error('Please log in first'); return; }
    const currentStatus = checkWorkingHours();
    if (!currentStatus.isOpen) { toast.error(currentStatus.message); setWorkingHoursStatus(currentStatus); return; }
    if (hasWithdrawnToday) { toast.error('Only one withdrawal per day is allowed.'); return; }
    if (!meetsMinBalance) { toast.error('Wallet balance must be at least UGX 5,000'); return; }
    if (amount < 500) { toast.error('Minimum withdrawal is UGX 500'); return; }
    if (amount > walletBalance) { toast.error('Insufficient balance'); return; }
    if (!isPayoutValid()) { toast.error('Please complete payout details'); return; }

    setLoading(true);
    const MAX_RETRIES = 3;
    let lastError: any = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const { error } = await supabase.from('withdrawal_requests').insert({
          user_id: user.id,
          amount,
          status: 'pending' as const,
          mobile_money_number: payoutMode === 'mtn' || payoutMode === 'airtel' ? momoNumber.trim() : null,
          mobile_money_provider: payoutMode === 'mtn' || payoutMode === 'airtel' ? payoutMode : null,
        });
        if (error) throw error;

        // Save mobile money details to profile
        if (payoutMode === 'mtn' || payoutMode === 'airtel') {
          await supabase
            .from('profiles')
            .update({ mobile_money_number: momoNumber.trim(), mobile_money_provider: payoutMode })
            .eq('id', user.id);
        }

        setSuccess(true);
        toast.success('Withdrawal request submitted! 🎉');
        onSuccess?.();
        setLoading(false);
        return;
      } catch (error: any) {
        lastError = error;
        const isNetworkError = error instanceof TypeError && error.message === 'Failed to fetch';
        if (isNetworkError && attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
          continue;
        }
        break;
      }
    }

    console.error('Error submitting withdrawal request:', lastError);
    const isNetworkError = lastError instanceof TypeError && lastError.message === 'Failed to fetch';
    toast.error(isNetworkError ? 'Network error — check your internet and try again' : (lastError?.message || 'Failed to submit request'));
    setLoading(false);
  };

  const handleClose = () => {
    setAmount(0);
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-0" stable>
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw Funds
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose how you want to receive your money
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="px-5 pb-5 pt-2 space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <h3 className="text-lg font-semibold">Request Submitted! 🎉</h3>
              <p className="text-sm text-muted-foreground">
                Your withdrawal of {formatCurrency(amount)} is now being reviewed.
              </p>
            </div>
            <div className="p-3 rounded-xl border border-border bg-muted/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Approval Progress</p>
              <WithdrawalStepTracker status="pending" createdAt={new Date().toISOString()} />
            </div>
            <Button onClick={handleClose} className="w-full h-12 text-base">Done</Button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-4">
            {/* Balance bar */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Available</span>
              </div>
              <span className="text-lg font-black text-foreground">{formatCurrency(walletBalance)}</span>
            </div>

            {/* Working Hours Warning */}
            {!workingHoursStatus.isOpen && (
              <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 space-y-1">
                <div className="flex items-center gap-2 text-warning">
                  <Clock className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-bold">Outside Working Hours</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{workingHoursStatus.message}. Next: <strong>{workingHoursStatus.nextOpen}</strong></p>
              </div>
            )}

            {/* Daily limit warning */}
            {hasWithdrawnToday && (
              <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-xl">
                <Clock className="h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="text-xs font-bold">Daily limit reached 🚫</p>
                  <p className="text-[11px] text-muted-foreground">You can withdraw again tomorrow.</p>
                </div>
              </div>
            )}

            {/* Min balance policy */}
            {!meetsMinBalance && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive font-medium">
                  Balance must be at least <strong>UGX 5,000</strong> to withdraw.
                </p>
              </div>
            )}

            {/* ── PAYOUT METHOD SELECTION ── */}
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
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-3 min-h-[72px] transition-all active:scale-95 touch-manipulation ${
                        selected
                          ? `${opt.color} ring-2 ring-primary shadow-md`
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      }`}
                    >
                      {selected && <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />}
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
                            {payoutMode === 'mtn' ? 'MTN' : 'Airtel'} Mobile Money Number
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
                              disabled={fetchingProfile}
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
                          <Label className="text-xs font-semibold">Bank Name</Label>
                          <Select value={bankName} onValueChange={setBankName}>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select your bank…" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {UGANDA_BANKS.map((b) => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Account Holder Name</Label>
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
                        <p className="text-xs font-bold mb-1">💵 Cash at Agent Shop</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-[11px]">
                          <li>Submit your request below</li>
                          <li>A manager will approve it</li>
                          <li>Visit the nearest agent shop with your ID to collect</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── AMOUNT SECTION (only after valid payout) ── */}
            {isPayoutValid() && meetsMinBalance && !hasWithdrawnToday && workingHoursStatus.isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 border-t border-border pt-4"
              >
                <Label className="text-sm font-bold">Amount to Withdraw</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min: UGX 500"
                  value={amount || ''}
                  onChange={(e) => setAmount(Math.min(Number(e.target.value), walletBalance))}
                  min={500}
                  max={walletBalance}
                  className="h-12 text-lg font-bold"
                />
                <Slider
                  value={[amount]}
                  onValueChange={([v]) => setAmount(v)}
                  max={walletBalance}
                  min={500}
                  step={500}
                  className="py-1"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>UGX 500</span>
                  <button type="button" onClick={() => setAmount(walletBalance)} className="text-primary font-bold hover:underline">
                    Withdraw All
                  </button>
                </div>

                {/* Quick amount chips */}
                <div className="flex gap-2 flex-wrap">
                  {[0.25, 0.5, 0.75, 1].map((fraction) => {
                    const quickAmount = Math.max(500, Math.floor(walletBalance * fraction));
                    return (
                      <Button
                        key={fraction}
                        variant={amount === quickAmount ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAmount(quickAmount)}
                        className="flex-1 h-10 touch-manipulation"
                      >
                        {fraction === 1 ? 'All' : `${fraction * 100}%`}
                      </Button>
                    );
                  })}
                </div>

                {/* Transfer preview */}
                {amount >= 500 && isPayoutValid() && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-1.5">
                    <p className="text-xs text-muted-foreground">You will receive</p>
                    <p className="text-2xl font-black text-primary">{formatCurrency(amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      via <strong>{PAYOUT_OPTIONS.find(o => o.value === payoutMode)?.label}</strong>
                      {(payoutMode === 'mtn' || payoutMode === 'airtel') && momoNumber && ` • ${momoNumber}`}
                      {payoutMode === 'bank' && bankName && ` • ${bankName}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Remaining: {formatCurrency(walletBalance - amount)}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── ACTION BUTTON ── */}
            <div className="pt-1 flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1 h-12">Cancel</Button>
              {isFormValid ? (
                <Button onClick={handleSubmit} disabled={loading} className="flex-1 gap-2 h-12">
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                  ) : (
                    <><ArrowDownToLine className="h-4 w-4" /> Withdraw</>
                  )}
                </Button>
              ) : (
                <Button disabled className="flex-1 h-12 opacity-50">
                  {!payoutMode ? 'Select payout method' : !isPayoutValid() ? 'Complete details' : 'Enter amount'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
