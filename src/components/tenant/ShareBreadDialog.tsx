import { useState } from 'react';
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
import { Loader2, Send, Wheat, CheckCircle2 } from 'lucide-react';
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

export function ShareBreadDialog({ open, onOpenChange, availableBalance }: Props) {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setPhone('');
    setSending(false);
    setSent(false);
  };

  const handleSend = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 9) {
      toast.error('Enter a valid phone number');
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
          recipient_phone: cleaned,
          amount: WELILE_BREAD_PRICE,
          description: `You have received a Welile bread of ${formatUGX(WELILE_BREAD_PRICE)}`,
        },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);

      setSent(true);
      toast.success(`🍞 Welile Bread sent! ${formatUGX(WELILE_BREAD_PRICE)} delivered.`);
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
              <p className="text-xs text-muted-foreground">
                Recipient must have a Welile account.
              </p>
            </div>

            {typeof availableBalance === 'number' && (
              <p className="text-xs text-muted-foreground">
                Your withdrawable balance: <span className="font-semibold text-foreground">{formatUGX(availableBalance)}</span>
              </p>
            )}

            <Button
              onClick={handleSend}
              disabled={sending || phone.replace(/\D/g, '').length < 9}
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
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
