import { useEffect, useMemo, useState } from 'react';
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
import { BadgePercent, CheckCircle2, Hash, Wallet, X, WifiOff } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';

/**
 * WelileReceiptDialog
 *
 * The flagship tenant action: enter a Welile receipt number + amount from
 * any seller, redeem 5% of that amount as a discount on the daily bread.
 *
 * Designed to be ordinary-mind simple, mobile-first, and to work fully
 * offline — the applied receipt is cached in localStorage and survives
 * reloads and connectivity drops.
 */

export const WELILE_BREAD_PRICE = 6500;
export const WELILE_BREAD_DISCOUNT_RATE = 0.05;
export const WELILE_BREAD_MIN_PAYABLE = 500;
const RECEIPT_STORAGE_KEY = 'welile.bread.receipt.v1';

interface BreadReceipt {
  number: string;
  amount: number;
  savedAt: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WelileReceiptDialog({ open, onOpenChange }: Props) {
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptAmountInput, setReceiptAmountInput] = useState('');
  const [applied, setApplied] = useState<BreadReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  // Hydrate cached receipt on open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    try {
      const raw = localStorage.getItem(RECEIPT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BreadReceipt;
      if (parsed?.number && typeof parsed.amount === 'number' && parsed.amount > 0) {
        setApplied(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [open]);

  // Track connectivity for the offline badge.
  useEffect(() => {
    const onChange = () => setOnline(navigator.onLine);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  const grossAmount = WELILE_BREAD_PRICE; // single bread reference price
  const rawDiscount = applied
    ? Math.round(applied.amount * WELILE_BREAD_DISCOUNT_RATE)
    : 0;
  const discountAmount = useMemo(
    () => Math.min(rawDiscount, Math.max(0, grossAmount - WELILE_BREAD_MIN_PAYABLE)),
    [rawDiscount, grossAmount],
  );
  const reducedPrice = Math.max(WELILE_BREAD_MIN_PAYABLE, grossAmount - discountAmount);

  const submit = () => {
    setError(null);
    const num = receiptNumber.trim();
    const amt = Number(receiptAmountInput.replace(/[,\s]/g, ''));
    if (num.length < 3) {
      setError('Enter the full receipt number');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid receipt amount');
      return;
    }
    const next: BreadReceipt = { number: num, amount: amt, savedAt: Date.now() };
    setApplied(next);
    setReceiptNumber('');
    setReceiptAmountInput('');
    try {
      localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* offline-safe: discount still applies in-memory */
    }
    toast.success('Receipt applied', {
      description: `5% of ${formatUGX(amt)} = ${formatUGX(Math.round(amt * WELILE_BREAD_DISCOUNT_RATE))} off`,
      duration: 4000,
    });
  };

  const remove = () => {
    setApplied(null);
    setError(null);
    try {
      localStorage.removeItem(RECEIPT_STORAGE_KEY);
    } catch {
      /* noop */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        {/* Minimal header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <BadgePercent className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                Welile Receipt
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-snug">
                Save 5% on your bread with any receipt
              </DialogDescription>
            </div>
            {!online && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-[10px] font-semibold px-2 py-0.5"
                title="Works offline"
              >
                <WifiOff className="h-3 w-3" /> Offline
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="px-5 py-5 space-y-5">
          {/* Price headline — always visible, before/after */}
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Today's Bread
            </p>
            <div className="mt-1 flex items-baseline gap-3 flex-wrap">
              {discountAmount > 0 ? (
                <>
                  <span className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formatUGX(reducedPrice)}
                  </span>
                  <span className="text-sm line-through text-muted-foreground tabular-nums">
                    {formatUGX(grossAmount)}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 rounded-full px-2 py-0.5">
                    −{formatUGX(discountAmount)}
                  </span>
                </>
              ) : (
                <span className="text-3xl font-extrabold text-foreground tabular-nums">
                  {formatUGX(grossAmount)}
                </span>
              )}
            </div>
          </div>

          {/* Applied receipt card OR input form */}
          {applied ? (
            <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                    Receipt applied
                  </p>
                  <p className="font-mono text-sm font-bold text-emerald-950 dark:text-emerald-50 truncate">
                    {applied.number}
                  </p>
                  <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/80 mt-0.5">
                    {formatUGX(applied.amount)} receipt · 5% = {formatUGX(rawDiscount)} off
                  </p>
                </div>
                <button
                  type="button"
                  onClick={remove}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                  aria-label="Remove receipt"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                <Wallet className="h-4 w-4" />
                Done — pay {formatUGX(reducedPrice)}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="welile-receipt-number"
                  className="text-xs font-semibold text-foreground"
                >
                  Receipt number
                </Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="welile-receipt-number"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="e.g. RCT-12345"
                    className="pl-9 h-12 text-base font-mono"
                    inputMode="text"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="welile-receipt-amount"
                  className="text-xs font-semibold text-foreground"
                >
                  Receipt amount (UGX)
                </Label>
                <Input
                  id="welile-receipt-amount"
                  value={receiptAmountInput}
                  onChange={(e) => setReceiptAmountInput(e.target.value)}
                  placeholder="e.g. 10000"
                  className="h-12 text-base tabular-nums"
                  inputMode="numeric"
                />
                <p className="text-[11px] text-muted-foreground">
                  We take 5% of this as a discount on your bread.
                </p>
              </div>

              {error && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="button"
                onClick={submit}
                disabled={!receiptNumber.trim() || !receiptAmountInput.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                <BadgePercent className="h-4 w-4" />
                Apply 5% discount
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                Works offline · Saved on this device
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
