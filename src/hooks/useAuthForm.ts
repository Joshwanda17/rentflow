import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getLocationData } from '@/hooks/useGeolocation';
import { generatePhoneEmailVariants, cleanPhoneNumber, isValidPhoneNumber, getTriedPhoneFormats } from '@/lib/phoneUtils';
import { validateSignUp, validateSignIn } from '@/lib/authValidation';

export function useAuthForm() {
  const [searchParams] = useSearchParams();
  const referralId = searchParams.get('ref');
  const becomeRole = searchParams.get('become');
  const preSelectedRole = searchParams.get('role');

  const [referrerIdState, setReferrerIdState] = useState<string | null>(() => {
    if (referralId) return referralId;
    return localStorage.getItem('referral_agent_id');
  });

  const [isSignUp, setIsSignUp] = useState(!!referralId || !!becomeRole || !!preSelectedRole);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isForgotPhone, setIsForgotPhone] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<{ message: string; triedFormats: string[] } | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('welile_remember_me');
    return saved !== 'false';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const { signUpWithoutRole, signIn, signInWithGoogle, resetPassword, user, roles } = useAuth();
  const { isDuplicate, isChecking: isCheckingDuplicate, duplicateMessage } = usePhoneDuplicateCheck(phone, 400);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Store referral/role params
  useEffect(() => {
    if (referralId) {
      localStorage.setItem('referral_agent_id', referralId);
      setReferrerIdState(referralId);
    }
    if (becomeRole) {
      localStorage.setItem('become_role', becomeRole);
    }
    if (preSelectedRole) {
      localStorage.setItem('become_role', preSelectedRole);
    }
  }, [referralId, becomeRole, preSelectedRole]);

  // Redirect on auth
  useEffect(() => {
    if (user) {
      localStorage.setItem('welile_had_session', 'true');
      if (roles.length > 0) {
        navigate('/dashboard');
      }
    }
  }, [user, roles, navigate]);

  // Auto-focus
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isSignUp) {
        phoneInputRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isSignUp]);

  const saveLocationInBackground = () => {
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
  };

  const handleForgotPhoneSubmit = async () => {
    const isValidEmail = email.includes('@') && email.includes('.');
    if (!isValidEmail) {
      toast({ title: 'Error', description: 'Please enter a valid email', variant: 'destructive' });
      return;
    }
    const { error } = await signIn(email, password);
    if (error) {
      let errorMessage = error.message;
      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'No account found with this email, or the password is incorrect. If you signed in with Google, please use the "Continue with Google" button instead.';
      }
      toast({ title: 'Sign In Failed', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleForgotPasswordSubmit = async () => {
    const isValidEmail = email.includes('@') && email.includes('.');
    if (!isValidEmail) {
      toast({ title: 'Error', description: 'Please enter a valid email', variant: 'destructive' });
      return;
    }
    const { error } = await resetPassword(email);
    if (error) {
      toast({ title: 'Reset Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Check Your Email', description: 'We sent you a password reset link' });
      setIsForgotPassword(false);
    }
  };

  const handleSignUpSubmit = async () => {
    if (isDuplicate) {
      toast({ title: 'Phone Already Registered', description: duplicateMessage || 'This phone number is already in use.', variant: 'destructive' });
      return;
    }
    const validationError = validateSignUp({ password, confirmPassword, fullName, phone });
    if (validationError) {
      toast({ title: 'Error', description: validationError, variant: 'destructive' });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const generatedEmail = `${cleanPhone}@welile.user`;
    const storedReferrerId = referrerIdState || localStorage.getItem('referral_agent_id');
    console.log('[Auth] Signup with referrer:', storedReferrerId, '(state:', referrerIdState, ', localStorage:', localStorage.getItem('referral_agent_id'), ')');

    const { error } = await signUpWithoutRole(generatedEmail, password, fullName, phone, storedReferrerId || undefined);
    if (error) {
      let errorMessage = error.message;
      if (error.message.includes('already registered')) {
        errorMessage = 'This phone number is already registered. Please sign in instead.';
      }
      toast({ title: 'Sign Up Failed', description: errorMessage, variant: 'destructive' });
    } else {
      toast({ title: 'Account Created!', description: 'Welcome to Welile' });
      saveLocationInBackground();
    }
  };

  const handleSignInSubmit = async () => {
    const cleanedPhone = cleanPhoneNumber(phone);

    if (!isValidPhoneNumber(phone)) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid phone number (e.g., 0700123456 or 256700123456)',
        variant: 'destructive',
      });
      return;
    }

    const validationError = validateSignIn({ phone: cleanedPhone, password });
    if (validationError) {
      toast({ title: 'Error', description: validationError, variant: 'destructive' });
      return;
    }

    const phoneLocal9 = cleanedPhone.slice(-9);
    const phoneFormats = [`0${phoneLocal9}`, `256${phoneLocal9}`];

    // STEP 1: Try profile lookup and primary generated email in parallel
    const primaryEmail = `${cleanedPhone}@welile.user`;
    let profileEmail: string | null = null;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('email, phone')
        .in('phone', phoneFormats)
        .limit(1);
      if (data?.[0]?.email) profileEmail = data[0].email;
    } catch {
      // Continue with generated email
    }

    // Use profile email if found, otherwise use the primary generated one
    const emailToTry = profileEmail || primaryEmail;

    // STEP 2: Single sign-in attempt with best candidate
    let loginSuccess = false;
    let lastError: Error | null = null;

    try {
      const { error } = await signIn(emailToTry, password);
      if (!error) {
        loginSuccess = true;
      } else {
        lastError = error;
      }
    } catch (e: any) {
      lastError = e;
    }

    // If first attempt failed with wrong credentials and we have an alternative, try it
    if (!loginSuccess && lastError?.message.includes('Invalid login credentials') && profileEmail && profileEmail !== primaryEmail) {
      try {
        const { error } = await signIn(primaryEmail, password);
        if (!error) {
          loginSuccess = true;
          lastError = null;
        } else {
          lastError = error;
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    // STEP 3: Handle result
    if (loginSuccess) {
      setLoginError(null);
      setFailedAttempts(0);
      // Session is always persistent — no session_only flag needed
      saveLocationInBackground();
      return;
    }

    // Login failed
    setFailedAttempts(prev => prev + 1);
    const triedFormats = getTriedPhoneFormats(phone);
    let errorMessage = lastError?.message || 'Sign in failed';

    if (lastError?.message.includes('Invalid login credentials')) {
      if (profileEmail && !profileEmail.includes('@welile.')) {
        errorMessage = `This phone number is linked to an account that uses email login. Please use "Continue with Google" instead.`;
      } else if (emailToTry) {
        errorMessage = 'Incorrect password. Please check your password and try again.';
      } else {
        errorMessage = 'No account found with this phone number. Please sign up first.';
      }
    } else if (lastError?.message.includes('rate')) {
      errorMessage = 'Too many login attempts. Please wait a moment and try again.';
    } else if (lastError?.message.includes('fetch') || lastError?.message.includes('network') || lastError?.message.includes('Failed to fetch')) {
      errorMessage = 'Network error. Please check your connection and try again.';
    }

    setLoginError({ message: errorMessage, triedFormats });
    toast({ title: 'Sign In Failed', description: errorMessage, variant: 'destructive' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Safety timeout: silently reset spinner after 15s so UI never gets stuck
    const safetyTimer = setTimeout(() => setIsLoading(false), 15000);

    try {
      if (isForgotPhone) {
        await handleForgotPhoneSubmit();
      } else if (isForgotPassword) {
        await handleForgotPasswordSubmit();
      } else if (isSignUp) {
        await handleSignUpSubmit();
      } else {
        await handleSignInSubmit();
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      clearTimeout(safetyTimer);
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

  return {
    // URL params
    referralId,
    becomeRole,
    preSelectedRole,
    // Form state
    isSignUp, setIsSignUp,
    isForgotPassword, setIsForgotPassword,
    isForgotPhone, setIsForgotPhone,
    email, setEmail,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    showConfirmPassword, setShowConfirmPassword,
    fullName, setFullName,
    phone, setPhone,
    isLoading,
    loginError, setLoginError,
    failedAttempts,
    rememberMe, setRememberMe,
    showPassword, setShowPassword,
    isGoogleLoading,
    // Refs
    phoneInputRef,
    passwordInputRef,
    // Duplicate check
    isDuplicate, isCheckingDuplicate, duplicateMessage,
    // Handlers
    handleSubmit,
    handleGoogleSignIn,
  };
}
