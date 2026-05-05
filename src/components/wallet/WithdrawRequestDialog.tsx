import { useState, useEffect, useRef } from 'react';
import { WithdrawalStepTracker } from './WithdrawalStepTracker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDownToLine, Wallet, Loader2, CheckCircle, AlertCircle, Phone, Building2, Banknote, Clock, CheckCircle2, Sparkles, Shield, TrendingDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';

interface WithdrawRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance?: number;
  onSuccess?: () => void;
  prefillAmount?: number;
  prefillReason?: string;
  linkedParty?: string;
}

type PayoutMode = 'mtn' | 'airtel' | 'bank' | 'cash';

const WORKING_HOURS = { start: 8, end: 17, saturdayEnd: 13 };

const checkWorkingHours = (): { isOpen: boolean; message: string; nextOpen: string } => {
  // Withdrawals are now available 24/7
  return { isOpen: true, message: '', nextOpen: '' };
};

const PAYOUT_OPTIONS: { value: PayoutMode; label: string; sublabel: string; icon: string; accent: string; ring: string }[] = [
  { value: 'mtn', label: 'MTN', sublabel: 'MoMo', icon: '📱', accent: 'from-yellow-400/20 to-yellow-500/5 border-yellow-400/40', ring: 'ring-yellow-400' },
  { value: 'airtel', label: 'Airtel', sublabel: 'Money', icon: '📱', accent: 'from-red-400/20 to-red-500/5 border-red-400/40', ring: 'ring-red-400' },
  { value: 'bank', label: 'Bank', sublabel: 'Transfer', icon: '🏦', accent: 'from-blue-400/20 to-blue-500/5 border-blue-400/40', ring: 'ring-blue-400' },
  { value: 'cash', label: 'Cash', sublabel: 'Agent', icon: '💵', accent: 'from-emerald-400/20 to-emerald-500/5 border-emerald-400/40', ring: 'ring-emerald-400' },
];

import { formatDynamic } from '@/lib/currencyFormat';
const formatCurrency = formatDynamic;

// ─── Recipient session guard ──────────────────────────────────────────────
// Stops a single user from spamming Financial Ops with multiple identical
// pending withdrawals (e.g. five UGX 22,500 requests to the same MoMo
// number) by re-opening the dialog after a refresh, switching tabs, or
// just nervously tapping again. Layer 2 (the server trigger) is the real
// safety net; this layer just gives the user immediate, friendly feedback
// without a network round-trip.
const RECENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const recentStorageKey = (userId: string) => `welile:withdraw:recent:${userId}`;

type RecentRecipientEntry = {
  amount: number;
  submittedAt: number; // ms epoch
  recipientLabel: string;
};

function readRecentRecipients(userId: string): Record<string, RecentRecipientEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(recentStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, RecentRecipientEntry>;
    // Self-prune anything older than the window so the map doesn't grow
    // unbounded across long sessions.
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    const cleaned: Record<string, RecentRecipientEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.submittedAt === 'number' && v.submittedAt > cutoff) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeRecentRecipient(
  userId: string,
  key: string,
  entry: RecentRecipientEntry,
): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readRecentRecipients(userId);
    current[key] = entry;
    sessionStorage.setItem(recentStorageKey(userId), JSON.stringify(current));
  } catch {
    /* sessionStorage full / disabled — non-fatal */
  }
}

function buildRecipientKey(args: {
  payoutMode: 'mtn' | 'airtel' | 'bank' | 'cash';
  momoNumber: string;
  bankName: string;
  bankAccountNumber: string;
}): { key: string; label: string } | null {
  const { payoutMode, momoNumber, bankName, bankAccountNumber } = args;
  if (payoutMode === 'mtn' || payoutMode === 'airtel') {
    const normalised = momoNumber.replace(/\D/g, '');
    if (!normalised) return null;
    return {
      key: `momo:${payoutMode}:${normalised}`,
      label: `${payoutMode.toUpperCase()} ${momoNumber.trim()}`,
    };
  }
  if (payoutMode === 'bank') {
    if (!bankAccountNumber.trim()) return null;
    return {
      key: `bank:${(bankName || '').toLowerCase()}:${bankAccountNumber.trim()}`,
      label: `${bankName || 'bank'} A/C ${bankAccountNumber.trim()}`,
    };
  }
  if (payoutMode === 'cash') {
    return { key: 'cash:Nearest Agent', label: 'Cash at agent' };
  }
  return null;
}

function formatRelativeMinutes(submittedAt: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - submittedAt) / 60000));
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}

export function WithdrawRequestDialog({ open, onOpenChange, walletBalance = 0, onSuccess, prefillAmount, prefillReason, linkedParty }: WithdrawRequestDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [workingHoursStatus, setWorkingHoursStatus] = useState(checkWorkingHours());
  const [pendingAmount, setPendingAmount] = useState(0);
  const isSubmittingRef = useRef(false);
  const clientRequestIdRef = useRef<string | null>(null);
  const amountSectionRef = useRef<HTMLDivElement | null>(null);
  const payoutSectionRef = useRef<HTMLDivElement | null>(null);
  const reasonSectionRef = useRef<HTMLDivElement | null>(null);
  const [pulseTarget, setPulseTarget] = useState<null | 'amount' | 'payout' | 'reason'>(null);

  const focusMissing = () => {
    let target: 'amount' | 'payout' | 'reason' | null = null;
    let node: HTMLDivElement | null = null;
    if (!payoutMode || !isPayoutValid()) { target = 'payout'; node = payoutSectionRef.current; }
    else if (reason.trim().length < 10) { target = 'reason'; node = reasonSectionRef.current; }
    else if (amount < 500) { target = 'amount'; node = amountSectionRef.current; }
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseTarget(target);
      setTimeout(() => setPulseTarget(null), 1600);
    }
  };

  const [payoutMode, setPayoutMode] = useState<PayoutMode | null>(null);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [reason, setReason] = useState('');

  // Prefill from proxy partner funds
  useEffect(() => {
    if (open && prefillAmount && prefillAmount > 0) {
      setAmount(prefillAmount);
    }
    if (open && prefillReason) {
      setReason(prefillReason);
    }
  }, [open, prefillAmount, prefillReason]);
  const [fetchingProfile, setFetchingProfile] = useState(false);

  useEffect(() => {
    if (open) setWorkingHoursStatus(checkWorkingHours());
  }, [open]);

  // Fetch pending withdrawal amounts to prevent over-requesting
  useEffect(() => {
    const fetchPending = async () => {
      if (!user || !open) { setPendingAmount(0); return; }
      // For proxy-partner withdrawals (linkedParty set), the wallet balance
      // passed in is the per-partner ROI amount, NOT the agent's own wallet.
      // Subtracting unrelated pending wallet withdrawals would incorrectly
      // zero out the available balance. Skip the pending check here — the
      // per-partner balance is already authoritative.
      if (linkedParty) { setPendingAmount(0); return; }
      try {
        const { data } = await supabase
          .from('withdrawal_requests')
          .select('amount')
          .eq('user_id', user.id)
          .in('status', ['pending', 'requested', 'manager_approved']);
        const total = (data || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);
        setPendingAmount(total);
      } catch { setPendingAmount(0); }
    };
    fetchPending();
  }, [user, open, linkedParty]);


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
          if (p === 'mtn' || p === 'airtel') setPayoutMode(p);
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
    return true;
  };

  // 100% of available wallet balance (incl. all commission earnings) is withdrawable.
  // Only constraint: telco-imposed UGX 500 minimum per transaction.
  const availableBalance = Math.max(0, walletBalance - pendingAmount);
  const meetsMinBalance = availableBalance >= 500;
  const isFormValid = meetsMinBalance && amount >= 500 && amount <= availableBalance && isPayoutValid() && reason.trim().length >= 10 && workingHoursStatus.isOpen;

  // Live look-up of the current recipient against the in-session map.
  // Drives the inline notice on the form so the user is warned BEFORE
  // they hit Submit. Recomputes whenever the recipient inputs change.
  const recentRecipientMatch = (() => {
    if (!user || !payoutMode) return null;
    const info = buildRecipientKey({
      payoutMode,
      momoNumber,
      bankName,
      bankAccountNumber,
    });
    if (!info) return null;
    const recent = readRecentRecipients(user.id);
    const hit = recent[info.key];
    if (!hit) return null;
    if (Date.now() - hit.submittedAt >= RECENT_WINDOW_MS) return null;
    return { ...hit, recipientLabel: info.label };
  })();

  const handleSubmit = async () => {
    if (!user) { toast.error('Please log in first'); return; }
    // Re-entrant guard: prevent double-tap / rapid double submission
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const currentStatus = checkWorkingHours();
    if (!currentStatus.isOpen) { toast.error(currentStatus.message); setWorkingHoursStatus(currentStatus); isSubmittingRef.current = false; return; }
    if (availableBalance < 500) { toast.error('Available balance must be at least UGX 500'); isSubmittingRef.current = false; return; }
    if (amount < 500) { toast.error('Minimum withdrawal is UGX 500'); isSubmittingRef.current = false; return; }
    if (amount > availableBalance) { toast.error(`Insufficient available balance. You have UGX ${pendingAmount.toLocaleString()} in pending withdrawals.`); isSubmittingRef.current = false; return; }
    if (!isPayoutValid()) { toast.error('Please complete payout details'); isSubmittingRef.current = false; return; }

    // ─── Recipient session guard ────────────────────────────────────────
    // Catches the "submit five identical withdrawals to the same number"
    // pattern before it ever hits the network. Server-side trigger
    // (`prevent_duplicate_pending_withdrawal`) is the real safety net for
    // cross-tab / cleared-storage attempts.
    const recipientInfo = buildRecipientKey({
      payoutMode: payoutMode as 'mtn' | 'airtel' | 'bank' | 'cash',
      momoNumber,
      bankName,
      bankAccountNumber,
    });
    if (recipientInfo) {
      const recent = readRecentRecipients(user.id);
      const existing = recent[recipientInfo.key];
      if (existing && Date.now() - existing.submittedAt < RECENT_WINDOW_MS) {
        const sameAmount = existing.amount === amount;
        if (sameAmount) {
          // Hard block — explicit confirm required.
          const proceed = window.confirm(
            `You already submitted UGX ${existing.amount.toLocaleString()} to ` +
              `${recipientInfo.label} ${formatRelativeMinutes(existing.submittedAt)}. ` +
              `That request is still waiting for operator approval.\n\n` +
              `Sending the same amount again will create a duplicate that operations may reject.\n\n` +
              `Tap OK only if you really mean to send another UGX ${amount.toLocaleString()} to the same recipient.`,
          );
          if (!proceed) {
            toast.info('Duplicate blocked — your earlier request is still pending.');
            isSubmittingRef.current = false;
            return;
          }
        } else {
          // Soft warn — different amount but same recipient very recently.
          const proceed = window.confirm(
            `You sent UGX ${existing.amount.toLocaleString()} to ` +
              `${recipientInfo.label} ${formatRelativeMinutes(existing.submittedAt)}.\n\n` +
              `Continue with this new UGX ${amount.toLocaleString()} request?`,
          );
          if (!proceed) {
            isSubmittingRef.current = false;
            return;
          }
        }
      }
    }

    setLoading(true);
    // Stable idempotency key for the lifetime of this submission attempt.
    // Reused across network retries so the DB unique index on (user_id, client_request_id)
    // collapses any duplicate inserts into a single row.
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current =
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const clientRequestId = clientRequestIdRef.current;
    const MAX_RETRIES = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const isMomo = payoutMode === 'mtn' || payoutMode === 'airtel';
        const { error } = await supabase.from('withdrawal_requests').insert({
          user_id: user.id,
          amount,
          status: 'pending' as const,
          mobile_money_number: isMomo ? momoNumber.trim() : null,
          mobile_money_provider: isMomo ? payoutMode : null,
          mobile_money_name: isMomo ? momoName.trim() : null,
          payout_method: payoutMode === 'bank' ? 'bank_transfer' : payoutMode === 'cash' ? 'cash' : 'mobile_money',
          bank_name: payoutMode === 'bank' ? bankName : null,
          bank_account_name: payoutMode === 'bank' ? bankAccountName.trim() : null,
          bank_account_number: payoutMode === 'bank' ? bankAccountNumber.trim() : null,
          agent_location: payoutMode === 'cash' ? 'Nearest Agent' : null,
          reason: reason.trim(),
          client_request_id: clientRequestId,
          // For proxy-partner withdrawals, populate BOTH linked_party (audit
          // trail) AND proxy_partner_id (the column approve-withdrawal uses
          // to recognize this as a partner-linked payout and gate against
          // the partner's ledger entitlement instead of the agent's own
          // withdrawable). Omitting proxy_partner_id makes the row look
          // like a self-withdrawal and blocks approval whenever the agent's
          // wallet is empty — even though the partner has unwithdrawn ROI.
          ...(linkedParty
            ? { linked_party: linkedParty, proxy_partner_id: linkedParty }
            : {}),
        } as any);
        if (error) {
          // 23505 = unique_violation. Means a previous attempt already committed
          // this exact submission server-side. Treat as success.
          if ((error as any).code === '23505') {
            // Two distinct cases share this code:
            //   1. Idempotency key collision → genuine duplicate of *this*
            //      submission (network retry). Treat as success.
            //   2. Our `prevent_duplicate_pending_withdrawal` trigger fired
            //      → user already has another pending request for the same
            //      recipient + amount in the last 10 min. Block, surface a
            //      friendly message, and stop the success flow.
            const msg = String((error as any).message || '');
            if (msg.includes('DUPLICATE_PENDING_WITHDRAWAL')) {
              toast.error(
                `You already have a pending withdrawal of UGX ${amount.toLocaleString()} ` +
                  `to this recipient. Wait for operations to approve or reject the ` +
                  `existing one before submitting again.`,
                { duration: 8000 },
              );
              setLoading(false);
              isSubmittingRef.current = false;
              clientRequestIdRef.current = null;
              return;
            }
            console.info('[WithdrawRequestDialog] Duplicate suppressed by idempotency key');
          } else {
            throw error;
          }
        }

        // No wallet deduction or ledger insert here — that happens at approval time
        // via the approve-withdrawal edge function (ledger-first architecture)

        if (payoutMode === 'mtn' || payoutMode === 'airtel') {
          await supabase.from('profiles').update({ mobile_money_number: momoNumber.trim(), mobile_money_provider: payoutMode }).eq('id', user.id);
        }

        // NOTE: Returns Disbursement Confirmation email is NOT sent here.
        // It is sent by the `approve-withdrawal` edge function only after the
        // merchant agent confirms payment, so partners are never emailed for
        // a release/rejected/unconfirmed payout.

        setSuccess(true);
        toast.success('Withdrawal request submitted! 🎉');
        onSuccess?.();
        // Record this recipient in the session map so a re-open within
        // 10 minutes triggers the guard above.
        if (recipientInfo) {
          writeRecentRecipient(user.id, recipientInfo.key, {
            amount,
            submittedAt: Date.now(),
            recipientLabel: recipientInfo.label,
          });
        }
        setLoading(false);
        isSubmittingRef.current = false;
        clientRequestIdRef.current = null;
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
    isSubmittingRef.current = false;
    // Keep clientRequestIdRef so a manual retry by the user re-uses the same key
  };

  const handleClose = () => {
    setAmount(0);
    setReason('');
    setSuccess(false);
    onOpenChange(false);
  };

  const selectedOption = PAYOUT_OPTIONS.find(o => o.value === payoutMode);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-0 border-0 bg-transparent shadow-2xl" stable>
        {/* Gradient header */}
        <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-6 pt-6 pb-5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5 blur-xl" />
          
          <DialogHeader className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm">
                <ArrowDownToLine className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-bold tracking-tight">
                  Withdraw Money
                </DialogTitle>
                <p className="text-white/70 text-xs mt-0.5">Fast · Secure · Instant notifications</p>
              </div>
            </div>
          </DialogHeader>

          {/* Balance pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative z-10 mt-4 flex items-center justify-between p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20"
          >
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-white/80" />
              <span className="text-white/70 text-xs font-medium">Available Balance</span>
            </div>
            <div className="text-right">
              <span className="text-white text-xl font-black tracking-tight">{formatCurrency(availableBalance)}</span>
              {pendingAmount > 0 && (
                <p className="text-white/50 text-[10px]">{formatCurrency(pendingAmount)} pending</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Content area */}
        <div className="bg-background rounded-b-xl px-5 pb-6 pt-5 space-y-5">
          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5 py-2"
            >
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center"
                >
                  <CheckCircle className="h-10 w-10 text-success" />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <h3 className="text-xl font-bold text-foreground">Request Submitted!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We're processing <strong className="text-foreground">{formatCurrency(amount)}</strong>
                  </p>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="p-4 rounded-2xl border border-border bg-muted/30 text-center"
              >
                <p className="text-sm text-muted-foreground">
                  ⏳ Awaiting approval — you'll be notified once it's processed. Thank you for your patience!
                </p>
              </motion.div>

              <Button onClick={handleClose} className="w-full h-12 rounded-xl text-base font-bold">
                Done
              </Button>
            </motion.div>
          ) : (
            <>
              {/* Alerts */}
              {!workingHoursStatus.isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-warning/10 border border-warning/20 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warning shrink-0" />
                    <p className="text-sm font-bold text-foreground">Outside Working Hours</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{workingHoursStatus.message}</p>
                  <p className="text-xs">Next: <strong className="text-foreground">{workingHoursStatus.nextOpen}</strong></p>
                  <p className="text-[10px] text-muted-foreground/60 pt-1 border-t border-warning/10">🕐 Mon–Fri 8AM–5PM · Sat 8AM–1PM EAT</p>
                </motion.div>
              )}


              {!meetsMinBalance && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20">
                  <TrendingDown className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Insufficient available balance</p>
                    <p className="text-xs text-muted-foreground">You need at least <strong>UGX 500</strong> available to withdraw</p>
                  </div>
                </div>
              )}

              {/* ── PAYOUT METHOD ── */}
              <div
                ref={payoutSectionRef}
                className={`space-y-3 rounded-2xl transition-shadow ${pulseTarget === 'payout' ? 'ring-4 ring-primary/40 ring-offset-2 ring-offset-background' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-bold text-foreground">Where should we send your money?</Label>
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {PAYOUT_OPTIONS.map((opt, i) => {
                    const selected = payoutMode === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        type="button"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => setPayoutMode(prev => prev === opt.value ? null : opt.value)}
                        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 p-3 min-h-[80px] transition-all active:scale-95 touch-manipulation ${
                          selected
                            ? `bg-gradient-to-b ${opt.accent} ${opt.ring} ring-2 shadow-lg`
                            : 'border-border bg-card hover:border-muted-foreground/30 hover:shadow-sm'
                        }`}
                      >
                        {selected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1"
                          >
                            <CheckCircle2 className="h-4 w-4 text-primary drop-shadow-sm" />
                          </motion.div>
                        )}
                        <span className="text-2xl leading-none">{opt.icon}</span>
                        <span className="text-[11px] font-bold mt-1.5 text-foreground">{opt.label}</span>
                        <span className="text-[9px] text-muted-foreground leading-none">{opt.sublabel}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* ── INLINE PAYOUT DETAILS ── */}
              {payoutMode && (
                <div className="animate-fade-in">
                    <div className="space-y-3 p-4 rounded-2xl bg-muted/30 border border-border/50">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {selectedOption?.label} Details
                      </p>

                      {recentRecipientMatch && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">
                            <p className="font-semibold">
                              You already sent UGX {recentRecipientMatch.amount.toLocaleString()} to {recentRecipientMatch.recipientLabel} {formatRelativeMinutes(recentRecipientMatch.submittedAt)}.
                            </p>
                            <p className="opacity-90 mt-0.5">
                              That request is still pending operator approval. Re-submitting may create a duplicate.
                            </p>
                          </div>
                        </div>
                      )}

                      {(payoutMode === 'mtn' || payoutMode === 'airtel') && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">
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
                                className="h-12 pl-10 rounded-xl text-base font-medium"
                                disabled={fetchingProfile}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">Registered Name</Label>
                            <Input
                              placeholder="As it appears on MoMo"
                              value={momoName}
                              onChange={(e) => setMomoName(e.target.value)}
                              className="h-12 rounded-xl text-base font-medium"
                            />
                          </div>
                        </>
                      )}

                      {payoutMode === 'bank' && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">Bank</Label>
                            <Select value={bankName} onValueChange={setBankName}>
                              <SelectTrigger className="h-12 rounded-xl">
                                <SelectValue placeholder="Select your bank…" />
                              </SelectTrigger>
                              <SelectContent className="max-h-60 z-[200]" position="popper" sideOffset={4}>
                                {UGANDA_BANKS.map((b) => (
                                  <SelectItem key={b} value={b}>{b}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">Account Holder</Label>
                            <div className="relative">
                              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Full name on account"
                                value={bankAccountName}
                                onChange={(e) => setBankAccountName(e.target.value)}
                                className="h-12 pl-10 rounded-xl text-base font-medium"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">Account Number</Label>
                            <div className="relative">
                              <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="e.g. 9030012345678"
                                value={bankAccountNumber}
                                onChange={(e) => setBankAccountNumber(e.target.value)}
                                className="h-12 pl-10 rounded-xl text-base font-medium"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {payoutMode === 'cash' && (
                        <div className="p-4 rounded-xl bg-success/5 border border-success/20">
                          <p className="text-sm font-bold text-foreground mb-2">💵 Cash Collection</p>
                          <div className="space-y-2">
                            {['Submit your request', 'Manager approves it', 'Collect at nearest agent with your ID'].map((step, i) => (
                              <div key={i} className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-success">{i + 1}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{step}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                </div>
              )}

              {/* ── REASON FOR WITHDRAWAL ── */}
              {payoutMode && isPayoutValid() && (
                <motion.div
                  ref={reasonSectionRef as any}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`space-y-2 rounded-2xl p-1 transition-shadow ${pulseTarget === 'reason' ? 'ring-4 ring-primary/40 ring-offset-2 ring-offset-background' : ''}`}
                >
                  <Label className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Why are you withdrawing?
                  </Label>
                  <Textarea
                    placeholder="Include reason and phone number or A/C"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-h-[70px] rounded-xl text-sm"
                  />
                  {reason.length > 0 && reason.trim().length < 10 && (
                    <p className="text-[10px] text-destructive">Reason must be at least 10 characters</p>
                  )}
                </motion.div>
              )}

              <AnimatePresence>
                {isPayoutValid() && meetsMinBalance && workingHoursStatus.isOpen && (
                  <motion.div
                    ref={amountSectionRef as any}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className={`space-y-4 rounded-2xl p-1 transition-shadow ${pulseTarget === 'amount' ? 'ring-4 ring-primary/40 ring-offset-2 ring-offset-background' : ''}`}
                  >
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

                    <Label className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span>💰</span> How much?
                    </Label>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-bold">UGX</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={amount || ''}
                        onChange={(e) => setAmount(Math.min(Number(e.target.value), walletBalance))}
                        min={500}
                        max={walletBalance}
                        className="h-14 pl-14 text-2xl font-black rounded-2xl bg-muted/30 border-border/50 text-center"
                      />
                    </div>

                    <Slider
                      value={[amount]}
                      onValueChange={([v]) => setAmount(v)}
                      max={walletBalance}
                      min={500}
                      step={500}
                      className="py-1"
                    />

                    {/* Quick chips */}
                    <div className="grid grid-cols-4 gap-2">
                      {[0.25, 0.5, 0.75, 1].map((fraction) => {
                        const quickAmount = Math.max(500, Math.floor(walletBalance * fraction));
                        const isActive = amount === quickAmount;
                        return (
                          <Button
                            key={fraction}
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setAmount(quickAmount)}
                            className={`h-10 rounded-xl font-bold touch-manipulation text-xs ${
                              isActive ? '' : 'border-border/50'
                            }`}
                          >
                            {fraction === 1 ? '💯 All' : `${fraction * 100}%`}
                          </Button>
                        );
                      })}
                    </div>

                    {/* Transfer preview card */}
                    <AnimatePresence>
                      {amount >= 500 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/15 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground font-medium">You'll receive</p>
                            <p className="text-xs text-muted-foreground">
                              via <strong className="text-foreground">{selectedOption?.label}</strong>
                            </p>
                          </div>
                          <p className="text-3xl font-black text-primary tracking-tight">{formatCurrency(amount)}</p>
                          <div className="flex items-center justify-between pt-1 border-t border-primary/10">
                            <span className="text-[10px] text-muted-foreground">
                              {(payoutMode === 'mtn' || payoutMode === 'airtel') && momoNumber ? `📱 ${momoNumber}` : ''}
                              {payoutMode === 'bank' && bankName ? `🏦 ${bankName}` : ''}
                              {payoutMode === 'cash' ? '💵 Cash at agent' : ''}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Remaining: {formatCurrency(walletBalance - amount)}
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── ACTIONS ── */}
              <div className="pt-2 flex gap-3">
                <Button variant="outline" onClick={handleClose} className="flex-1 h-12 rounded-xl font-bold border-border/50">
                  Cancel
                </Button>
                {isFormValid ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 gap-2 h-12 rounded-xl font-bold bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                    ) : (
                      <><ArrowDownToLine className="h-4 w-4" /> Withdraw</>
                    )}
                  </Button>
                ) : (
                  <Button disabled className="flex-1 h-12 rounded-xl font-bold opacity-40">
                    {!payoutMode
                      ? 'Select method ↑'
                      : !isPayoutValid()
                      ? 'Fill details ↑'
                      : reason.trim().length < 10
                      ? 'Add reason ↑'
                      : amount < 500
                      ? 'Enter amount'
                      : 'Withdraw'
                    }
                  </Button>
                )}
              </div>

              {/* Trust footer */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <Shield className="h-3 w-3 text-muted-foreground/40" />
                <p className="text-[9px] text-muted-foreground/40 font-medium tracking-wide">
                  256-BIT ENCRYPTED · 4-STAGE APPROVAL · INSTANT NOTIFICATIONS
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
