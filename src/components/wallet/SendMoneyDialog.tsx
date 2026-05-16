import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFirstTransactionCelebration } from '@/hooks/useFirstTransactionCelebration';
import { useConfetti } from '@/components/Confetti';
import { toast } from 'sonner';
import { 
  Loader2, Send, Phone, Coins, FileText, CheckCircle, Sparkles, UserCheck, UserX,
  Mail, UtensilsCrossed, ShoppingCart, Fuel, Car, Hotel, Stethoscope, 
  Wrench, Coffee, Zap, Droplets, Scissors, BookOpen, Baby, Shirt, PawPrint, Bike
} from 'lucide-react';

interface SendMoneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 }
  },
};

export function SendMoneyDialog({ open, onOpenChange }: SendMoneyDialogProps) {
  const { sendMoney, wallet } = useWallet();
  const { user } = useAuth();
  const { triggerCelebration, markCelebrated } = useFirstTransactionCelebration();
  const { fireSuccess } = useConfetti();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isFirstTx, setIsFirstTx] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lookupNonce, setLookupNonce] = useState(0);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  type RecipientMatch = {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    isSelf: boolean;
  };
  const [recipient, setRecipient] = useState<
    | { status: 'idle' }
    | { status: 'invalid'; reason: string }
    | { status: 'searching' }
    | { status: 'found'; name: string; phone: string; email: string | null; isSelf: boolean }
    | { status: 'multiple'; matches: RecipientMatch[] }
    | { status: 'not_found' }
  >({ status: 'idle' });

  // Debounced recipient lookup (phone OR email depending on mode)
  useEffect(() => {
    if (mode === 'phone') {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 0) {
        setRecipient({ status: 'idle' });
        return;
      }
      // Reject obviously wrong shapes early
      if (digits.length < 9) {
        setRecipient({
          status: 'invalid',
          reason: `Phone number too short (${digits.length}/9 digits).`,
        });
        return;
      }
      if (digits.length > 13) {
        setRecipient({
          status: 'invalid',
          reason: 'Phone number is too long. Use a Ugandan format like 0783673998 or +256783673998.',
        });
        return;
      }
      const last9 = digits.slice(-9);
      // Ugandan mobile numbers always start with 7 (after the leading 0 / 256)
      if (!/^7\d{8}$/.test(last9)) {
        setRecipient({
          status: 'invalid',
          reason: 'Enter a valid Ugandan mobile number (e.g. 0783673998).',
        });
        return;
      }
      setRecipient({ status: 'searching' });
      let cancelled = false;
      const timer = setTimeout(async () => {
        const variants = [`0${last9}`, `256${last9}`, `+256${last9}`, last9];
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone, email')
          .in('phone', variants)
          .limit(10);
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setRecipient({ status: 'not_found' });
          return;
        }
        const matches: RecipientMatch[] = data.map((d) => ({
          id: d.id,
          name: d.full_name || d.email || 'Unnamed user',
          phone: d.phone || phone,
          email: d.email || null,
          isSelf: d.id === user?.id,
        }));
        if (matches.length === 1) {
          const m = matches[0];
          setRecipient({
            status: 'found',
            name: m.name,
            phone: m.phone,
            email: m.email,
            isSelf: m.isSelf,
          });
        } else {
          setRecipient({ status: 'multiple', matches });
        }
      }, 400);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Email mode
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length === 0) {
      setRecipient({ status: 'idle' });
      return;
    }
    if (trimmed.length > 254) {
      setRecipient({ status: 'invalid', reason: 'Email is too long.' });
      return;
    }
    const validEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed);
    if (!validEmail) {
      setRecipient({
        status: 'invalid',
        reason: 'Enter a valid email like name@example.com.',
      });
      return;
    }
    setRecipient({ status: 'searching' });
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .ilike('email', trimmed)
        .limit(10);
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setRecipient({ status: 'not_found' });
        return;
      }
      const withPhone = data.filter((d) => !!d.phone);
      if (withPhone.length === 0) {
        setRecipient({ status: 'not_found' });
        return;
      }
      const matches: RecipientMatch[] = withPhone.map((d) => ({
        id: d.id,
        name: d.full_name || d.email || 'Unnamed user',
        phone: d.phone as string,
        email: d.email || null,
        isSelf: d.id === user?.id,
      }));
      if (matches.length === 1) {
        const m = matches[0];
        setRecipient({
          status: 'found',
          name: m.name,
          phone: m.phone,
          email: m.email,
          isSelf: m.isSelf,
        });
      } else {
        setRecipient({ status: 'multiple', matches });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, phone, email, user?.id, lookupNonce]);

  const categories = [
    { icon: UtensilsCrossed, label: 'Food', keywords: ['food', 'eat', 'lunch', 'dinner', 'breakfast', 'meal', 'chakula'] },
    { icon: ShoppingCart, label: 'Groceries', keywords: ['groc', 'shop', 'market', 'buy', 'sugar', 'rice', 'soap'] },
    { icon: Fuel, label: 'Fuel', keywords: ['fuel', 'petrol', 'diesel', 'gas', 'station'] },
    { icon: Car, label: 'Transport', keywords: ['transport', 'taxi', 'fare', 'travel', 'trip', 'matatu'] },
    { icon: Bike, label: 'Boda Boda', keywords: ['boda', 'bike', 'motorcycle', 'pikipiki', 'ride'] },
    { icon: Hotel, label: 'Hotel', keywords: ['hotel', 'lodge', 'room', 'stay', 'accommodation', 'guest'] },
    { icon: Stethoscope, label: 'Clinic', keywords: ['clinic', 'hospital', 'doctor', 'medical', 'health', 'medicine', 'drug'] },
    { icon: Wrench, label: 'Mechanic', keywords: ['mechanic', 'repair', 'fix', 'garage', 'service', 'car'] },
    { icon: Coffee, label: 'Restaurant', keywords: ['restaurant', 'cafe', 'coffee', 'drink', 'bar'] },
    { icon: Zap, label: 'Electricity', keywords: ['electric', 'power', 'yaka', 'umeme', 'light', 'token'] },
    { icon: Droplets, label: 'Water', keywords: ['water', 'nwsc', 'bill'] },
    { icon: Scissors, label: 'Salon', keywords: ['salon', 'hair', 'barber', 'cut', 'beauty', 'nails'] },
    { icon: BookOpen, label: 'School', keywords: ['school', 'fees', 'tuition', 'education', 'books', 'uniform'] },
    { icon: Baby, label: 'Kids', keywords: ['kid', 'child', 'baby', 'diaper', 'milk'] },
    { icon: Shirt, label: 'Clothes', keywords: ['cloth', 'shirt', 'dress', 'wear', 'shoes'] },
  ];

  const filteredCategories = description.trim()
    ? categories.filter(cat => 
        cat.keywords.some(kw => description.toLowerCase().includes(kw)) ||
        cat.label.toLowerCase().includes(description.toLowerCase())
      )
    : categories.slice(0, 8); // show top 8 by default

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Enter an amount greater than 0 UGX');
      return;
    }
    if (wallet && amountNum > (wallet.balance || 0)) {
      toast.error(`Insufficient balance. Available: ${formatCurrency(wallet.balance || 0)}`);
      return;
    }
    if (mode === 'phone' && !phone) {
      toast.error('Enter the recipient phone number to continue');
      return;
    }
    if (mode === 'email' && !email) {
      toast.error('Enter the recipient email to continue');
      return;
    }

    if (recipient.status === 'invalid') {
      toast.error(recipient.reason);
      return;
    }
    if (recipient.status === 'not_found') {
      toast.error(
        mode === 'email'
          ? 'No Welile user found for this email address'
          : 'No Welile user found for this phone number'
      );
      return;
    }
    if (recipient.status === 'found' && recipient.isSelf) {
      toast.error("You can't send money to your own account");
      return;
    }
    if (recipient.status === 'searching') {
      toast.error('Still verifying recipient — please wait a moment');
      return;
    }
    if (recipient.status === 'multiple') {
      toast.error('Multiple accounts match — pick the correct recipient to continue');
      return;
    }
    if (recipient.status === 'idle') {
      toast.error(
        mode === 'email'
          ? 'Enter a valid recipient email like name@example.com'
          : 'Enter a valid Ugandan phone number (e.g. 0783673998)'
      );
      return;
    }

    // Open confirmation step — user must explicitly confirm before money is sent.
    setConfirming(true);
  };

  // Single source of truth for why the Send button is disabled.
  // Returned string is shown inline; null means the button is enabled.
  const getDisabledReason = (): string | null => {
    if (loading) return 'Sending… please wait.';
    const amountNum = parseFloat(amount);
    if (mode === 'phone' && !phone.trim()) return 'Enter the recipient phone number to continue.';
    if (mode === 'email' && !email.trim()) return 'Enter the recipient email to continue.';
    if (recipient.status === 'idle') {
      return mode === 'email'
        ? 'Enter a valid recipient email like name@example.com.'
        : 'Enter a valid Ugandan phone number (e.g. 0783673998).';
    }
    if (recipient.status === 'invalid') return recipient.reason;
    if (recipient.status === 'searching') return 'Verifying recipient on Welile…';
    if (recipient.status === 'not_found') {
      return mode === 'email'
        ? 'No Welile user found for this email address.'
        : 'No Welile user found for this phone number.';
    }
    if (recipient.status === 'multiple') return 'Multiple accounts match — pick the correct recipient above.';
    if (recipient.status === 'found' && recipient.isSelf) {
      return "You can't send money to your own account.";
    }
    if (!amount.trim() || isNaN(amountNum) || amountNum <= 0) return 'Enter an amount greater than 0 UGX.';
    if (wallet && amountNum > (wallet.balance || 0)) {
      return `Insufficient balance. Available: ${formatCurrency(wallet.balance || 0)}.`;
    }
    return null;
  };
  const disabledReason = getDisabledReason();
  const sendDisabled = disabledReason !== null;

  const executeSend = async () => {
    const amountNum = parseFloat(amount);
    setLoading(true);
    // Always send via matched phone (edge function accepts recipient_phone)
    const recipientPhone =
      recipient.status === 'found' ? recipient.phone : phone;
    const { error } = await sendMoney(recipientPhone, amountNum, description);
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setConfirming(false);
    setSuccess(true);
    
    // Check if this was the first transaction and trigger celebration
    setTimeout(async () => {
      const celebrated = localStorage.getItem(`welile_first_tx_celebrated_${wallet?.user_id}`);
      if (!celebrated) {
        // This might be their first transaction - fire confetti!
        fireSuccess();
        setIsFirstTx(true);
        localStorage.setItem(`welile_first_tx_celebrated_${wallet?.user_id}`, 'true');
        toast.success('🎉 Congratulations on your first transaction!', {
          duration: 4000,
        });
      }
    }, 300);
    
    toast.success(`Successfully sent ${formatCurrency(amountNum)}`);
    
    setTimeout(() => {
      setPhone('');
      setEmail('');
      setMode('phone');
      setAmount('');
      setDescription('');
      setSuccess(false);
      setIsFirstTx(false);
      setRecipient({ status: 'idle' });
      onOpenChange(false);
    }, isFirstTx ? 3000 : 1500);
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setPhone('');
      setEmail('');
      setMode('phone');
      setAmount('');
      setDescription('');
      setSuccess(false);
      setIsFirstTx(false);
      setConfirming(false);
      setRecipient({ status: 'idle' });
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-hidden border-border/50 glass-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="py-12 flex flex-col items-center justify-center relative"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' as const, stiffness: 300, damping: 20, delay: 0.1 }}
                className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isFirstTx ? 'bg-gradient-to-br from-success/30 to-primary/30' : 'bg-success/20'}`}
              >
                <CheckCircle className={`h-10 w-10 ${isFirstTx ? 'text-primary' : 'text-success'}`} />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-semibold"
              >
                {isFirstTx ? '🎉 First Transaction!' : 'Money Sent!'}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground text-sm text-center"
              >
                {isFirstTx 
                  ? `Welcome to Welile! ${formatCurrency(parseFloat(amount))} sent successfully.`
                  : `${formatCurrency(parseFloat(amount))} transferred successfully`
                }
              </motion.p>
            </motion.div>
          ) : confirming ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CheckCircle className="h-5 w-5 text-primary" />
                  </div>
                  Confirm transfer
                </DialogTitle>
                <DialogDescription>
                  Review the recipient before sending. This cannot be undone.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-border/60 bg-background/50 p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sending to</p>
                  <p className="text-base font-semibold">
                    {recipient.status === 'found' ? recipient.name : '—'}
                  </p>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {recipient.status === 'found' && recipient.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="text-foreground">{recipient.phone}</span>
                      </div>
                    )}
                    {recipient.status === 'found' && recipient.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="text-foreground truncate">{recipient.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Amount</span>
                    <span className="text-lg font-bold">{formatCurrency(parseFloat(amount) || 0)}</span>
                  </div>
                  {description.trim() && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground pt-0.5">For</span>
                      <span className="text-sm text-foreground text-right break-words">{description.trim()}</span>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={executeSend}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Confirm & Send
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <motion.div
                    className="p-2 rounded-lg bg-primary/10"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
                  >
                    <Send className="h-5 w-5 text-primary" />
                  </motion.div>
                  Send Money
                </DialogTitle>
                <DialogDescription>
                  Send money to anyone on Welile using their phone number
                </DialogDescription>
              </DialogHeader>

              <motion.form 
                onSubmit={handleSubmit} 
                className="space-y-4 mt-4"
                variants={formVariants}
                initial="hidden"
                animate="visible"
              >
                <motion.div variants={itemVariants} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={mode === 'phone' ? 'phone' : 'email'} className="flex items-center gap-2">
                      {mode === 'phone' ? (
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      Recipient {mode === 'phone' ? 'Phone Number' : 'Email'}
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode(mode === 'phone' ? 'email' : 'phone');
                        setRecipient({ status: 'idle' });
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Use {mode === 'phone' ? 'email' : 'phone'} instead
                    </button>
                  </div>
                  {mode === 'phone' ? (
                    <PhoneInput
                      id="phone"
                      ref={phoneInputRef}
                      placeholder="e.g. 0783673998"
                      value={phone}
                      onChange={(v) => {
                        setPhone(v);
                        // Auto-clear any stale lookup status (invalid / not_found /
                        // multiple / found-self) the instant the user edits the
                        // phone — the debounced effect will reapply the correct
                        // status shortly. This prevents old errors from lingering
                        // while typing a corrected number.
                        setRecipient((prev) =>
                          prev.status === 'idle' || prev.status === 'searching'
                            ? prev
                            : { status: 'searching' }
                        );
                      }}
                      className="bg-background/50 border-border/50 focus:border-primary/50 transition-all"
                      required
                    />
                  ) : (
                    <Input
                      id="email"
                      ref={emailInputRef}
                      type="email"
                      placeholder="recipient@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setRecipient((prev) =>
                          prev.status === 'idle' || prev.status === 'searching'
                            ? prev
                            : { status: 'searching' }
                        );
                      }}
                      className="bg-background/50 border-border/50 focus:border-primary/50 transition-all"
                      required
                    />
                  )}
                  <div role="status" aria-live="polite" aria-atomic="true">
                  <AnimatePresence mode="wait">
                    {recipient.status === 'searching' && (
                      <motion.p
                        key="searching"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-muted-foreground flex items-center gap-1.5"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Looking up recipient… sending is paused until we confirm them.
                      </motion.p>
                    )}
                    {recipient.status === 'found' && !recipient.isSelf && (
                      <motion.div
                        key="found"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5"
                      >
                        <UserCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                        <div className="text-xs text-foreground space-y-0.5 min-w-0">
                          <p>
                            Sending to <span className="font-semibold">{recipient.name}</span>
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                            {recipient.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {recipient.phone}
                              </span>
                            )}
                            {recipient.email && (
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3" />
                                {recipient.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                    {recipient.status === 'found' && recipient.isSelf && (
                      <motion.p
                        key="self"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-destructive flex items-center gap-1.5"
                      >
                        <UserX className="h-3 w-3" />
                        Sending blocked: this {mode === 'email' ? 'email' : 'number'} is your own account.
                      </motion.p>
                    )}
                    {recipient.status === 'not_found' && (
                      <motion.p
                        key="notfound"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"
                      >
                        <UserX className="h-3 w-3" />
                        Sending blocked: no Welile user found for this {mode === 'email' ? 'email' : 'number'}.
                      </motion.p>
                    )}
                    {recipient.status === 'multiple' && (
                      <motion.div
                        key="multiple"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2"
                      >
                        <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <UserX className="h-3 w-3" />
                          {recipient.matches.length} accounts match this {mode === 'email' ? 'email' : 'number'}. Pick the correct recipient:
                        </p>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {recipient.matches.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              disabled={m.isSelf}
                              onClick={() =>
                                setRecipient({
                                  status: 'found',
                                  name: m.name,
                                  phone: m.phone,
                                  email: m.email,
                                  isSelf: m.isSelf,
                                })
                              }
                              className="w-full text-left rounded-md border border-border/60 bg-background/70 hover:bg-background hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-2 transition-all"
                            >
                              <p className="text-sm font-medium text-foreground truncate">
                                {m.name}
                                {m.isSelf && (
                                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-destructive">
                                    you
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                                {m.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {m.phone}
                                  </span>
                                )}
                                {m.email && (
                                  <span className="flex items-center gap-1 truncate">
                                    <Mail className="h-3 w-3" />
                                    {m.email}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                    {recipient.status === 'invalid' && (
                      <motion.p
                        key="invalid"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-destructive flex items-center gap-1.5"
                      >
                        <UserX className="h-3 w-3" />
                        {recipient.reason}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  </div>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-2">
                  <Label htmlFor="amount" className="flex items-center gap-2">
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    Amount (UGX)
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-background/50 border-border/50 focus:border-primary/50 transition-all text-lg font-medium"
                    min="1"
                    required
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Available: {formatCurrency(wallet?.balance || 0)}
                  </p>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-2">
                  <Label htmlFor="description" className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    What's this payment for?
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="Type e.g. food, boda, school fees..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-background/50 border-border/50 focus:border-primary/50 transition-all resize-none"
                    rows={2}
                  />
                  <AnimatePresence mode="popLayout">
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {filteredCategories.map((cat) => (
                        <motion.button
                          key={cat.label}
                          type="button"
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          onClick={() => setDescription(cat.label)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                            description.toLowerCase() === cat.label.toLowerCase()
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/50 text-foreground border-border/50 hover:bg-muted'
                          }`}
                        >
                          <cat.icon className="h-3.5 w-3.5" />
                          {cat.label}
                        </motion.button>
                      ))}
                    </div>
                  </AnimatePresence>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                        Cancel
                      </Button>
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      // Native tooltip on the wrapper so it still shows even when
                      // the underlying <button> is disabled (disabled buttons
                      // don't reliably emit hover events in all browsers).
                      title={disabledReason ?? undefined}
                    >
                      <Button
                        type="submit"
                        disabled={sendDisabled}
                        className="gap-2"
                        // Mirror the inline validation text exactly so the
                        // hover tooltip matches searching / not-found / self
                        // / invalid / insufficient-balance cases verbatim.
                        // The disabled reason is also announced via the
                        // role="alert" aria-live region below, so we keep the
                        // button's accessible name stable at "Send Money" and
                        // expose the reason via aria-describedby instead of
                        // mutating aria-label (which would break label-based
                        // queries that match on "phone number" etc.).
                        title={disabledReason ?? undefined}
                        aria-disabled={sendDisabled}
                        aria-describedby={
                          disabledReason ? 'send-money-disabled-reason' : undefined
                        }
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Money
                      </Button>
                    </motion.div>
                  </DialogFooter>
                  <AnimatePresence mode="wait">
                    {disabledReason && !loading && (
                      <motion.p
                        key={disabledReason}
                        id="send-money-disabled-reason"
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        role="alert"
                        aria-live="assertive"
                        aria-atomic="true"
                        className="mt-2 text-xs text-muted-foreground text-right"
                      >
                        {disabledReason}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  {disabledReason && !loading && (
                    <div className="mt-1 flex justify-end gap-3 text-xs">
                      {(recipient.status === 'not_found' ||
                        recipient.status === 'invalid' ||
                        (recipient.status === 'found' && recipient.isSelf)) && (
                        <button
                          type="button"
                          onClick={() => {
                            // Re-trigger the debounced lookup effect.
                            setRecipient({ status: 'searching' });
                            setLookupNonce((n) => n + 1);
                          }}
                          className="text-primary hover:underline"
                        >
                          Retry lookup
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const el = mode === 'phone' ? phoneInputRef.current : emailInputRef.current;
                          if (!el) return;
                          el.focus();
                          try { el.select(); } catch { /* number inputs ignore select */ }
                        }}
                        className="text-primary hover:underline"
                      >
                        Edit recipient
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
