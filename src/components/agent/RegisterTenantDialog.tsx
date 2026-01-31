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
import { User, Phone, MapPin, Banknote, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';

interface RegisterTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function RegisterTenantDialog({ open, onOpenChange, onSuccess }: RegisterTenantDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Tenant info
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantNationalId, setTenantNationalId] = useState('');
  const [tenantFullName, setTenantFullName] = useState('');
  
  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [waterMeterNumber, setWaterMeterNumber] = useState('');
  const [electricityMeterNumber, setElectricityMeterNumber] = useState('');

  const resetForm = () => {
    setTenantEmail('');
    setTenantPhone('');
    setTenantNationalId('');
    setTenantFullName('');
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setMonthlyRent('');
    setMobileMoneyNumber('');
    setWaterMeterNumber('');
    setElectricityMeterNumber('');
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!tenantEmail.trim() && !tenantPhone.trim()) {
      toast.error('Please provide tenant email or phone');
      return;
    }

    if (!tenantNationalId.trim()) {
      toast.error('Please provide tenant National ID number');
      return;
    }

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toast.error('Please fill in all landlord details');
      return;
    }

    setLoading(true);

    // Find tenant by email or phone
    let tenantId: string | null = null;
    
    if (tenantEmail.trim()) {
      const { data: tenantByEmail } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', tenantEmail.trim().toLowerCase())
        .maybeSingle();
      
      if (tenantByEmail) {
        tenantId = tenantByEmail.id;
      }
    }
    
    if (!tenantId && tenantPhone.trim()) {
      const { data: tenantByPhone } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', tenantPhone.trim())
        .maybeSingle();
      
      if (tenantByPhone) {
        tenantId = tenantByPhone.id;
      }
    }

    if (!tenantId) {
      toast.error('Tenant not found. They need to sign up first.');
      setLoading(false);
      return;
    }

    // Update tenant profile with national ID and name
    if (tenantNationalId.trim() || tenantFullName.trim()) {
      await supabase
        .from('profiles')
        .update({ 
          national_id: tenantNationalId.trim() || undefined,
          full_name: tenantFullName.trim() || undefined
        })
        .eq('id', tenantId);
    }

    // Register landlord for tenant with utility meters
    const { error } = await supabase
      .from('landlords')
      .insert({
        tenant_id: tenantId,
        name: landlordName.trim(),
        phone: landlordPhone.trim(),
        property_address: propertyAddress.trim(),
        monthly_rent: monthlyRent ? parseInt(monthlyRent) : null,
        mobile_money_number: mobileMoneyNumber.trim() || null,
        water_meter_number: waterMeterNumber.trim() || null,
        electricity_meter_number: electricityMeterNumber.trim() || null,
        registered_by: user.id
      });

    setLoading(false);

    if (error) {
      if (error.code === '23505') {
        toast.error('This tenant already has this landlord registered');
      } else {
        toast.error('Failed to register tenant');
        console.error('Registration error:', error);
      }
      return;
    }

    // Activate rent discount for tenant
    await supabase
      .from('profiles')
      .update({ 
        rent_discount_active: true,
        monthly_rent: monthlyRent ? parseInt(monthlyRent) : null
      })
      .eq('id', tenantId);

    setSuccess(true);
    toast.success('Tenant registered for rent discounts!');
    onSuccess?.();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const rentAmount = parseInt(monthlyRent) || 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Register Tenant for Rent Discounts
          </DialogTitle>
          <DialogDescription>
            Register a tenant and their landlord to activate rent discount benefits
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
              <h3 className="text-lg font-semibold mb-2">Tenant Registered!</h3>
              <p className="text-muted-foreground text-sm mb-4">
                The tenant is now active for rent discounts
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
              {/* Tenant Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Tenant Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="tenantFullName" className="text-xs">Full Name (as on ID) *</Label>
                    <Input
                      id="tenantFullName"
                      value={tenantFullName}
                      onChange={(e) => setTenantFullName(e.target.value)}
                      placeholder="Names on National ID"
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenantNationalId" className="text-xs">National ID Number *</Label>
                    <Input
                      id="tenantNationalId"
                      value={tenantNationalId}
                      onChange={(e) => setTenantNationalId(e.target.value.toUpperCase())}
                      placeholder="CM12345678ABCD"
                      className="h-9"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="tenantEmail" className="text-xs">Email</Label>
                    <Input
                      id="tenantEmail"
                      type="email"
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      placeholder="tenant@email.com"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenantPhone" className="text-xs">Phone</Label>
                    <Input
                      id="tenantPhone"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="0783..."
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Landlord Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Landlord Details
                </h4>
                
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
                    <Label htmlFor="landlordPhone" className="text-xs">Phone *</Label>
                    <Input
                      id="landlordPhone"
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(e.target.value)}
                      placeholder="Phone number"
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="monthlyRent" className="text-xs flex items-center gap-1">
                      <Banknote className="h-3 w-3" /> Monthly Rent
                    </Label>
                    <Input
                      id="monthlyRent"
                      type="number"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="500000"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mobileMoneyNumber" className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Mobile Money
                    </Label>
                    <Input
                      id="mobileMoneyNumber"
                      value={mobileMoneyNumber}
                      onChange={(e) => setMobileMoneyNumber(e.target.value)}
                      placeholder="MoMo number"
                      className="h-9"
                    />
                  </div>
                </div>

                {/* Uganda Utility Meters */}
                <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Uganda Utility Meters</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="waterMeterNumber" className="text-xs">NWSC Water Meter</Label>
                      <Input
                        id="waterMeterNumber"
                        value={waterMeterNumber}
                        onChange={(e) => setWaterMeterNumber(e.target.value)}
                        placeholder="Water meter number"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="electricityMeterNumber" className="text-xs">UEDCL/UMEME Meter</Label>
                      <Input
                        id="electricityMeterNumber"
                        value={electricityMeterNumber}
                        onChange={(e) => setElectricityMeterNumber(e.target.value)}
                        placeholder="Electricity meter"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Potential savings */}
              {rentAmount > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                >
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    Potential monthly discount: up to {formatUGX(rentAmount * 0.7)}
                  </p>
                </motion.div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  'Register Tenant'
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
