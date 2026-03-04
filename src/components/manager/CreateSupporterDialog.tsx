import { useState } from 'react';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface CreateSupporterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSupporterDialog({ open, onOpenChange }: CreateSupporterDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
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
  } | null>(null);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

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
        body: { ...formData, role: 'supporter' },
      });

      if (response.error || response.data?.error) {
        const errorMsg = await extractEdgeFunctionError(response, 'Failed to create supporter invite. Please try again.');
        throw new Error(errorMsg);
      }

      setCreatedInvite({
        token: response.data.invite.activation_token,
        fullName: response.data.invite.full_name,
        password: formData.password,
      });

      toast({
        title: '✅ Supporter Invite Created!',
        description: 'Share the activation link with the supporter.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create supporter invite',
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
    return `🎉 Welcome to Welile, ${createdInvite.fullName}!

You've been invited to become a Tenant Supporter and earn 15% monthly returns!

🔐 Your temporary password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Just click the link and enter your password to get started!`;
  };

  const handleShareWhatsApp = () => {
    const message = encodeURIComponent(getWhatsAppMessage());
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getShareLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied!' });
  };

  const handleClose = () => {
    setFormData({ email: '', fullName: '', phone: '', password: '' });
    setCreatedInvite(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {createdInvite ? 'Share Activation Link' : 'Create Supporter Account'}
          </DialogTitle>
          <DialogDescription>
            {createdInvite 
              ? 'Share this link with the supporter to activate their account'
              : 'Create a new supporter account and share the activation link'}
          </DialogDescription>
        </DialogHeader>

        {!createdInvite ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="Enter supporter's full name"
                value={formData.fullName}
                onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="supporter@example.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="0700000000"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Temporary Password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button type="button" variant="outline" onClick={generatePassword}>
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This password will be shared with the supporter
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Supporter Account
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Supporter</p>
                  <p className="font-medium">{createdInvite.fullName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Temporary Password</p>
                  <p className="font-mono font-medium">{createdInvite.password}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>Activation Link</Label>
              <div className="flex gap-2">
                <Input value={getShareLink()} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button 
              onClick={handleShareWhatsApp} 
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share on WhatsApp
            </Button>

            <Button variant="outline" onClick={handleClose} className="w-full">
              Create Another
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
