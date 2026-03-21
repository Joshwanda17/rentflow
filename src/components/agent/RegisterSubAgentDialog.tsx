import { useState, useEffect } from 'react';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Sparkles, RefreshCw, AlertCircle, Link2, ExternalLink } from 'lucide-react';
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
  const [lastError, setLastError] = useState<string | null>(null);
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setLastError(null);

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

      if (response.error || response.data?.error) {
        const errorMsg = await extractEdgeFunctionError(response, 'Failed to register sub-agent. Please try again.');
        throw new Error(errorMsg);
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
    setLastError(null);
    onOpenChange(false);
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-warning/20">
            <Users className="h-6 w-6 text-warning" />
          </div>
          <div>
            <p className="font-bold text-warning">Quick Sub-Agent Registration</p>
            <p className="text-sm text-muted-foreground">Just name, phone & password — done in 30 seconds</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="py-1.5 rounded-lg bg-background/60">
            <p className="text-sm font-bold text-warning">💰 UGX 500</p>
            <p className="text-[10px] text-muted-foreground">you earn now</p>
          </div>
          <div className="py-1.5 rounded-lg bg-background/60">
            <p className="text-sm font-bold text-warning">📈 1%</p>
            <p className="text-[10px] text-muted-foreground">their earnings</p>
          </div>
          <div className="py-1.5 rounded-lg bg-background/60">
            <p className="text-sm font-bold text-warning">🤝 4%</p>
            <p className="text-[10px] text-muted-foreground">they earn</p>
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

      <Button type="submit" className="w-full h-14 text-base font-semibold rounded-xl bg-warning text-warning-foreground hover:bg-warning/90" disabled={isLoading}>
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
              onClick={() => handleSubmit()}
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

  const successContent = (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-orange-500/5 to-amber-500/10 border-orange-500/20">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🤝</span>
            <div>
              <p className="font-bold text-xl">{createdInvite?.fullName}</p>
              <p className="text-sm text-muted-foreground">Sub-Agent Account Created!</p>
            </div>
          </div>
          <div className="bg-background rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Temporary Password</p>
            <p className="font-mono font-bold text-xl tracking-wider">{createdInvite?.password}</p>
          </div>
        </CardContent>
      </Card>

      {/* Prominent Activation Link Section */}
      <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border-2 border-primary/30 shadow-glow">
        <div className="absolute -top-3 left-4 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center gap-1">
          <Link2 className="h-3 w-3" />
          SHARE THIS LINK
        </div>
        
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Send this link to <strong>{createdInvite?.fullName}</strong> to activate their account:
          </p>
          
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input 
                value={getShareLink()} 
                readOnly 
                className="h-14 text-sm rounded-xl pr-12 bg-background border-2 border-primary/20 font-medium" 
              />
              <ExternalLink className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Button 
              variant={copied ? "default" : "outline"} 
              size="icon" 
              onClick={handleCopyLink} 
              className={`h-14 w-14 shrink-0 rounded-xl transition-all ${copied ? 'bg-green-600 hover:bg-green-700 border-green-600' : 'border-2 border-primary/30 hover:bg-primary/10'}`}
            >
              {copied ? <Check className="h-6 w-6 text-white" /> : <Copy className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      <Button 
        onClick={handleShareWhatsApp} 
        className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 rounded-xl gap-2"
      >
        <Share2 className="h-5 w-5" />
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
