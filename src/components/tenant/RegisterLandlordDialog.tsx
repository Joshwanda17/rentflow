import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeoLocation } from '@/hooks/useGeoLocation';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Home, User, Phone, MapPin, Banknote, CheckCircle2, Sparkles,
  Navigation, Loader2, AlertTriangle, Droplets, Zap, Building2, Star, Share2, Copy
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const HOUSE_CATEGORIES = [
  { value: 'single_room', label: 'Single Room' },
  { value: 'double_room', label: 'Double Room' },
  { value: 'self_contained', label: 'Self Contained' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'commercial', label: 'Commercial' },
];

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess }: RegisterLandlordDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { location, loading: locationLoading, error: locationError, captureLocation } = useGeoLocation();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [activationLink, setActivationLink] = useState('');

  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [numberOfRentals, setNumberOfRentals] = useState('1');
  const [houseCategory, setHouseCategory] = useState('single_room');

  // Mobile Money — must match landlord name
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [mobileMoneyName, setMobileMoneyName] = useState('');

  // Utility meters — must be in landlord's name
  const [waterMeterNumber, setWaterMeterNumber] = useState('');
  const [electricityMeterNumber, setElectricityMeterNumber] = useState('');

  const resetForm = () => {
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setMonthlyRent('');
    setNumberOfRentals('1');
    setHouseCategory('single_room');
    setMobileMoneyNumber('');
    setMobileMoneyName('');
    setWaterMeterNumber('');
    setElectricityMeterNumber('');
    setSuccess(false);
    setLocationCaptured(false);
    setActivationLink('');
  };

  // Calculate qualification score (0-100)
  const getQualificationScore = () => {
    let score = 0;
    const maxScore = 100;

    // Required fields (40 points)
    if (landlordName.trim()) score += 10;
    if (landlordPhone.trim()) score += 10;
    if (propertyAddress.trim()) score += 10;
    if (monthlyRent) score += 10;

    // GPS location (15 points)
    if (locationCaptured) score += 15;

    // Mobile Money name matching landlord name (15 points)
    if (mobileMoneyName.trim()) {
      score += 5;
      if (mobileMoneyName.trim().toLowerCase().includes(landlordName.trim().toLowerCase().split(' ')[0]?.toLowerCase() || '___')) {
        score += 10; // Name match bonus
      }
    }

    // NWSC Water Meter (10 points)
    if (waterMeterNumber.trim()) score += 10;

    // UEDCL Electricity Meter (10 points)
    if (electricityMeterNumber.trim()) score += 10;

    // Number of rentals (5 points)
    if (parseInt(numberOfRentals) > 0) score += 5;

    // Category (5 points)
    if (houseCategory) score += 5;

    return Math.min(score, maxScore);
  };

  const qualificationScore = getQualificationScore();

  const getScoreColor = () => {
    if (qualificationScore >= 80) return 'text-success';
    if (qualificationScore >= 50) return 'text-amber-500';
    return 'text-destructive';
  };

  const getScoreLabel = () => {
    if (qualificationScore >= 80) return 'High Approval Chance';
    if (qualificationScore >= 50) return 'Moderate Chance';
    return 'Low — Add More Details';
  };

  // Check if MoMo name matches landlord name
  const momoNameMatches = () => {
    if (!mobileMoneyName.trim() || !landlordName.trim()) return null;
    const first = landlordName.trim().toLowerCase().split(' ')[0];
    return mobileMoneyName.trim().toLowerCase().includes(first || '');
  };

  const handleDialogOpen = async (isOpen: boolean) => {
    if (isOpen && !locationCaptured) {
      const loc = await captureLocation();
      if (loc) setLocationCaptured(true);
    }
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toast({ title: 'Missing Fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const rentAmount = parseInt(monthlyRent.replace(/,/g, '')) || 0;

      const { error } = await supabase.from('landlords').insert({
        tenant_id: user.id,
        name: landlordName.trim(),
        phone: landlordPhone.trim(),
        property_address: propertyAddress.trim(),
        monthly_rent: rentAmount || null,
        mobile_money_number: mobileMoneyNumber.trim() || null,
        mobile_money_name: mobileMoneyName.trim() || null,
        water_meter_number: waterMeterNumber.trim() || null,
        electricity_meter_number: electricityMeterNumber.trim() || null,
        number_of_houses: parseInt(numberOfRentals) || 1,
        house_category: houseCategory,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_captured_at: location ? new Date().toISOString() : null,
        location_captured_by: location ? user.id : null,
      });

      if (error) throw error;

      // Generate activation link via supporter_invites
      const tempPassword = generateTempPassword();
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
        const link = `${window.location.origin}/join?t=${invite.activation_token}`;
        setActivationLink(link);
      }

      setSuccess(true);
      toast({
        title: 'Landlord Registered!',
        description: 'Share the activation link so they can activate with one tap.',
      });
      onSuccess?.();
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

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const shareViaWhatsApp = () => {
    const message = `Hello ${landlordName}, you have been registered on Welile. Tap this link to activate your account:\n\n${activationLink}\n\nJust tap and your account is activated!`;
    const whatsappUrl = `https://wa.me/${landlordPhone.trim().replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(activationLink);
      toast({ title: 'Link Copied!' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const rentAmount = parseInt(monthlyRent.replace(/,/g, '')) || 0;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Register Your Landlord
          </DialogTitle>
          <DialogDescription>
            The more accurate info you provide, the higher your rent qualification
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="w-16 h-16 mx-auto mb-2 rounded-full bg-success/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold">Registration Complete!</h3>
              <p className="text-muted-foreground text-sm">
                Share the link with <strong>{landlordName}</strong> — they just tap to activate!
              </p>
              <p className="text-muted-foreground text-xs">
                Qualification Score: <span className={`font-bold ${getScoreColor()}`}>{qualificationScore}%</span>
              </p>

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

              <Button variant="outline" onClick={() => handleDialogOpen(false)} className="w-full">
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
              {/* Qualification Score Bar */}
              <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1">
                    <Star className="h-3 w-3 text-primary" />
                    Qualification Score
                  </span>
                  <span className={`text-sm font-bold ${getScoreColor()}`}>
                    {qualificationScore}%
                  </span>
                </div>
                <Progress value={qualificationScore} className="h-2" />
                <p className={`text-[10px] font-medium ${getScoreColor()}`}>
                  {getScoreLabel()}
                </p>
              </div>

              {/* GPS Location */}
              <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <Navigation className="h-3 w-3 text-primary" />
                  Property Location
                </h4>

                <div className={`flex items-center justify-between p-3 rounded-lg border ${
                  locationCaptured
                    ? 'bg-success/10 border-success/30'
                    : locationError
                      ? 'bg-destructive/10 border-destructive/30'
                      : 'bg-muted/50 border-muted'
                }`}>
                  <div className="flex items-center gap-2">
                    {locationLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : locationCaptured ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : locationError ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <Navigation className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-xs font-medium">
                        {locationLoading ? 'Capturing GPS...' : locationCaptured ? 'GPS Captured ✓' : locationError || 'Tap to capture GPS'}
                      </p>
                      {locationCaptured && location && (
                        <p className="text-[10px] text-muted-foreground">
                          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={locationCaptured ? 'outline' : 'default'}
                    size="sm"
                    disabled={locationLoading}
                    onClick={async () => {
                      const loc = await captureLocation();
                      if (loc) setLocationCaptured(true);
                    }}
                  >
                    {locationLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                      <><Navigation className="h-3 w-3 mr-1" />{locationCaptured ? 'Redo' : 'Capture'}</>
                    )}
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="propertyAddress" className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Manual Address *
                  </Label>
                  <Input
                    id="propertyAddress"
                    placeholder="e.g. Plot 12, Makindye, Kampala"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    className="h-9"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Must match your GPS pin location for faster approval
                  </p>
                </div>
              </div>

              {/* Landlord Info */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Landlord Details</h4>

                <div className="space-y-1">
                  <Label htmlFor="landlordName" className="text-xs flex items-center gap-1">
                    <User className="h-3 w-3" /> Landlord's Full Name *
                  </Label>
                  <Input
                    id="landlordName"
                    placeholder="Full name as on National ID"
                    value={landlordName}
                    onChange={(e) => setLandlordName(e.target.value)}
                    className="h-9"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="landlordPhone" className="text-xs flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone Number *
                  </Label>
                  <Input
                    id="landlordPhone"
                    placeholder="e.g. 0700123456"
                    value={landlordPhone}
                    onChange={(e) => setLandlordPhone(e.target.value)}
                    className="h-9"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="numberOfRentals" className="text-xs flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Number of Rentals
                    </Label>
                    <Input
                      id="numberOfRentals"
                      type="number"
                      min="1"
                      placeholder="1"
                      value={numberOfRentals}
                      onChange={(e) => setNumberOfRentals(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="houseCategory" className="text-xs">Category</Label>
                    <Select value={houseCategory} onValueChange={setHouseCategory}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUSE_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="monthlyRent" className="text-xs flex items-center gap-1">
                    <Banknote className="h-3 w-3" /> Monthly Rent (UGX)
                  </Label>
                  <Input
                    id="monthlyRent"
                    placeholder="e.g. 500000"
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Mobile Money — name must match landlord */}
              <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Mobile Money
                </h4>

                <div className="space-y-1">
                  <Label htmlFor="mobileMoneyName" className="text-xs font-semibold text-primary">
                    MoMo Registered Name (Must match Landlord Name)
                  </Label>
                  <Input
                    id="mobileMoneyName"
                    placeholder="Name as shown on MoMo"
                    value={mobileMoneyName}
                    onChange={(e) => setMobileMoneyName(e.target.value)}
                    className={`h-9 ${momoNameMatches() === false ? 'border-destructive' : momoNameMatches() === true ? 'border-success' : ''}`}
                  />
                  {momoNameMatches() === false && (
                    <p className="text-[10px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Name doesn't match landlord name — approval may be delayed
                    </p>
                  )}
                  {momoNameMatches() === true && (
                    <p className="text-[10px] text-success flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Name matches ✓
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="mobileMoneyNumber" className="text-xs">MoMo Number</Label>
                  <Input
                    id="mobileMoneyNumber"
                    placeholder="e.g. 0700123456"
                    value={mobileMoneyNumber}
                    onChange={(e) => setMobileMoneyNumber(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Utility Meters — in landlord's name */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs text-muted-foreground font-medium">
                  Utility Meters (Must be in Landlord's Name)
                </p>

                <div className="space-y-1">
                  <Label htmlFor="waterMeterNumber" className="text-xs flex items-center gap-1">
                    <Droplets className="h-3 w-3 text-blue-500" />
                    NWSC Water Meter — in <strong className="text-primary">{landlordName || "Landlord's"}</strong> name
                  </Label>
                  <Input
                    id="waterMeterNumber"
                    placeholder="NWSC Meter Number"
                    value={waterMeterNumber}
                    onChange={(e) => setWaterMeterNumber(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="electricityMeterNumber" className="text-xs flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-500" />
                    UEDCL Electricity Meter — in <strong className="text-primary">{landlordName || "Landlord's"}</strong> name
                  </Label>
                  <Input
                    id="electricityMeterNumber"
                    placeholder="UEDCL/UMEME Meter Number"
                    value={electricityMeterNumber}
                    onChange={(e) => setElectricityMeterNumber(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Savings Preview */}
              {rentAmount > 0 && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Potential Savings</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Up to <span className="font-bold text-primary">{formatUGX(rentAmount * 0.7)}</span>/month (70% of rent)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Registering...' : 'Register Landlord'}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
