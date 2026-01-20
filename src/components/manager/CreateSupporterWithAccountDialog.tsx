import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Wallet, Sparkles, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CreateSupporterWithAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const COLORS = [
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

const APP_URL = 'https://welile2.lovable.app';

type Step = 'form' | 'share';

export function CreateSupporterWithAccountDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: CreateSupporterWithAccountDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountColor, setAccountColor] = useState('blue');
  const [initialAmount, setInitialAmount] = useState('');

  // Created data
  const [createdData, setCreatedData] = useState<{
    token: string;
    fullName: string;
    password: string;
    accountName: string;
    phone: string;
  } | null>(null);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !phone || !password || !accountName) return;

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // Step 1: Create the supporter invite
      const response = await supabase.functions.invoke('create-supporter-invite', {
        body: { email, fullName, phone, password, role: 'supporter' },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create invite');
      }

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      const inviteToken = response.data.invite.activation_token;

      // Step 2: Create the investment account (pending_activation)
      // We need to wait for user creation, so we store account details in the invite metadata
      // For now, create a placeholder that will be linked after activation
      
      // Store account details in localStorage temporarily (will be retrieved during activation)
      const pendingAccountData = {
        token: inviteToken,
        accountName,
        accountColor,
        initialAmount: initialAmount ? parseFloat(initialAmount) : 0,
        createdBy: session.user.id
      };
      
      // Store pending account info
      const { error: storageError } = await supabase
        .from('notifications')
        .insert({
          user_id: session.user.id,
          title: '📋 Pending Investment Setup',
          message: `Investment account "${accountName}" pending for ${fullName}. Will be created after activation.`,
          type: 'info',
          metadata: {
            type: 'pending_investment_account',
            invite_token: inviteToken,
            account_name: accountName,
            account_color: accountColor,
            initial_amount: initialAmount ? parseFloat(initialAmount) : 0,
            supporter_name: fullName,
            supporter_email: email,
            supporter_phone: phone
          }
        });

      setCreatedData({
        token: inviteToken,
        fullName,
        password,
        accountName,
        phone
      });

      setStep('share');
      toast({
        title: '✅ Supporter Account Created!',
        description: 'Share the activation link to complete setup.',
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create supporter',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getShareLink = () => {
    if (!createdData) return '';
    return `${APP_URL}/join?t=${createdData.token}`;
  };

  const getWhatsAppMessage = () => {
    if (!createdData) return '';
    return `🎉 Welcome to Welile, ${createdData.fullName}!

You've been invited to become a Tenant Supporter and earn 15% monthly returns!

📊 Investment Account: "${createdData.accountName}" is ready for you!

🔐 Your temporary password: ${createdData.password}

👉 Activate your account here:
${getShareLink()}

Just click the link and enter your password to get started!`;
  };

  const handleShareWhatsApp = () => {
    if (!createdData) return;
    
    let formattedPhone = createdData.phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '256' + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith('256')) {
      formattedPhone = '256' + formattedPhone;
    }
    
    const message = encodeURIComponent(getWhatsAppMessage());
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getShareLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied!' });
  };

  const handleClose = () => {
    setEmail('');
    setFullName('');
    setPhone('');
    setPassword('');
    setAccountName('');
    setAccountColor('blue');
    setInitialAmount('');
    setCreatedData(null);
    setStep('form');
    setCopied(false);
    onOpenChange(false);
  };

  // Stable form input props
  const emailInputProps = {
    id: 'email',
    type: 'email' as const,
    placeholder: 'supporter@example.com',
    value: email,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    required: true
  };

  const fullNameInputProps = {
    id: 'fullName',
    placeholder: "Enter supporter's full name",
    value: fullName,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value),
    required: true
  };

  const phoneInputProps = {
    id: 'phone',
    placeholder: '0700000000',
    value: phone,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value),
    required: true
  };

  const passwordInputProps = {
    id: 'password',
    type: showPassword ? 'text' as const : 'password' as const,
    placeholder: 'Create a password',
    value: password,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
    required: true,
    minLength: 6
  };

  const accountNameInputProps = {
    id: 'accountName',
    placeholder: 'e.g., Main Investment',
    value: accountName,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAccountName(e.target.value),
    required: true
  };

  const initialAmountInputProps = {
    id: 'initialAmount',
    type: 'number' as const,
    placeholder: 'e.g., 500000',
    value: initialAmount,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInitialAmount(e.target.value),
    min: '0'
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {step === 'share' ? 'Share Activation Link' : 'Create New Supporter'}
          </DialogTitle>
          <DialogDescription>
            {step === 'share' 
              ? 'Share this link with the supporter to activate their account'
              : 'Create a supporter account with an investment account for someone who is not yet a user'}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 pb-4">
                {/* Personal Details Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Personal Details
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input {...fullNameInputProps} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input {...emailInputProps} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input {...phoneInputProps} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Temporary Password</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input {...passwordInputProps} />
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
                  </div>
                </div>

                {/* Investment Account Section */}
                <div className="space-y-3 pt-3 border-t">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Investment Account
                  </h4>

                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input {...accountNameInputProps} />
                  </div>

                  <div className="space-y-2">
                    <Label>Account Color</Label>
                    <RadioGroup value={accountColor} onValueChange={setAccountColor} className="flex gap-3">
                      {COLORS.map((c) => (
                        <div key={c.id} className="flex items-center">
                          <RadioGroupItem value={c.id} id={`new-color-${c.id}`} className="sr-only" />
                          <Label
                            htmlFor={`new-color-${c.id}`}
                            className={`w-8 h-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background transition-all ${c.class} ${
                              accountColor === c.id ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/50'
                            }`}
                          />
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="initialAmount">Initial Amount (Optional)</Label>
                    <Input {...initialAmountInputProps} />
                    <p className="text-xs text-muted-foreground">
                      This amount will be added after the supporter activates their account
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Create & Share
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-4">
            <Card className="bg-success/5 border-success/30">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/20">
                    <Check className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium">{createdData?.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      Account: {createdData?.accountName}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Temporary Password</p>
                  <p className="font-mono font-medium">{createdData?.password}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>Activation Link</Label>
              <div className="flex gap-2">
                <Input value={getShareLink()} readOnly className="text-xs bg-secondary/50" />
                <Button variant="outline" size="icon" onClick={handleCopyLink}>
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button 
              onClick={handleShareWhatsApp} 
              className="w-full bg-[#25D366] hover:bg-[#128C7E] gap-2"
              size="lg"
            >
              <MessageCircle className="h-5 w-5" />
              Share on WhatsApp
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              The account and investment will be created when they click the link
            </p>

            <Button variant="outline" onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
