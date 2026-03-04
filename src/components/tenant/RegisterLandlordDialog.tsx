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
import {
  Home, User, Phone, MapPin, CheckCircle2,
  Navigation, Loader2, AlertTriangle, Building2, Share2, Copy,
  Eye, EyeOff, RefreshCw
} from 'lucide-react';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess }: RegisterLandlordDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { location, loading: locationLoading, error: locationError, captureLocation } = useGeoLocation();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [activationLink, setActivationLink] = useState('');

  // Core fields
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
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

  const resetForm = () => {
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setTempPassword('');
    setShowPassword(false);
    setSuccess(false);
    setActivationLink('');
    setLocationCaptured(false);
  };

  const handleDialogOpen = async (isOpen: boolean) => {
    if (isOpen) {
      generateTempPassword();
      if (!locationCaptured) {
        const loc = await captureLocation();
        if (loc) setLocationCaptured(true);
      }
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

    if (!tempPassword) {
      toast({ title: 'Missing Password', description: 'Please generate a temporary password.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Register landlord
      const { error } = await supabase.from('landlords').insert({
        tenant_id: user.id,
        name: landlordName.trim(),
        phone: landlordPhone.trim(),
        property_address: propertyAddress.trim(),
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_captured_at: location ? new Date().toISOString() : null,
        location_captured_by: location ? user.id : null,
      });

      if (error) throw error;

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
        const link = `${window.location.origin}/join?t=${invite.activation_token}`;
        setActivationLink(link);
      }

      setSuccess(true);
      toast({ title: 'Landlord Registered!', description: 'Share the activation link so they can activate with one tap.' });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Registration Failed', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Link Copied!' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Register Landlord
          </DialogTitle>
          <DialogDescription>
            Create a new landlord account
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
                className="w-16 h-16 mx-auto mb-2 rounded-full bg-success/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold">Landlord Registered!</h3>
              <p className="text-muted-foreground text-sm">
                Share the link with <strong>{landlordName}</strong> — they just tap to activate.
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
              {/* Role badge */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-primary">Register Landlord</p>
                  <p className="text-xs text-muted-foreground">Property owner</p>
                </div>
              </div>

              {/* Landlord Name */}
              <div className="space-y-1.5">
                <Label htmlFor="landlordName" className="text-sm font-semibold flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Landlord Name
                </Label>
                <Input
                  id="landlordName"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  placeholder="Full name as on National ID"
                  className="h-11"
                  required
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <Label htmlFor="landlordPhone" className="text-sm font-semibold flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Phone Number
                </Label>
                <Input
                  id="landlordPhone"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  placeholder="0700000000"
                  className="h-11"
                  required
                />
              </div>

              {/* Property Address */}
              <div className="space-y-1.5">
                <Label htmlFor="propertyAddress" className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Property Address
                </Label>
                <Input
                  id="propertyAddress"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="e.g., Kabalagala, Block 5, Plot 12"
                  className="h-11"
                  required
                />
              </div>

              {/* GPS Location Status */}
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
                    <p className={`text-sm font-medium ${locationCaptured ? 'text-success' : ''}`}>
                      {locationLoading
                        ? 'Capturing GPS...'
                        : locationCaptured
                          ? 'Location captured!'
                          : locationError || 'GPS not captured'}
                    </p>
                    {locationCaptured && location && (
                      <p className="text-[10px] text-muted-foreground">
                        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                        {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={locationLoading}
                  onClick={async () => {
                    const loc = await captureLocation();
                    if (loc) setLocationCaptured(true);
                  }}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className={`h-3 w-3 ${locationLoading ? 'animate-spin' : ''}`} />
                  {locationCaptured ? 'Refresh' : 'Capture'}
                </Button>
              </div>

              {/* Temporary Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tempPassword" className="text-sm font-semibold">
                    Temporary Password
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateTempPassword}
                    className="gap-1.5 text-xs h-7 text-primary"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Generate
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="tempPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={tempPassword}
                    placeholder="Auto-generated"
                    className="h-11 pr-10"
                    readOnly
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Submit */}
              <Button type="submit" className="w-full h-12 text-base gap-2" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4" />
                    Register Landlord
                  </>
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
