import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Mail, Lock, User, Phone, Loader2, MessageCircle, AlertCircle, LogIn, Smartphone, Sparkles } from 'lucide-react';
import { CountryCodeSelect } from '@/components/auth/CountryCodeSelect';
import WelileLogo from '@/components/WelileLogo';
import PasswordStrengthIndicator from '@/components/auth/PasswordStrengthIndicator';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { AppleSignInButton } from '@/components/auth/AppleSignInButton';
import { ReferralBanner } from '@/components/auth/ReferralBanner';
import { AuthTabToggle } from '@/components/auth/AuthTabToggle';
import { OtpVerificationStep } from '@/components/auth/OtpVerificationStep';
import { useAuthForm } from '@/hooks/useAuthForm';
import { SIGNUP_PAUSED } from '@/components/SignupPauseBanner';
import { useState, useEffect, useCallback } from 'react';
// supabase client available via hooks
import { useOtpVerification } from '@/hooks/useOtpVerification';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function Auth() {
  const {
    referralId, becomeRole,
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
    isGoogleLoading, isAppleLoading,
    phoneInputRef, passwordInputRef,
    isDuplicate, isCheckingDuplicate, duplicateMessage,
    otpSent, otpVerified, otpLoading, otpError,
    sendOtp, verifyOtp, resetOtp: resetOtpState,
    // SMS reset
    resetStep, setResetStep,
    resetPhone, setResetPhone,
    resetOtpCode, setResetOtpCode,
    resetNewPassword, setResetNewPassword,
    resetConfirmPassword, setResetConfirmPassword,
    handleSubmit, handleGoogleSignIn, handleAppleSignIn,
  } = useAuthForm();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // ========== Feature 4: Auto-login for returning users ==========
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // ========== Feature 3: Returning user welcome ==========
  const lastUserName = localStorage.getItem('welile_last_user_name');
  const lastLoginMethod = localStorage.getItem('welile_last_login_method');
  const hadSession = localStorage.getItem('welile_had_session') === 'true';

  // ========== Feature 1: Phone OTP Login ==========
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [otpLoginPhone, setOtpLoginPhone] = useState('');
  const [otpLoginCode, setOtpLoginCode] = useState('');
  const [otpLoginStep, setOtpLoginStep] = useState<'phone' | 'code'>('phone');
  const [otpLoginLoading, setOtpLoginLoading] = useState(false);
  const [otpLoginCountryCode, setOtpLoginCountryCode] = useState('256');
  const loginOtp = useOtpVerification();

  // ========== Feature 2: WhatsApp deeplink auto-fill ==========
  const deepLinkPhone = searchParams.get('phone');
  const deepLinkToken = searchParams.get('token');
  const deepLinkAgent = searchParams.get('agent');

  useEffect(() => {
    if (deepLinkPhone && deepLinkToken) {
      // Auto-fill OTP login mode
      setLoginMode('otp');
      setOtpLoginPhone(deepLinkPhone);
      setOtpLoginCode(deepLinkToken);
      setOtpLoginStep('code');
      // Auto-submit after a brief delay so user sees what's happening
      const timer = setTimeout(() => {
        handleOtpLogin(deepLinkPhone, deepLinkToken);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [deepLinkPhone, deepLinkToken]);

  const getFullOtpPhone = useCallback((phoneVal: string, codeVal: string) => {
    const cleanDigits = phoneVal.replace(/\D/g, '');
    return cleanDigits.startsWith(codeVal) ? cleanDigits : codeVal + (cleanDigits.startsWith('0') ? cleanDigits.slice(1) : cleanDigits);
  }, []);

  const handleSendOtpForLogin = async () => {
    const fullNum = getFullOtpPhone(otpLoginPhone, otpLoginCountryCode);
    if (fullNum.length < 10) {
      toast({ title: 'Error', description: 'Please enter a valid phone number', variant: 'destructive' });
      return;
    }
    setOtpLoginLoading(true);
    const success = await loginOtp.sendOtp(fullNum);
    setOtpLoginLoading(false);
    if (success) {
      setOtpLoginStep('code');
      toast({ title: 'Code Sent! 📱', description: 'Check your phone for the 6-digit code' });
    } else {
      toast({ title: 'Failed', description: loginOtp.otpError || 'Could not send code', variant: 'destructive' });
    }
  };

  const handleOtpLogin = async (phoneOverride?: string, codeOverride?: string) => {
    const phoneVal = phoneOverride || otpLoginPhone;
    const codeVal = codeOverride || otpLoginCode;
    const fullNum = getFullOtpPhone(phoneVal, otpLoginCountryCode);

    if (codeVal.length !== 6) {
      toast({ title: 'Error', description: 'Please enter the 6-digit code', variant: 'destructive' });
      return;
    }

    setOtpLoginLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/otp-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ phone: fullNum, otp: codeVal }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: 'Login Failed', description: data.error || 'Could not verify code', variant: 'destructive' });
        return;
      }

      if (data.verify_url) {
        // Store login context
        if (data.user_name) {
          localStorage.setItem('welile_last_user_name', data.user_name);
        }
        localStorage.setItem('welile_last_login_method', 'otp');
        localStorage.setItem('welile_had_session', 'true');

        toast({ title: `Welcome back${data.user_name ? ', ' + data.user_name : ''}! 🎉`, description: 'Logging you in...' });
        // Redirect to the magic link verify URL
        window.location.href = data.verify_url;
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please check your connection.', variant: 'destructive' });
    } finally {
      setOtpLoginLoading(false);
    }
  };

  // Save user context on password login for returning user greeting
  const wrappedHandleSubmit = async (e: React.FormEvent) => {
    await handleSubmit(e);
    // If login succeeds, save context for next visit
    if (!isSignUp && !isForgotPassword && !isForgotPhone) {
      localStorage.setItem('welile_last_login_method', 'password');
    }
  };

  const wrappedHandleGoogleSignIn = async () => {
    localStorage.setItem('welile_last_login_method', 'google');
    await handleGoogleSignIn();
  };

  // Show loading if checking existing session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking your session...</p>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center justify-center mt-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/50 border border-border/50">
                <span className="text-xs text-muted-foreground">Currency:</span>
                <CurrencySwitcher variant="compact" />
              </div>
            </div>
          </div>

          {/* Feature 3: Welcome back banner for returning users */}
          {hadSession && lastUserName && !isSignUp && !isForgotPassword && !isForgotPhone && (
            <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Welcome back, {lastUserName}!</p>
                <p className="text-xs text-muted-foreground">
                  {lastLoginMethod === 'google' ? 'Tap "Continue with Google" to sign in' :
                   lastLoginMethod === 'otp' ? 'Use SMS code for quick login' :
                   'Enter your password to continue'}
                </p>
              </div>
            </div>
          )}

          {/* Feature 2: WhatsApp deeplink banner */}
          {deepLinkAgent && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Sent by Agent {deepLinkAgent}</p>
                <p className="text-xs text-muted-foreground">Verifying your login code automatically...</p>
              </div>
            </div>
          )}

          <ReferralBanner referralId={referralId} becomeRole={becomeRole} />

          <Card className="border-border/50 shadow-lg overflow-hidden">
            {/* Prominent social sign-in for login view */}
            {!isForgotPassword && !isForgotPhone && !isSignUp && loginMode === 'password' && (
              <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border/30 space-y-3">
                <GoogleSignInButton
                  onClick={wrappedHandleGoogleSignIn}
                  disabled={isGoogleLoading || isAppleLoading || isLoading}
                  isLoading={isGoogleLoading}
                  variant="prominent"
                />
                <AppleSignInButton
                  onClick={handleAppleSignIn}
                  disabled={isGoogleLoading || isAppleLoading || isLoading}
                  isLoading={isAppleLoading}
                />
                <p className="text-center text-xs text-muted-foreground">Fastest way to sign in</p>
              </div>
            )}

            {/* Tab toggle - hidden during signup pause */}
            {!isForgotPassword && !isForgotPhone && !SIGNUP_PAUSED && (
              <AuthTabToggle isSignUp={isSignUp} onToggle={setIsSignUp} />
            )}

            {/* ========== Feature 1: Login Mode Toggle (Password vs OTP) ========== */}
            {!isSignUp && !isForgotPassword && !isForgotPhone && (
              <div className="flex border-b border-border/30">
                <button
                  type="button"
                  onClick={() => setLoginMode('password')}
                  className={`flex-1 py-3 text-sm font-medium transition-all touch-manipulation flex items-center justify-center gap-2 ${
                    loginMode === 'password'
                      ? 'text-primary border-b-2 border-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={{ minHeight: '48px' }}
                >
                  <Lock className="h-4 w-4" />
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('otp')}
                  className={`flex-1 py-3 text-sm font-medium transition-all touch-manipulation flex items-center justify-center gap-2 ${
                    loginMode === 'otp'
                      ? 'text-primary border-b-2 border-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={{ minHeight: '48px' }}
                >
                  <Smartphone className="h-4 w-4" />
                  SMS Code
                </button>
              </div>
            )}

            <CardHeader className={!isForgotPassword && !isForgotPhone ? 'pt-4 pb-2' : ''}>
              <CardTitle className="flex items-center gap-2 text-xl">
                {isForgotPassword ? 'Reset Password' : isForgotPhone ? 'Sign In with Email' : isSignUp ? 'Create Account' : loginMode === 'otp' ? 'Login with SMS Code' : 'Sign in with Phone'}
              </CardTitle>
              <CardDescription className="text-sm">
                {isForgotPassword
                  ? resetStep === 'phone' ? 'Enter your phone number to receive a reset code via SMS, or your email for a reset link'
                    : resetStep === 'otp' ? 'Enter the 6-digit code sent to your phone'
                    : 'Set your new password'
                  : isForgotPhone
                    ? 'Enter the email you used with Google sign-in'
                    : isSignUp
                      ? 'Join Welile to get started'
                      : loginMode === 'otp'
                        ? 'No password needed — we\'ll send you a code'
                        : 'Enter your phone number and password'}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-2">
              {/* ========== OTP Login Mode ========== */}
              {!isSignUp && !isForgotPassword && !isForgotPhone && loginMode === 'otp' ? (
                <div className="space-y-4">
                  {otpLoginStep === 'phone' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="otpLoginPhone" className="text-sm font-medium">Phone Number</Label>
                        <div className="relative flex">
                          <CountryCodeSelect value={otpLoginCountryCode} onChange={setOtpLoginCountryCode} />
                          <div className="relative flex-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                              id="otpLoginPhone"
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              value={otpLoginPhone}
                              onChange={(e) => setOtpLoginPhone(e.target.value)}
                              placeholder="700123456"
                              className="pl-11 h-14 text-base rounded-xl rounded-l-none"
                              style={{ fontSize: '16px' }}
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={handleSendOtpForLogin}
                        disabled={otpLoginLoading || otpLoginPhone.replace(/\D/g, '').length < 7}
                        className="w-full gap-2 h-14 text-base rounded-xl touch-manipulation active:scale-[0.98] transition-transform font-medium"
                        style={{ fontSize: '16px' }}
                      >
                        {otpLoginLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <Smartphone className="h-5 w-5" />
                            Send SMS Code
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="otpLoginCode" className="text-sm font-medium">Enter 6-digit code</Label>
                        <Input
                          id="otpLoginCode"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otpLoginCode}
                          onChange={(e) => setOtpLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          className="h-14 text-center text-2xl tracking-[0.5em] rounded-xl font-mono"
                          style={{ fontSize: '24px' }}
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground text-center">
                          Sent to +{otpLoginCountryCode} {otpLoginPhone}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleOtpLogin()}
                        disabled={otpLoginLoading || otpLoginCode.length !== 6}
                        className="w-full gap-2 h-14 text-base rounded-xl touch-manipulation active:scale-[0.98] transition-transform font-medium"
                        style={{ fontSize: '16px' }}
                      >
                        {otpLoginLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <LogIn className="h-5 w-5" />
                            Verify & Log In
                          </>
                        )}
                      </Button>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => { setOtpLoginStep('phone'); setOtpLoginCode(''); }}
                          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          <ArrowLeft className="h-3 w-3" />
                          Change number
                        </button>
                        <button
                          type="button"
                          onClick={handleSendOtpForLogin}
                          disabled={otpLoginLoading}
                          className="text-sm text-primary hover:underline"
                        >
                          Resend code
                        </button>
                      </div>
                    </>
                  )}

                  {/* Social buttons in OTP mode too */}
                  <div className="relative flex items-center py-2">
                    <div className="flex-1 border-t border-border/50" />
                    <span className="px-3 text-xs text-muted-foreground">or</span>
                    <div className="flex-1 border-t border-border/50" />
                  </div>
                  <GoogleSignInButton
                    onClick={wrappedHandleGoogleSignIn}
                    disabled={isGoogleLoading || isAppleLoading || isLoading}
                    isLoading={isGoogleLoading}
                    variant="standard"
                  />
                </div>
              ) : (
                /* ========== Original Password Login / Signup / Forgot flows ========== */
                <form onSubmit={wrappedHandleSubmit} className="space-y-4">
                  {/* Full Name (signup only) */}
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

                  {/* Phone Number */}
                  {!isForgotPassword && !isForgotPhone && (
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                      <div className="relative flex">
                        <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
                        <div className="relative flex-1">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            ref={phoneInputRef}
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => { setPhone(e.target.value); setLoginError(null); }}
                            placeholder="700123456"
                            className={`pl-11 h-14 text-base rounded-xl rounded-l-none ${loginError || (isSignUp && isDuplicate) ? 'border-destructive focus:ring-destructive' : ''}`}
                            style={{ fontSize: '16px' }}
                            required
                          />
                        </div>
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
                      {!isSignUp && loginError && (
                        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                          <p className="text-sm text-destructive">{loginError.message}</p>
                        </div>
                      )}
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

                  {/* Forgot Password - SMS/Email dual flow */}
                  {isForgotPassword && resetStep === 'phone' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="resetPhone" className="text-sm font-medium">Phone Number</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            id="resetPhone"
                            type="tel"
                            inputMode="tel"
                            value={resetPhone}
                            onChange={(e) => setResetPhone(e.target.value)}
                            placeholder="0700123456"
                            className="pl-11 h-14 text-base rounded-xl"
                            style={{ fontSize: '16px' }}
                          />
                        </div>
                      </div>
                      <div className="relative flex items-center py-1">
                        <div className="flex-1 border-t border-border/50" />
                        <span className="px-3 text-xs text-muted-foreground">or</span>
                        <div className="flex-1 border-t border-border/50" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="resetEmail" className="text-sm font-medium">Email (for Google/email accounts)</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            id="resetEmail"
                            type="email"
                            inputMode="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="pl-11 h-14 text-base rounded-xl"
                            style={{ fontSize: '16px' }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* OTP step */}
                  {isForgotPassword && resetStep === 'otp' && (
                    <div className="space-y-2">
                      <Label htmlFor="resetOtp" className="text-sm font-medium">Reset Code</Label>
                      <Input
                        id="resetOtp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={resetOtpCode}
                        onChange={(e) => setResetOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit code"
                        className="h-14 text-center text-2xl tracking-[0.5em] rounded-xl font-mono"
                        style={{ fontSize: '24px' }}
                        required
                      />
                    </div>
                  )}

                  {/* New password step */}
                  {isForgotPassword && resetStep === 'new-password' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            id="newPassword"
                            type={showPassword ? "text" : "password"}
                            value={resetNewPassword}
                            onChange={(e) => setResetNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            className="pl-11 h-14 text-base rounded-xl"
                            style={{ fontSize: '16px' }}
                            required
                          />
                        </div>
                        <PasswordStrengthIndicator password={resetNewPassword} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmNewPassword" className="text-sm font-medium">Confirm Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            id="confirmNewPassword"
                            type={showPassword ? "text" : "password"}
                            value={resetConfirmPassword}
                            onChange={(e) => setResetConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            className={`pl-11 h-14 text-base rounded-xl ${resetConfirmPassword && resetNewPassword !== resetConfirmPassword ? 'border-destructive' : resetConfirmPassword && resetNewPassword === resetConfirmPassword ? 'border-emerald-500' : ''}`}
                            style={{ fontSize: '16px' }}
                            required
                          />
                        </div>
                        {resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                          <p className="text-xs text-destructive">Passwords don't match</p>
                        )}
                        <div className="flex items-center space-x-2 mt-1">
                          <Checkbox
                            id="showResetPassword"
                            checked={showPassword}
                            onCheckedChange={(checked) => setShowPassword(!!checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="showResetPassword" className="text-xs text-muted-foreground cursor-pointer select-none">
                            Show password
                          </Label>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Email for forgot phone flow */}
                  {isForgotPhone && (
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

                  {/* Password */}
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
                          className="pl-11 h-14 text-base rounded-xl"
                          style={{ fontSize: '16px' }}
                          required
                        />
                      </div>
                      {isSignUp && <PasswordStrengthIndicator password={password} />}
                      <div className="flex items-center space-x-2 mt-1">
                        <Checkbox
                          id="showPassword"
                          checked={showPassword}
                          onCheckedChange={(checked) => setShowPassword(!!checked)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="showPassword" className="text-xs text-muted-foreground cursor-pointer select-none">
                          Show password
                        </Label>
                      </div>
                    </div>
                  )}

                  {/* Confirm Password (signup) */}
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
                          className={`pl-11 h-14 text-base rounded-xl ${confirmPassword && password !== confirmPassword ? 'border-destructive' : confirmPassword && password === confirmPassword ? 'border-emerald-500' : ''}`}
                          style={{ fontSize: '16px' }}
                          required
                        />
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
                        if (isForgotPassword && resetStep !== 'phone') {
                          setResetStep(resetStep === 'new-password' ? 'otp' : 'phone');
                        } else {
                          setIsForgotPassword(false);
                          setIsForgotPhone(false);
                          setEmail('');
                          setResetStep('phone');
                          setResetPhone('');
                          setResetOtpCode('');
                          setResetNewPassword('');
                          setResetConfirmPassword('');
                        }
                      }}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors touch-manipulation"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      {isForgotPassword && resetStep !== 'phone' ? 'Back' : 'Back to sign in'}
                    </button>
                  )}

                  {/* OTP Verification - MANDATORY for signup */}
                  {isSignUp && !isForgotPassword && !isForgotPhone && phone.replace(/\D/g, '').length >= 9 && (
                    <OtpVerificationStep
                      phone={phone}
                      otpSent={otpSent}
                      otpVerified={otpVerified}
                      otpLoading={otpLoading}
                      otpError={otpError}
                      onSendOtp={() => {
                        const cleanDigits = phone.replace(/\D/g, '');
                        const fullNum = cleanDigits.startsWith(countryCode) ? cleanDigits : countryCode + (cleanDigits.startsWith('0') ? cleanDigits.slice(1) : cleanDigits);
                        sendOtp(fullNum);
                      }}
                      onVerifyOtp={(otp) => {
                        const cleanDigits = phone.replace(/\D/g, '');
                        const fullNum = cleanDigits.startsWith(countryCode) ? cleanDigits : countryCode + (cleanDigits.startsWith('0') ? cleanDigits.slice(1) : cleanDigits);
                        verifyOtp(fullNum, otp);
                      }}
                      onResendOtp={() => {
                        const cleanDigits = phone.replace(/\D/g, '');
                        const fullNum = cleanDigits.startsWith(countryCode) ? cleanDigits : countryCode + (cleanDigits.startsWith('0') ? cleanDigits.slice(1) : cleanDigits);
                        sendOtp(fullNum);
                      }}
                    />
                  )}

                  {/* Remember me & Forgot password */}
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
                    disabled={isLoading || (isSignUp && (isDuplicate || isCheckingDuplicate || !otpVerified))}
                    style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        {isForgotPassword ? <Mail className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                        {isForgotPassword 
                          ? resetStep === 'phone' ? (email ? 'Send Reset Link' : 'Send Reset Code')
                            : resetStep === 'otp' ? 'Verify Code'
                            : 'Reset Password'
                          : isForgotPhone ? 'Sign In' : isSignUp ? 'Create Account' : 'Sign In'}
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* Social buttons for signup */}
              {isSignUp && (
                <div className="space-y-3">
                  <GoogleSignInButton
                    onClick={wrappedHandleGoogleSignIn}
                    disabled={isGoogleLoading || isAppleLoading || isLoading}
                    isLoading={isGoogleLoading}
                    variant="standard"
                  />
                  <AppleSignInButton
                    onClick={handleAppleSignIn}
                    disabled={isGoogleLoading || isAppleLoading || isLoading}
                    isLoading={isAppleLoading}
                  />
                </div>
              )}

              {/* Forgot phone link */}
              {!isSignUp && !isForgotPassword && !isForgotPhone && loginMode === 'password' && (
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
