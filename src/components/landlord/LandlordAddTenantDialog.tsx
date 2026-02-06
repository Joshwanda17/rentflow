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
import { Textarea } from '@/components/ui/textarea';
import {
  User,
  Phone,
  MapPin,
  Banknote,
  Loader2,
  CheckCircle2,
  Shield,
  Home,
  Navigation,
} from 'lucide-react';
import { toast } from 'sonner';

interface LandlordAddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function LandlordAddTenantDialog({
  open,
  onOpenChange,
  onSuccess,
}: LandlordAddTenantDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);

  // Tenant info
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');

  // Rental details
  const [propertyAddress, setPropertyAddress] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [numberOfRooms, setNumberOfRooms] = useState('');
  const [rentalNotes, setRentalNotes] = useState('');

  // Location
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // LC1 Chairperson
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');

  const resetForm = () => {
    setTenantName('');
    setTenantPhone('');
    setPropertyAddress('');
    setMonthlyRent('');
    setNumberOfRooms('');
    setRentalNotes('');
    setLatitude(null);
    setLongitude(null);
    setLc1Name('');
    setLc1Phone('');
    setLc1Village('');
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

    if (!tenantName.trim() || !tenantPhone.trim()) {
      toast.error('Please provide tenant name and phone');
      return;
    }

    if (!propertyAddress.trim()) {
      toast.error('Please provide the property address');
      return;
    }

    if (!monthlyRent.trim()) {
      toast.error('Please provide the monthly rent amount');
      return;
    }

    setLoading(true);

    try {
      // Find tenant by phone
      const { data: tenantProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', tenantPhone.trim())
        .maybeSingle();

      // Get landlord's own profile for phone
      const { data: landlordProfile } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', user.id)
        .single();

      if (!landlordProfile) {
        toast.error('Could not load your profile');
        setLoading(false);
        return;
      }

      // Insert into landlords table (this is how tenant-landlord relationships work)
      const { error: landlordError } = await supabase.from('landlords').insert({
        tenant_id: tenantProfile?.id || null,
        name: landlordProfile.full_name || 'Landlord',
        phone: landlordProfile.phone || '',
        property_address: propertyAddress.trim(),
        monthly_rent: parseInt(monthlyRent),
        number_of_houses: numberOfRooms ? parseInt(numberOfRooms) : null,
        latitude: latitude,
        longitude: longitude,
        location_captured_at: latitude ? new Date().toISOString() : null,
        location_captured_by: user.id,
        registered_by: user.id,
      });

      if (landlordError) {
        if (landlordError.code === '23505') {
          toast.error('This tenant is already registered at this property');
        } else {
          toast.error('Failed to register tenant');
          console.error('Registration error:', landlordError);
        }
        setLoading(false);
        return;
      }

      // Save LC1 chairperson if provided
      if (lc1Name.trim() && lc1Phone.trim() && lc1Village.trim()) {
        // Check if LC1 already exists for this village
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

      // If tenant has an account, update their rent info
      if (tenantProfile?.id) {
        await supabase
          .from('profiles')
          .update({
            monthly_rent: parseInt(monthlyRent),
          })
          .eq('id', tenantProfile.id);
      }

      setSuccess(true);
      toast.success('Tenant added successfully!');
      onSuccess?.();
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Error:', err);
    }

    setLoading(false);
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
            Add a Tenant
          </DialogTitle>
          <DialogDescription>
            Register your tenant with their rental details and location
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
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold mb-2">Tenant Added!</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Your tenant has been registered successfully
              </p>
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
              {/* Tenant Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  Tenant Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lt-tenantName" className="text-xs">
                      Full Name *
                    </Label>
                    <Input
                      id="lt-tenantName"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Tenant's full name"
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lt-tenantPhone" className="text-xs">
                      Phone Number *
                    </Label>
                    <Input
                      id="lt-tenantPhone"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="0783..."
                      className="h-9"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Rental Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Home className="h-4 w-4 text-primary" />
                  Rental Details
                </h4>

                <div className="space-y-1">
                  <Label htmlFor="lt-propertyAddress" className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Property Address *
                  </Label>
                  <Input
                    id="lt-propertyAddress"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="e.g. Kira Road, Block 5, Room 12"
                    className="h-9"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lt-monthlyRent" className="text-xs flex items-center gap-1">
                      <Banknote className="h-3 w-3" /> Monthly Rent (UGX) *
                    </Label>
                    <Input
                      id="lt-monthlyRent"
                      type="number"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="500000"
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lt-numberOfRooms" className="text-xs">
                      Number of Rooms
                    </Label>
                    <Input
                      id="lt-numberOfRooms"
                      type="number"
                      value={numberOfRooms}
                      onChange={(e) => setNumberOfRooms(e.target.value)}
                      placeholder="e.g. 2"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="lt-rentalNotes" className="text-xs">
                    Additional Notes
                  </Label>
                  <Textarea
                    id="lt-rentalNotes"
                    value={rentalNotes}
                    onChange={(e) => setRentalNotes(e.target.value)}
                    placeholder="Any extra details about the rental..."
                    className="min-h-[60px] resize-none"
                  />
                </div>
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
                        <p className="text-xs text-success font-medium">📍 Location captured</p>
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
                      <Label htmlFor="lt-lc1Name" className="text-xs">
                        LC1 Name
                      </Label>
                      <Input
                        id="lt-lc1Name"
                        value={lc1Name}
                        onChange={(e) => setLc1Name(e.target.value)}
                        placeholder="Chairperson name"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lt-lc1Phone" className="text-xs">
                        LC1 Phone
                      </Label>
                      <Input
                        id="lt-lc1Phone"
                        value={lc1Phone}
                        onChange={(e) => setLc1Phone(e.target.value)}
                        placeholder="0783..."
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lt-lc1Village" className="text-xs">
                      Village / Zone
                    </Label>
                    <Input
                      id="lt-lc1Village"
                      value={lc1Village}
                      onChange={(e) => setLc1Village(e.target.value)}
                      placeholder="e.g. Bukoto Zone A"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding Tenant...
                  </>
                ) : (
                  'Add Tenant'
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
