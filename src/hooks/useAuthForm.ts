import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { useOtpVerification } from '@/hooks/useOtpVerification';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getLocationData } from '@/hooks/useGeolocation';
import { generatePhoneEmailVariants, cleanPhoneNumber, isValidPhoneNumber, getTriedPhoneFormats } from '@/lib/phoneUtils';
import { validateSignUp, validateFullName } from '@/lib/authValidation';
import { roleToSlug } from '@/lib/roleRoutes';

const VALID_SIGNUP_ROLES = ['tenant', 'agent', 'landlord', 'supporter'] as const;

export function useAuthForm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const referralId = searchParams.get('ref');
  const becomeRole = searchParams.get('become');
  const rawRole = searchParams.get('role');
  const preSelectedRole = rawRole && VALID_SIGNUP_ROLES.includes(rawRole as any) ? rawRole : null;

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

  // Store referral/role params & validate role
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
    // If role param is present but invalid, remove it from URL
    if (rawRole && !preSelectedRole) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('role');
      setSearchParams(newParams, { replace: true });
    }
  }, [referralId, becomeRole, preSelectedRole, rawRole]);

  // Redirect on auth — wait briefly for roles to load before deciding
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user) return;
    localStorage.setItem('welile_had_session', 'true');

    // If roles already loaded, navigate immediately
    if (roles.length > 0) {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      navigate(roleToSlug(roles[0]), { replace: true });
      return;
    }

    // Roles not yet loaded — give them up to 3s before falling back to /select-role
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = setTimeout(() => {
      if (roles.length > 0) {
        navigate(roleToSlug(roles[0]), { replace: true });
      } else {
        navigate('/select-role', { replace: true });
      }
    }, 3000);

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
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
    const nameCheck = validateFullName(fullName);
    const trimmedFullName = nameCheck.trimmed;
    const validationError = validateSignUp({ password, confirmPassword, fullName: trimmedFullName, phone });
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

    const { error } = await signUpWithoutRole(generatedEmail, password, trimmedFullName, fullPhone, storedReferrerId || undefined, preSelectedRole || undefined);
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
    if (!isValidPhoneNumber(phone)) {
      toast({ title: 'Invalid Phone Number', description: 'Please enter a valid phone number', variant: 'destructive' });
      return;
    }

    if (!password) {
      toast({ title: 'Error', description: 'Password is required', variant: 'destructive' });
      return;
    }

    // Normalize phone to last 9 digits (strips country code / leading zeros)
    const digits = phone.replace(/\D/g, '');
    const last9 = digits.slice(-9);

    // Build email candidates — real emails first, then placeholders as fallback
    const emailCandidates: string[] = [];

    // RPC lookup first: find real email linked to this phone (Gmail, Outlook, etc.)
    let rpcEmails: string[] = [];
    try {
      const { data } = await Promise.race([
        supabase.rpc('get_email_by_phone', { phone_variants: [`0${last9}`, `256${last9}`, last9] }),
        new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 5000)),
      ]);
      if (data?.length) {
        rpcEmails = (data as { email: string }[]).map(r => r.email).filter(Boolean);
      }
    } catch {
      // RPC lookup failed — continue to direct profile lookup fallback
    }

    // Fallback: direct profile lookup by phone so phone->email login still works if RPC is slow/unavailable
    if (!rpcEmails.length) {
      try {
        const { data: profileMatches } = await supabase
          .from('profiles')
          .select('email')
          .in('phone', [`0${last9}`, `256${last9}`, last9])
          .not('email', 'is', null)
          .limit(10);

        if (profileMatches?.length) {
          rpcEmails = profileMatches
            .map((row) => row.email)
            .filter((value): value is string => Boolean(value));
        }
      } catch {
        // Ignore and continue with generated placeholder candidates
      }
    }

    if (rpcEmails.length) {
      // PRIORITY: Real emails first (Gmail, Outlook, etc.) — these are verified accounts
      const realEmails = rpcEmails.filter(e => !e.includes('@welile.'));
      const placeholderEmails = rpcEmails.filter(e => e.includes('@welile.'));
      emailCandidates.push(...realEmails, ...placeholderEmails);
    }

    // Fallback: generated placeholder emails (tried only if RPC found nothing)
    emailCandidates.push(
      `0${last9}@welile.user`,
      `256${last9}@welile.user`,
      `${last9}@welile.user`,
      `0${last9}@welile.agent`,
      `256${last9}@welile.agent`,
      `${last9}@welile.agent`,
    );

    // Deduplicate while preserving order
    const uniqueCandidates = [...new Set(emailCandidates)];

    // Try each email candidate with the provided password
    let loginSuccess = false;
    let lastError: Error | null = null;
    let accountExists = rpcEmails.length > 0;

    // Split candidates: RPC-matched emails first, generated placeholders only as fallback
    const rpcMatchedEmails = uniqueCandidates.slice(0, rpcEmails.length);
    const generatedPlaceholders = uniqueCandidates.slice(rpcEmails.length);

    // Phase 1: Try RPC-matched emails (max 2-3 attempts)
    for (const emailToTry of rpcMatchedEmails) {
      try {
        const { error } = await signIn(emailToTry, password);
        if (!error) {
          loginSuccess = true;
          lastError = null;
          break;
        }
        lastError = error;
        if (error.message.includes('Invalid login credentials')) {
          accountExists = true;
          // Continue to next RPC email — might be a different account format
        } else {
          // Fatal error (rate limit, network, etc.) — stop entirely
          break;
        }
      } catch (e: any) {
        lastError = e;
        break;
      }
    }

    // Phase 2: Try generated placeholders.
    // We attempt these even if Phase 1 found a profile email, because the auth
    // account may be keyed off the synthetic `@welile.user` / `@welile.agent`
    // placeholder while `profiles.email` stores a contact address (e.g. Gmail).
    // Without this fallback, users whose contact email differs from their auth
    // identifier can never sign in by phone.
    if (!loginSuccess) {
      // Limit to 3 placeholder attempts max to avoid rate limiting
      for (const emailToTry of generatedPlaceholders.slice(0, 3)) {
        try {
          const { error } = await signIn(emailToTry, password);
          if (!error) {
            loginSuccess = true;
            lastError = null;
            break;
          }
          lastError = error;
          if (error.message.includes('Invalid login credentials')) {
            accountExists = true;
          } else {
            break;
          }
        } catch (e: any) {
          lastError = e;
          break;
        }
      }
    }

    if (loginSuccess) {
      setLoginError(null);
      setFailedAttempts(0);
      saveLocationInBackground();
      // Save user name for returning-user greeting
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const name = currentUser.user_metadata?.full_name;
          if (name) localStorage.setItem('welile_last_user_name', name);
        }
      } catch { /* non-critical */ }
      return;
    }

    // Build helpful error message
    setFailedAttempts(prev => prev + 1);
    const triedFormats = getTriedPhoneFormats(phone);
    let errorMessage = 'Sign in failed. Please try again.';

    if (lastError?.message?.includes('fetch') || lastError?.message?.includes('network') || lastError?.message?.includes('timeout')) {
      errorMessage = 'Network error. Please check your connection and try again.';
    } else if (lastError?.message?.includes('rate') || lastError?.message?.includes('too many')) {
      errorMessage = 'Too many login attempts. Please wait a moment and try again.';
    } else if (accountExists) {
      errorMessage = 'Incorrect password. Tap "Forgot Password?" below to reset it via SMS.';
    } else {
      errorMessage = 'No account found with this phone number. Please check the number or sign up.';
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AuthForm] Unexpected error:', err);
      toast({ title: 'Error', description: `Unexpected error: ${msg}`, variant: 'destructive' });
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
        const isProviderError = error.message?.toLowerCase().includes('not supported') || error.message?.toLowerCase().includes('provider');
        toast({
          title: 'Google Sign In Failed',
          description: isProviderError
            ? 'Google sign-in is temporarily unavailable. Please try again in a few seconds or use phone/password.'
            : error.message,
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GoogleSignIn] Unexpected error:', err);
      // Friendlier message for provider config issues
      const isProviderError = msg.toLowerCase().includes('not supported') || msg.toLowerCase().includes('provider');
      toast({
        title: 'Google Sign In Failed',
        description: isProviderError
          ? 'Google sign-in is temporarily unavailable. Please try again in a few seconds or use phone/password.'
          : `Unexpected error: ${msg}`,
        variant: 'destructive',
      });
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AppleSignIn] Unexpected error:', err);
      toast({ title: 'Apple Sign In Failed', description: `Unexpected error: ${msg}`, variant: 'destructive' });
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
