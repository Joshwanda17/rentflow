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
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import RentRequestStatusTracker from '@/components/agent/RentRequestStatusTracker';
import { useSmartLocation } from '@/hooks/useSmartLocation';

interface RegisterTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function RegisterTenantDialog({ open, onOpenChange, onSuccess }: RegisterTenantDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdRentRequestId, setCreatedRentRequestId] = useState<string | null>(null);
  const { capture: captureSmart, loading: capturingLocation } = useSmartLocation();
  const [nationalIdError, setNationalIdError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const totalSteps = 4;
  const stepLabels = ['Tenant', 'Landlord', 'Location', 'Confirm'];
  
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
    setCreatedRentRequestId(null);
    setNationalIdError('');
    setStep(1);
  };
  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!tenantFullName.trim()) return 'Enter tenant full name';
      if (!tenantNationalId.trim()) return 'Enter tenant National ID';
      if (nationalIdError) return 'National ID is already registered';
      if (!tenantEmail.trim() && !tenantPhone.trim()) return 'Provide tenant email or phone';
    }
    if (s === 2) {
      if (!landlordName.trim()) return 'Enter landlord name';
      if (!landlordPhone.trim()) return 'Enter landlord phone';
      if (!propertyAddress.trim()) return 'Enter property address';
      if (!monthlyRent.trim() || parseInt(monthlyRent) <= 0) return 'Enter monthly rent';
      const tp = tenantPhone.replace(/\s/g, '');
      const lp = landlordPhone.replace(/\s/g, '');
      if (tp && lp && tp === lp) return 'Tenant and landlord phone cannot match';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    if (step < totalSteps) setStep((step + 1) as 1 | 2 | 3 | 4);
  };
  const goBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3 | 4);
  };


  const checkDuplicateNationalId = async (value: string) => {
    setNationalIdError('');
    const cleaned = value.trim().toUpperCase();
    if (cleaned.length < 10) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('national_id', cleaned)
      .maybeSingle();
    if (data) {
      setNationalIdError(`This National ID is already registered to ${data.full_name}`);
    }
  };

  const captureLocation = async () => {
    const result = await captureSmart();
    if (result.ok === true) {
      setLatitude(result.latitude);
      setLongitude(result.longitude);
      toast.success(
        result.source === 'high'
          ? 'Location captured successfully'
          : 'Approximate location captured (low accuracy)',
      );
      return;
    }
    toast.error(result.message);
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

    if (nationalIdError) {
      toast.error('This National ID is already registered. Please check.');
      return;
    }

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toast.error('Please fill in all landlord details');
      return;
    }

    const cleanTenantPhone = tenantPhone.replace(/\s/g, '');
    const cleanLandlordPhone = landlordPhone.replace(/\s/g, '');
    if (cleanTenantPhone && cleanLandlordPhone && cleanTenantPhone === cleanLandlordPhone) {
      toast.error('Tenant and Landlord phone numbers cannot be the same');
      return;
    }

    if (!monthlyRent.trim()) {
      toast.error('Please provide the monthly rent amount');
      return;
    }

    setLoading(true);

    try {
      // Single atomic call — the edge function provisions the tenant AND
      // creates the landlord, LC1, and rent request inside one transaction.
      // If any step fails server-side, the auth user is rolled back.
      const { data: regData, error: regErr } = await invokeEdgeFunction<{
        user_id: string;
        existing: boolean;
        rent_request_id?: string | null;
      }>('register-tenant', {
        body: {
          full_name: tenantFullName.trim(),
          phone: tenantPhone.trim() || `0${Date.now().toString().slice(-9)}`,
          email: tenantEmail.trim() || undefined,
          national_id: tenantNationalId.trim().toUpperCase(),
          landlord: {
            name: landlordName.trim(),
            phone: landlordPhone.trim(),
            property_address: propertyAddress.trim(),
            monthly_rent: parseInt(monthlyRent),
            mobile_money_number: mobileMoneyNumber.trim() || null,
            latitude,
            longitude,
          },
          lc1: lc1Name.trim() && lc1Phone.trim() && lc1Village.trim()
            ? {
                name: lc1Name.trim(),
                phone: lc1Phone.trim(),
                village: lc1Village.trim(),
              }
            : null,
          rent_request: {
            rent_amount: parseInt(monthlyRent),
            duration_days: 30,
            house_category: 'single-room',
            request_latitude: latitude,
            request_longitude: longitude,
          },
        },
        errorTitle: 'Could not register tenant',
      });

      if (regErr || !regData?.user_id) {
        setLoading(false);
        return;
      }
      setCreatedRentRequestId(regData.rent_request_id ?? null);

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
      <DialogContent className="sm:max-w-lg max-h-[92vh] p-0 overflow-hidden flex flex-col overscroll-contain">
        <div className="px-6 pt-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Register Tenant Under Landlord
          </DialogTitle>
          <DialogDescription>
            Register a tenant under their landlord and earn 2% on every rent payment
          </DialogDescription>
        </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4">
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
              <h3 className="text-lg font-semibold mb-2">Rent Request Submitted ✅</h3>
              <p className="text-muted-foreground text-sm mb-2">
                Your rent request has been posted successfully and is now pending review.
              </p>
              {createdRentRequestId && (
                <p className="text-xs text-muted-foreground mb-3">
                  Reference ID: <span className="font-mono font-semibold text-foreground">{createdRentRequestId.slice(0, 8).toUpperCase()}</span>
                </p>
              )}
              {createdRentRequestId && (
                <div className="mb-4">
                  <RentRequestStatusTracker
                    rentRequestId={createdRentRequestId}
                    initialStatus="pending"
                  />
                </div>
              )}
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
              id="register-tenant-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {stepLabels.map((lbl, i) => {
                  const n = (i + 1) as 1 | 2 | 3 | 4;
                  const active = step === n;
                  const done = step > n;
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => {
                        if (n < step) setStep(n);
                        else if (n > step) {
                          for (let k = step; k < n; k++) {
                            const err = validateStep(k);
                            if (err) { toast.error(err); return; }
                          }
                          setStep(n);
                        }
                      }}
                      className="flex-1 flex flex-col items-center gap-1 group"
                    >
                      <div className={`h-1.5 w-full rounded-full transition-colors ${
                        active ? 'bg-primary' : done ? 'bg-emerald-500' : 'bg-muted'
                      }`} />
                      <span className={`text-[10px] font-medium ${
                        active ? 'text-primary' : done ? 'text-emerald-600' : 'text-muted-foreground'
                      }`}>
                        {n}. {lbl}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Agent Commission Banner (step 1 only) */}
              {step === 1 && (
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
              )}

              {/* Tenant Section */}
              {step === 1 && (
              <div id="sec-tenant" className="space-y-3 scroll-mt-16">
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
                      className="h-11 text-base"
                      autoComplete="name"
                      autoCapitalize="words"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenantNationalId" className="text-xs">National ID Number *</Label>
                    <Input
                      id="tenantNationalId"
                      value={tenantNationalId}
                      onChange={(e) => { setTenantNationalId(e.target.value.toUpperCase()); setNationalIdError(''); }}
                      onBlur={() => checkDuplicateNationalId(tenantNationalId)}
                      placeholder="CM12345678ABCD"
                      className={`h-11 text-base uppercase ${nationalIdError ? 'border-destructive' : ''}`}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    {nationalIdError && (
                      <p className="text-[11px] text-destructive font-medium">{nationalIdError}</p>
                    )}
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
                      className="h-11 text-base"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenantPhone" className="text-xs">Phone</Label>
                    <Input
                      id="tenantPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="0783..."
                      className="h-11 text-base"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Landlord Section */}
              {step === 2 && (
              <div id="sec-landlord" className="space-y-3 scroll-mt-16">
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
                      className="h-11 text-base"
                      autoCapitalize="words"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="landlordPhone" className="text-xs">Phone *</Label>
                    <Input
                      id="landlordPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(e.target.value)}
                      placeholder="Phone number"
                      className="h-11 text-base"
                      required
                    />
                    {landlordPhone.replace(/\s/g, '').length >= 9 &&
                      tenantPhone.replace(/\s/g, '').length >= 9 &&
                      landlordPhone.replace(/\s/g, '') === tenantPhone.replace(/\s/g, '') && (
                        <p className="text-[11px] text-destructive font-medium">Cannot be the same as Tenant phone</p>
                      )}
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
                    className="h-11 text-base"
                    autoCapitalize="words"
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
                      inputMode="numeric"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="500000"
                      className="h-11 text-base"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mobileMoneyNumber" className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Mobile Money
                    </Label>
                    <Input
                      id="mobileMoneyNumber"
                      type="tel"
                      inputMode="tel"
                      value={mobileMoneyNumber}
                      onChange={(e) => setMobileMoneyNumber(e.target.value)}
                      placeholder="MoMo number"
                      className="h-11 text-base"
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
              )}

              {/* Location Capture */}
              {step === 3 && (
              <div id="sec-location" className="space-y-3 scroll-mt-16">
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
              )}

              {/* LC1 Chairperson + Consent (final step) */}
              {step === 4 && (
              <>
              <div id="sec-lc1" className="space-y-3 scroll-mt-16">
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
                      className="h-11 text-base"
                      autoCapitalize="words"
                    />
                  </div>
                </div>
              </div>

              <GuarantorConsentCheckbox checked={guarantorConsent} onCheckedChange={setGuarantorConsent} />
              </>
              )}
            </motion.form>
          )}
        </AnimatePresence>
        </div>

        {!success && (
          <div className="border-t bg-background/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            {step === 4 && !guarantorConsent && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2 text-center">
                Tick the guarantor consent above to submit
              </p>
            )}
            <div className="flex gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 px-4 text-base"
                  onClick={goBack}
                  disabled={loading}
                >
                  Back
                </Button>
              )}
              {step < totalSteps ? (
                <Button
                  type="button"
                  size="lg"
                  className="flex-1 h-12 text-base font-semibold shadow-lg"
                  onClick={goNext}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="flex-1 h-12 text-base font-semibold shadow-lg"
                  disabled={loading}
                  onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Rent Request'
                  )}
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Step {step} of {totalSteps}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
