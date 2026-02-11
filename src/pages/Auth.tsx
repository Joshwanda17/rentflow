import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, LogIn, ArrowLeft, Mail, Lock, User, Phone, Sparkles, Loader2, Eye, EyeOff, MessageCircle, AlertCircle } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { getLocationData } from '@/hooks/useGeolocation';
import { generatePhoneEmailVariants, cleanPhoneNumber, isValidPhoneNumber, getTriedPhoneFormats } from '@/lib/phoneUtils';
import PasswordStrengthIndicator from '@/components/auth/PasswordStrengthIndicator';

// Inline validation for faster processing (no zod overhead)
const validateSignUp = (data: { password: string; confirmPassword: string; fullName: string; phone: string }) => {
  if (data.password.length < 6) return 'Password must be at least 6 characters';
  if (data.password !== data.confirmPassword) return "Passwords don't match";
  if (data.fullName.length < 2) return 'Full name is required';
  if (data.phone.replace(/\D/g, '').length < 9) return 'Please enter a valid phone number';
  return null;
};

const validateSignIn = (data: { phone: string; password: string }) => {
  if (data.phone.replace(/\D/g, '').length < 9) return 'Please enter a valid phone number';
  if (!data.password) return 'Password is required';
  return null;
};

export default function Auth() {
  const [searchParams] = useSearchParams();
  const referralId = searchParams.get('ref');
  const becomeRole = searchParams.get('become'); // e.g., 'agent' for sub-agent signup
  const preSelectedRole = searchParams.get('role'); // e.g., 'supporter' from calculator
  
  // Store referrer ID in state as fallback for iOS (localStorage can be unreliable on iOS Safari)
  const [referrerIdState, setReferrerIdState] = useState<string | null>(() => {
    // Initialize from URL param or localStorage
    if (referralId) return referralId;
    return localStorage.getItem('referral_agent_id');
  });
  
  const [isSignUp, setIsSignUp] = useState(!!referralId || !!becomeRole || !!preSelectedRole);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isForgotPhone, setIsForgotPhone] = useState(false);
  const [email, setEmail] = useState(''); // Used for forgot password/phone recovery
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<{ message: string; triedFormats: string[] } | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [rememberMe, setRememberMe] = useState(() => {
    // Default to true, check localStorage for saved preference
    const saved = localStorage.getItem('welile_remember_me');
    return saved !== 'false';
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  
  const { signUpWithoutRole, signIn, signInWithGoogle, resetPassword, user, roles } = useAuth();
  
  const { isDuplicate, isChecking: isCheckingDuplicate, duplicateMessage } = usePhoneDuplicateCheck(phone, 400);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // No PIN gate — users go straight to dashboard after auth

  useEffect(() => {
    if (referralId) {
      localStorage.setItem('referral_agent_id', referralId);
      setReferrerIdState(referralId);
    }
    if (becomeRole) {
      localStorage.setItem('become_role', becomeRole);
    }
    // Auto-assign supporter role from calculator page
    if (preSelectedRole) {
      localStorage.setItem('become_role', preSelectedRole);
    }
  }, [referralId, becomeRole, preSelectedRole]);

  useEffect(() => {
    if (user) {
      // Mark that user has had a session (for PIN entry on next visit)
      localStorage.setItem('welile_had_session', 'true');
      
      if (roles.length === 0) {
        navigate('/select-role');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, roles, navigate]);

  // Auto-focus first input for faster entry on mobile
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isSignUp) {
        // Focus will be on name field (first in signup)
      } else {
        phoneInputRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isSignUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isForgotPhone) {
        // Handle forgot phone - sign in with Google email
        const isValidEmail = email.includes('@') && email.includes('.');
        if (!isValidEmail) {
          toast({ title: 'Error', description: 'Please enter a valid email', variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        // Try to sign in with the email directly (for Google users)
        const { error } = await signIn(email, password);
        if (error) {
          let errorMessage = error.message;
          if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'No account found with this email, or the password is incorrect. If you signed in with Google, please use the "Continue with Google" button instead.';
          }
          toast({ title: 'Sign In Failed', description: errorMessage, variant: 'destructive' });
        }
      } else if (isForgotPassword) {
        const isValidEmail = email.includes('@') && email.includes('.');
        if (!isValidEmail) {
          toast({ title: 'Error', description: 'Please enter a valid email', variant: 'destructive' });
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
        // Check for duplicate phone before attempting signup
        if (isDuplicate) {
          toast({ title: 'Phone Already Registered', description: duplicateMessage || 'This phone number is already in use.', variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        // Use inline validation for faster response
        const validationError = validateSignUp({ password, confirmPassword, fullName, phone });
        if (validationError) {
          toast({ title: 'Error', description: validationError, variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        // Generate email from phone number
        const cleanPhone = phone.replace(/\D/g, '');
        const generatedEmail = `${cleanPhone}@welile.user`;

        // Use state-based referrer first (more reliable on iOS), fallback to localStorage
        const storedReferrerId = referrerIdState || localStorage.getItem('referral_agent_id');
        console.log('[Auth] Signup with referrer:', storedReferrerId, '(state:', referrerIdState, ', localStorage:', localStorage.getItem('referral_agent_id'), ')');
        
        const { error } = await signUpWithoutRole(generatedEmail, password, fullName, phone, storedReferrerId || undefined);
        // DON'T clear referrer here - SelectRole needs it after the user session activates
        // It will be cleared in SelectRole after the referral records are created
        if (error) {
          // Translate common errors
          let errorMessage = error.message;
          if (error.message.includes('already registered')) {
            errorMessage = 'This phone number is already registered. Please sign in instead.';
          }
          toast({ title: 'Sign Up Failed', description: errorMessage, variant: 'destructive' });
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
        const cleanedPhone = cleanPhoneNumber(phone);
        
        if (!isValidPhoneNumber(phone)) {
          toast({ 
            title: 'Invalid Phone Number', 
            description: 'Please enter a valid phone number (e.g., 0700123456 or 256700123456)', 
            variant: 'destructive' 
          });
          setIsLoading(false);
          return;
        }

        // Use inline validation for faster response
        const validationError = validateSignIn({ phone: cleanedPhone, password });
        if (validationError) {
          toast({ title: 'Error', description: validationError, variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        // Helper: race a promise against a timeout — generous for slow mobile networks
        const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
          Promise.race([
            promise,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), ms)),
          ]);

        const phoneLocal9 = cleanedPhone.slice(-9);
        
        // Build email variants (no network, fast) — cap to 3 most likely
        const emailVariants = generatePhoneEmailVariants(phone).slice(0, 3);
        
        // Fast profile lookup — 15s timeout for slow networks
        try {
          const phoneFormats = [`0${phoneLocal9}`, `256${phoneLocal9}`];
          const profileResult = await withTimeout(
            Promise.resolve(
              supabase
                .from('profiles')
                .select('email, phone')
                .in('phone', phoneFormats)
                .limit(3)
            ),
            15000
          );
          const profileMatch = profileResult.data;
          
          if (profileMatch) {
            for (const p of profileMatch) {
              if (p.email && !p.email.includes('@welile.') && !emailVariants.includes(p.email)) {
                emailVariants.unshift(p.email);
              }
            }
          }
        } catch {
          // Lookup failed/timed out — continue with generated variants
        }

        let loginSuccess = false;
        let lastError: Error | null = null;
        let usedRealEmail = false;

        // Try all email variants in PARALLEL instead of sequentially — 30s timeout
        try {
          const results = await withTimeout(
            Promise.all(
              emailVariants.map(async (emailVariant) => {
                try {
                  const { error } = await signIn(emailVariant, password);
                  return { emailVariant, error };
                } catch (e: any) {
                  return { emailVariant, error: e as Error };
                }
              })
            ),
            30000
          );

          for (const result of results) {
            if (!result.error) {
              loginSuccess = true;
              usedRealEmail = !result.emailVariant.includes('@welile.');
              break;
            }
            lastError = result.error;
          }
        } catch (timeoutErr: any) {
          lastError = timeoutErr;
        }

        if (!loginSuccess && lastError) {
          // Get the formats we tried for helpful display
          const triedFormats = getTriedPhoneFormats(phone);
          
          // Increment failed attempts counter
          setFailedAttempts(prev => prev + 1);
          
          // Provide helpful error message
          let errorMessage = lastError.message;
          if (lastError.message.includes('Invalid login credentials')) {
            // Reuse exact-match lookup instead of ILIKE full-table scan
            try {
              const phoneFormats2 = [`0${phoneLocal9}`, `256${phoneLocal9}`];
              const { data: existingProfile } = await withTimeout(
                Promise.resolve(supabase.from('profiles').select('email').in('phone', phoneFormats2).limit(1)),
                15000
              );
              
              if (existingProfile && existingProfile.length > 0 && existingProfile[0].email) {
                const profileEmail = existingProfile[0].email;
                if (!profileEmail.includes('@welile.')) {
                  errorMessage = `This phone number is linked to an account that uses email login (${profileEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}). Please use "Continue with Google" or sign in with your email address.`;
                } else {
                  errorMessage = 'Incorrect password. Please check your password and try again.';
                }
              } else {
                errorMessage = 'No account found with this phone number. Please sign up first.';
              }
            } catch {
              errorMessage = 'Sign in failed. Please check your connection and try again.';
            }
          } else if (lastError.message.includes('rate')) {
            errorMessage = 'Too many login attempts. Please wait a moment and try again.';
          }
          
          setLoginError({ message: errorMessage, triedFormats });
          toast({ 
            title: 'Sign In Failed', 
            description: errorMessage, 
            variant: 'destructive' 
          });
        } else if (loginSuccess) {
          setLoginError(null);
          setFailedAttempts(0); // Reset failed attempts on success
          // If "Remember me" is unchecked, set up session cleanup on browser close
          if (!rememberMe) {
            sessionStorage.setItem('welile_session_only', 'true');
          } else {
            sessionStorage.removeItem('welile_session_only');
          }
          
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
    <>
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

        {(referralId || becomeRole) && (
          <div className={`mb-4 p-4 rounded-xl ${becomeRole === 'agent' ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-success/10 border border-success/20'}`}>
            <div className={`flex items-center justify-center gap-2 ${becomeRole === 'agent' ? 'text-orange-600' : 'text-success'}`}>
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">
                {becomeRole === 'agent' ? 'Become a Sub-Agent' : 'Referred by an Agent'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              {becomeRole === 'agent' 
                ? 'Sign up to start earning as an agent!' 
                : 'Sign up to get started with rent facilitation'}
            </p>
          </div>
        )}

        <Card className="border-border/50 shadow-lg overflow-hidden">
          {/* Quick Google Sign-In - Most prominent for easy login */}
          {!isForgotPassword && !isForgotPhone && !isSignUp && (
            <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border/30">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-3 h-14 text-base bg-white hover:bg-gray-50 border-2 shadow-sm touch-manipulation active:scale-[0.98] transition-all"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                style={{ 
                  fontSize: '16px',
                  WebkitTapHighlightColor: 'transparent',
                }}
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
                <span className="font-medium">Continue with Google</span>
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-2">Fastest way to sign in</p>
            </div>
          )}

          {/* Login/Signup Toggle */}
          {!isForgotPassword && !isForgotPhone && (
            <div className="flex border-b border-border/50">
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className={`flex-1 py-4 px-4 text-base font-medium transition-all touch-manipulation ${
                  !isSignUp 
                    ? 'bg-primary/10 text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent', minHeight: '56px' }}
              >
                <div className="flex items-center justify-center gap-2">
                  <LogIn className="h-5 w-5" />
                  Sign In
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className={`flex-1 py-4 px-4 text-base font-medium transition-all touch-manipulation ${
                  isSignUp 
                    ? 'bg-primary/10 text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent', minHeight: '56px' }}
              >
                <div className="flex items-center justify-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Sign Up
                </div>
              </button>
            </div>
          )}
          
          <CardHeader className={!isForgotPassword && !isForgotPhone ? 'pt-4 pb-2' : ''}>
            <CardTitle className="flex items-center gap-2 text-xl">
              {isForgotPassword ? 'Reset Password' : isForgotPhone ? 'Sign In with Email' : isSignUp ? 'Create Account' : 'Sign in with Phone'}
            </CardTitle>
            <CardDescription className="text-sm">
              {isForgotPassword 
                ? 'Enter your email to receive a reset link'
                : isForgotPhone
                  ? 'Enter the email you used with Google sign-in'
                  : isSignUp 
                    ? 'Join Welile to get started' 
                    : 'Enter your phone number and password'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && !isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="pl-11 h-14 text-base rounded-xl"
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                </div>
              )}

              {!isForgotPassword && !isForgotPhone && (
              <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      ref={phoneInputRef}
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setLoginError(null);
                      }}
                      placeholder="0700123456"
                      className={`pl-11 h-14 text-base rounded-xl ${loginError || (isSignUp && isDuplicate) ? 'border-destructive focus:ring-destructive' : ''}`}
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                  {isSignUp && isDuplicate && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {duplicateMessage}
                    </p>
                  )}
                  {isSignUp && isCheckingDuplicate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking...
                    </p>
                  )}
                  
                  {/* Simplified error display */}
                  {!isSignUp && loginError && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive">{loginError.message}</p>
                    </div>
                  )}

                  {/* Quick support after failed attempts */}
                  {!isSignUp && failedAttempts >= 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full gap-2 text-primary"
                      onClick={() => {
                        const message = encodeURIComponent(
                          `Hello Welile Support,\n\nI'm having trouble logging into my account.\n\nPhone: ${phone}\n\nPlease help me access my account.`
                        );
                        window.open(`https://wa.me/256783673998?text=${message}`, '_blank');
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Need help? Contact Support
                    </Button>
                  )}
                </div>
              )}

              {(isForgotPassword || isForgotPhone) && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-11 h-14 text-base rounded-xl"
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Password field - show for sign in, sign up, forgot phone (email login) but NOT for forgot password */}
              {!isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      ref={passwordInputRef}
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-11 pr-12 h-14 text-base rounded-xl"
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation p-2"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {isSignUp && <PasswordStrengthIndicator password={password} />}
                </div>
              )}

              {/* Confirm Password for signup */}
              {isSignUp && !isForgotPassword && !isForgotPhone && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`pl-11 pr-12 h-14 text-base rounded-xl ${confirmPassword && password !== confirmPassword ? 'border-destructive' : confirmPassword && password === confirmPassword ? 'border-emerald-500' : ''}`}
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation p-2"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords don't match</p>
                  )}
                </div>
              )}
              
              {/* Back button for forgot flows */}
              {(isForgotPassword || isForgotPhone) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setIsForgotPhone(false);
                    setEmail('');
                  }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors touch-manipulation"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to sign in
                </button>
              )}

              {/* Remember me & Forgot password - simplified */}
              {!isSignUp && !isForgotPassword && !isForgotPhone && (
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="remember" 
                      checked={rememberMe}
                      onCheckedChange={(checked) => {
                        setRememberMe(!!checked);
                        localStorage.setItem('welile_remember_me', String(!!checked));
                      }}
                      className="h-5 w-5"
                    />
                    <Label htmlFor="remember" className="text-sm cursor-pointer">
                      Remember me
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full gap-2 h-14 text-base rounded-xl touch-manipulation active:scale-[0.98] transition-transform font-medium" 
                disabled={isLoading || (isSignUp && (isDuplicate || isCheckingDuplicate))}
                style={{ 
                  fontSize: '16px',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {isForgotPassword ? <Mail className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                    {isForgotPassword ? 'Send Reset Link' : isForgotPhone ? 'Sign In' : isSignUp ? 'Create Account' : 'Sign In'}
                  </>
                )}
              </Button>
            </form>

            {/* Google button for signup (already shown for login at top) */}
            {isSignUp && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-3 h-14 text-base rounded-xl touch-manipulation active:scale-[0.98]"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading || isLoading}
                  style={{ fontSize: '16px' }}
                >
                  {isGoogleLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
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
              </>
            )}

            {/* Forgot phone - simplified */}
            {!isSignUp && !isForgotPassword && !isForgotPhone && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setIsForgotPhone(true)}
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  Can't access with phone? Try email
                </button>
              </div>
            )}
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
    </>
  );
}