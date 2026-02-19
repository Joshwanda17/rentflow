import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { useOtpVerification } from '@/hooks/useOtpVerification';
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
  const [countryCode, setCountryCode] = useState('256');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<{ message: string; triedFormats: string[] } | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('welile_remember_me');
    return saved !== 'false';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const { signUpWithoutRole, signIn, signInWithGoogle, signInWithApple, resetPassword, user, roles } = useAuth();
  const { isDuplicate, isChecking: isCheckingDuplicate, duplicateMessage } = usePhoneDuplicateCheck(phone, 400);
  const { otpSent, otpVerified, otpLoading, otpError, sendOtp, verifyOtp, resetOtp: resetOtpState } = useOtpVerification();
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

  // SMS reset state
  const [resetStep, setResetStep] = useState<'phone' | 'otp' | 'new-password'>('phone');
  const [resetPhone, setResetPhone] = useState('');
  const [resetOtp, setResetOtpCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  const handleForgotPasswordSubmit = async () => {
    if (resetStep === 'phone') {
      // Check if it looks like an email (real email user) or phone
      const isEmail = email && email.includes('@') && email.includes('.') && !email.includes('@welile.');
      if (isEmail) {
        // Real email user — use Supabase email reset
        const { error } = await resetPassword(email);
        if (error) {
          toast({ title: 'Reset Failed', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Check Your Email', description: 'We sent you a password reset link' });
          setIsForgotPassword(false);
        }
        return;
      }

      // Phone-based reset via SMS
      const cleanedPhone = resetPhone.replace(/\D/g, '');
      if (cleanedPhone.length < 9) {
        toast({ title: 'Error', description: 'Please enter a phone number or email', variant: 'destructive' });
        return;
      }
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/password-reset-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ action: 'send', phone: cleanedPhone }),
        });
        const data = await response.json();
        if (!response.ok) {
          toast({ title: 'Error', description: data.error || 'Failed to send reset code', variant: 'destructive' });
        } else {
          toast({ title: 'Code Sent', description: 'Check your phone for the reset code' });
          setResetStep('otp');
        }
      } catch {
        toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
      }
      return;
    }

    if (resetStep === 'otp') {
      if (resetOtp.length !== 6) {
        toast({ title: 'Error', description: 'Please enter the 6-digit code', variant: 'destructive' });
        return;
      }
      setResetStep('new-password');
      return;
    }

    if (resetStep === 'new-password') {
      if (resetNewPassword.length < 6) {
        toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
        return;
      }
      if (resetNewPassword !== resetConfirmPassword) {
        toast({ title: 'Error', description: "Passwords don't match", variant: 'destructive' });
        return;
      }
      const cleanedPhone = resetPhone.replace(/\D/g, '');
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/password-reset-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ action: 'verify-and-reset', phone: cleanedPhone, otp: resetOtp, new_password: resetNewPassword }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (data.error?.includes('Invalid code') || data.error?.includes('expired')) {
            setResetStep('otp');
          }
          toast({ title: 'Reset Failed', description: data.error || 'Failed to reset password', variant: 'destructive' });
        } else {
          toast({ title: 'Password Reset!', description: 'You can now sign in with your new password' });
          setIsForgotPassword(false);
          setResetStep('phone');
          setResetPhone('');
          setResetOtpCode('');
          setResetNewPassword('');
          setResetConfirmPassword('');
        }
      } catch {
        toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
      }
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
    // OTP verification is MANDATORY before account creation
    if (!otpVerified) {
      toast({ title: 'Phone Verification Required', description: 'Please verify your phone number with the SMS code before creating your account.', variant: 'destructive' });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    // Prepend country code if the number doesn't already include it
    const fullPhone = cleanPhone.startsWith(countryCode) ? cleanPhone : countryCode + (cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone);
    const generatedEmail = `${fullPhone}@welile.user`;
    const storedReferrerId = referrerIdState || localStorage.getItem('referral_agent_id');
    console.log('[Auth] Signup with referrer:', storedReferrerId, '(state:', referrerIdState, ', localStorage:', localStorage.getItem('referral_agent_id'), ')');

    const { error } = await signUpWithoutRole(generatedEmail, password, fullName, fullPhone, storedReferrerId || undefined);
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
        description: 'Please enter a valid phone number',
        variant: 'destructive',
      });
      return;
    }

    const validationError = validateSignIn({ phone: cleanedPhone, password });
    if (validationError) {
      toast({ title: 'Error', description: validationError, variant: 'destructive' });
      return;
    }

    // Build full number with country code
    const fullPhone = cleanedPhone.startsWith(countryCode) ? cleanedPhone : countryCode + (cleanedPhone.startsWith('0') ? cleanedPhone.slice(1) : cleanedPhone);
    const phoneLocal9 = cleanedPhone.slice(-9);
    const phoneFormats = [`0${phoneLocal9}`, `256${phoneLocal9}`, `${countryCode}${phoneLocal9}`, fullPhone];

    // STEP 1: Try profile lookup to find the correct auth email
    let profileEmails: string[] = [];

    try {
      const profilePromise = supabase
        .from('profiles')
        .select('email, phone')
        .in('phone', phoneFormats);
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout: Unable to reach the server. Please check your connection and try again.')), 10000)
      );

      const { data } = await Promise.race([profilePromise, timeoutPromise]);
      if (data?.length) {
        // Prefer @welile.user emails first, then @welile.agent
        const userEmails = data.filter(p => p.email?.includes('@welile.user')).map(p => p.email);
        const agentEmails = data.filter(p => p.email?.includes('@welile.agent')).map(p => p.email);
        profileEmails = [...userEmails, ...agentEmails];
      }
    } catch (e: any) {
      if (e?.message?.includes('Network timeout')) {
        toast({ title: 'Connection Error', description: e.message, variant: 'destructive' });
        return;
      }
    }

    // Build ordered list of emails to try (profile matches first, then generated fallbacks)
    const emailCandidates = new Set<string>();
    for (const e of profileEmails) emailCandidates.add(e);
    emailCandidates.add(`${fullPhone}@welile.user`);
    emailCandidates.add(`${cleanedPhone}@welile.user`);
    emailCandidates.add(`0${phoneLocal9}@welile.user`);
    emailCandidates.add(`256${phoneLocal9}@welile.user`);
    emailCandidates.add(`${countryCode}${phoneLocal9}@welile.user`);
    // Also try agent variants as fallback
    emailCandidates.add(`0${phoneLocal9}@welile.agent`);
    emailCandidates.add(`256${phoneLocal9}@welile.agent`);
    emailCandidates.add(`${countryCode}${phoneLocal9}@welile.agent`);

    // STEP 2: Try sign-in with each candidate until one works
    let loginSuccess = false;
    let lastError: Error | null = null;

    for (const emailToTry of emailCandidates) {
      try {
        const signInPromise = signIn(emailToTry, password);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 12000)
        );
        const { error } = await Promise.race([signInPromise, timeoutPromise]);
        if (!error) {
          loginSuccess = true;
          lastError = null;
          break;
        }
        lastError = error;
        // Only continue trying if it's a credentials error (wrong email variant)
        if (!error.message.includes('Invalid login credentials')) break;
      } catch (e: any) {
        lastError = e;
        // Network errors — stop trying
        if (e?.message?.includes('Network timeout') || e?.message?.includes('Failed to fetch')) break;
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
      const hasRealEmail = profileEmails.some(e => !e.includes('@welile.'));
      if (hasRealEmail) {
        errorMessage = `This phone number is linked to an account that uses email login. Please use "Continue with Google" instead.`;
      } else if (profileEmails.length > 0) {
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

    // Safety timeout: reset spinner after 6s so UI never gets stuck
    const safetyTimer = setTimeout(() => setIsLoading(false), 6000);

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

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const { error } = await signInWithApple();
      if (error) {
        toast({ title: 'Apple Sign In Failed', description: error.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to sign in with Apple', variant: 'destructive' });
    } finally {
      setIsAppleLoading(false);
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
    countryCode, setCountryCode,
    isLoading,
    loginError, setLoginError,
    failedAttempts,
    rememberMe, setRememberMe,
    showPassword, setShowPassword,
    isGoogleLoading,
    isAppleLoading,
    // Refs
    phoneInputRef,
    passwordInputRef,
    // Duplicate check
    isDuplicate, isCheckingDuplicate, duplicateMessage,
    // OTP
    otpSent, otpVerified, otpLoading, otpError,
    sendOtp, verifyOtp, resetOtp: resetOtpState,
    // SMS password reset
    resetStep, setResetStep,
    resetPhone, setResetPhone,
    resetOtpCode: resetOtp, setResetOtpCode,
    resetNewPassword, setResetNewPassword,
    resetConfirmPassword, setResetConfirmPassword,
    // Handlers
    handleSubmit,
    handleGoogleSignIn,
    handleAppleSignIn,
  };
}
