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
import { Loader2, Send, Wheat, CheckCircle2, UserCheck, AlertCircle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export const WELILE_BREAD_PRICE = 6500;

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
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });

  const reset = () => {
    setPhone('');
    setSending(false);
    setSent(false);
    setLookup({ status: 'idle' });
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
  }, [phone, user]);

  const handleSend = async () => {
    if (lookup.status !== 'found') {
      toast.error('Pick a valid Welile recipient first');
      return;
    }
    if (!user) {
      toast.error('Please sign in');
      return;
    }
    if (typeof availableBalance === 'number' && availableBalance < WELILE_BREAD_PRICE) {
      toast.error(`Insufficient balance. You need ${formatUGX(WELILE_BREAD_PRICE)}`);
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-transfer', {
        body: {
          recipient_id: lookup.recipient.id,
          amount: WELILE_BREAD_PRICE,
          description: `You have received a Welile bread of ${formatUGX(WELILE_BREAD_PRICE)}`,
        },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);

      setSent(true);
      const name = lookup.recipient.full_name?.trim() || 'recipient';
      toast.success(`🍞 Welile Bread delivered to ${name}`);
      setTimeout(() => {
        onOpenChange(false);
        setTimeout(reset, 300);
      }, 1600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send Welile Bread';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const canSend = lookup.status === 'found' && !sending;

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
            <Wheat className="h-5 w-5 text-amber-600" />
            Share Welile Bread
          </DialogTitle>
          <DialogDescription>
            Send a fresh {formatUGX(WELILE_BREAD_PRICE)} Welile Bread to any Welile user. The amount is deducted from your withdrawable balance and credited to their wallet instantly.
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
              {formatUGX(WELILE_BREAD_PRICE)} has been credited to the recipient's wallet.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Welile Bread</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {formatUGX(WELILE_BREAD_PRICE)}
                  </p>
                </div>
                <span className="text-4xl" role="img" aria-label="bread">🍞</span>
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
                    <span>That's your own number. Pick a different recipient.</span>
                  </div>
                )}
                {lookup.status === 'found' && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/5 px-3 py-2.5"
                  >
                    <div className="h-9 w-9 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                      <UserCheck className="h-4 w-4 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {lookup.recipient.full_name?.trim() || 'Welile user'}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {lookup.recipient.phone || 'Verified Welile account'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {typeof availableBalance === 'number' && (
              <p className="text-xs text-muted-foreground">
                Your withdrawable balance: <span className="font-semibold text-foreground">{formatUGX(availableBalance)}</span>
              </p>
            )}

            <Button
              onClick={handleSend}
              disabled={!canSend}
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : lookup.status === 'found' ? (
                <>
                  <Send className="h-4 w-4" />
                  Send to {lookup.recipient.full_name?.trim().split(' ')[0] || 'recipient'} · {formatUGX(WELILE_BREAD_PRICE)}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send {formatUGX(WELILE_BREAD_PRICE)} Welile Bread
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
