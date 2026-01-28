import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, Eye, EyeOff, ArrowRight, AlertCircle, UserPlus, KeyRound, Copy, MessageCircle } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';

type PageState = 'loading' | 'invalid' | 'activated-already' | 'ready' | 'success' | 'forgot-password' | 'password-reset';

export default function ActivateSupporter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get('token');
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pageState, setPageState] = useState<PageState>('ready'); // Start ready for instant form display
  const [isValidating, setIsValidating] = useState(true); // Background validation
  const [activatedEmail, setActivatedEmail] = useState('');
  const [inviteDetails, setInviteDetails] = useState<{ full_name: string; role?: string; phone?: string } | null>(null);

  // Auto-focus password input when ready
  useEffect(() => {
    if (pageState === 'ready' && passwordInputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    }
  }, [pageState]);
  
  // Forgot password state
  const [emailForReset, setEmailForReset] = useState('');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [copied, setCopied] = useState(false);

  // Validate invite in background while showing form immediately
  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      setIsValidating(false);
      return;
    }

    // Fetch invite details in background
    const fetchInvite = async () => {
      try {
        const { data, error } = await supabase
          .from('supporter_invites')
          .select('full_name, status, role, email, phone, activated_user_id')
          .eq('activation_token', token)
          .maybeSingle();

        if (error || !data) {
          setPageState('invalid');
          setIsValidating(false);
          return;
        }

        // Detect duplicate - already activated
        if (data.status === 'activated' || data.activated_user_id) {
          setPageState('activated-already');
          setActivatedEmail(data.email);
        } else {
          setInviteDetails({ full_name: data.full_name, role: data.role, phone: data.phone });
          setEmailForReset(data.email);
          setResetPhone(data.phone || '');
          setPageState('ready');
        }
      } catch {
        setPageState('invalid');
      } finally {
        setIsValidating(false);
      }
    };

    fetchInvite();
  }, [token]);

  const handleActivate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;

    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('activate-supporter', {
        body: { token: token.trim(), password: password.trim() },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Activation failed');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const email = response.data.email;
      setActivatedEmail(email);

      toast({
        title: response.data?.alreadyActivated ? '✅ Already Activated' : '🎉 Account Activated!',
        description: 'Signing you in...',
      });

      // Auto sign-in and redirect to dashboard
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: password.trim(),
      });

      if (signInError) {
        // If auto-login fails, show success state with manual login button
        setPageState('success');
        toast({
          title: 'Account Activated',
          description: 'Please click the button to go to your dashboard.',
        });
      } else {
        // Successfully signed in - redirect to dashboard
        toast({
          title: '🎉 Welcome to Welile!',
          description: 'Redirecting to your dashboard...',
        });
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast({
        title: 'Activation Failed',
        description: error.message || 'Please check your password and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, password, toast, navigate]);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: activatedEmail,
        password,
      });

      if (error) throw error;

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message || 'Please try logging in manually.',
        variant: 'destructive',
      });
      navigate('/auth');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate new temporary password
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleResetPassword = async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      const newPassword = generatePassword();
      
      // Update the invite with new password
      const { error } = await supabase
        .from('supporter_invites')
        .update({ temp_password: newPassword })
        .eq('activation_token', token)
        .eq('status', 'pending');
      
      if (error) throw error;
      
      // Notify managers about the password reset request
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .eq('enabled', true);
      
      if (managers && managers.length > 0) {
        const notifications = managers.map(m => ({
          user_id: m.user_id,
          title: '🔑 Password Reset Request',
          message: `${inviteDetails?.full_name || 'A user'} (${emailForReset}) requested a new activation password.`,
          type: 'info',
          metadata: { 
            email: emailForReset, 
            phone: resetPhone,
            full_name: inviteDetails?.full_name,
            role: inviteDetails?.role
          }
        }));
        
        await supabase.from('notifications').insert(notifications);
      }
      
      setNewTempPassword(newPassword);
      setPageState('password-reset');
      
      toast({
        title: '🔑 New Password Generated',
        description: 'Opening WhatsApp...',
      });

      // Auto-open WhatsApp with the new password
      if (resetPhone) {
        const phone = resetPhone.replace(/\D/g, '');
        const message = encodeURIComponent(
          `🔑 Your new Welile password: ${newPassword}\n\nUse this to activate your account.`
        );
        setTimeout(() => {
          window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
        }, 500);
      }
    } catch (error: any) {
      toast({
        title: 'Reset Failed',
        description: error.message || 'Could not reset password. Please contact support.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(newTempPassword);
      setCopied(true);
      toast({ title: 'Password copied!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleShareWhatsApp = () => {
    const phone = resetPhone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `🔑 Your new Welile password: ${newTempPassword}\n\nUse this to activate your account.`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  const handleBackToActivation = () => {
    setPassword(newTempPassword);
    setPageState('ready');
  };

  // Invalid token state
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-destructive/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <WelileLogo linkToHome={false} />
            </div>
            <div className="mx-auto p-3 rounded-full bg-destructive/10 w-fit mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Invalid Invitation</CardTitle>
            <CardDescription>
              This activation link is invalid or has expired. Please contact the person who invited you for a new link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link to="/auth" className="block">
              <Button className="w-full gap-2">
                <ArrowRight className="h-4 w-4" />
                Go to Sign In
              </Button>
            </Link>
            <Link to="/become-supporter" className="block">
              <Button variant="outline" className="w-full gap-2">
                <UserPlus className="h-4 w-4" />
                Become a Supporter
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already activated state
  if (pageState === 'activated-already') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <WelileLogo linkToHome={false} />
            </div>
            <div className="mx-auto p-3 rounded-full bg-success/10 w-fit mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-2xl">Already Activated</CardTitle>
            <CardDescription>
              This account has already been activated. Please sign in to access your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activatedEmail && (
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-xs text-muted-foreground mb-1">Sign in with</p>
                <p className="font-medium text-sm break-all">{activatedEmail}</p>
              </div>
            )}
            <Link to="/auth" className="block">
              <Button className="w-full gap-2">
                <ArrowRight className="h-4 w-4" />
                Sign In Now
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (pageState === 'success') {
    const roleLabel = inviteDetails?.role ? inviteDetails.role.charAt(0).toUpperCase() + inviteDetails.role.slice(1) : 'User';
    return (
      <div className="min-h-screen bg-gradient-to-b from-success/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <WelileLogo linkToHome={false} />
            </div>
            <div className="mx-auto p-4 rounded-full bg-success/10 w-fit mb-4">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <CardTitle className="text-2xl">Account Activated!</CardTitle>
            <CardDescription>
              Welcome to Welile! Your {roleLabel} account is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Click below to access your dashboard and get started.
            </p>
            <Button onClick={handleLogin} className="w-full gap-2" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Forgot password state
  if (pageState === 'forgot-password') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-warning/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <WelileLogo linkToHome={false} />
            </div>
            <div className="mx-auto p-3 rounded-full bg-warning/10 w-fit mb-4">
              <KeyRound className="h-8 w-8 text-warning" />
            </div>
            <CardTitle className="text-2xl">Lost Your Password?</CardTitle>
            <CardDescription>
              No worries! We can generate a new password for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-muted text-center">
              <p className="text-xs text-muted-foreground mb-1">Account for</p>
              <p className="font-medium text-sm">{inviteDetails?.full_name}</p>
              {emailForReset && (
                <p className="text-xs text-muted-foreground">{emailForReset}</p>
              )}
            </div>
            
            <Button 
              onClick={handleResetPassword} 
              className="w-full h-12 gap-2" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  Generate New Password
                </>
              )}
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full" 
              onClick={() => setPageState('ready')}
            >
              Back to Activation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password reset success state
  if (pageState === 'password-reset') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-success/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <WelileLogo linkToHome={false} />
            </div>
            <div className="mx-auto p-3 rounded-full bg-success/10 w-fit mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-2xl">New Password Ready!</CardTitle>
            <CardDescription>
              Use this password to activate your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* New Password Display */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground mb-2 text-center">Your new password</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-2xl font-mono font-bold tracking-wider text-primary">
                  {newTempPassword}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyPassword}
                  className="h-8 w-8"
                >
                  <Copy className={`h-4 w-4 ${copied ? 'text-success' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            {resetPhone && (
              <div className="space-y-1">
                <Button 
                  className="w-full h-12 gap-2"
                  onClick={handleShareWhatsApp}
                >
                  <MessageCircle className="h-4 w-4" />
                  Resend to WhatsApp
                </Button>
                <p className="text-[10px] text-center text-muted-foreground">
                  Tap here if WhatsApp didn't open automatically
                </p>
              </div>
            )}

            <Button 
              variant="outline"
              onClick={handleBackToActivation} 
              className="w-full gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              Continue to Activate
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Save this password somewhere safe before continuing.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ready state - show activation form immediately (no loading spinner)
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <WelileLogo linkToHome={false} />
          </div>
          <CardTitle className="text-2xl">Activate Your Account</CardTitle>
          <CardDescription>
            {isValidating ? (
              <span className="inline-block h-4 w-48 bg-muted/50 rounded animate-pulse" />
            ) : (
              <>Welcome {inviteDetails?.full_name || 'there'}! Enter your password to activate.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleActivate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  ref={passwordInputRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  inputMode="text"
                  autoComplete="current-password"
                  placeholder="Enter the password you received"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={1}
                  className="h-12 text-base"
                  style={{ fontSize: '16px' }}
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
              <p className="text-xs text-muted-foreground">
                Use the password shared with you
              </p>
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={isLoading || !password.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Activate Account
                </>
              )}
            </Button>

            {/* Forgot Password Link */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setPageState('forgot-password')}
                className="text-sm text-primary hover:underline"
              >
                Lost your password?
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
