import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { Button } from '@/components/ui/button';
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
  Wallet, ShieldCheck, XCircle,
} from 'lucide-react';

const HOUSE_CATEGORIES = [
  'Single Room', 'Double Room', 'Bedsitter', 'One Bedroom',
  'Two Bedroom', 'Three Bedroom', 'Commercial', 'Mixed',
];

interface LandlordRegistrationFormProps {
  registeredByRole: 'agent' | 'tenant';
  onSuccess?: () => void;
  onClose: () => void;
  toastFn: (opts: { title: string; description?: string; variant?: 'destructive' | 'default' }) => void;
}

export default function LandlordRegistrationForm({
  registeredByRole,
  onSuccess,
  onClose,
  toastFn,
}: LandlordRegistrationFormProps) {
  const { user } = useAuth();
  const { location, loading: locationLoading, error: locationError, captureLocation } = useGeoLocation();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activationLink, setActivationLink] = useState('');
  const [locationCaptured, setLocationCaptured] = useState(false);

  // Core fields
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [numberOfRentals, setNumberOfRentals] = useState('');
  const [houseCategory, setHouseCategory] = useState('');

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
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toastFn({ title: 'Missing Fields', description: 'Name, phone and address are required.', variant: 'destructive' });
      return;
    }

    if (!tempPassword) {
      toastFn({ title: 'Missing Password', description: 'Generate a temporary password.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from('landlords')
        .select('id')
        .eq('phone', landlordPhone.trim())
        .maybeSingle();

      if (existing) {
        toastFn({ title: 'Already Exists', description: 'A landlord with this phone number already exists.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const insertData: Record<string, unknown> = {
        name: landlordName.trim(),
        phone: landlordPhone.trim(),
        property_address: propertyAddress.trim(),
        registered_by: user.id,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_captured_at: location ? new Date().toISOString() : null,
        location_captured_by: location ? user.id : null,
        mobile_money_name: momoName.trim() || null,
        mobile_money_number: momoNumber.trim() || null,
        water_meter_number: nwscMeter.trim() || null,
        electricity_meter_number: uedclMeter.trim() || null,
        number_of_houses: numberOfRentals ? parseInt(numberOfRentals) : null,
        house_category: houseCategory || null,
      };

      if (registeredByRole === 'tenant') {
        insertData.tenant_id = user.id;
      }

      const { data: newLandlord, error } = await supabase.from('landlords').insert(insertData as any).select('id').single();
      if (error) throw error;

      // Credit 5,000 UGX registration bonus to the registering user's wallet
      try {
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
      const placeholderEmail = `${landlordPhone.trim().replace(/[^0-9]/g, '')}@welile.user`;
      const { data: invite } = await supabase
        .from('supporter_invites')
        .insert({
          created_by: user.id,
          full_name: landlordName.trim(),
          phone: landlordPhone.trim(),
          email: placeholderEmail,
          temp_password: tempPassword,
          role: 'landlord',
          property_address: propertyAddress.trim(),
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
      toastFn({ title: 'Registration Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
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
                  onClick={shareViaWhatsApp}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button variant="outline" onClick={copyLink} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          )}

          <Button variant="outline" onClick={onClose} className="w-full">
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

          {/* Landlord Name */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <User className="h-3 w-3" /> Landlord Name *
            </Label>
            <Input
              value={landlordName}
              onChange={(e) => setLandlordName(e.target.value)}
              placeholder="Full name as on National ID"
              className="h-10"
              required
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Phone Number *
            </Label>
            <Input
              value={landlordPhone}
              onChange={(e) => setLandlordPhone(e.target.value)}
              placeholder="0700000000"
              className="h-10"
              required
            />
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
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Property Address *
            </Label>
            <Input
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              placeholder="e.g., Kabalagala, Block 5, Plot 12"
              className="h-10"
              required
            />
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
                  value={momoNumber}
                  onChange={(e) => setMomoNumber(e.target.value)}
                  placeholder="0770000000"
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

          {/* Submit */}
          <Button type="submit" className="w-full h-11 text-sm gap-2" disabled={loading}>
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Registering...</>
            ) : (
              <><Building2 className="h-4 w-4" /> Register Landlord</>
            )}
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
