import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeoLocation } from '@/hooks/useGeoLocation';
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
import { Switch } from '@/components/ui/switch';
import { Building2, Phone, MapPin, Banknote, Loader2, CheckCircle2, CreditCard, Smartphone, Zap, Home, User, Navigation, AlertTriangle, Droplets, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess }: RegisterLandlordDialogProps) {
  const { user } = useAuth();
  const { location, loading: locationLoading, error: locationError, captureLocation } = useGeoLocation();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activationLink, setActivationLink] = useState('');
  
  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [mobileMoneyName, setMobileMoneyName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  
  // New fields
  const [hasSmartphone, setHasSmartphone] = useState(true);
  const [electricityMeterNumber, setElectricityMeterNumber] = useState('');
  const [waterMeterNumber, setWaterMeterNumber] = useState('');
  const [numberOfHouses, setNumberOfHouses] = useState('1');
  const [desiredRentFromWelile, setDesiredRentFromWelile] = useState('');
  const [caretakerName, setCaretakerName] = useState('');
  const [caretakerPhone, setCaretakerPhone] = useState('');
  const [locationCaptured, setLocationCaptured] = useState(false);
  
  // LC1 Chairperson
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');

  const handleDialogOpen = async (isOpen: boolean) => {
    if (isOpen && !locationCaptured) {
      const loc = await captureLocation();
      if (loc) setLocationCaptured(true);
    }
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const resetForm = () => {
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setMobileMoneyNumber('');
    setMobileMoneyName('');
    setBankName('');
    setAccountNumber('');
    setHasSmartphone(true);
    setElectricityMeterNumber('');
    setWaterMeterNumber('');
    setNumberOfHouses('1');
    setDesiredRentFromWelile('');
    setCaretakerName('');
    setCaretakerPhone('');
    setLocationCaptured(false);
    setLc1Name('');
    setLc1Phone('');
    setLc1Village('');
    setSuccess(false);
    setActivationLink('');
  };

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!mobileMoneyName.trim()) {
      toast.error('Please enter the Mobile Money registered name');
      return;
    }

    if (!lc1Name.trim() || !lc1Phone.trim() || !lc1Village.trim()) {
      toast.error('Please fill in LC1 Chairperson details');
      return;
    }

    if (!locationCaptured || !location) {
      toast.error('GPS location is required. Please allow location access.');
      return;
    }

    setLoading(true);

    try {
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

      const rentAmount = desiredRentFromWelile ? parseInt(desiredRentFromWelile.replace(/,/g, '')) : null;

      // Register landlord
      const { error } = await supabase
        .from('landlords')
        .insert({
          name: landlordName.trim(),
          phone: landlordPhone.trim(),
          property_address: propertyAddress.trim(),
          mobile_money_number: mobileMoneyNumber.trim() || null,
          mobile_money_name: mobileMoneyName.trim() || null,
          bank_name: bankName.trim() || null,
          account_number: accountNumber.trim() || null,
          registered_by: user.id,
          has_smartphone: hasSmartphone,
          electricity_meter_number: electricityMeterNumber.trim() || null,
          water_meter_number: waterMeterNumber.trim() || null,
          number_of_houses: parseInt(numberOfHouses) || 1,
          desired_rent_from_welile: rentAmount,
          caretaker_name: caretakerName.trim() || null,
          caretaker_phone: caretakerPhone.trim() || null,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_captured_at: location ? new Date().toISOString() : null,
          location_captured_by: location ? user.id : null,
        });

      if (error) {
        toast.error('Failed to register landlord');
        console.error('Registration error:', error);
        setLoading(false);
        return;
      }

      // Register LC1 Chairperson
      await supabase.from('lc1_chairpersons').insert({
        name: lc1Name.trim(),
        phone: lc1Phone.trim(),
        village: lc1Village.trim(),
      });

      // Create activation invite for the landlord
      const tempPassword = generateTempPassword();
      const placeholderEmail = `${landlordPhone.trim().replace(/[^0-9]/g, '')}@welile.user`;

      const { data: invite, error: inviteError } = await supabase
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

      if (inviteError) {
        console.error('Invite error:', inviteError);
        // Landlord was registered but invite failed - still show success
        toast.warning('Landlord registered but activation link could not be generated');
      }

      if (invite) {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/join?t=${invite.activation_token}`;
        setActivationLink(link);
      }

      setSuccess(true);
      toast.success('Landlord registered successfully!');
      onSuccess?.();
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const shareViaWhatsApp = () => {
    const message = `Hello ${landlordName}, you have been registered on Welile by your agent. Please click this link to activate your account and verify your details:\n\n${activationLink}\n\nYou will be able to view your registered information, accept it, and create your password.`;
    const whatsappUrl = `https://wa.me/${landlordPhone.trim().replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Register Landlord
          </DialogTitle>
          <DialogDescription>
            Register landlord details and share activation link via WhatsApp
          </DialogDescription>
        </DialogHeader>

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
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </motion.div>
              <h3 className="text-lg font-semibold">Landlord Registered!</h3>
              <p className="text-muted-foreground text-sm">
                Share the activation link with <strong>{landlordName}</strong> via WhatsApp so they can view their details, accept, and create their password.
              </p>

              {activationLink && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50 border text-xs break-all text-left text-muted-foreground">
                    {activationLink}
                  </div>
                  <Button 
                    onClick={shareViaWhatsApp} 
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share via WhatsApp
                  </Button>
                </div>
              )}

              <Button variant="outline" onClick={() => handleDialogOpen(false)}>
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
              {/* Location Status */}
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
                    <p className="text-sm font-medium">
                      {locationLoading 
                        ? 'Getting location...' 
                        : locationCaptured 
                          ? 'Location captured' 
                          : locationError 
                            ? locationError
                            : 'Location pending'}
                    </p>
                    {locationCaptured && location && (
                      <p className="text-xs text-muted-foreground">
                        {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                        {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
                      </p>
                    )}
                  </div>
                </div>
                {!locationCaptured && !locationLoading && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={async () => {
                      const loc = await captureLocation();
                      if (loc) setLocationCaptured(true);
                    }}
                  >
                    <Navigation className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}
              </div>

              {/* Smartphone Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <Label htmlFor="hasSmartphone" className="text-sm font-medium cursor-pointer">
                    Landlord has smartphone
                  </Label>
                </div>
                <Switch
                  id="hasSmartphone"
                  checked={hasSmartphone}
                  onCheckedChange={setHasSmartphone}
                />
              </div>

              {/* Landlord Names & Phone */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Landlord Information</h4>
                
                <div className="space-y-1">
                  <Label htmlFor="landlordName" className="text-xs flex items-center gap-1">
                    <User className="h-3 w-3" /> Landlord's Full Name *
                  </Label>
                  <Input
                    id="landlordName"
                    value={landlordName}
                    onChange={(e) => setLandlordName(e.target.value)}
                    placeholder="Full name as on ID"
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
                    value={landlordPhone}
                    onChange={(e) => setLandlordPhone(e.target.value)}
                    placeholder="e.g. 256783..."
                    className="h-9"
                    required
                  />
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

              {/* Mobile Money Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  Mobile Money Details
                </h4>
                
                <div className="space-y-1">
                  <Label htmlFor="mobileMoneyName" className="text-xs font-semibold text-primary">
                    Mobile Money Registered Name *
                  </Label>
                  <Input
                    id="mobileMoneyName"
                    value={mobileMoneyName}
                    onChange={(e) => setMobileMoneyName(e.target.value)}
                    placeholder="Name as shown on MoMo"
                    className="h-9 border-primary/30"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    The name that appears when you send money to this number
                  </p>
                </div>

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
              </div>

              {/* Utility Meters - In Landlord's Name */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/50 border">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Utility Meters (in Landlord's Name)
                </h4>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Meter numbers must be registered in <strong>{landlordName || "the landlord's"}</strong> name
                </p>
                
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="electricityMeter" className="text-xs flex items-center gap-1">
                      <Zap className="h-3 w-3 text-yellow-500" /> UMEME/UEDCL Electricity Meter #
                    </Label>
                    <Input
                      id="electricityMeter"
                      value={electricityMeterNumber}
                      onChange={(e) => setElectricityMeterNumber(e.target.value)}
                      placeholder={`Meter number in ${landlordName || "landlord's"} name`}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="waterMeter" className="text-xs flex items-center gap-1">
                      <Droplets className="h-3 w-3 text-blue-500" /> NWSC Water Meter #
                    </Label>
                    <Input
                      id="waterMeter"
                      value={waterMeterNumber}
                      onChange={(e) => setWaterMeterNumber(e.target.value)}
                      placeholder={`Meter number in ${landlordName || "landlord's"} name`}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Property Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  Property Details
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="numberOfHouses" className="text-xs">Number of Houses</Label>
                    <Input
                      id="numberOfHouses"
                      type="number"
                      min="1"
                      value={numberOfHouses}
                      onChange={(e) => setNumberOfHouses(e.target.value)}
                      placeholder="1"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="desiredRent" className="text-xs flex items-center gap-1">
                      <Banknote className="h-3 w-3" /> Desired Rent (UGX)
                    </Label>
                    <Input
                      id="desiredRent"
                      value={desiredRentFromWelile}
                      onChange={(e) => setDesiredRentFromWelile(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g., 500000"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* LC1 Chairperson */}
              <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <User className="h-3 w-3 text-primary" />
                  LC1 Chairperson *
                </h4>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Local Council 1 chairperson of the area where the property is located
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lc1Name" className="text-xs">Name *</Label>
                    <Input
                      id="lc1Name"
                      value={lc1Name}
                      onChange={(e) => setLc1Name(e.target.value)}
                      placeholder="LC1 chairperson name"
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lc1Phone" className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone *
                    </Label>
                    <Input
                      id="lc1Phone"
                      value={lc1Phone}
                      onChange={(e) => setLc1Phone(e.target.value)}
                      placeholder="0783..."
                      className="h-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="lc1Village" className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Village / Cell *
                  </Label>
                  <Input
                    id="lc1Village"
                    value={lc1Village}
                    onChange={(e) => setLc1Village(e.target.value)}
                    placeholder="Village or cell name"
                    className="h-9"
                    required
                  />
                </div>
              </div>


              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Caretaker (Optional)
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="caretakerName" className="text-xs">Caretaker Name</Label>
                    <Input
                      id="caretakerName"
                      value={caretakerName}
                      onChange={(e) => setCaretakerName(e.target.value)}
                      placeholder="Name"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="caretakerPhone" className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone
                    </Label>
                    <Input
                      id="caretakerPhone"
                      value={caretakerPhone}
                      onChange={(e) => setCaretakerPhone(e.target.value)}
                      placeholder="0783..."
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Bank Details (Optional) */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <CreditCard className="h-3 w-3" />
                  Bank Details (Optional)
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="bankName" className="text-xs">Bank Name</Label>
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
                  'Register Landlord & Generate Link'
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
