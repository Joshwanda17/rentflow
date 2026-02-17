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
import { Building2, Phone, MapPin, Banknote, Loader2, CheckCircle2, CreditCard, Smartphone, Zap, Home, User, Navigation, AlertTriangle } from 'lucide-react';
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
  
  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  
  // New fields
  const [hasSmartphone, setHasSmartphone] = useState(true);
  const [electricityMeterNumber, setElectricityMeterNumber] = useState('');
  const [numberOfHouses, setNumberOfHouses] = useState('1');
  const [desiredRentFromWelile, setDesiredRentFromWelile] = useState('');
  const [caretakerName, setCaretakerName] = useState('');
  const [caretakerPhone, setCaretakerPhone] = useState('');
   const [locationCaptured, setLocationCaptured] = useState(false);

   // Auto-capture location when dialog opens
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
    setBankName('');
    setAccountNumber('');
    setHasSmartphone(true);
    setElectricityMeterNumber('');
    setNumberOfHouses('1');
    setDesiredRentFromWelile('');
    setCaretakerName('');
    setCaretakerPhone('');
     setLocationCaptured(false);
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

    try {
      // Check if landlord with this phone already exists
      const { data: existingLandlord } = await supabase
        .from('landlords')
        .select('id')
        .eq('phone', landlordPhone.trim())
        .maybeSingle();

      if (existingLandlord) {
        toast.error('A landlord with this phone number already exists');
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
          bank_name: bankName.trim() || null,
          account_number: accountNumber.trim() || null,
          registered_by: user.id,
          has_smartphone: hasSmartphone,
          electricity_meter_number: electricityMeterNumber.trim() || null,
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
        return;
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

  return (
     <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
               <Button onClick={() => handleDialogOpen(false)}>
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

              {/* Property Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  Property Details
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="electricityMeter" className="text-xs flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Electricity Meter #
                    </Label>
                    <Input
                      id="electricityMeter"
                      value={electricityMeterNumber}
                      onChange={(e) => setElectricityMeterNumber(e.target.value)}
                      placeholder="Meter number"
                      className="h-9"
                    />
                  </div>
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
                </div>

                <div className="space-y-1">
                  <Label htmlFor="desiredRent" className="text-xs flex items-center gap-1">
                    <Banknote className="h-3 w-3" /> Desired Rent from Welile (UGX)
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

              {/* Caretaker Info */}
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
