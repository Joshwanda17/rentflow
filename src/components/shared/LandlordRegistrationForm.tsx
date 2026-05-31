import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCaptureLocation } from '@/hooks/useCaptureLocation';
import { Button } from '@/components/ui/button';
import { formatUgandaPhone, cleanPhoneNumber } from '@/lib/phoneUtils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2, Phone, MapPin, Loader2, CheckCircle2,
  Navigation, AlertTriangle, Share2, Eye, EyeOff,
  RefreshCw, Copy, User, Hash, Zap, Droplets,
  Wallet, ShieldCheck, XCircle, Home, ChevronDown, ChevronUp,
} from 'lucide-react';
import { ListEmptyHouseDialog } from '@/components/agent/ListEmptyHouseDialog';
import { hapticTap, hapticWarning } from '@/lib/haptics';

const HOUSE_CATEGORIES = [
  'Single Room', 'Double Room', 'Bedsitter', 'One Bedroom',
  'Two Bedroom', 'Three Bedroom', 'Commercial', 'Mixed',
];

interface LandlordRegistrationFormProps {
  registeredByRole: 'agent' | 'tenant';
  onSuccess?: () => void;
  onClose: () => void;
  toastFn: (opts: {
    title: string;
    description?: string;
    variant?: 'destructive' | 'default';
    action?: { label: string; onClick: () => void };
  }) => void;
  /**
   * Minimal mode (used by the Outstanding Balance tenant flow).
   * Only requires: Landlord Name, Landlord Phone, LC1 Name, LC1 Phone.
   * All other fields (address, GPS, MoMo, meters, password) are hidden /
   * auto-handled.
   */
  minimal?: boolean;
}

export default function LandlordRegistrationForm({
  registeredByRole,
  onSuccess,
  onClose,
  toastFn,
  minimal = false,
}: LandlordRegistrationFormProps) {
  const { user } = useAuth();
  const { location, loading: locationLoading, error: locationError, captureLocation } = useCaptureLocation();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Inline stepped progress message shown while saving so the agent always
  // sees forward motion, even on a weak connection.
  const [progressMsg, setProgressMsg] = useState('');
  // Inline error state when the submission itself fails (network, DB, etc.)
  const [submitError, setSubmitError] = useState('');
  const [showListHouse, setShowListHouse] = useState(false);
  const [activationLink, setActivationLink] = useState('');
  const [locationCaptured, setLocationCaptured] = useState(false);
  // Optional details are tucked away so the core flow is just Name + Phone.
  const [showMore, setShowMore] = useState(false);

  // Inline validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (name: string, value: string) => {
    const trimmed = value.trim();
    let msg = '';
    if (name === 'landlordName') {
      if (!trimmed) msg = 'Landlord name is required';
      else if (trimmed.length < 2) msg = 'Name must be at least 2 characters';
    }
    if (name === 'landlordPhone') {
      if (!trimmed) msg = 'Phone number is required';
      else if (!/^\d{9,10}$/.test(trimmed.replace(/\D/g, ''))) msg = 'Enter a valid phone number';
    }
    if (name === 'propertyAddress') {
      // Address is optional now — only validate when something was typed.
      if (trimmed && trimmed.length < 5) msg = 'Address is too short';
    }
    if (name === 'lc1Name') {
      if (!trimmed) msg = 'LC1 name is required';
      else if (trimmed.length < 2) msg = 'Name must be at least 2 characters';
    }
    if (name === 'lc1Phone') {
      if (!trimmed) msg = 'LC1 phone is required';
      else if (!/^\d{9,10}$/.test(trimmed.replace(/\D/g, ''))) msg = 'Enter a valid phone number';
    }
    setErrors((prev) => ({ ...prev, [name]: msg }));
    return msg;
  };

  const clearError = (name: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const clearSubmitError = () => setSubmitError('');

  // Scroll to and focus the input inside a given [data-field] wrapper so the
  // agent is taken straight to the field that needs their attention.
  const focusField = (name: string) => {
    requestAnimationFrame(() => {
      const wrapper = document.querySelector(`[data-field="${name}"]`);
      wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = wrapper?.querySelector(
        'input, textarea, select'
      ) as HTMLElement | null;
      input?.focus();
    });
  };

  // Core fields
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [numberOfRentals, setNumberOfRentals] = useState('');
  const [houseCategory, setHouseCategory] = useState('');

  // LC1 (only collected in minimal/outstanding mode)
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');

  // Mobile Money
  const [momoName, setMomoName] = useState('');
  const [momoNumber, setMomoNumber] = useState('');

  // Utility meters
  const [nwscMeter, setNwscMeter] = useState('');
  const [uedclMeter, setUedclMeter] = useState('');

  // Password
  const [tempPassword, setTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTempPassword(result);
    return result;
  };

  // In minimal mode, auto-generate the temp password silently so the user
  // never has to interact with it.
  useEffect(() => {
    if (minimal && !tempPassword) {
      generateTempPassword();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimal]);

  // Name matching logic
  const nameMatchScore = useMemo(() => {
    if (!landlordName.trim() || !momoName.trim()) return null;
    const a = landlordName.trim().toLowerCase().split(/\s+/);
    const b = momoName.trim().toLowerCase().split(/\s+/);
    const matched = a.filter(w => b.includes(w)).length;
    const total = Math.max(a.length, b.length);
    return total > 0 ? Math.round((matched / total) * 100) : 0;
  }, [landlordName, momoName]);

  // Qualification score
  const qualificationScore = useMemo(() => {
    let score = 0;
    const max = 100;
    if (landlordName.trim()) score += 10;
    if (landlordPhone.trim()) score += 10;
    if (propertyAddress.trim()) score += 10;
    if (numberOfRentals && parseInt(numberOfRentals) > 0) score += 10;
    if (houseCategory) score += 5;
    if (locationCaptured) score += 15;
    if (momoName.trim() && momoNumber.trim()) score += 10;
    if (nameMatchScore !== null && nameMatchScore >= 80) score += 10;
    if (nwscMeter.trim()) score += 10;
    if (uedclMeter.trim()) score += 10;
    return Math.min(score, max);
  }, [landlordName, landlordPhone, propertyAddress, numberOfRentals, houseCategory, locationCaptured, momoName, momoNumber, nameMatchScore, nwscMeter, uedclMeter]);

  const resetForm = () => {
    setLandlordName(''); setLandlordPhone(''); setPropertyAddress('');
    setNumberOfRentals(''); setHouseCategory('');
    setMomoName(''); setMomoNumber('');
    setNwscMeter(''); setUedclMeter('');
    setTempPassword(''); setShowPassword(false);
    setSuccess(false); setActivationLink(''); setLocationCaptured(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;

    // Inline validate every required field before submit
    const fieldsToValidate: { name: string; value: string }[] = [
      { name: 'landlordName', value: landlordName },
      { name: 'landlordPhone', value: landlordPhone },
    ];
    if (minimal) {
      fieldsToValidate.push(
        { name: 'lc1Name', value: lc1Name },
        { name: 'lc1Phone', value: lc1Phone }
      );
    }

    const newErrors: Record<string, string> = {};
    for (const { name, value } of fieldsToValidate) {
      const msg = validateField(name, value);
      if (msg) newErrors[name] = msg;
    }

    if (Object.keys(newErrors).length > 0) {
      // Reveal the optional section if the only problem hides there, then
      // jump straight to the first broken field so the button never feels dead.
      const firstError = Object.keys(newErrors)[0];
      if (!['landlordName', 'landlordPhone', 'lc1Name', 'lc1Phone'].includes(firstError)) {
        setShowMore(true);
      }
      hapticWarning();
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-field="${firstError}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      toastFn({
        title: 'Please fix the errors',
        description: 'Some required fields are missing or invalid.',
        variant: 'destructive',
      });
      return;
    }

    // Make sure we always have a password to seed the activation invite.
    // It's auto-generated silently so an ordinary agent never has to think
    // about it — they only ever type a name and phone.
    const passwordToUse = tempPassword || generateTempPassword();
    // landlords.property_address is NOT NULL — when no address is given, fall
    // back to a placeholder that ops can update later.
    const addressToUse = propertyAddress.trim() || 'To be confirmed';

    setLoading(true);
    setProgressMsg('Saving details…');

    const landlordPhoneClean = cleanPhoneNumber(landlordPhone);
    const lc1PhoneClean = cleanPhoneNumber(lc1Phone);
    const momoNumberClean = cleanPhoneNumber(momoNumber);

    try {
      setProgressMsg('Checking the phone number…');
      const { data: existing } = await supabase
        .from('landlords')
        .select('id')
        .eq('phone', landlordPhoneClean)
        .maybeSingle();

      if (existing) {
        toastFn({ title: 'Already Exists', description: 'A landlord with this phone number already exists.', variant: 'destructive' });
        setLoading(false);
        setProgressMsg('');
        return;
      }

      const insertData: Record<string, unknown> = {
        name: landlordName.trim(),
        phone: landlordPhoneClean,
        property_address: addressToUse,
        registered_by: user.id,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_captured_at: location ? new Date().toISOString() : null,
        location_captured_by: location ? user.id : null,
        mobile_money_name: momoName.trim() || null,
        mobile_money_number: momoNumberClean || null,
        water_meter_number: nwscMeter.trim() || null,
        electricity_meter_number: uedclMeter.trim() || null,
        number_of_houses: numberOfRentals ? parseInt(numberOfRentals) : null,
        house_category: houseCategory || null,
      };

      if (registeredByRole === 'tenant') {
        insertData.tenant_id = user.id;
      }

      setProgressMsg('Saving the landlord…');
      const { data: newLandlord, error } = await supabase.from('landlords').insert(insertData as any).select('id').single();
      if (error) throw error;

      // Persist LC1 chairperson when collected (minimal/outstanding flow).
      if (minimal && lc1Name.trim() && lc1PhoneClean) {
        const { error: lc1Err } = await supabase
          .from('lc1_chairpersons')
          .insert({
            name: lc1Name.trim(),
            phone: lc1PhoneClean,
            village: 'To be confirmed',
          } as any);
        if (lc1Err) {
          console.warn('[LandlordRegistration] LC1 insert failed:', lc1Err);
        }
      }

      // Credit 5,000 UGX registration bonus to the registering user's wallet
      try {
        setProgressMsg('Adding your bonus…');
        const { data: bonusResult, error: bonusError } = await supabase.functions.invoke('credit-landlord-registration-bonus', {
          body: { landlord_id: newLandlord.id },
        });
        if (bonusError) {
          console.warn('[LandlordRegistration] Bonus credit failed:', bonusError);
        } else if (bonusResult?.success) {
          toastFn({ title: '💰 UGX 5,000 Bonus Credited!', description: 'Registration bonus added to your wallet.' });
        }
      } catch (bonusErr) {
        console.warn('[LandlordRegistration] Bonus credit error:', bonusErr);
      }

      // Create activation invite
      setProgressMsg('Almost done…');
      const placeholderEmail = `${landlordPhone.trim().replace(/[^0-9]/g, '')}@welile.user`;
      const { data: invite } = await supabase
        .from('supporter_invites')
        .insert({
          created_by: user.id,
          full_name: landlordName.trim(),
          phone: landlordPhoneClean,
          email: placeholderEmail,
          temp_password: passwordToUse,
          role: 'landlord',
          property_address: addressToUse,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_accuracy: location?.accuracy || null,
        })
        .select('activation_token')
        .single();

      if (invite) {
        setActivationLink(`${window.location.origin}/join?t=${invite.activation_token}`);
      }

      setSuccess(true);
      toastFn({ title: 'Landlord Registered!', description: 'Share the activation link.' });
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong while saving. Please try again.';
      setSubmitError(msg);
      hapticWarning();
      toastFn({
        title: 'Registration Failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setProgressMsg('');
    }
  };

  const shareViaWhatsApp = () => {
    const message = `Hello ${landlordName}, you have been registered on Welile. Tap this link to activate your account:\n\n${activationLink}\n\nJust tap and your account is activated!`;
    const whatsappUrl = `https://wa.me/${landlordPhone.trim().replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(activationLink);
      toastFn({ title: 'Link Copied!' });
    } catch {
      toastFn({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <>
    <AnimatePresence mode="wait">
      {success ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-6 text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="w-16 h-16 mx-auto mb-2 rounded-full bg-success/20 flex items-center justify-center"
          >
            <CheckCircle2 className="h-8 w-8 text-success" />
          </motion.div>
          <h3 className="text-lg font-semibold">Landlord Registered!</h3>
          <p className="text-muted-foreground text-sm">
            Share the link with <strong>{landlordName}</strong> — they just tap to activate.
          </p>

          {/* Qualification Score */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground mb-1">Qualification Score</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${qualificationScore >= 80 ? 'bg-success' : qualificationScore >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                  style={{ width: `${qualificationScore}%` }}
                />
              </div>
              <span className="text-sm font-bold">{qualificationScore}%</span>
            </div>
          </div>

          {activationLink && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50 border text-xs break-all text-left text-muted-foreground">
                {activationLink}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => { hapticTap(); shareViaWhatsApp(); }}
                  className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white touch-manipulation select-none transition-transform active:scale-[0.98]"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { hapticTap(); copyLink(); }}
                  className="h-12 gap-2 touch-manipulation select-none transition-transform active:scale-[0.98]"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            onClick={() => { hapticTap(); onClose(); }}
            className="w-full h-12 touch-manipulation select-none transition-transform active:scale-[0.98]"
          >
            Done
          </Button>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          {/* Friendly, low-pressure intro for first-time / casual agents */}
          {!minimal && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Just the landlord's <span className="font-semibold text-foreground">name</span> and{' '}
              <span className="font-semibold text-foreground">phone</span> registers them. Everything else is optional —
              you can add it later.
            </p>
          )}

          {/* Landlord Name */}
          <div data-field="landlordName" className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <User className="h-3 w-3" /> Landlord Name *
            </Label>
            <Input
              value={landlordName}
              onChange={(e) => { setLandlordName(e.target.value); clearError('landlordName'); clearSubmitError(); }}
              onBlur={(e) => validateField('landlordName', e.target.value)}
              placeholder="e.g. John Bosco Ssentamu — as on National ID"
              className={`h-10 ${errors.landlordName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              required
            />
            {errors.landlordName && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {errors.landlordName}
              </p>
            )}
          </div>

          {/* Phone Number */}
          <div data-field="landlordPhone" className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Phone Number *
            </Label>
            <Input
              type="tel"
              inputMode="tel"
              value={landlordPhone}
              onChange={(e) => { setLandlordPhone(formatUgandaPhone(e.target.value)); clearError('landlordPhone'); clearSubmitError(); }}
              onBlur={(e) => validateField('landlordPhone', cleanPhoneNumber(e.target.value))}
              placeholder="07XX XXX XXX — 10 digits"
              className={`h-10 ${errors.landlordPhone ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              required
            />
            {errors.landlordPhone && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {errors.landlordPhone}
              </p>
            )}
          </div>

          {/* Minimal-mode LC1 fields (Outstanding Balance flow) */}
          {minimal && (
            <div className="space-y-2 p-2.5 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span className="text-xs font-semibold">LC1 Chairperson</span>
              </div>
              <div className="space-y-2">
                <div data-field="lc1Name" className="space-y-1">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <User className="h-3 w-3" /> LC1 Name *
                  </Label>
                  <Input
                    value={lc1Name}
                    onChange={(e) => { setLc1Name(e.target.value); clearError('lc1Name'); }}
                    onBlur={(e) => validateField('lc1Name', e.target.value)}
                    placeholder="e.g. Grace Nakato Ssebunya — LC1 Chairperson"
                    className={`h-10 ${errors.lc1Name ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    required
                  />
                  {errors.lc1Name && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {errors.lc1Name}
                    </p>
                  )}
                </div>
                <div data-field="lc1Phone" className="space-y-1">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> LC1 Phone *
                  </Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={lc1Phone}
                    onChange={(e) => { setLc1Phone(formatUgandaPhone(e.target.value)); clearError('lc1Phone'); }}
                    onBlur={(e) => validateField('lc1Phone', cleanPhoneNumber(e.target.value))}
                    placeholder="07XX XXX XXX — 10 digits"
                    className={`h-10 ${errors.lc1Phone ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    required
                  />
                  {errors.lc1Phone && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {errors.lc1Phone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Submit — placed right after the essentials so it's always one tap away */}
          <Button
            type="submit"
            onClick={() => hapticTap()}
            className="w-full h-14 text-base font-semibold gap-2 touch-manipulation select-none transition-transform active:scale-[0.98] disabled:opacity-70"
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Registering...</>
            ) : (
              <><Building2 className="h-5 w-5" /> Register Landlord</>
            )}
          </Button>

          {/* Inline stepped progress so the agent always sees forward motion */}
          {loading && progressMsg && (
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" /> {progressMsg}
            </p>
          )}

          {/* Inline error banner — stays on screen so agents on weak networks always know what happened */}
          <AnimatePresence>
            {submitError && !loading && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 space-y-2"
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1 rounded-full bg-destructive/20">
                    <XCircle className="h-4 w-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-destructive">Could not save</p>
                    <p className="text-xs text-destructive/80 mt-0.5">{submitError}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => { hapticTap(); clearSubmitError(); handleSubmit(); }}
                  className="w-full h-12 text-sm font-semibold gap-2 touch-manipulation select-none transition-transform active:scale-[0.98]"
                >
                  <RefreshCw className="h-4 w-4" /> Try Again
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle to reveal the optional property / payout details */}
          {!minimal && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => { hapticTap(); setShowMore((s) => !s); }}
              className="w-full h-11 gap-2 text-xs text-muted-foreground touch-manipulation select-none"
            >
              {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showMore ? 'Hide extra details' : 'Add property & payout details (optional)'}
            </Button>
          )}

          {/* ===== Optional collapsible section ===== */}
          {!minimal && showMore && (
          <div className="space-y-3 pt-1">
          {/* List-a-house shortcut — a landlord needs a verified house before
              they can be used on a rent request. Agent earns UGX 5,000 total. */}
          {registeredByRole === 'agent' && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
              <p className="text-xs text-muted-foreground">
                A landlord needs at least one <span className="font-medium text-foreground">verified house</span> before
                you can post a rent request for them.
              </p>
              <p className="text-xs text-muted-foreground">
                List a house and earn <span className="font-semibold text-foreground">UGX 5,000</span> when Landlord Ops
                verifies it — <span className="font-semibold text-foreground">UGX 1,000 now</span>,{' '}
                <span className="font-semibold text-foreground">UGX 4,000 on verification</span>, straight to your withdrawable wallet.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 gap-2 touch-manipulation select-none transition-transform active:scale-[0.98]"
                onClick={() => { hapticTap(); setShowListHouse(true); }}
              >
                <Home className="h-4 w-4" />
                List a house for this landlord
              </Button>
            </div>
          )}

          {/* Qualification Score Bar */}
          <div className="p-2.5 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Qualification Score</span>
              <span className={`text-xs font-bold ${qualificationScore >= 80 ? 'text-success' : qualificationScore >= 50 ? 'text-warning' : 'text-destructive'}`}>
                {qualificationScore}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${qualificationScore >= 80 ? 'bg-success' : qualificationScore >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                style={{ width: `${qualificationScore}%` }}
              />
            </div>
          </div>

          {/* Number of Rentals & Category in row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Hash className="h-3 w-3" /> No. of Rentals
              </Label>
              <Input
                type="number"
                min="1"
                value={numberOfRentals}
                onChange={(e) => setNumberOfRentals(e.target.value)}
                placeholder="e.g. 5"
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Category
              </Label>
              <Select value={houseCategory} onValueChange={setHouseCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {HOUSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Property Address */}
          <div data-field="propertyAddress" className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Property Address
              <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={propertyAddress}
              onChange={(e) => { setPropertyAddress(e.target.value); clearError('propertyAddress'); }}
              onBlur={(e) => validateField('propertyAddress', e.target.value)}
              placeholder="e.g., Kabalagala, Block 5, Plot 12"
              className={`h-10 ${errors.propertyAddress ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            />
            {errors.propertyAddress && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {errors.propertyAddress}
              </p>
            )}
          </div>

          {/* GPS Location */}
          <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
            locationCaptured ? 'bg-success/10 border-success/30'
              : locationError ? 'bg-destructive/10 border-destructive/30'
              : 'bg-muted/50 border-muted'
          }`}>
            <div className="flex items-center gap-2">
              {locationLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : locationCaptured ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : locationError ? (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div>
                <p className={`text-xs font-medium ${locationCaptured ? 'text-success' : ''}`}>
                  {locationLoading ? 'Capturing GPS...'
                    : locationCaptured ? 'GPS Captured'
                    : locationError || 'GPS not captured'}
                </p>
                {locationCaptured && location && (
                  <p className="text-[10px] text-muted-foreground">
                    {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button" variant="ghost" size="sm" disabled={locationLoading}
              onClick={async () => {
                const loc = await captureLocation();
                if (loc) setLocationCaptured(true);
              }}
              className="gap-1 text-[10px] h-7 px-2"
            >
              <RefreshCw className={`h-3 w-3 ${locationLoading ? 'animate-spin' : ''}`} />
              {locationCaptured ? 'Refresh' : 'Capture'}
            </Button>
          </div>

          {/* Mobile Money Section */}
          <div className="space-y-2 p-2.5 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3 w-3 text-primary" />
              <span className="text-xs font-semibold">Mobile Money Details</span>
              {nameMatchScore !== null && (
                <span className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${nameMatchScore >= 80 ? 'text-success' : nameMatchScore >= 50 ? 'text-warning' : 'text-destructive'}`}>
                  {nameMatchScore >= 80 ? <ShieldCheck className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {nameMatchScore}% match
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">MoMo Name</Label>
                <Input
                  value={momoName}
                  onChange={(e) => setMomoName(e.target.value)}
                  placeholder="Name on MoMo"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">MoMo Number</Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={momoNumber}
                  onChange={(e) => setMomoNumber(formatUgandaPhone(e.target.value))}
                  placeholder="07XX XXX XXX"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Utility Meters */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Droplets className="h-3 w-3 text-blue-500" /> NWSC Meter
                <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={nwscMeter}
                onChange={(e) => setNwscMeter(e.target.value)}
                placeholder="In landlord's name"
                className="h-10 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-yellow-500" /> UEDCL Meter
                <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={uedclMeter}
                onChange={(e) => setUedclMeter(e.target.value)}
                placeholder="In landlord's name"
                className="h-10 text-xs"
              />
            </div>
          </div>

          {/* Temporary Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Temporary Password</Label>
              <Button type="button" variant="ghost" size="sm" onClick={generateTempPassword}
                className="gap-1 text-[10px] h-6 px-2 text-primary">
                <RefreshCw className="h-3 w-3" /> Generate
              </Button>
            </div>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={tempPassword}
                placeholder="Auto-generated"
                className="h-10 pr-10 text-xs"
                readOnly
              />
              <Button type="button" variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          </div>
          )}
        </motion.form>
      )}
    </AnimatePresence>

    {registeredByRole === 'agent' && (
      <ListEmptyHouseDialog
        open={showListHouse}
        onOpenChange={setShowListHouse}
        initialLandlordName={landlordName}
        initialLandlordPhone={landlordPhone}
      />
    )}
    </>
  );
}
