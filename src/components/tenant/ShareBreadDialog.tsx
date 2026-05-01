import { useEffect, useState } from 'react';
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
import { Loader2, Send, Wheat, CheckCircle2, UserCheck, AlertCircle, Search, ArrowLeft, ArrowRight, Wallet, Copy, Hash, Minus, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAvailableBalance } from '@/hooks/useAvailableBalance';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export const WELILE_BREAD_PRICE = 6500;
export const WELILE_BREAD_MAX_QTY = 50;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance?: number;
}

interface ResolvedRecipient {
  id: string;
  full_name: string | null;
  phone: string | null;
}

type LookupState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; recipient: ResolvedRecipient }
  | { status: 'not_found' }
  | { status: 'self' }
  | { status: 'too_short' };

export function ShareBreadDialog({ open, onOpenChange, availableBalance }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  // Always derive a live, ledger-backed withdrawable inside the dialog so the
  // zero-balance gate stays accurate even if the parent's prop is stale
  // (e.g. after a top-up that posted to the ledger while this dialog was
  // mounted). Falls back to the prop on first paint.
  const { available: liveAvailable, refresh: refreshAvailable } = useAvailableBalance();
  const effectiveBalance =
    typeof liveAvailable === 'number' ? liveAvailable : availableBalance;
  const myLast9 = (profile?.phone ?? '').replace(/\D/g, '').slice(-9);
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const [reference, setReference] = useState<string | null>(null);

  // Force a fresh withdrawable read every time the dialog opens. The hook
  // also live-subscribes to wallet/ledger changes, so a top-up that posts
  // while the dialog is open will automatically lift the zero-balance gate.
  useEffect(() => {
    if (open) void refreshAvailable();
  }, [open, refreshAvailable]);

  const reset = () => {
    setStep('pick');
    setPhone('');
    setQty(1);
    setSending(false);
    setSent(false);
    setLookup({ status: 'idle' });
    setReference(null);
  };

  // Debounced recipient lookup by phone (last 9 digits)
  useEffect(() => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 0) {
      setLookup({ status: 'idle' });
      return;
    }
    if (cleaned.length < 9) {
      setLookup({ status: 'too_short' });
      return;
    }

    const last9 = cleaned.slice(-9);
    // Instant self-check — block before hitting the DB so the user gets
    // immediate feedback even on slow networks.
    if (myLast9 && last9 === myLast9) {
      setLookup({ status: 'self' });
      return;
    }
    setLookup({ status: 'searching' });
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .ilike('phone', `%${last9}`)
        .limit(1);
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setLookup({ status: 'not_found' });
        return;
      }
      const recipient = data[0] as ResolvedRecipient;
      if (user && recipient.id === user.id) {
        setLookup({ status: 'self' });
        return;
      }
      setLookup({ status: 'found', recipient });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [phone, user, myLast9]);

  const handleSend = async () => {
    // Defensive guard — should be unreachable because the Send button is
    // disabled in the 'self' state, but if a user races the picker we
    // still refuse the transfer locally before the edge function runs.
    if (lookup.status === 'self') {
      toast.error("You can't send a Welile Bread to your own wallet.");
      return;
    }
    if (lookup.status !== 'found') {
      toast.error('Pick a valid Welile recipient first');
      return;
    }
    if (!user) {
      toast.error('Please sign in');
      return;
    }
    // Final belt-and-suspenders self-check using the resolved recipient id.
    if (lookup.recipient.id === user.id) {
      toast.error("You can't send a Welile Bread to your own wallet.");
      return;
    }
    // Hard zero-balance gate: a user with zero (or unknown-but-non-positive)
    // withdrawable balance is never allowed to send a Welile Bread.
    if (typeof availableBalance === 'number' && availableBalance <= 0) {
      toast.error("You can't send a Welile Bread with zero withdrawable balance. Top up your wallet first.");
      return;
    }
    if (typeof availableBalance === 'number' && availableBalance < totalAmount) {
      toast.error(`Insufficient balance. You need ${formatUGX(totalAmount)}`);
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-transfer', {
        body: {
          recipient_id: lookup.recipient.id,
          amount: totalAmount,
          // Canonical descriptions are set server-side for both legs so the
          // sender and receiver wallet statements stay consistent.
          transfer_kind: 'welile_bread',
          bread_qty: qty,
          description: `Welile Bread x${qty} (${formatUGX(totalAmount)})`,
        },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { error?: string; transfer_reference?: string; reference?: string };
      if (payload.error) throw new Error(payload.error);

      const ref =
        payload.transfer_reference ||
        payload.reference ||
        `WB-${Date.now().toString(36).toUpperCase()}`;
      setReference(ref);
      setSent(true);

      const name = lookup.recipient.full_name?.trim() || 'recipient';
      const shortRef = ref.slice(0, 8).toUpperCase();
      // Receipt-style toast
      toast.success(`🍞 ${qty > 1 ? `${qty} Welile Breads` : 'Welile Bread'} delivered`, {
        description:
          `${formatUGX(totalAmount)} → ${name}\n` +
          `Ref: ${shortRef}`,
        duration: 6000,
        action: {
          label: 'Copy ref',
          onClick: () => {
            navigator.clipboard?.writeText(ref).catch(() => {});
            toast.success('Reference copied');
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send Welile Bread';
      // Receipt-style failure toast
      toast.error('Welile Bread failed', {
        description: `${formatUGX(totalAmount)} · ${msg}`,
        duration: 7000,
      });
    } finally {
      setSending(false);
    }
  };

  const canSend = lookup.status === 'found' && !sending;
  const totalAmount = WELILE_BREAD_PRICE * qty;
  // Hard zero-balance gate. Treat unknown balance as not-zero (don't lock the
  // user out if the parent never passed it). Once we know it's <= 0, ALL
  // sending paths are blocked.
  const zeroBalance =
    typeof availableBalance === 'number' && availableBalance <= 0;
  const insufficient =
    typeof availableBalance === 'number' && availableBalance < totalAmount;
  const balanceAfter =
    typeof availableBalance === 'number' ? availableBalance - totalAmount : null;

  const decQty = () => setQty((q) => Math.max(1, q - 1));
  const incQty = () => setQty((q) => Math.min(WELILE_BREAD_MAX_QTY, q + 1));

  // === Recipient display helpers ===
  // Keep these pure & self-contained so the same formatting is used in both
  // the picker card and the review card.
  const recipientFullName =
    lookup.status === 'found' ? lookup.recipient.full_name?.trim() || '' : '';
  const recipientFirstName =
    recipientFullName.split(/\s+/)[0] || 'Welile user';
  const recipientInitial = (recipientFirstName[0] || 'W').toUpperCase();

  // Format a Ugandan-style phone number into readable groups without ever
  // dropping digits. Falls back to the raw value if it doesn't look like a
  // 9–13 digit number so we never silently mangle international formats.
  const formatPhone = (raw?: string | null): string => {
    if (!raw) return '';
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 13) return trimmed;
    // Local 0XXXXXXXXX (10) → 0XXX XXX XXX
    if (digits.length === 10 && digits.startsWith('0')) {
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    // International 256XXXXXXXXX (12) → +256 XXX XXX XXX
    if (digits.length === 12 && digits.startsWith('256')) {
      return `+256 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
    }
    // Generic last-9 grouping → … XXX XXX XXX
    const last9 = digits.slice(-9);
    const prefix = digits.slice(0, digits.length - 9);
    const grouped = `${last9.slice(0, 3)} ${last9.slice(3, 6)} ${last9.slice(6)}`;
    return prefix ? `+${prefix} ${grouped}` : grouped;
  };
  const recipientPhoneFormatted =
    lookup.status === 'found'
      ? formatPhone(lookup.recipient.phone) || formatPhone(phone)
      : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 300);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'review' && !sent && (
              <button
                type="button"
                onClick={() => setStep('pick')}
                className="-ml-1 p-1 rounded-md hover:bg-muted/50"
                aria-label="Back to recipient picker"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Wheat className="h-5 w-5 text-amber-600" />
            {sent ? 'Welile Bread sent' : step === 'review' ? 'Confirm & Send' : 'Share Welile Bread'}
          </DialogTitle>
          <DialogDescription>
            {sent
              ? 'Your Welile Bread is on its way.'
              : step === 'review'
              ? 'Review the details below. This action is final once you tap Send.'
              : `Send fresh Welile Bread (${formatUGX(WELILE_BREAD_PRICE)} each) to any Welile user.`}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-3 py-6"
          >
            <CheckCircle2 className="h-14 w-14 text-success" />
            <p className="font-semibold">Welile Bread delivered</p>
            <p className="text-sm text-muted-foreground text-center">
              {qty > 1
                ? `${qty} Welile Breads (${formatUGX(totalAmount)})`
                : formatUGX(totalAmount)}{' '}
              has been credited to the recipient's wallet.
            </p>
            {reference && (
              <div className="w-full mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Transfer reference
                      </p>
                      <p className="text-xs font-mono font-semibold text-foreground truncate">
                        {reference}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 shrink-0"
                    onClick={() => {
                      navigator.clipboard?.writeText(reference).catch(() => {});
                      toast.success('Reference copied');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => {
                onOpenChange(false);
                setTimeout(reset, 300);
              }}
            >
              Done
            </Button>
          </motion.div>
        ) : step === 'pick' ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Welile Bread</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {formatUGX(totalAmount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {qty} × {formatUGX(WELILE_BREAD_PRICE)}
                  </p>
                </div>
                <span className="text-4xl" role="img" aria-label="bread">🍞</span>
              </div>
            </div>

            {/* Quantity stepper */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">How many breads?</p>
                <p className="text-[11px] text-muted-foreground">Up to {WELILE_BREAD_MAX_QTY} per send</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={decQty}
                  disabled={qty <= 1 || sending}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={WELILE_BREAD_MAX_QTY}
                  value={qty}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isNaN(n)) {
                      setQty(1);
                      return;
                    }
                    setQty(Math.min(WELILE_BREAD_MAX_QTY, Math.max(1, n)));
                  }}
                  disabled={sending}
                  className="h-9 w-14 text-center font-semibold"
                  aria-label="Number of breads"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={incQty}
                  disabled={qty >= WELILE_BREAD_MAX_QTY || sending}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bread-phone">Recipient phone number</Label>
              <Input
                id="bread-phone"
                type="tel"
                inputMode="tel"
                placeholder="0700 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={sending}
                autoFocus
              />

              {/* Lookup status — single source of truth for who will receive the bread */}
              <div aria-live="polite" className="min-h-[44px]">
                {lookup.status === 'idle' && (
                  <p className="text-xs text-muted-foreground">
                    Recipient must have a Welile account.
                  </p>
                )}
                {lookup.status === 'too_short' && (
                  <p className="text-xs text-muted-foreground">
                    Keep typing the full phone number…
                  </p>
                )}
                {lookup.status === 'searching' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Search className="h-3.5 w-3.5 animate-pulse" />
                    Looking up Welile user…
                  </div>
                )}
                {lookup.status === 'not_found' && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>No Welile user with this phone. Ask them to sign up first.</span>
                  </div>
                )}
                {lookup.status === 'self' && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning-foreground">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      That's your own phone number. You can't send a Welile Bread to yourself — pick a different recipient.
                    </span>
                  </div>
                )}
                {lookup.status === 'found' && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/5 px-3 py-2.5"
                  >
                    <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center shrink-0 relative">
                      <span className="text-sm font-bold text-success">
                        {recipientInitial}
                      </span>
                      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-success flex items-center justify-center ring-2 ring-background">
                        <UserCheck className="h-2.5 w-2.5 text-success-foreground" />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">
                        Sending to{' '}
                        <span className="text-success">{recipientFirstName}</span>
                      </p>
                      {recipientFullName && recipientFullName !== recipientFirstName && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {recipientFullName}
                        </p>
                      )}
                      <p className="text-xs font-mono font-medium text-foreground mt-0.5 break-all">
                        {recipientPhoneFormatted || 'Verified Welile account'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {zeroBalance ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Your withdrawable balance is UGX 0</p>
                  <p className="opacity-80">
                    Top up your wallet to send a Welile Bread.
                  </p>
                </div>
              </div>
            ) : (
              typeof availableBalance === 'number' && (
                <p className="text-xs text-muted-foreground">
                  Your withdrawable balance:{' '}
                  <span className="font-semibold text-foreground">{formatUGX(availableBalance)}</span>
                </p>
              )
            )}

            <Button
              onClick={() => setStep('review')}
              disabled={lookup.status !== 'found' || zeroBalance}
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold gap-2"
            >
              Continue to review
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          /* === REVIEW STEP === */
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4 pt-2"
          >
            {/* Item summary */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl" role="img" aria-label="bread">🍞</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {qty > 1 ? `${qty} Welile Breads` : 'Welile Bread'} · Fresh today
                  </p>
                  <p className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
                    {formatUGX(totalAmount)}
                  </p>
                  {qty > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      {qty} × {formatUGX(WELILE_BREAD_PRICE)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Recipient row */}
            {lookup.status === 'found' && (
              <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Recipient
                </p>
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-full bg-success/15 flex items-center justify-center shrink-0 relative">
                    <span className="text-base font-bold text-success">
                      {recipientInitial}
                    </span>
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-success flex items-center justify-center ring-2 ring-card">
                      <UserCheck className="h-2.5 w-2.5 text-success-foreground" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* First name takes the spotlight; full name (if longer) is shown as a small hint and is the only text allowed to truncate. */}
                    <p className="text-base font-bold text-foreground leading-tight">
                      {recipientFirstName}
                    </p>
                    {recipientFullName && recipientFullName !== recipientFirstName && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {recipientFullName}
                      </p>
                    )}
                    {/* Full phone — never truncated; wraps on narrow screens. */}
                    <p className="text-sm font-mono font-medium text-foreground mt-1 break-all">
                      {recipientPhoneFormatted || phone}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Balance impact */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Your wallet
                </p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Withdrawable now</span>
                <span className="font-semibold text-foreground">
                  {typeof availableBalance === 'number' ? formatUGX(availableBalance) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {qty > 1 ? `${qty} Welile Breads` : 'Welile Bread'} cost
                </span>
                <span className="font-semibold text-destructive">
                  − {formatUGX(totalAmount)}
                </span>
              </div>
              <div className="border-t border-border my-1" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium">Withdrawable after</span>
                <span
                  className={`font-bold ${
                    insufficient ? 'text-destructive' : 'text-success'
                  }`}
                >
                  {balanceAfter !== null ? formatUGX(Math.max(balanceAfter, 0)) : '—'}
                </span>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Not enough withdrawable balance. Top up your wallet to send a Welile Bread.
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('pick')}
                disabled={sending}
                className="flex-1 h-12"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={!canSend || insufficient || zeroBalance}
                className="flex-[2] h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Confirm & Send
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
