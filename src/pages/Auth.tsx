import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePinAuth } from '@/hooks/usePinAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, LogIn, ArrowLeft, Mail, Lock, User, Phone, Sparkles, Loader2, Eye, EyeOff, MessageCircle, HelpCircle } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { getLocationData } from '@/hooks/useGeolocation';
import PinEntry from '@/components/auth/PinEntry';
import PinSetupDialog from '@/components/auth/PinSetupDialog';
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
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  
  const { signUpWithoutRole, signIn, signInWithGoogle, resetPassword, user, roles, session } = useAuth();
  const { isPinEnabled } = usePinAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Check if we should show PIN entry on page load
  useEffect(() => {
    // Check if there's a previous session indicator and PIN is enabled
    const hadPreviousSession = localStorage.getItem('welile_had_session') === 'true';
    if (hadPreviousSession && isPinEnabled && !user) {
      setShowPinEntry(true);
    }
  }, [isPinEnabled, user]);

  useEffect(() => {
    if (referralId) {
      localStorage.setItem('referral_agent_id', referralId);
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
        // Offer PIN setup if not enabled and signed in successfully
        if (!isPinEnabled) {
          setShowPinSetup(true);
        } else {
          navigate('/dashboard');
        }
      }
    }
  }, [user, roles, navigate, isPinEnabled]);

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

        const storedReferrerId = localStorage.getItem('referral_agent_id');
        const { error } = await signUpWithoutRole(generatedEmail, password, fullName, phone, storedReferrerId || undefined);
        if (!error) localStorage.removeItem('referral_agent_id');
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

        // First, check if user exists with real email (Google OAuth users)
        // by matching their phone number in the profiles table
        const phoneLocal9 = cleanedPhone.slice(-9);
        const { data: profileMatch } = await supabase
          .from('profiles')
          .select('email')
          .or(`phone.ilike.%${phoneLocal9}%,phone.ilike.%${phoneLocal9}`)
          .limit(5);
        
        // Build list of emails to try - include real emails from profile matches
        const emailVariants = generatePhoneEmailVariants(phone);
        
        // Add profile-matched emails to the front (more likely to work)
        if (profileMatch && profileMatch.length > 0) {
          for (const profile of profileMatch) {
            // Verify exact match on last 9 digits
            const profilePhone = profile.email ? '' : '';
            if (profile.email && !emailVariants.includes(profile.email)) {
              // Check if this profile's phone matches
              emailVariants.unshift(profile.email);
            }
          }
        }

        // Also check profiles for real emails matching the phone
        const { data: phoneProfiles } = await supabase
          .from('profiles')
          .select('email, phone')
          .limit(10);
        
        if (phoneProfiles) {
          for (const p of phoneProfiles) {
            const pClean = cleanPhoneNumber(p.phone || '');
            const pLocal9 = pClean.slice(-9);
            if (pLocal9 === phoneLocal9 && p.email && !p.email.includes('@welile.')) {
              // This user registered with a real email but has matching phone
              if (!emailVariants.includes(p.email)) {
                emailVariants.unshift(p.email); // Try real email first
              }
            }
          }
        }

        let loginSuccess = false;
        let lastError: Error | null = null;
        let usedRealEmail = false;

        for (const emailVariant of emailVariants) {
          const { error } = await signIn(emailVariant, password);
          if (!error) {
            loginSuccess = true;
            usedRealEmail = !emailVariant.includes('@welile.');
            break;
          }
          lastError = error;
          
          // If it's a wrong password error, don't try other variants
          if (error.message.includes('Invalid login credentials')) {
            continue; // Try next variant
          } else {
            // For other errors (rate limit, etc.), stop trying
            break;
          }
        }

        if (!loginSuccess && lastError) {
          // Get the formats we tried for helpful display
          const triedFormats = getTriedPhoneFormats(phone);
          
          // Increment failed attempts counter
          setFailedAttempts(prev => prev + 1);
          
          // Provide helpful error message
          let errorMessage = lastError.message;
          if (lastError.message.includes('Invalid login credentials')) {
            // Check if account exists but was registered differently
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('email')
              .or(`phone.ilike.%${phoneLocal9}%`)
              .limit(1);
            
            if (existingProfile && existingProfile.length > 0 && existingProfile[0].email) {
              const profileEmail = existingProfile[0].email;
              if (!profileEmail.includes('@welile.')) {
                // User signed up with Google or real email
                errorMessage = `This phone number is linked to an account that uses email login (${profileEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}). Please use "Continue with Google" or sign in with your email address.`;
              } else {
                errorMessage = 'Incorrect password. Please check your password and try again.';
              }
            } else {
              errorMessage = 'No account found with this phone number. Please sign up first.';
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

  const handlePinSuccess = () => {
    setShowPinEntry(false);
    navigate('/dashboard');
  };

  const handlePinSetupComplete = () => {
    setShowPinSetup(false);
    navigate('/dashboard');
  };

  const handleSkipPinSetup = () => {
    setShowPinSetup(false);
    navigate('/dashboard');
  };

  // Show PIN entry screen
  if (showPinEntry) {
    return (
      <PinEntry 
        onSuccess={handlePinSuccess}
        onFallbackToPassword={() => setShowPinEntry(false)}
      />
    );
  }

  return (
    <>
      <PinSetupDialog 
        open={showPinSetup} 
        onOpenChange={(open) => {
          if (!open) handleSkipPinSetup();
        }}
        onComplete={handlePinSetupComplete}
      />
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

        <Card className="border-border/50 shadow-lg">
          {/* Prominent Login/Signup Toggle - visible on iPads without scrolling */}
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
          
          <CardHeader className={!isForgotPassword && !isForgotPhone ? 'pt-4' : ''}>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                {isForgotPassword || isForgotPhone ? <Mail className="h-5 w-5 text-primary" /> : isSignUp ? <UserPlus className="h-5 w-5 text-primary" /> : <LogIn className="h-5 w-5 text-primary" />}
              </div>
              {isForgotPassword ? 'Reset Password' : isForgotPhone ? 'Sign In with Email' : isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription>
              {isForgotPassword 
                ? 'Enter your email to receive a reset link'
                : isForgotPhone
                  ? 'Enter the email you used with Google sign-in'
                  : isSignUp 
                    ? 'Join Welile Platform to get started' 
                    : 'Sign in to continue to your dashboard'}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && !isForgotPassword && (
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
              )}

              {!isForgotPassword && !isForgotPhone && (
              <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={phoneInputRef}
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setLoginError(null); // Clear error when user types
                      }}
                      placeholder="e.g., 0700123456"
                      className={`pl-10 h-12 text-base ${loginError ? 'border-destructive' : ''}`}
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                  {!isSignUp && !loginError && (
                    <p className="text-xs text-muted-foreground">
                      Enter your phone number with or without country code
                    </p>
                  )}
                  
                  {/* Show tried formats on login failure */}
                  {!isSignUp && loginError && loginError.triedFormats.length > 0 && (
                    <div className="mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-xs text-destructive font-medium mb-2">
                        We tried these phone formats:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {loginError.triedFormats.slice(0, 4).map((format, idx) => (
                          <span 
                            key={idx} 
                            className="px-2 py-0.5 text-xs rounded-full bg-background border border-border text-muted-foreground"
                          >
                            {format}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Make sure you're using the same phone number you registered with.
                      </p>
                    </div>
                  )}

                  {/* Show Contact Support after 3+ failed attempts */}
                  {!isSignUp && failedAttempts >= 3 && (
                    <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                          <HelpCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            Still having trouble?
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Our support team can help you access your account.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3 gap-2 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => {
                              const message = encodeURIComponent(
                                `Hello Welile Support,\n\nI'm having trouble logging into my account.\n\nPhone: ${phone}\nAttempts: ${failedAttempts}\n\nPlease help me access my account.`
                              );
                              window.open(`https://wa.me/256783673998?text=${message}`, '_blank');
                            }}
                          >
                            <MessageCircle className="h-4 w-4" />
                            Contact Support
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(isForgotPassword || isForgotPhone) && (
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
                  <p className="text-xs text-muted-foreground">
                    {isForgotPhone 
                      ? 'Enter the email you used to sign in with Google, or try the "Continue with Google" button below.'
                      : 'If you signed up with phone only, please contact support.'}
                  </p>
                </div>
              )}

              {/* Password field - show for forgot phone (email login) but not forgot password */}
              {isForgotPhone && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-12 text-base"
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If you only used Google sign-in, you may not have a password. Use the Google button instead.
                  </p>
                </div>
              )}

              {!isForgotPassword && !isForgotPhone && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-12 text-base"
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {/* Password strength indicator for signup */}
                  {isSignUp && <PasswordStrengthIndicator password={password} />}
                </div>
              )}

              {/* Confirm Password field for signup */}
              {isSignUp && !isForgotPassword && !isForgotPhone && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`pl-10 pr-10 h-12 text-base ${confirmPassword && password !== confirmPassword ? 'border-destructive' : confirmPassword && password === confirmPassword ? 'border-emerald-500' : ''}`}
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors touch-manipulation p-1"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords don't match</p>
                  )}
                  {confirmPassword && password === confirmPassword && (
                    <p className="text-xs text-emerald-600">Passwords match ✓</p>
                  )}
                </div>
              )}
              
              {/* Back button for forgot phone/password flows */}
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
                  Back to phone login
                </button>
              )}

              {!isSignUp && !isForgotPassword && !isForgotPhone && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="remember" 
                      checked={rememberMe}
                      onCheckedChange={(checked) => {
                        setRememberMe(!!checked);
                        localStorage.setItem('welile_remember_me', String(!!checked));
                      }}
                      className="h-5 w-5 touch-manipulation"
                    />
                    <Label 
                      htmlFor="remember" 
                      className="text-sm font-normal cursor-pointer touch-manipulation"
                    >
                      Remember me
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-sm text-primary hover:text-primary/80 transition-colors touch-manipulation py-1"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              
              {/* Forgot Phone Number option */}
              {!isSignUp && !isForgotPassword && !isForgotPhone && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPhone(true);
                      setLoginError(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors touch-manipulation py-1"
                  >
                    Forgot phone number? Sign in with email instead
                  </button>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full gap-2 h-14 text-base touch-manipulation active:scale-[0.98] transition-transform" 
                disabled={isLoading}
                style={{ 
                  fontSize: '16px',
                  WebkitTapHighlightColor: 'transparent',
                  WebkitAppearance: 'none',
                }}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    {isForgotPassword ? <Mail className="h-5 w-5" /> : isForgotPhone ? <LogIn className="h-5 w-5" /> : isSignUp ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                    {isForgotPassword ? 'Send Reset Link' : isForgotPhone ? 'Sign In with Email' : isSignUp ? 'Create Account' : 'Sign In'}
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
              className="w-full gap-3 h-14 text-base touch-manipulation active:scale-[0.98] transition-transform"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              style={{ 
                fontSize: '16px',
                WebkitTapHighlightColor: 'transparent',
                WebkitAppearance: 'none',
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
              ) : isForgotPhone ? (
                <button
                  type="button"
                  onClick={() => setIsForgotPhone(false)}
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Back to Sign In
                </button>
              ) : null}
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
    </>
  );
}