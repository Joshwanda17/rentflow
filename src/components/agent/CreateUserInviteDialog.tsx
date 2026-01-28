import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Building2, Sparkles, UsersRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

interface CreateUserInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type UserRole = 'tenant' | 'landlord' | 'agent';

const roleConfig: Record<UserRole, { label: string; icon: React.ElementType; description: string; color: string; bgColor: string; emoji: string }> = {
  tenant: {
    label: 'Tenant',
    icon: Users,
    description: 'Rent payer who can request rent assistance',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    emoji: '🏠',
  },
  landlord: {
    label: 'Landlord',
    icon: Building2,
    description: 'Property owner who receives rent payments',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    emoji: '🏢',
  },
  agent: {
    label: 'Sub-Agent',
    icon: UsersRound,
    description: 'Team member who helps register tenants',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    emoji: '👥',
  },
};

export function CreateUserInviteDialog({ open, onOpenChange, onSuccess }: CreateUserInviteDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('tenant');
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    phone: '',
    password: '',
  });
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    fullName: string;
    password: string;
    role: UserRole;
  } | null>(null);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  // Auto-generate password when dialog opens
  useEffect(() => {
    if (open && !formData.password) {
      generatePassword();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const response = await supabase.functions.invoke('create-supporter-invite', {
        body: { ...formData, role: selectedRole, isSubAgent: selectedRole === 'agent' },
      });

      if (response.error) {
        const errorMsg = response.error.message || 
          (response.error as any)?.context?.body || 
          'Failed to create invite';
        throw new Error(errorMsg);
      }

      if (!response.data || response.data.error) {
        throw new Error(response.data?.error || 'Failed to create invite');
      }

      setCreatedInvite({
        token: response.data.invite.activation_token,
        fullName: response.data.invite.full_name,
        password: formData.password,
        role: selectedRole,
      });

      toast({
        title: `✅ ${roleConfig[selectedRole].label} Invite Created!`,
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

  const getShareLink = () => {
    if (!createdInvite) return '';
    return `${window.location.origin}/join?t=${createdInvite.token}`;
  };

  const getWhatsAppMessage = () => {
    if (!createdInvite) return '';
    const config = roleConfig[createdInvite.role];
    
    return `${config.emoji} Welcome to Welile, ${createdInvite.fullName}!

You've been invited to join as a ${config.label}!

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
    setCreatedInvite(null);
    setCopied(false);
    setSelectedRole('tenant');
    onOpenChange(false);
  };

  const RoleIcon = roleConfig[selectedRole].icon;

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Role Selection - Large touch-friendly cards */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Who are you registering?</Label>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(roleConfig) as UserRole[]).map((role) => {
            const config = roleConfig[role];
            const Icon = config.icon;
            const isSelected = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all active:scale-95 ${
                  isSelected 
                    ? `${config.bgColor} border-current` 
                    : 'bg-muted/30 border-transparent hover:bg-muted/50'
                }`}
              >
                <span className="text-3xl mb-2">{config.emoji}</span>
                <Icon className={`h-6 w-6 mb-1 ${isSelected ? config.color : 'text-muted-foreground'}`} />
                <span className={`text-sm font-semibold ${isSelected ? config.color : 'text-foreground'}`}>
                  {config.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground text-center px-2">{roleConfig[selectedRole].description}</p>
      </div>

      {/* Form fields with larger inputs for easy mobile use */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
          <Input
            id="fullName"
            placeholder="Enter user's full name"
            value={formData.fullName}
            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
            required
            className="h-12 text-base rounded-xl"
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
            className="h-12 text-base rounded-xl"
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
            className="h-12 text-base rounded-xl"
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
              className="h-8 text-xs gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Generate New
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
              className="h-12 text-base pr-12 rounded-xl"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This password will be shared with the user
          </p>
        </div>
      </div>

      <Button type="submit" className="w-full h-14 text-base font-semibold rounded-xl" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Creating Account...
          </>
        ) : (
          <>
            <RoleIcon className={`h-5 w-5 mr-2 ${roleConfig[selectedRole].color}`} />
            Register {roleConfig[selectedRole].label}
          </>
        )}
      </Button>
    </form>
  );

  const successContent = (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{createdInvite ? roleConfig[createdInvite.role].emoji : ''}</span>
            <div>
              <p className="font-bold text-xl">{createdInvite?.fullName}</p>
              <p className="text-sm text-muted-foreground">{createdInvite ? roleConfig[createdInvite.role].label : ''} Account</p>
            </div>
          </div>
          <div className="bg-background rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Temporary Password</p>
            <p className="font-mono font-bold text-xl tracking-wider">{createdInvite?.password}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Activation Link</Label>
        <div className="flex gap-2">
          <Input value={getShareLink()} readOnly className="h-12 text-sm rounded-xl" />
          <Button variant="outline" size="icon" onClick={handleCopyLink} className="h-12 w-12 shrink-0 rounded-xl">
            {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <Button 
        onClick={handleShareWhatsApp} 
        className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 rounded-xl"
      >
        <Share2 className="h-5 w-5 mr-2" />
        Share on WhatsApp
      </Button>

      <Button variant="outline" onClick={handleClose} className="w-full h-12 text-base rounded-xl">
        Register Another User
      </Button>
    </div>
  );

  // Use Sheet for mobile, Dialog for desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto pb-safe">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="h-6 w-6 text-primary" />
              {createdInvite ? 'Share Activation Link' : 'Register New User'}
            </SheetTitle>
            <SheetDescription>
              {createdInvite 
                ? `Share this link with the ${roleConfig[createdInvite.role].label.toLowerCase()}`
                : 'Create a new tenant or landlord account'}
            </SheetDescription>
          </SheetHeader>
          
          {!createdInvite ? formContent : successContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {createdInvite ? 'Share Activation Link' : 'Register New User'}
          </DialogTitle>
          <DialogDescription>
            {createdInvite 
              ? `Share this link with the ${roleConfig[createdInvite.role].label.toLowerCase()} to activate their account`
              : 'Create a new tenant or landlord account and share the activation link'}
          </DialogDescription>
        </DialogHeader>

        {!createdInvite ? formContent : successContent}
      </DialogContent>
    </Dialog>
  );
}

export default CreateUserInviteDialog;
