import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getLocationData } from '@/hooks/useGeolocation';
import { generatePhoneEmailVariants, cleanPhoneNumber, isValidPhoneNumber, getTriedPhoneFormats } from '@/lib/phoneUtils';
import { validateSignUp, validateSignIn, withTimeout } from '@/lib/authValidation';

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
        variant: 'destructive'
      });
      return;
    }

    const validationError = validateSignIn({ phone: cleanedPhone, password });
    if (validationError) {
      toast({ title: 'Error', description: validationError, variant: 'destructive' });
      return;
    }

    const phoneLocal9 = cleanedPhone.slice(-9);

    // STEP 1: Quick profile lookup
    let targetEmail: string | null = null;
    try {
      const phoneFormats = [`0${phoneLocal9}`, `256${phoneLocal9}`];
      const profileResult = await withTimeout(
        Promise.resolve(
          supabase.from('profiles').select('email, phone').in('phone', phoneFormats).limit(1)
        ),
        15000
      );
      const match = profileResult.data?.[0];
      if (match?.email) {
        targetEmail = match.email;
      }
    } catch {
      // Lookup failed — fall through to variant approach
    }

    let loginSuccess = false;
    let lastError: Error | null = null;

    // STEP 2: Try exact email
    if (targetEmail) {
      try {
        const { error } = await withTimeout(signIn(targetEmail, password), 20000);
        if (!error) {
          loginSuccess = true;
        } else {
          lastError = error;
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    // STEP 3: Try generated variants
    if (!loginSuccess) {
      const emailVariants = generatePhoneEmailVariants(phone).slice(0, 2);
      const remainingVariants = targetEmail
        ? emailVariants.filter(e => e !== targetEmail)
        : emailVariants;

      for (const emailVariant of remainingVariants) {
        try {
          const { error } = await withTimeout(signIn(emailVariant, password), 15000);
          if (!error) {
            loginSuccess = true;
            break;
          }
          lastError = error;
          if (!error.message.includes('Invalid login credentials')) break;
        } catch (e: any) {
          lastError = e;
          break;
        }
      }
    }

    if (!loginSuccess && lastError) {
      const triedFormats = getTriedPhoneFormats(phone);
      setFailedAttempts(prev => prev + 1);

      let errorMessage = lastError.message;
      if (lastError.message.includes('Invalid login credentials')) {
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
      toast({ title: 'Sign In Failed', description: errorMessage, variant: 'destructive' });
    } else if (loginSuccess) {
      setLoginError(null);
      setFailedAttempts(0);
      if (!rememberMe) {
        sessionStorage.setItem('welile_session_only', 'true');
      } else {
        sessionStorage.removeItem('welile_session_only');
      }
      saveLocationInBackground();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
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
