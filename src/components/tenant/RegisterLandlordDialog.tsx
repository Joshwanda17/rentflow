import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
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
import { Home, User, Phone, MapPin, Banknote, CheckCircle2, Sparkles } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const formVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess }: RegisterLandlordDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');

  const resetForm = () => {
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setMonthlyRent('');
    setMobileMoneyNumber('');
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const rentAmount = parseInt(monthlyRent.replace(/,/g, '')) || 0;

      const { error } = await supabase.from('landlords').insert({
        tenant_id: user.id,
        name: landlordName.trim(),
        phone: landlordPhone.trim(),
        property_address: propertyAddress.trim(),
        monthly_rent: rentAmount,
        mobile_money_number: mobileMoneyNumber.trim() || null,
      });

      if (error) throw error;

      setSuccess(true);
      toast({
        title: 'Landlord Registered!',
        description: 'You can now access rent discount benefits.',
      });

      setTimeout(() => {
        onOpenChange(false);
        resetForm();
        onSuccess?.();
      }, 2000);
    } catch (error: any) {
      toast({
        title: 'Registration Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const rentAmount = parseInt(monthlyRent.replace(/,/g, '')) || 0;
  const maxDiscount = rentAmount * 0.7;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Register Your Landlord
          </DialogTitle>
          <DialogDescription>
            Register your landlord details to unlock rent discounts of up to 70%
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
              >
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </motion.div>
              <h3 className="text-lg font-semibold mb-2">Registration Complete!</h3>
              <p className="text-muted-foreground text-sm">
                You're now eligible for rent discounts. Start uploading receipts to earn discounts!
              </p>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              variants={formVariants}
              initial="hidden"
              animate="visible"
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="landlordName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Landlord's Full Name
                </Label>
                <Input
                  id="landlordName"
                  placeholder="Enter landlord's name"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  required
                />
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="landlordPhone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Landlord's Phone Number
                </Label>
                <Input
                  id="landlordPhone"
                  placeholder="e.g., 0700123456"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  required
                />
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="propertyAddress" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Property Location/Address
                </Label>
                <Input
                  id="propertyAddress"
                  placeholder="Enter property address"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  required
                />
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="monthlyRent" className="flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Monthly Rent Amount (UGX)
                </Label>
                <Input
                  id="monthlyRent"
                  placeholder="e.g., 500000"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9]/g, ''))}
                  required
                />
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="mobileMoneyNumber" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Mobile Money Number (Optional)
                </Label>
                <Input
                  id="mobileMoneyNumber"
                  placeholder="For rent payments"
                  value={mobileMoneyNumber}
                  onChange={(e) => setMobileMoneyNumber(e.target.value)}
                />
              </motion.div>

              {rentAmount > 0 && (
                <motion.div
                  variants={itemVariants}
                  className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20"
                >
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Potential Savings</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        With receipts, you could save up to{' '}
                        <span className="font-bold text-primary">{formatUGX(maxDiscount)}</span>{' '}
                        per month (70% of your rent)!
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.div variants={itemVariants}>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Registering...' : 'Register Landlord'}
                </Button>
              </motion.div>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
