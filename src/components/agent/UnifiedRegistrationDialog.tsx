import { useState, useEffect, useMemo } from 'react';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Building2, 
  Sparkles, ArrowLeft, Shield, MapPin, Home, RefreshCw, AlertCircle, Heart,
  Hash, Wallet, Zap, Droplets, ShieldCheck, XCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { Loader2 as LoaderIcon, Navigation } from 'lucide-react';

const HOUSE_CATEGORIES = [
  'Single Room', 'Double Room', 'Bedsitter', 'One Bedroom',
  'Two Bedroom', 'Three Bedroom', 'Commercial', 'Mixed',
];
// User-friendly error messages mapping
const getErrorMessage = (error: string): string => {
  const errorLower = error.toLowerCase();
  
  // Email errors
  if (errorLower.includes('email already exists') || errorLower.includes('user with this email')) {
    return 'This email is already registered. Try a different email address.';
  }
  if (errorLower.includes('invite for this email already exists')) {
    return 'An invitation was already sent to this email. Check if they received it or use a different email.';
  }
  if (errorLower.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  
  // Phone errors
  if (errorLower.includes('phone') && errorLower.includes('exists')) {
    return 'This phone number is already registered.';
  }
  
  // Permission errors
  if (errorLower.includes('unauthorized') || errorLower.includes('not authenticated')) {
    return 'Your session has expired. Please log in again.';
  }
  if (errorLower.includes('only managers')) {
    return 'You don\'t have permission to create this type of account.';
  }
  if (errorLower.includes('agents can only')) {
    return 'As an agent, you can only register tenants, landlords, and sub-agents.';
  }
  
  // Validation errors  
  if (errorLower.includes('missing required')) {
    return 'Please fill in all required fields.';
  }
  if (errorLower.includes('invalid role')) {
    return 'Invalid account type selected. Please try again.';
  }
  
  // Duplicate errors
  if (errorLower.includes('already registered') || errorLower.includes('duplicate')) {
    return 'This person is already registered in the system.';
  }
  
  // Network/Server errors
  if (errorLower.includes('failed to fetch') || errorLower.includes('network')) {
    return 'Connection error. Please check your internet and try again.';
  }
  if (errorLower.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  
  // Generic fallback with the original message if it's readable
  if (error.length < 100 && !errorLower.includes('error') && !errorLower.includes('exception')) {
    return error;
  }
  
  return 'Something went wrong. Please try again or contact support.';
};

interface UnifiedRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type RegistrationType = 'tenant' | 'landlord' | 'sub-agent' | 'supporter' | 'lc1' | null;

const registrationConfig = {
  tenant: {
    label: 'Tenant',
    icon: Home,
    description: 'Register a rent payer',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    emoji: '🏠',
  },
  landlord: {
    label: 'Landlord',
    icon: Building2,
    description: 'Property owner',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    emoji: '🏢',
  },
  'sub-agent': {
    label: 'Sub-Agent',
    icon: Users,
    description: 'Build your team',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    emoji: '🤝',
  },
  supporter: {
    label: 'Supporter',
    icon: Heart,
    description: 'Fund rent for tenants',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10 border-pink-500/30',
    emoji: '💝',
  },
  lc1: {
    label: 'LC1 Chairman',
    icon: Shield,
    description: 'Local leader',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
    emoji: '🛡️',
  },
};

export function UnifiedRegistrationDialog({ open, onOpenChange, onSuccess }: UnifiedRegistrationDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedType, setSelectedType] = useState<RegistrationType>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  
  // Form data for invite-based registrations (simplified: only phone + password)
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
  });
  
  // LC1 specific data
  const [lc1Data, setLc1Data] = useState({
    name: '',
    phone: '',
    village: '',
  });
  
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    fullName: string;
    password: string;
    role: string;
  } | null>(null);

  const [lc1Success, setLc1Success] = useState(false);

  // Location capture for landlord registrations
  const { location: capturedLocation, loading: locationLoading, error: locationError, captureLocation } = useGeoLocation();
  const [propertyAddress, setPropertyAddress] = useState('');
  const [locationCaptured, setLocationCaptured] = useState(false);

  // Extended landlord fields
  const [numberOfRentals, setNumberOfRentals] = useState('');
  const [houseCat, setHouseCat] = useState('');
  const [momoName, setMomoName] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [nwscMeter, setNwscMeter] = useState('');
  const [uedclMeter, setUedclMeter] = useState('');

  // Name matching (MoMo name vs phone-holder name)
  const nameMatchScore = useMemo(() => {
    if (!momoName.trim() || !formData.phone.trim()) return null;
    // We compare momoName words - since we only have phone, show score if momoName is filled
    return momoName.trim().length > 2 ? 100 : 0;
  }, [momoName, formData.phone]);

  // Qualification score for landlords
  const qualificationScore = useMemo(() => {
    if (selectedType !== 'landlord') return 0;
    let score = 0;
    if (formData.phone.trim()) score += 15;
    if (propertyAddress.trim()) score += 10;
    if (numberOfRentals && parseInt(numberOfRentals) > 0) score += 10;
    if (houseCat) score += 5;
    if (locationCaptured) score += 20;
    if (momoName.trim() && momoNumber.trim()) score += 15;
    if (nwscMeter.trim()) score += 12;
    if (uedclMeter.trim()) score += 13;
    return Math.min(score, 100);
  }, [selectedType, formData.phone, propertyAddress, numberOfRentals, houseCat, locationCaptured, momoName, momoNumber, nwscMeter, uedclMeter]);

  // Real-time duplicate phone checking
  const { isDuplicate: isPhoneDuplicate, isChecking: isCheckingPhone, duplicateMessage: phoneDuplicateMessage } = usePhoneDuplicateCheck(formData.phone);
  const { isDuplicate: isLc1PhoneDuplicate, isChecking: isCheckingLc1Phone, duplicateMessage: lc1PhoneDuplicateMessage } = usePhoneDuplicateCheck(lc1Data.phone);

  // Capture location when landlord is selected
  const handleSelectType = async (type: RegistrationType) => {
    setSelectedType(type);
    if (type === 'landlord') {
      // Automatically capture location when landlord is selected
      const loc = await captureLocation();
      if (loc) {
        setLocationCaptured(true);
      }
    }
  };

  const handleRetryLocation = async () => {
    const loc = await captureLocation();
    if (loc) {
      setLocationCaptured(true);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  useEffect(() => {
    if (open && !formData.password) {
      generatePassword();
    }
  }, [open]);

  const handleSubmitInvite = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedType || selectedType === 'lc1') return;
    
    setIsLoading(true);
    setLastError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const role = selectedType === 'sub-agent' ? 'agent' : selectedType;
      const isSubAgent = selectedType === 'sub-agent';
      const isSupporter = selectedType === 'supporter';

      // Auto-generate email from phone number
      const generatedEmail = `${formData.phone.replace(/\D/g, '')}@welile.user`;

      const response = await supabase.functions.invoke('create-supporter-invite', {
        body: { 
          phone: formData.phone,
          password: formData.password,
          email: generatedEmail,
          role, 
          isSubAgent, 
          isSupporter,
          latitude: role === 'landlord' && capturedLocation ? capturedLocation.latitude : null,
          longitude: role === 'landlord' && capturedLocation ? capturedLocation.longitude : null,
          locationAccuracy: role === 'landlord' && capturedLocation ? capturedLocation.accuracy : null,
          propertyAddress: role === 'landlord' && propertyAddress ? propertyAddress : null,
          numberOfRentals: role === 'landlord' && numberOfRentals ? parseInt(numberOfRentals) : null,
          houseCategory: role === 'landlord' && houseCat ? houseCat : null,
          momoName: role === 'landlord' && momoName.trim() ? momoName.trim() : null,
          momoNumber: role === 'landlord' && momoNumber.trim() ? momoNumber.trim() : null,
          nwscMeter: role === 'landlord' && nwscMeter.trim() ? nwscMeter.trim() : null,
          uedclMeter: role === 'landlord' && uedclMeter.trim() ? uedclMeter.trim() : null,
        },
      });

      if (response.error || response.data?.error) {
        const errorMsg = await extractEdgeFunctionError(response, 'Failed to register user. Please try again.');
        throw new Error(errorMsg);
      }

      setCreatedInvite({
        token: response.data.invite.activation_token,
        fullName: formData.phone, // Use phone as identifier since no name yet
        password: formData.password,
        role: selectedType,
      });

      toast({
        title: `✅ ${registrationConfig[selectedType].label} Created!`,
        description: 'Share the activation link with the user.',
      });

      onSuccess?.();
    } catch (error: any) {
      const rawMessage = error.message || 'Failed to create invite';
      const friendlyMessage = getErrorMessage(rawMessage);
      setLastError(friendlyMessage);
      toast({
        title: 'Registration Failed',
        description: friendlyMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitLC1 = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setLastError(null);

    try {
      const { error } = await supabase
        .from('lc1_chairpersons')
        .insert({
          name: lc1Data.name.trim(),
          phone: lc1Data.phone.trim(),
          village: lc1Data.village.trim(),
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error('This LC1 chairman is already registered');
        }
        throw error;
      }

      setLc1Success(true);
      toast({
        title: '✅ LC1 Chairman Registered!',
        description: `${lc1Data.name} has been added successfully.`,
      });
      onSuccess?.();
    } catch (error: any) {
      const rawMessage = error.message || 'Failed to register LC1';
      const friendlyMessage = getErrorMessage(rawMessage);
      setLastError(friendlyMessage);
      toast({
        title: 'Registration Failed',
        description: friendlyMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getShareLink = () => {
    if (!createdInvite) return '';
    return `${getPublicOrigin()}/join?t=${createdInvite.token}`;
  };

  const getWhatsAppMessage = () => {
    if (!createdInvite) return '';
    const config = registrationConfig[createdInvite.role as keyof typeof registrationConfig];
    const isSubAgent = createdInvite.role === 'sub-agent';
    
    if (isSubAgent) {
      return `🤝 Welcome to the Welile Agent Team!

You've been invited to join as an Agent!

💰 You'll earn 4% commission on all rent repayments from tenants you register!

🔐 Your temporary password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Click the link, enter your password, and set up your profile to start earning!`;
    }

    if (createdInvite.role === 'supporter') {
      return `💝 Welcome to Welile!

You've been invited to join as a Supporter!

💰 Earn 15% monthly ROI by funding rent for tenants!

🔐 Your temporary password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Click the link, enter your password, and complete your profile to start investing!`;
    }
    
    return `${config?.emoji || '🎉'} Welcome to Welile!

You've been invited to join as a ${config?.label || 'User'}!

🔐 Your temporary password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Click the link, enter your password, and set up your profile to get started!`;
  };

  const handleShareWhatsApp = () => {
    const message = encodeURIComponent(getWhatsAppMessage());
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleCopyLink = async () => {
    const text = `Activation Link: ${getShareLink()}
Password: ${createdInvite?.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link & password copied!' });
  };

  const resetLandlordFields = () => {
    setPropertyAddress('');
    setLocationCaptured(false);
    setNumberOfRentals('');
    setHouseCat('');
    setMomoName('');
    setMomoNumber('');
    setNwscMeter('');
    setUedclMeter('');
  };

  const handleClose = () => {
    setFormData({ phone: '', password: '' });
    setLc1Data({ name: '', phone: '', village: '' });
    setCreatedInvite(null);
    setLc1Success(false);
    setCopied(false);
    setSelectedType(null);
    setLastError(null);
    resetLandlordFields();
    onOpenChange(false);
  };

  const handleBack = () => {
    setFormData({ phone: '', password: '' });
    setLc1Data({ name: '', phone: '', village: '' });
    setCreatedInvite(null);
    setLc1Success(false);
    setSelectedType(null);
    setLastError(null);
    resetLandlordFields();
    generatePassword();
  };

  // Selection screen
  const selectionContent = (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground text-center">
        Tap to select who you want to register
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(registrationConfig) as RegistrationType[]).filter(Boolean).map((type) => {
          if (!type) return null;
          const config = registrationConfig[type];
          const Icon = config.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleSelectType(type)}
              className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all active:scale-95 touch-manipulation bg-muted/30 border-transparent hover:${config.bgColor} hover:border-current min-h-[120px]`}
            >
              <span className="text-4xl mb-2">{config.emoji}</span>
              <Icon className={`h-6 w-6 mb-1 ${config.color}`} />
              <span className="text-sm font-semibold">{config.label}</span>
              <span className="text-xs text-muted-foreground mt-1">{config.description}</span>
            </button>
          );
        })}
      </div>
      
      <div className="pt-2 text-center">
        <p className="text-xs text-muted-foreground">
          💰 You earn <strong>UGX 500</strong> when they activate their account!
        </p>
      </div>
    </div>
  );

  // Invite form for tenant, landlord, sub-agent
  const inviteFormContent = selectedType && selectedType !== 'lc1' && (
    <form onSubmit={handleSubmitInvite} className="space-y-5">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back</span>
      </button>

      <div className={`${registrationConfig[selectedType].bgColor} border rounded-2xl p-4`}>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{registrationConfig[selectedType].emoji}</span>
          <div>
            <p className={`font-bold ${registrationConfig[selectedType].color}`}>
              Register {registrationConfig[selectedType].label}
            </p>
            <p className="text-sm text-muted-foreground">
              {selectedType === 'sub-agent' 
                ? 'They earn 4%, you earn 1% of their tenants' 
                : selectedType === 'supporter'
                ? 'They earn 15% ROI monthly on rent funded'
                : registrationConfig[selectedType].description}
            </p>
          </div>
        </div>
      </div>

      {/* Qualification Score - Only for landlords */}
      {selectedType === 'landlord' && (
        <div className="p-3 rounded-xl bg-muted/50 border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Qualification Score</span>
            <span className={`text-xs font-bold ${qualificationScore >= 80 ? 'text-success' : qualificationScore >= 50 ? 'text-warning' : 'text-destructive'}`}>
              {qualificationScore}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${qualificationScore >= 80 ? 'bg-success' : qualificationScore >= 50 ? 'bg-warning' : 'bg-destructive'}`}
              style={{ width: `${qualificationScore}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">More data = higher qualification = faster approval</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
          <div className="relative">
            <Input
              id="phone"
              placeholder="0700000000"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              required
              className={`h-14 text-base rounded-xl touch-manipulation pr-10 ${isPhoneDuplicate && selectedType !== 'tenant' && selectedType !== 'supporter' ? 'border-destructive focus:ring-destructive' : isPhoneDuplicate ? 'border-warning focus:ring-warning' : ''}`}
              autoComplete="off"
              inputMode="tel"
            />
            {isCheckingPhone && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!isCheckingPhone && isPhoneDuplicate && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
            )}
          </div>
          {isPhoneDuplicate && phoneDuplicateMessage && (
            <p className={`text-sm flex items-center gap-1.5 animate-in fade-in duration-200 ${(selectedType === 'tenant' || selectedType === 'supporter') ? 'text-warning' : 'text-destructive'}`}>
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {(selectedType === 'tenant') 
                ? `${phoneDuplicateMessage} — will link existing account`
                : selectedType === 'supporter'
                ? `${phoneDuplicateMessage} — will create supporter invite`
                : phoneDuplicateMessage}
            </p>
          )}
        </div>

        {/* Number of Rentals & Category - Only for landlords */}
        {selectedType === 'landlord' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Hash className="h-3 w-3" /> No. of Rentals
              </Label>
              <Input
                type="number"
                min="1"
                value={numberOfRentals}
                onChange={(e) => setNumberOfRentals(e.target.value)}
                placeholder="e.g. 5"
                className="h-12 text-base rounded-xl touch-manipulation"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Category
              </Label>
              <Select value={houseCat} onValueChange={setHouseCat}>
                <SelectTrigger className="h-12 rounded-xl">
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
        )}

        {/* Property Address - Only for landlords */}
        {selectedType === 'landlord' && (
          <div className="space-y-2">
            <Label htmlFor="propertyAddress" className="text-sm font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Property Address
            </Label>
            <Input
              id="propertyAddress"
              placeholder="e.g., Kabalagala, Block 5, Plot 12"
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              className="h-14 text-base rounded-xl touch-manipulation"
              autoComplete="off"
            />
          </div>
        )}

        {/* Location Status - Only for landlords */}
        {selectedType === 'landlord' && (
          <div className={`p-3 rounded-xl border ${locationCaptured ? 'bg-green-500/10 border-green-500/30' : locationError ? 'bg-amber-500/10 border-amber-500/30' : 'bg-muted/50 border-muted'}`}>
            <div className="flex items-center gap-3">
              {locationLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Capturing GPS location...</p>
                    <p className="text-xs text-muted-foreground">This is the tenant's house location</p>
                  </div>
                </>
              ) : locationCaptured && capturedLocation ? (
                <>
                  <Navigation className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-600">📍 Location captured!</p>
                    <p className="text-xs text-muted-foreground">
                      {capturedLocation.latitude.toFixed(6)}, {capturedLocation.longitude.toFixed(6)}
                      {capturedLocation.accuracy && ` (±${Math.round(capturedLocation.accuracy)}m)`}
                    </p>
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRetryLocation}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </>
              ) : locationError ? (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-600">{locationError}</p>
                    <p className="text-xs text-muted-foreground">Location helps verify the property</p>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRetryLocation}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  <Navigation className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Location not captured</p>
                    <p className="text-xs text-muted-foreground">Tap to capture tenant's house location</p>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRetryLocation}
                    className="text-xs"
                  >
                    <Navigation className="h-3 w-3 mr-1" />
                    Capture
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Mobile Money Details - Only for landlords */}
        {selectedType === 'landlord' && (
          <div className="space-y-2 p-3 rounded-xl border bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">Mobile Money Details</span>
              {momoName.trim() && (
                <span className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${momoName.trim().length > 2 ? 'text-success' : 'text-destructive'}`}>
                  {momoName.trim().length > 2 ? <ShieldCheck className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {momoName.trim().length > 2 ? 'Name provided' : 'Name too short'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">MoMo Name</Label>
                <Input
                  value={momoName}
                  onChange={(e) => setMomoName(e.target.value)}
                  placeholder="Name on MoMo"
                  className="h-12 text-sm rounded-xl touch-manipulation"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">MoMo Number</Label>
                <Input
                  value={momoNumber}
                  onChange={(e) => setMomoNumber(e.target.value)}
                  placeholder="0770000000"
                  className="h-12 text-sm rounded-xl touch-manipulation"
                  inputMode="tel"
                />
              </div>
            </div>
          </div>
        )}

        {/* Utility Meters - Only for landlords */}
        {selectedType === 'landlord' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Droplets className="h-3 w-3 text-blue-500" /> NWSC Meter
              </Label>
              <Input
                value={nwscMeter}
                onChange={(e) => setNwscMeter(e.target.value)}
                placeholder="In landlord's name"
                className="h-12 text-sm rounded-xl touch-manipulation"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Zap className="h-3 w-3 text-yellow-500" /> UEDCL Meter
              </Label>
              <Input
                value={uedclMeter}
                onChange={(e) => setUedclMeter(e.target.value)}
                placeholder="In landlord's name"
                className="h-12 text-sm rounded-xl touch-manipulation"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">Temporary Password</Label>
            <Button 
              type="button" 
              variant="ghost" 
              size="sm" 
              onClick={generatePassword}
              className="h-8 text-xs gap-1 touch-manipulation"
            >
              <Sparkles className="h-3 w-3" />
              Generate
            </Button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
              minLength={6}
              className="h-14 text-base pr-14 rounded-xl touch-manipulation"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-12 w-12 touch-manipulation"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      <Button 
        type="submit" 
        className={`w-full h-14 text-base font-semibold rounded-xl touch-manipulation ${
          selectedType === 'sub-agent' 
            ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600' 
            : ''
        }`}
        disabled={isLoading || (isPhoneDuplicate && selectedType !== 'tenant' && selectedType !== 'supporter')}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Creating...
          </>
        ) : isPhoneDuplicate && selectedType !== 'tenant' && selectedType !== 'supporter' ? (
          <>
            <AlertCircle className="h-5 w-5 mr-2" />
            Phone Number Already Exists
          </>
        ) : isPhoneDuplicate && (selectedType === 'tenant' || selectedType === 'supporter') ? (
          <>
            <UserPlus className="h-5 w-5 mr-2" />
            {selectedType === 'supporter' ? 'Register Supporter' : 'Link Existing Tenant'}
          </>
        ) : (
          <>
            <UserPlus className="h-5 w-5 mr-2" />
            Register {registrationConfig[selectedType].label}
          </>
        )}
      </Button>

      {/* Error retry section */}
      {lastError && !isLoading && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 animate-shake">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive font-medium">{lastError}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSubmitInvite()}
              className="mt-2 h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          </div>
        </div>
      )}
    </form>
  );

  // LC1 form
  const lc1FormContent = selectedType === 'lc1' && !lc1Success && (
    <form onSubmit={handleSubmitLC1} className="space-y-5">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back</span>
      </button>

      <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🛡️</span>
          <div>
            <p className="font-bold text-purple-500">Register LC1 Chairman</p>
            <p className="text-sm text-muted-foreground">Local leader for rent verifications</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lc1Name" className="text-sm font-medium">Full Name</Label>
          <Input
            id="lc1Name"
            placeholder="Enter LC1 chairman's name"
            value={lc1Data.name}
            onChange={(e) => setLc1Data(prev => ({ ...prev, name: e.target.value }))}
            required
            className="h-14 text-base rounded-xl touch-manipulation"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lc1Phone" className="text-sm font-medium">Phone Number</Label>
          <div className="relative">
            <Input
              id="lc1Phone"
              placeholder="0700000000"
              value={lc1Data.phone}
              onChange={(e) => setLc1Data(prev => ({ ...prev, phone: e.target.value }))}
              required
              className={`h-14 text-base rounded-xl touch-manipulation pr-10 ${isLc1PhoneDuplicate ? 'border-red-500 focus:ring-red-500' : ''}`}
              autoComplete="off"
              inputMode="tel"
            />
            {isCheckingLc1Phone && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!isCheckingLc1Phone && isLc1PhoneDuplicate && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            )}
          </div>
          {isLc1PhoneDuplicate && lc1PhoneDuplicateMessage && (
            <p className="text-sm text-red-500 flex items-center gap-1.5 animate-in fade-in duration-200">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {lc1PhoneDuplicateMessage}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lc1Village" className="text-sm font-medium flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Village/Zone
          </Label>
          <Input
            id="lc1Village"
            placeholder="e.g., Kabalagala Zone 2"
            value={lc1Data.village}
            onChange={(e) => setLc1Data(prev => ({ ...prev, village: e.target.value }))}
            required
            className="h-14 text-base rounded-xl touch-manipulation"
            autoComplete="off"
          />
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full h-14 text-base font-semibold rounded-xl bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 touch-manipulation"
        disabled={isLoading || isLc1PhoneDuplicate}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Registering...
          </>
        ) : isLc1PhoneDuplicate ? (
          <>
            <AlertCircle className="h-5 w-5 mr-2" />
            Phone Number Already Exists
          </>
        ) : (
          <>
            <Shield className="h-5 w-5 mr-2" />
            Register LC1 Chairman
          </>
        )}
      </Button>

      {/* Error retry section */}
      {lastError && !isLoading && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 animate-shake">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive font-medium">{lastError}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSubmitLC1()}
              className="mt-2 h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          </div>
        </div>
      )}
    </form>
  );

  // LC1 success
  const lc1SuccessContent = lc1Success && (
    <div className="space-y-5 py-4">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
          <Check className="h-10 w-10 text-purple-500" />
        </div>
        <h3 className="text-xl font-bold mb-2">LC1 Chairman Registered!</h3>
        <p className="text-muted-foreground">
          {lc1Data.name} from {lc1Data.village} is now in the system
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={handleBack} className="h-12 rounded-xl touch-manipulation">
          Register Another
        </Button>
        <Button onClick={handleClose} className="h-12 rounded-xl touch-manipulation">
          Done
        </Button>
      </div>
    </div>
  );

  // Success with share link
  const successContent = createdInvite && (
    <div className="space-y-5">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Register Another</span>
      </button>

      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">
              {registrationConfig[createdInvite.role as keyof typeof registrationConfig]?.emoji || '🎉'}
            </span>
            <div>
              <p className="font-bold text-xl">{createdInvite.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {registrationConfig[createdInvite.role as keyof typeof registrationConfig]?.label || 'User'} Account
              </p>
            </div>
          </div>
          <div className="bg-background rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Temporary Password</p>
            <p className="font-mono font-bold text-xl tracking-wider">{createdInvite.password}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Activation Link</Label>
        <div className="flex gap-2">
          <Input value={getShareLink()} readOnly className="h-12 text-sm rounded-xl" />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleCopyLink} 
            className="h-12 w-12 shrink-0 rounded-xl touch-manipulation"
          >
            {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <Button 
        onClick={handleShareWhatsApp} 
        className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 rounded-xl touch-manipulation"
      >
        <Share2 className="h-5 w-5 mr-2" />
        Share on WhatsApp
      </Button>

      <Button variant="outline" onClick={handleClose} className="w-full h-12 text-base rounded-xl touch-manipulation">
        Close
      </Button>
    </div>
  );

  const renderContent = () => {
    if (createdInvite) return successContent;
    if (lc1Success) return lc1SuccessContent;
    if (selectedType === 'lc1') return lc1FormContent;
    if (selectedType) return inviteFormContent;
    return selectionContent;
  };

  const getTitle = () => {
    if (createdInvite) return 'Share Activation Link';
    if (lc1Success) return 'Registration Complete';
    if (selectedType) return `Register ${registrationConfig[selectedType].label}`;
    return 'Register User';
  };

  const getDescription = () => {
    if (createdInvite) return 'Share this link to activate their account';
    if (lc1Success) return 'LC1 Chairman added successfully';
    if (selectedType === 'lc1') return 'Add a local leader for verifications';
    if (selectedType) return `Create a new ${registrationConfig[selectedType].label.toLowerCase()} account`;
    return 'Choose who you want to register';
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-hidden pb-safe">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="h-6 w-6 text-primary" />
              {getTitle()}
            </SheetTitle>
            <SheetDescription>{getDescription()}</SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="h-[calc(100%-80px)] pr-3">
            {renderContent()}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

export default UnifiedRegistrationDialog;
