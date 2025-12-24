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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, HandCoins, Phone, Coins, FileText, CheckCircle, Send } from 'lucide-react';

interface RequestMoneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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

export function RequestMoneyDialog({ open, onOpenChange, onSuccess }: RequestMoneyDialogProps) {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [recipientName, setRecipientName] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    const amountNum = parseFloat(amount);
    if (!phone || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter valid phone number and amount');
      return;
    }

    setLoading(true);

    const { data: recipientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('phone', phone)
      .maybeSingle();

    if (profileError || !recipientProfile) {
      toast.error('User not found with this phone number');
      setLoading(false);
      return;
    }

    if (recipientProfile.id === user.id) {
      toast.error('Cannot request money from yourself');
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from('money_requests')
      .insert({
        requester_id: user.id,
        recipient_id: recipientProfile.id,
        amount: amountNum,
        description: description || `Money request from ${user.user_metadata?.full_name || 'a user'}`,
      });

    setLoading(false);

    if (error) {
      toast.error('Failed to create request');
      return;
    }

    setRecipientName(recipientProfile.full_name);
    setSuccess(true);
    toast.success(`Requested ${formatCurrency(amountNum)} from ${recipientProfile.full_name}`);
    
    setTimeout(() => {
      setPhone('');
      setAmount('');
      setDescription('');
      setSuccess(false);
      setRecipientName('');
      onOpenChange(false);
      onSuccess?.();
    }, 1500);
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setPhone('');
      setAmount('');
      setDescription('');
      setSuccess(false);
      setRecipientName('');
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-hidden border-border/50 glass-card">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none" />
        
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
                className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-4"
              >
                <Send className="h-10 w-10 text-primary" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-semibold"
              >
                Request Sent!
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground text-sm text-center"
              >
                {recipientName} will be notified to approve your request
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
                    className="p-2 rounded-lg bg-accent/10"
                    whileHover={{ scale: 1.1, rotate: -5 }}
                    transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
                  >
                    <HandCoins className="h-5 w-5 text-accent" />
                  </motion.div>
                  Request Money
                </DialogTitle>
                <DialogDescription>
                  Request money from someone on Welile. They'll need to approve it.
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
                    Their Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g. 0783673998"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-2">
                  <Label htmlFor="description" className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Reason (Optional)
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="What's this for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-background/50 border-border/50 focus:border-primary/50 transition-all resize-none"
                    rows={2}
                  />
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
                          <HandCoins className="h-4 w-4" />
                        )}
                        Send Request
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
