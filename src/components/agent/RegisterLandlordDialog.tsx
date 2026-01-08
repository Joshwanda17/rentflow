import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Phone, MapPin, Banknote, Loader2, CheckCircle2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess }: RegisterLandlordDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const resetForm = () => {
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setMobileMoneyNumber('');
    setBankName('');
    setAccountNumber('');
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);

    // Check if landlord with this phone already exists
    const { data: existingLandlord } = await supabase
      .from('landlords')
      .select('id')
      .eq('phone', landlordPhone.trim())
      .maybeSingle();

    if (existingLandlord) {
      toast.error('A landlord with this phone number already exists');
      setLoading(false);
      return;
    }

    // Register landlord
    const { error } = await supabase
      .from('landlords')
      .insert({
        name: landlordName.trim(),
        phone: landlordPhone.trim(),
        property_address: propertyAddress.trim(),
        mobile_money_number: mobileMoneyNumber.trim() || null,
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        registered_by: user.id
      });

    setLoading(false);

    if (error) {
      toast.error('Failed to register landlord');
      console.error('Registration error:', error);
      return;
    }

    setSuccess(true);
    toast.success('Landlord registered successfully!');
    onSuccess?.();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Register Landlord
          </DialogTitle>
          <DialogDescription>
            Add a new landlord to the system
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </motion.div>
              <h3 className="text-lg font-semibold mb-2">Landlord Registered!</h3>
              <p className="text-muted-foreground text-sm mb-4">
                The landlord has been added to the system
              </p>
              <Button onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Basic Info */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Basic Information</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="landlordName" className="text-xs">Name *</Label>
                    <Input
                      id="landlordName"
                      value={landlordName}
                      onChange={(e) => setLandlordName(e.target.value)}
                      placeholder="Landlord name"
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="landlordPhone" className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone *
                    </Label>
                    <Input
                      id="landlordPhone"
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(e.target.value)}
                      placeholder="0783..."
                      className="h-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="propertyAddress" className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Property Address *
                  </Label>
                  <Input
                    id="propertyAddress"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="Full property address"
                    className="h-9"
                    required
                  />
                </div>
              </div>

              {/* Payment Info */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Banknote className="h-3 w-3" />
                  Payment Details (Optional)
                </h4>
                
                <div className="space-y-1">
                  <Label htmlFor="mobileMoneyNumber" className="text-xs">Mobile Money Number</Label>
                  <Input
                    id="mobileMoneyNumber"
                    value={mobileMoneyNumber}
                    onChange={(e) => setMobileMoneyNumber(e.target.value)}
                    placeholder="MoMo number"
                    className="h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="bankName" className="text-xs flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> Bank Name
                    </Label>
                    <Input
                      id="bankName"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. Stanbic"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="accountNumber" className="text-xs">Account Number</Label>
                    <Input
                      id="accountNumber"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Account #"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  'Register Landlord'
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
