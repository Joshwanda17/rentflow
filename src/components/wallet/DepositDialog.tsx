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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Plus, Coins, CheckCircle, Sparkles, Phone, Clock } from 'lucide-react';

interface DepositDialogProps {
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

export function DepositDialog({ open, onOpenChange }: DepositDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const quickAmounts = [10000, 50000, 100000, 500000];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!agentPhone.trim()) {
      toast.error('Please enter the agent phone number');
      return;
    }

    setLoading(true);

    try {
      // Find agent by phone number
      const { data: agentProfile, error: agentError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('phone', agentPhone.trim())
        .maybeSingle();

      if (agentError || !agentProfile) {
        toast.error('Agent not found with this phone number');
        setLoading(false);
        return;
      }

      // Verify the user is an agent
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', agentProfile.id)
        .eq('role', 'agent')
        .maybeSingle();

      if (roleError || !roleData) {
        toast.error('This phone number does not belong to an agent');
        setLoading(false);
        return;
      }

      // Create deposit request
      const { error: depositError } = await supabase
        .from('deposit_requests')
        .insert({
          user_id: user.id,
          agent_id: agentProfile.id,
          amount: amountNum,
          status: 'pending',
        });

      if (depositError) {
        console.error('Deposit request error:', depositError);
        toast.error('Failed to create deposit request');
        setLoading(false);
        return;
      }

      setSuccess(true);
      toast.success(`Deposit request sent to ${agentProfile.full_name}`);
      
      setTimeout(() => {
        setAmount('');
        setAgentPhone('');
        setSuccess(false);
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setAmount('');
      setAgentPhone('');
      setSuccess(false);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-hidden border-border/50 glass-card">
        <div className="absolute inset-0 bg-gradient-to-br from-success/5 via-transparent to-primary/5 pointer-events-none" />
        
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
                className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center mb-4"
              >
                <Clock className="h-10 w-10 text-yellow-500" />
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
                className="text-muted-foreground text-sm text-center px-4"
              >
                Your deposit of {formatCurrency(parseFloat(amount))} is pending agent approval
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
                    className="p-2 rounded-lg bg-success/10"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
                  >
                    <Plus className="h-5 w-5 text-success" />
                  </motion.div>
                  Deposit Money
                </DialogTitle>
                <DialogDescription>
                  Request a deposit through an agent. The agent will approve once they receive your cash.
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
                  <Label htmlFor="agentPhone" className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    Agent Phone Number
                  </Label>
                  <Input
                    id="agentPhone"
                    type="tel"
                    placeholder="Enter agent's phone number"
                    value={agentPhone}
                    onChange={(e) => setAgentPhone(e.target.value)}
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
                  <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    Quick amounts
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts.map((amt, index) => (
                      <motion.div
                        key={amt}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 + index * 0.05 }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          type="button"
                          variant={amount === amt.toString() ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAmount(amt.toString())}
                          className="transition-all"
                        >
                          {formatCurrency(amt)}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div 
                  variants={itemVariants}
                  className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
                >
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    <Clock className="h-3.5 w-3.5 inline mr-1" />
                    Your balance will update after the agent approves your deposit
                  </p>
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
                          <Plus className="h-4 w-4" />
                        )}
                        Request Deposit
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
