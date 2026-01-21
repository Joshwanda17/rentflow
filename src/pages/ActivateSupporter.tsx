import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, Eye, EyeOff, ArrowRight, AlertCircle, UserPlus } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { Skeleton } from '@/components/ui/skeleton';

type PageState = 'loading' | 'invalid' | 'activated-already' | 'ready' | 'success';

export default function ActivateSupporter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pageState, setPageState] = useState<PageState>('ready'); // Start ready for instant form display
  const [isValidating, setIsValidating] = useState(true); // Background validation
  const [activatedEmail, setActivatedEmail] = useState('');
  const [inviteDetails, setInviteDetails] = useState<{ full_name: string; role?: string } | null>(null);

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
          .select('full_name, status, role, email, activated_user_id')
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
          setInviteDetails({ full_name: data.full_name, role: data.role });
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
          <CardContent>
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
              <Skeleton className="h-4 w-48 mx-auto" />
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
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter the password you received"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  className="h-12 text-base"
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

            <Button type="submit" className="w-full h-12 text-base" disabled={isLoading || isValidating}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : (
                'Activate Account'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
