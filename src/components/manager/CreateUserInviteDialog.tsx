import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Briefcase, Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface CreateUserInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UserRole = 'tenant' | 'agent' | 'supporter' | 'landlord';

const roleConfig: Record<UserRole, { label: string; icon: React.ElementType; description: string; color: string }> = {
  tenant: {
    label: 'Tenant',
    icon: Users,
    description: 'Rent payer who can request rent assistance',
    color: 'text-blue-500',
  },
  landlord: {
    label: 'Landlord',
    icon: Briefcase,
    description: 'Property owner who receives rent payments',
    color: 'text-emerald-500',
  },
  agent: {
    label: 'Agent',
    icon: Briefcase,
    description: 'Field agent who registers tenants & manages deposits',
    color: 'text-amber-500',
  },
  supporter: {
    label: 'Supporter',
    icon: Heart,
    description: 'Investor who funds rent requests & earns returns',
    color: 'text-rose-500',
  },
};

export function CreateUserInviteDialog({ open, onOpenChange }: CreateUserInviteDialogProps) {
  const { toast } = useToast();
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
        body: { ...formData, role: selectedRole },
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
        role: selectedRole,
      });

      toast({
        title: `✅ ${roleConfig[selectedRole].label} Invite Created!`,
        description: 'Share the activation link with the user.',
      });
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

  const getRoleEmoji = (role: UserRole) => {
    switch (role) {
      case 'tenant': return '🏠';
      case 'landlord': return '🏢';
      case 'agent': return '💼';
      case 'supporter': return '💰';
    }
  };

  const getWhatsAppMessage = () => {
    if (!createdInvite) return '';
    const roleEmoji = getRoleEmoji(createdInvite.role);
    const roleLabel = roleConfig[createdInvite.role].label;
    
    return `${roleEmoji} Welcome to Welile, ${createdInvite.fullName}!

You've been invited to join as a ${roleLabel}!

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
    setSelectedRole('supporter');
    onOpenChange(false);
  };

  const RoleIcon = roleConfig[selectedRole].icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {createdInvite ? 'Share Activation Link' : 'Create User Account'}
          </DialogTitle>
          <DialogDescription>
            {createdInvite 
              ? `Share this link with the ${roleConfig[createdInvite.role].label.toLowerCase()} to activate their account`
              : 'Create a new user account and share the activation link'}
          </DialogDescription>
        </DialogHeader>

        {!createdInvite ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Select Role</Label>
              <ToggleGroup 
                type="single" 
                value={selectedRole} 
                onValueChange={(v) => v && setSelectedRole(v as UserRole)}
                className="justify-start"
              >
                {(Object.keys(roleConfig) as UserRole[]).map((role) => {
                  const config = roleConfig[role];
                  const Icon = config.icon;
                  return (
                    <ToggleGroupItem 
                      key={role} 
                      value={role}
                      className="flex-1 flex-col h-auto py-3 gap-1 data-[state=on]:bg-primary/10 data-[state=on]:border-primary"
                    >
                      <Icon className={`h-5 w-5 ${config.color}`} />
                      <span className="text-xs font-medium">{config.label}</span>
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{roleConfig[selectedRole].description}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="Enter user's full name"
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
                placeholder="user@example.com"
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
                This password will be shared with the user
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
                  <RoleIcon className={`h-4 w-4 mr-2 ${roleConfig[selectedRole].color}`} />
                  Create {roleConfig[selectedRole].label} Account
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getRoleEmoji(createdInvite.role)}</span>
                  <div>
                    <p className="font-medium">{createdInvite.fullName}</p>
                    <p className="text-sm text-muted-foreground">{roleConfig[createdInvite.role].label}</p>
                  </div>
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
