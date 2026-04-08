import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GuarantorConsentCheckbox } from '@/components/agent/GuarantorConsentCheckbox';
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
import {
  User,
  Phone,
  MapPin,
  Banknote,
  Building2,
  Loader2,
  CheckCircle2,
  Shield,
  Navigation,
  TrendingUp,
} from 'lucide-react';
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
  const [capturingLocation, setCapturingLocation] = useState(false);
  
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

  // Location
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // LC1 Chairperson
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  const [guarantorConsent, setGuarantorConsent] = useState(false);

  const agentCommission = monthlyRent ? Math.round(parseInt(monthlyRent) * 0.02) : 0;

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
    setLatitude(null);
    setLongitude(null);
    setLc1Name('');
    setLc1Phone('');
    setLc1Village('');
    setGuarantorConsent(false);
    setSuccess(false);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setCapturingLocation(false);
        toast.success('Location captured successfully');
      },
      (error) => {
        setCapturingLocation(false);
        toast.error('Failed to capture location. Please allow location access.');
        console.error('Geolocation error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!guarantorConsent) {
      toast.error('Please accept guarantor responsibility before registering');
      return;
    }

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

    if (!monthlyRent.trim()) {
      toast.error('Please provide the monthly rent amount');
      return;
    }

    setLoading(true);

    try {
      // Find tenant by email or phone
      let tenantId: string | null = null;
      
      if (tenantEmail.trim()) {
        const { data: tenantByEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', tenantEmail.trim().toLowerCase())
          .maybeSingle();
        if (tenantByEmail) tenantId = tenantByEmail.id;
      }
      
      if (!tenantId && tenantPhone.trim()) {
        const { data: tenantByPhone } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', tenantPhone.trim())
          .maybeSingle();
        if (tenantByPhone) tenantId = tenantByPhone.id;
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

      // Register landlord for tenant — agent is recorded as registered_by
      const { error } = await supabase
        .from('landlords')
        .insert({
          tenant_id: tenantId,
          name: landlordName.trim(),
          phone: landlordPhone.trim(),
          property_address: propertyAddress.trim(),
          monthly_rent: parseInt(monthlyRent),
          mobile_money_number: mobileMoneyNumber.trim() || null,
          latitude,
          longitude,
          location_captured_at: latitude ? new Date().toISOString() : null,
          location_captured_by: user.id,
          registered_by: user.id,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('This tenant already has this landlord registered');
        } else {
          toast.error('Failed to register tenant');
          console.error('Registration error:', error);
        }
        setLoading(false);
        return;
      }

      // Save LC1 chairperson if provided
      if (lc1Name.trim() && lc1Phone.trim() && lc1Village.trim()) {
        const { data: existingLc1 } = await supabase
          .from('lc1_chairpersons')
          .select('id')
          .eq('village', lc1Village.trim())
          .maybeSingle();

        if (!existingLc1) {
          await supabase.from('lc1_chairpersons').insert({
            name: lc1Name.trim(),
            phone: lc1Phone.trim(),
            village: lc1Village.trim(),
          });
        }
      }

      // Activate rent discount for tenant
      await supabase
        .from('profiles')
        .update({ 
          rent_discount_active: true,
          monthly_rent: parseInt(monthlyRent),
        })
        .eq('id', tenantId);

      setSuccess(true);
      toast.success('Tenant registered under landlord! You earn 2% on every rent payment.');
      onSuccess?.();
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm();
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Register Tenant Under Landlord
          </DialogTitle>
          <DialogDescription>
            Register a tenant under their landlord and earn 2% on every rent payment
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
              <p className="text-muted-foreground text-sm mb-2">
                The tenant is now linked to the landlord
              </p>
              <div className="text-xs text-muted-foreground space-y-1 mb-4">
                <p>✅ You earn <span className="font-semibold text-primary">2% commission</span> on every rent payment</p>
                <p>✅ Commission is automatically sent to your wallet</p>
                <p>✅ Tenant appears on the landlord's dashboard with your name</p>
              </div>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Agent Commission Banner */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 via-emerald-500/10 to-primary/5 border border-primary/20">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-500/15 shrink-0 mt-0.5">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Earn 2% on Every Rent Payment</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Register tenants under their landlord. Every time this tenant pays rent, you automatically earn 2% commission directly to your wallet.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tenant Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  Tenant Details
                </h4>
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
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
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
                      <Banknote className="h-3 w-3" /> Monthly Rent (UGX) *
                    </Label>
                    <Input
                      id="monthlyRent"
                      type="number"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="500000"
                      className="h-9"
                      required
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

                {/* Commission Preview */}
                {monthlyRent && parseInt(monthlyRent) > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Your 2% Commission Per Rent Payment
                    </p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {formatUGX(agentCommission)}/month
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Automatically sent to your wallet every time this tenant pays
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Location Capture */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Navigation className="h-4 w-4 text-primary" />
                  Property Location
                </h4>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                  {latitude && longitude ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-emerald-500 font-medium">📍 Location captured</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {latitude.toFixed(5)}, {longitude.toFixed(5)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={captureLocation}
                        disabled={capturingLocation}
                      >
                        Re-capture
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={captureLocation}
                      disabled={capturingLocation}
                    >
                      {capturingLocation ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Capturing...
                        </>
                      ) : (
                        <>
                          <Navigation className="h-4 w-4" />
                          Capture Current Location
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* LC1 Chairperson */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  LC1 Chairperson Details
                </h4>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="lc1Name" className="text-xs">LC1 Name</Label>
                      <Input
                        id="lc1Name"
                        value={lc1Name}
                        onChange={(e) => setLc1Name(e.target.value)}
                        placeholder="Chairperson name"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lc1Phone" className="text-xs">LC1 Phone</Label>
                      <Input
                        id="lc1Phone"
                        value={lc1Phone}
                        onChange={(e) => setLc1Phone(e.target.value)}
                        placeholder="0783..."
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lc1Village" className="text-xs">Village / Zone</Label>
                    <Input
                      id="lc1Village"
                      value={lc1Village}
                      onChange={(e) => setLc1Village(e.target.value)}
                      placeholder="e.g. Bukoto Zone A"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <GuarantorConsentCheckbox checked={guarantorConsent} onCheckedChange={setGuarantorConsent} />

              <Button type="submit" className="w-full" disabled={loading || !guarantorConsent}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  'Register Tenant Under Landlord'
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
