import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Building2, 
  Sparkles, ArrowLeft, Shield, MapPin, Home
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UnifiedRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type RegistrationType = 'tenant' | 'landlord' | 'sub-agent' | 'lc1' | null;

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
  
  // Form data for invite-based registrations
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
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

  const handleSubmitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || selectedType === 'lc1') return;
    
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const role = selectedType === 'sub-agent' ? 'agent' : selectedType;
      const isSubAgent = selectedType === 'sub-agent';

      const response = await supabase.functions.invoke('create-supporter-invite', {
        body: { ...formData, role, isSubAgent },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create invite');
      }

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      setCreatedInvite({
        token: response.data.invite.activation_token,
        fullName: response.data.invite.full_name,
        password: formData.password,
        role: selectedType,
      });

      toast({
        title: `✅ ${registrationConfig[selectedType].label} Created!`,
        description: 'Share the activation link with the user.',
      });

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create invite',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitLC1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

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
      toast({
        title: 'Error',
        description: error.message || 'Failed to register LC1',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getShareLink = () => {
    if (!createdInvite) return '';
    return `${window.location.origin}/join?t=${createdInvite.token}`;
  };

  const getWhatsAppMessage = () => {
    if (!createdInvite) return '';
    const config = registrationConfig[createdInvite.role as keyof typeof registrationConfig];
    const isSubAgent = createdInvite.role === 'sub-agent';
    
    if (isSubAgent) {
      return `🤝 Welcome to the Welile Agent Team, ${createdInvite.fullName}!

You've been invited to join as an Agent!

💰 You'll earn 4% commission on all rent repayments from tenants you register!

🔐 Your password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Just click the link and enter your password to start earning!`;
    }
    
    return `${config?.emoji || '🎉'} Welcome to Welile, ${createdInvite.fullName}!

You've been invited to join as a ${config?.label || 'User'}!

🔐 Your password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Just click the link and enter your password to get started!`;
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

  const handleClose = () => {
    setFormData({ email: '', fullName: '', phone: '', password: '' });
    setLc1Data({ name: '', phone: '', village: '' });
    setCreatedInvite(null);
    setLc1Success(false);
    setCopied(false);
    setSelectedType(null);
    onOpenChange(false);
  };

  const handleBack = () => {
    setFormData({ email: '', fullName: '', phone: '', password: '' });
    setLc1Data({ name: '', phone: '', village: '' });
    setCreatedInvite(null);
    setLc1Success(false);
    setSelectedType(null);
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
              onClick={() => setSelectedType(type)}
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
                : registrationConfig[selectedType].description}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
          <Input
            id="fullName"
            placeholder="Enter full name"
            value={formData.fullName}
            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
            required
            className="h-14 text-base rounded-xl touch-manipulation"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="user@example.com"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            required
            className="h-14 text-base rounded-xl touch-manipulation"
            autoComplete="off"
            inputMode="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
          <Input
            id="phone"
            placeholder="0700000000"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            required
            className="h-14 text-base rounded-xl touch-manipulation"
            autoComplete="off"
            inputMode="tel"
          />
        </div>

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
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <UserPlus className="h-5 w-5 mr-2" />
            Register {registrationConfig[selectedType].label}
          </>
        )}
      </Button>
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
          <Input
            id="lc1Phone"
            placeholder="0700000000"
            value={lc1Data.phone}
            onChange={(e) => setLc1Data(prev => ({ ...prev, phone: e.target.value }))}
            required
            className="h-14 text-base rounded-xl touch-manipulation"
            autoComplete="off"
            inputMode="tel"
          />
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
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Registering...
          </>
        ) : (
          <>
            <Shield className="h-5 w-5 mr-2" />
            Register LC1 Chairman
          </>
        )}
      </Button>
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
