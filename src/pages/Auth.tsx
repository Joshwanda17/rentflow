import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Mail, Lock, User, Phone, Loader2, MessageCircle, AlertCircle, LogIn, Smartphone, ArrowRight } from 'lucide-react';
import { CountryCodeSelect } from '@/components/auth/CountryCodeSelect';
import WelileLogo from '@/components/WelileLogo';
import PasswordStrengthIndicator from '@/components/auth/PasswordStrengthIndicator';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { AppleSignInButton } from '@/components/auth/AppleSignInButton';
import { ReferralBanner } from '@/components/auth/ReferralBanner';
import { OtpVerificationStep } from '@/components/auth/OtpVerificationStep';
import { useAuthForm } from '@/hooks/useAuthForm';
import { SIGNUP_PAUSED } from '@/components/SignupPauseBanner';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useOtpVerification } from '@/hooks/useOtpVerification';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const VALID_SIGNUP_ROLES = ['tenant', 'agent', 'landlord', 'supporter'] as const;

const ROLE_OPTIONS = [
  { role: 'tenant' as const, emoji: '🏠', label: 'I need rent help', desc: 'Get funded instantly', gradient: 'from-blue-500 to-indigo-600' },
  { role: 'supporter' as const, emoji: '💰', label: 'I want to earn', desc: '15% monthly returns', gradient: 'from-emerald-500 to-teal-600' },
  { role: 'agent' as const, emoji: '⚡', label: 'I want to hustle', desc: 'Register & earn cash', gradient: 'from-amber-500 to-orange-600' },
  { role: 'landlord' as const, emoji: '🏢', label: 'Guaranteed rent', desc: 'Never chase tenants', gradient: 'from-purple-500 to-violet-600' },
];

export default function Auth() {
  const {
    referralId, becomeRole, preSelectedRole,
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
    resetStep, setResetStep,
    resetPhone, setResetPhone,
    resetOtpCode, setResetOtpCode,
    resetNewPassword, setResetNewPassword,
    resetConfirmPassword, setResetConfirmPassword,
    handleSubmit, handleGoogleSignIn, handleAppleSignIn,
  } = useAuthForm();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signIn: authSignIn } = useAuth();
  const [emailLoginLoading, setEmailLoginLoading] = useState(false);

  const hasValidRole = !!preSelectedRole && VALID_SIGNUP_ROLES.includes(preSelectedRole as any);
  const needsRoleSelection = isSignUp && !hasValidRole;

  const handleSelectRole = (role: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('role', role);
    setSearchParams(newParams, { replace: true });
  };

  const roleLabelMap: Record<string, string> = {
    tenant: '🏠 Tenant',
    supporter: '💰 Funder',
    agent: '⚡ Agent',
    landlord: '🏢 Landlord',
  };

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Login mode: 'password' (phone+pw), 'email', 'otp'
  const [loginMode, setLoginMode] = useState<'password' | 'otp' | 'email'>('password');
  const [emailLoginAddress, setEmailLoginAddress] = useState('');
  const [otpLoginPhone, setOtpLoginPhone] = useState('');
  const [otpLoginCode, setOtpLoginCode] = useState('');
  const [otpLoginStep, setOtpLoginStep] = useState<'phone' | 'code'>('phone');
  const [otpLoginLoading, setOtpLoginLoading] = useState(false);
  const [otpLoginCountryCode, setOtpLoginCountryCode] = useState('256');
  const loginOtp = useOtpVerification();

  // WhatsApp deeplink
  const deepLinkPhone = searchParams.get('phone');
  const deepLinkToken = searchParams.get('token');
  const deepLinkAgent = searchParams.get('agent');

  useEffect(() => {
    if (deepLinkPhone && deepLinkToken) {
      setLoginMode('otp');
      setOtpLoginPhone(deepLinkPhone);
      setOtpLoginCode(deepLinkToken);
      setOtpLoginStep('code');
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
        if (data.user_name) localStorage.setItem('welile_last_user_name', data.user_name);
        localStorage.setItem('welile_last_login_method', 'otp');
        localStorage.setItem('welile_had_session', 'true');
        toast({ title: `Welcome back${data.user_name ? ', ' + data.user_name : ''}! 🎉`, description: 'Logging you in...' });
        window.location.href = data.verify_url;
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please check your connection.', variant: 'destructive' });
    } finally {
      setOtpLoginLoading(false);
    }
  };

  const wrappedHandleSubmit = async (e: React.FormEvent) => {
    await handleSubmit(e);
    if (!isSignUp && !isForgotPassword && !isForgotPhone) {
      localStorage.setItem('welile_last_login_method', 'password');
    }
  };

  const wrappedHandleGoogleSignIn = async () => {
    localStorage.setItem('welile_last_login_method', 'google');
    await handleGoogleSignIn();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Just a moment...</p>
        </div>
      </div>
    );
  }

  // Returning user info
  const lastUserName = localStorage.getItem('welile_last_user_name');
  const lastLoginMethod = localStorage.getItem('welile_last_login_method');
  const hadSession = localStorage.getItem('welile_had_session') === 'true';

  const isLoginView = !isSignUp && !isForgotPassword && !isForgotPhone;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm relative z-10">

        {/* Logo — compact */}
        <div className="text-center mb-5">
          <div className="flex items-center justify-center mb-1">
            <WelileLogo linkToHome={false} />
          </div>
          {isLoginView && (
            <p className="text-sm text-muted-foreground mt-2 animate-in fade-in duration-300">
              {hadSession && lastUserName ? `Welcome back, ${lastUserName}` : 'Sign in to continue'}
            </p>
          )}
          {isSignUp && (
            <p className="text-sm text-muted-foreground mt-2 animate-in fade-in duration-300">Create your account</p>
          )}
        </div>

        {/* WhatsApp deeplink banner */}
        {deepLinkAgent && (
          <div className="mb-4 p-3 rounded-xl bg-accent/50 border border-accent flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <MessageCircle className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Sent by Agent {deepLinkAgent}</p>
              <p className="text-xs text-muted-foreground">Verifying automatically...</p>
            </div>
          </div>
        )}

        <ReferralBanner referralId={referralId} becomeRole={becomeRole} />

        {/* Role badge for signup */}
        {isSignUp && hasValidRole && (
          <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between animate-in fade-in duration-200">
            <span className="text-sm font-medium text-foreground">
              Joining as <span className="font-bold">{roleLabelMap[preSelectedRole!] || preSelectedRole}</span>
            </span>
            <button type="button" onClick={() => navigate('/welcome')} className="text-xs text-primary hover:underline">
              Change
            </button>
          </div>
        )}

        {/* Inline role selector for signup without role */}
        {needsRoleSelection && (
          <div className="space-y-2 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-sm font-medium text-foreground mb-3">What do you need?</p>
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.role}
                type="button"
                onClick={() => handleSelectRole(opt.role)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-150",
                  "bg-card border border-border/50 shadow-sm",
                  "hover:shadow-md hover:scale-[1.01] active:scale-[0.98]",
                  "touch-manipulation"
                )}
              >
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 bg-gradient-to-br", opt.gradient)}>
                  <span>{opt.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {!needsRoleSelection && (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-400">

            {/* ===== SIGN IN VIEW ===== */}
            {isLoginView && loginMode === 'password' && (
              <div className="space-y-3">
                {/* Social sign-in — front and center */}
                <div className="space-y-2.5">
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
                </div>

                {/* Divider */}
                <div className="relative flex items-center py-1">
                  <div className="flex-1 border-t border-border/40" />
                  <span className="px-3 text-xs text-muted-foreground">or use phone</span>
                  <div className="flex-1 border-t border-border/40" />
                </div>

                {/* Phone + Password — compact */}
                <form onSubmit={wrappedHandleSubmit} className="space-y-3">
                  <div className="relative flex">
                    <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={phoneInputRef}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setLoginError(null); }}
                        placeholder="700 123 456"
                        className={cn("pl-10 h-12 text-base rounded-xl rounded-l-none", loginError && 'border-destructive')}
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={passwordInputRef}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="pl-10 h-12 text-base rounded-xl"
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {loginError && (
                    <p className="text-xs text-destructive px-1">{loginError.message}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={rememberMe}
                        onCheckedChange={(checked) => {
                          setRememberMe(!!checked);
                          localStorage.setItem('welile_remember_me', String(!!checked));
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-muted-foreground">Remember me</span>
                    </label>
                    <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98] transition-transform"
                    disabled={isLoading}
                    style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
                  </Button>
                </form>

                {failedAttempts >= 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full gap-2 text-primary text-xs"
                    onClick={() => {
                      const message = encodeURIComponent(`Hello Welile Support,\n\nI'm having trouble logging in.\n\nPhone: ${phone}\n\nPlease help.`);
                      window.open(`https://wa.me/256783673998?text=${message}`, '_blank');
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Need help? Contact Support
                  </Button>
                )}

                {/* Alternative login methods — subtle links */}
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button type="button" onClick={() => setLoginMode('email')} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    Use email instead
                  </button>
                  <span className="text-border">•</span>
                  <button type="button" onClick={() => setLoginMode('otp')} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    SMS code login
                  </button>
                </div>
              </div>
            )}

            {/* ===== EMAIL LOGIN ===== */}
            {isLoginView && loginMode === 'email' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!emailLoginAddress.trim() || !password.trim()) return;
                  setEmailLoginLoading(true);
                  const safetyTimer = setTimeout(() => setEmailLoginLoading(false), 6000);
                  try {
                    const { error } = await authSignIn(emailLoginAddress.trim(), password);
                    if (error) {
                      let msg = error.message;
                      if (msg.includes('Invalid login credentials')) {
                        msg = 'Incorrect email or password. Try Google sign-in if you used it before.';
                      }
                      setLoginError({ message: msg, triedFormats: [] });
                      toast({ title: 'Sign In Failed', description: msg, variant: 'destructive' });
                    } else {
                      setLoginError(null);
                      localStorage.setItem('welile_last_login_method', 'email');
                    }
                  } finally {
                    clearTimeout(safetyTimer);
                    setEmailLoginLoading(false);
                  }
                }} className="space-y-3">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={emailLoginAddress}
                      onChange={(e) => { setEmailLoginAddress(e.target.value); setLoginError(null); }}
                      placeholder="you@example.com"
                      className={cn("pl-10 h-12 text-base rounded-xl", loginError && 'border-destructive')}
                      style={{ fontSize: '16px' }}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="pl-10 h-12 text-base rounded-xl"
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {loginError && <p className="text-xs text-destructive px-1">{loginError.message}</p>}

                  <Button
                    type="submit"
                    className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98]"
                    disabled={emailLoginLoading || !emailLoginAddress.trim() || !password.trim()}
                    style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {emailLoginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
                  </Button>
                </form>

                <GoogleSignInButton
                  onClick={wrappedHandleGoogleSignIn}
                  disabled={isGoogleLoading || isAppleLoading || emailLoginLoading}
                  isLoading={isGoogleLoading}
                  variant="standard"
                />

                <button type="button" onClick={() => setLoginMode('password')} className="w-full text-xs text-muted-foreground hover:text-primary text-center pt-1">
                  ← Back to phone login
                </button>
              </div>
            )}

            {/* ===== OTP LOGIN ===== */}
            {isLoginView && loginMode === 'otp' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                {otpLoginStep === 'phone' ? (
                  <>
                    <div className="relative flex">
                      <CountryCodeSelect value={otpLoginCountryCode} onChange={setOtpLoginCountryCode} />
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={otpLoginPhone}
                          onChange={(e) => setOtpLoginPhone(e.target.value)}
                          placeholder="700 123 456"
                          className="pl-10 h-12 text-base rounded-xl rounded-l-none"
                          style={{ fontSize: '16px' }}
                          autoFocus
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleSendOtpForLogin}
                      disabled={otpLoginLoading || otpLoginPhone.replace(/\D/g, '').length < 7}
                      className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98]"
                      style={{ fontSize: '16px' }}
                    >
                      {otpLoginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send SMS Code'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
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
                    <p className="text-xs text-muted-foreground text-center">Code sent to +{otpLoginCountryCode} {otpLoginPhone}</p>
                    <Button
                      type="button"
                      onClick={() => handleOtpLogin()}
                      disabled={otpLoginLoading || otpLoginCode.length !== 6}
                      className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98]"
                      style={{ fontSize: '16px' }}
                    >
                      {otpLoginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify & Log In'}
                    </Button>
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => { setOtpLoginStep('phone'); setOtpLoginCode(''); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                        <ArrowLeft className="h-3 w-3" /> Change number
                      </button>
                      <button type="button" onClick={handleSendOtpForLogin} disabled={otpLoginLoading} className="text-xs text-primary hover:underline">
                        Resend code
                      </button>
                    </div>
                  </>
                )}

                <GoogleSignInButton
                  onClick={wrappedHandleGoogleSignIn}
                  disabled={isGoogleLoading || isAppleLoading || isLoading}
                  isLoading={isGoogleLoading}
                  variant="standard"
                />

                <button type="button" onClick={() => setLoginMode('password')} className="w-full text-xs text-muted-foreground hover:text-primary text-center pt-1">
                  ← Back to phone login
                </button>
              </div>
            )}

            {/* ===== FORGOT PASSWORD ===== */}
            {isForgotPassword && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <p className="text-sm font-medium text-foreground">Reset Password</p>
                <p className="text-xs text-muted-foreground">
                  {resetStep === 'phone' ? 'Enter your phone or email' : resetStep === 'otp' ? 'Enter the 6-digit code' : 'Set your new password'}
                </p>

                <form onSubmit={wrappedHandleSubmit} className="space-y-3">
                  {resetStep === 'phone' && (
                    <>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="tel" inputMode="tel" value={resetPhone} onChange={(e) => setResetPhone(e.target.value)} placeholder="0700123456" className="pl-10 h-12 text-base rounded-xl" style={{ fontSize: '16px' }} />
                      </div>
                      <div className="relative flex items-center">
                        <div className="flex-1 border-t border-border/40" />
                        <span className="px-3 text-xs text-muted-foreground">or</span>
                        <div className="flex-1 border-t border-border/40" />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-10 h-12 text-base rounded-xl" style={{ fontSize: '16px' }} />
                      </div>
                    </>
                  )}

                  {resetStep === 'otp' && (
                    <Input type="text" inputMode="numeric" maxLength={6} value={resetOtpCode} onChange={(e) => setResetOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="h-14 text-center text-2xl tracking-[0.5em] rounded-xl font-mono" style={{ fontSize: '24px' }} required />
                  )}

                  {resetStep === 'new-password' && (
                    <>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type={showPassword ? "text" : "password"} value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} placeholder="New password" className="pl-10 h-12 text-base rounded-xl" style={{ fontSize: '16px' }} required />
                      </div>
                      <PasswordStrengthIndicator password={resetNewPassword} />
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type={showPassword ? "text" : "password"} value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} placeholder="Confirm password" className={cn("pl-10 h-12 text-base rounded-xl", resetConfirmPassword && resetNewPassword !== resetConfirmPassword && 'border-destructive')} style={{ fontSize: '16px' }} required />
                      </div>
                      {resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                        <p className="text-xs text-destructive">Passwords don't match</p>
                      )}
                    </>
                  )}

                  <Button type="submit" className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98]" disabled={isLoading} style={{ fontSize: '16px' }}>
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : resetStep === 'phone' ? (email ? 'Send Reset Link' : 'Send Reset Code') : resetStep === 'otp' ? 'Verify Code' : 'Reset Password'}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    if (resetStep !== 'phone') {
                      setResetStep(resetStep === 'new-password' ? 'otp' : 'phone');
                    } else {
                      setIsForgotPassword(false);
                      setResetStep('phone');
                      setResetPhone('');
                      setResetOtpCode('');
                      setResetNewPassword('');
                      setResetConfirmPassword('');
                    }
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-primary text-center flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {resetStep !== 'phone' ? 'Back' : 'Back to sign in'}
                </button>
              </div>
            )}

            {/* ===== FORGOT PHONE (email login) ===== */}
            {isForgotPhone && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <p className="text-sm font-medium text-foreground">Sign In with Email</p>
                <form onSubmit={wrappedHandleSubmit} className="space-y-3">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-10 h-12 text-base rounded-xl" style={{ fontSize: '16px' }} required />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="pl-10 h-12 text-base rounded-xl" style={{ fontSize: '16px' }} required />
                  </div>
                  <Button type="submit" className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98]" disabled={isLoading} style={{ fontSize: '16px' }}>
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
                  </Button>
                </form>
                <button type="button" onClick={() => { setIsForgotPhone(false); setEmail(''); }} className="w-full text-xs text-muted-foreground hover:text-primary text-center flex items-center justify-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </button>
              </div>
            )}

            {/* ===== SIGN UP ===== */}
            {isSignUp && !needsRoleSelection && (
              <div className="space-y-3 animate-in fade-in duration-200">
                {/* Social signup */}
                <div className="space-y-2.5">
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
                </div>

                <div className="relative flex items-center py-1">
                  <div className="flex-1 border-t border-border/40" />
                  <span className="px-3 text-xs text-muted-foreground">or sign up with phone</span>
                  <div className="flex-1 border-t border-border/40" />
                </div>

                <form onSubmit={wrappedHandleSubmit} className="space-y-3">
                  {/* Full Name */}
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="pl-10 h-12 text-base rounded-xl" style={{ fontSize: '16px' }} required />
                  </div>

                  {/* Phone */}
                  <div className="relative flex">
                    <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={phoneInputRef}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setLoginError(null); }}
                        placeholder="700 123 456"
                        className={cn("pl-10 h-12 text-base rounded-xl rounded-l-none", isDuplicate && 'border-destructive')}
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                  </div>
                  {isDuplicate && (
                    <p className="text-xs text-destructive flex items-center gap-1 px-1"><AlertCircle className="h-3 w-3" />{duplicateMessage}</p>
                  )}
                  {isCheckingDuplicate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 px-1"><Loader2 className="h-3 w-3 animate-spin" />Checking...</p>
                  )}

                  {/* Password */}
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="pl-10 h-12 text-base rounded-xl"
                      style={{ fontSize: '16px' }}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <PasswordStrengthIndicator password={password} />

                  {/* Confirm Password */}
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className={cn("pl-10 h-12 text-base rounded-xl", confirmPassword && password !== confirmPassword && 'border-destructive', confirmPassword && password === confirmPassword && 'border-emerald-500')}
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-destructive px-1">Passwords don't match</p>
                  )}

                  {/* OTP Verification */}
                  {phone.replace(/\D/g, '').length >= 9 && (
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

                  <Button
                    type="submit"
                    className="w-full h-12 text-base rounded-xl font-semibold touch-manipulation active:scale-[0.98]"
                    disabled={isLoading || isDuplicate || isCheckingDuplicate || !otpVerified}
                    style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create Account'}
                  </Button>
                </form>
              </div>
            )}

            {/* Sign in / Sign up toggle */}
            {!isForgotPassword && !isForgotPhone && !SIGNUP_PAUSED && (
              <div className="text-center mt-5">
                <p className="text-sm text-muted-foreground">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                  {' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-primary font-semibold hover:underline"
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </button>
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground/60 mt-6">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="hover:underline">Terms</Link>
          {' & '}
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
