import { useState } from 'react';
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
import { useFirstTransactionCelebration } from '@/hooks/useFirstTransactionCelebration';
import { useConfetti } from '@/components/Confetti';
import { toast } from 'sonner';
import { 
  Loader2, Send, Phone, Coins, FileText, CheckCircle, Sparkles,
  UtensilsCrossed, ShoppingCart, Fuel, Car, Hotel, Stethoscope, 
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
  const { triggerCelebration, markCelebrated } = useFirstTransactionCelebration();
  const { fireSuccess } = useConfetti();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isFirstTx, setIsFirstTx] = useState(false);

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
    if (!phone || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter valid phone number and amount');
      return;
    }

    setLoading(true);
    const { error } = await sendMoney(phone, amountNum, description);
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

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
      setAmount('');
      setDescription('');
      setSuccess(false);
      setIsFirstTx(false);
      onOpenChange(false);
    }, isFirstTx ? 3000 : 1500);
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setPhone('');
      setAmount('');
      setDescription('');
      setSuccess(false);
      setIsFirstTx(false);
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
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    Recipient Phone Number
                  </Label>
                  <PhoneInput
                    id="phone"
                    placeholder="e.g. 0783673998"
                    value={phone}
                    onChange={(v) => setPhone(v)}
                    className="bg-background/50 border-border/50 focus:border-primary/50 transition-all"
                    required
                  />
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
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button type="submit" disabled={loading} className="gap-2">
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Money
                      </Button>
                    </motion.div>
                  </DialogFooter>
                </motion.div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
