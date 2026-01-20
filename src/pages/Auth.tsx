import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, LogIn, ArrowLeft, Mail, Lock, User, Phone, Sparkles } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import { useCurrency } from '@/hooks/useCurrency';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { getLocationData } from '@/hooks/useGeolocation';

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
});

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required')
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const referralId = searchParams.get('ref');
  
  const [isSignUp, setIsSignUp] = useState(!!referralId);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { signUpWithoutRole, signIn, signInWithGoogle, resetPassword, user, roles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (referralId) {
      localStorage.setItem('referral_agent_id', referralId);
    }
  }, [referralId]);

  useEffect(() => {
    if (user) {
      if (roles.length === 0) {
        navigate('/select-role');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, roles, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isForgotPassword) {
        const emailValidation = z.string().email('Please enter a valid email').safeParse(email);
        if (!emailValidation.success) {
          toast({ title: 'Error', description: emailValidation.error.errors[0].message, variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        const { error } = await resetPassword(email);
        if (error) {
          toast({ title: 'Reset Failed', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Check Your Email', description: 'We sent you a password reset link' });
          setIsForgotPassword(false);
        }
      } else if (isSignUp) {
        const validation = signUpSchema.safeParse({ email, password, fullName, phone });
        if (!validation.success) {
          toast({ title: 'Error', description: validation.error.errors[0].message, variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        const storedReferrerId = localStorage.getItem('referral_agent_id');
        const { error } = await signUpWithoutRole(email, password, fullName, phone, storedReferrerId || undefined);
        if (!error) localStorage.removeItem('referral_agent_id');
        if (error) {
          toast({ title: 'Sign Up Failed', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Account Created!', description: 'Welcome to Welile' });
          
          // Get and save user location in the background
          getLocationData().then(async (locationData) => {
            if (locationData.country || locationData.city) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase
                  .from('profiles')
                  .update({
                    country: locationData.country,
                    city: locationData.city,
                    country_code: locationData.countryCode
                  })
                  .eq('id', user.id);
              }
            }
          }).catch(console.error);
        }
      } else {
        const validation = signInSchema.safeParse({ email, password });
        if (!validation.success) {
          toast({ title: 'Error', description: validation.error.errors[0].message, variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        const { error } = await signIn(email, password);
        if (error) {
          toast({ title: 'Sign In Failed', description: error.message, variant: 'destructive' });
        } else {
          // Update location on sign in (in background)
          getLocationData().then(async (locationData) => {
            if (locationData.country || locationData.city) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase
                  .from('profiles')
                  .update({
                    country: locationData.country,
                    city: locationData.city,
                    country_code: locationData.countryCode
                  })
                  .eq('id', user.id);
              }
            }
          }).catch(console.error);
        }
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast({ title: 'Google Sign In Failed', description: error.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to sign in with Google', variant: 'destructive' });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>

        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <WelileLogo linkToHome={false} />
          </div>
          <p className="text-muted-foreground">Rent Facilitation Platform</p>
          
          {/* Currency Selector */}
          <div className="flex items-center justify-center mt-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/50 border border-border/50">
              <span className="text-xs text-muted-foreground">Currency:</span>
              <CurrencySwitcher variant="compact" />
            </div>
          </div>
        </div>

        {referralId && (
          <div className="mb-4 p-4 rounded-xl bg-success/10 border border-success/20">
            <div className="flex items-center justify-center gap-2 text-success">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Referred by an Agent</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              Sign up to get started with rent facilitation
            </p>
          </div>
        )}

        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                {isForgotPassword ? <Mail className="h-5 w-5 text-primary" /> : isSignUp ? <UserPlus className="h-5 w-5 text-primary" /> : <LogIn className="h-5 w-5 text-primary" />}
              </div>
              {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription>
              {isForgotPassword 
                ? 'Enter your email to receive a reset link'
                : isSignUp 
                  ? 'Join Welile Platform to get started' 
                  : 'Sign in to continue to your dashboard'}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && !isForgotPassword && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your full name"
                        className="pl-10 h-12 text-base"
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g., 0700123456"
                        className="pl-10 h-12 text-base"
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-10 h-12 text-base"
                    style={{ fontSize: '16px' }}
                    required
                  />
                </div>
              </div>

              {!isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 h-12 text-base"
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                </div>
              )}

              {!isSignUp && !isForgotPassword && (
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot your password?
                </button>
              )}

              <Button 
                type="submit" 
                className="w-full gap-2 h-12 text-base touch-manipulation active:scale-[0.98] transition-transform" 
                disabled={isLoading}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    {isForgotPassword ? <Mail className="h-5 w-5" /> : isSignUp ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                    {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'}
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-3 h-12 text-base touch-manipulation active:scale-[0.98] transition-transform"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {isGoogleLoading ? (
                <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </Button>

            <div className="mt-6 text-center text-sm">
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(false)}
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Back to Sign In
                </button>
              ) : (
                <>
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-primary hover:text-primary/80 font-medium transition-colors touch-manipulation py-2 px-1"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="text-primary hover:underline">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}