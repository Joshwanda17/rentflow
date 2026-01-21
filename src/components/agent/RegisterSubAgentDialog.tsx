import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

// User-friendly error messages mapping
const getErrorMessage = (error: string): string => {
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('email already exists') || errorLower.includes('user with this email')) {
    return 'This phone number is already registered as an agent.';
  }
  if (errorLower.includes('invite for this email already exists')) {
    return 'An invitation was already sent to this phone number. Ask them to check their link.';
  }
  if (errorLower.includes('unauthorized') || errorLower.includes('not authenticated')) {
    return 'Your session has expired. Please log in again.';
  }
  if (errorLower.includes('only managers')) {
    return 'You don\'t have permission to register sub-agents.';
  }
  if (errorLower.includes('missing required')) {
    return 'Please fill in all required fields.';
  }
  if (errorLower.includes('failed to fetch') || errorLower.includes('network')) {
    return 'Connection error. Please check your internet and try again.';
  }
  
  if (error.length < 100 && !errorLower.includes('error')) {
    return error;
  }
  
  return 'Something went wrong. Please try again.';
};

interface RegisterSubAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RegisterSubAgentDialog({ open, onOpenChange, onSuccess }: RegisterSubAgentDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    password: '',
  });
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    fullName: string;
    password: string;
  } | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // Generate email from phone number for backend compatibility
      const generatedEmail = `${formData.phone.replace(/\D/g, '')}@welile.agent`;
      
      const response = await supabase.functions.invoke('create-supporter-invite', {
        body: { ...formData, email: generatedEmail, role: 'agent', isSubAgent: true },
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
      });

      toast({
        title: '✅ Sub-Agent Invite Created!',
        description: 'Share the activation link with your new sub-agent.',
      });

      onSuccess?.();
    } catch (error: any) {
      const rawMessage = error.message || 'Failed to create invite';
      toast({
        title: 'Registration Failed',
        description: getErrorMessage(rawMessage),
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
    
    return `🤝 Welcome to the Welile Agent Team, ${createdInvite.fullName}!

You've been invited to join as a Sub-Agent!

💰 As a sub-agent, you'll earn 4% commission on all rent repayments from tenants you register!

🔐 Your password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Just click the link and enter your password to start earning!`;
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
    setFormData({ fullName: '', phone: '', password: '' });
    setCreatedInvite(null);
    setCopied(false);
    onOpenChange(false);
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-500/20">
            <Users className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <p className="font-bold text-orange-600 dark:text-orange-400">Sub-Agent Registration</p>
            <p className="text-sm text-muted-foreground">They earn 4% commission, you earn 1% of their earnings</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
          <Input
            id="fullName"
            placeholder="Enter sub-agent's full name"
            value={formData.fullName}
            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
            required
            className="h-12 text-base rounded-xl"
            autoComplete="off"
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
        </div>
      </div>

      <Button type="submit" className="w-full h-14 text-base font-semibold rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Creating Sub-Agent...
          </>
        ) : (
          <>
            <UserPlus className="h-5 w-5 mr-2" />
            Register Sub-Agent
          </>
        )}
      </Button>
    </form>
  );

  const successContent = (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-orange-500/5 to-amber-500/10 border-orange-500/20">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🤝</span>
            <div>
              <p className="font-bold text-xl">{createdInvite?.fullName}</p>
              <p className="text-sm text-muted-foreground">Sub-Agent Account</p>
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
        Register Another Sub-Agent
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto pb-safe">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Users className="h-6 w-6 text-orange-500" />
              {createdInvite ? 'Share Activation Link' : 'Register Sub-Agent'}
            </SheetTitle>
            <SheetDescription>
              {createdInvite 
                ? 'Share this link with your new sub-agent'
                : 'Build your team and earn from their success'}
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
            <Users className="h-5 w-5 text-orange-500" />
            {createdInvite ? 'Share Activation Link' : 'Register Sub-Agent'}
          </DialogTitle>
          <DialogDescription>
            {createdInvite 
              ? 'Share this link with your new sub-agent to activate their account'
              : 'Build your team and earn 1% from all their tenants\' repayments'}
          </DialogDescription>
        </DialogHeader>

        {!createdInvite ? formContent : successContent}
      </DialogContent>
    </Dialog>
  );
}

export default RegisterSubAgentDialog;
