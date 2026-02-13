import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Mail, Lock, User, Phone, Loader2, Eye, EyeOff, MessageCircle, AlertCircle, LogIn } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import PasswordStrengthIndicator from '@/components/auth/PasswordStrengthIndicator';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { ReferralBanner } from '@/components/auth/ReferralBanner';
import { AuthTabToggle } from '@/components/auth/AuthTabToggle';
import { OtpVerificationStep } from '@/components/auth/OtpVerificationStep';
import { useAuthForm } from '@/hooks/useAuthForm';
import { SIGNUP_PAUSED } from '@/components/SignupPauseBanner';

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
    isLoading,
    loginError, setLoginError,
    failedAttempts,
    rememberMe, setRememberMe,
    showPassword, setShowPassword,
    isGoogleLoading,
    phoneInputRef, passwordInputRef,
    isDuplicate, isCheckingDuplicate, duplicateMessage,
    otpSent, otpVerified, otpLoading, otpError,
    sendOtp, verifyOtp, resetOtp,
    handleSubmit, handleGoogleSignIn,
  } = useAuthForm();

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

          <ReferralBanner referralId={referralId} becomeRole={becomeRole} />

          <Card className="border-border/50 shadow-lg overflow-hidden">
            {/* Prominent Google sign-in for login view */}
            {!isForgotPassword && !isForgotPhone && !isSignUp && (
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                isLoading={isGoogleLoading}
                variant="prominent"
              />
            )}

            {/* Tab toggle - hidden during signup pause */}
            {!isForgotPassword && !isForgotPhone && !SIGNUP_PAUSED && (
              <AuthTabToggle isSignUp={isSignUp} onToggle={setIsSignUp} />
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
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        ref={phoneInputRef}
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setLoginError(null); }}
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

                {/* Email (forgot flows) */}
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
                    onClick={() => { setIsForgotPassword(false); setIsForgotPhone(false); setEmail(''); }}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors touch-manipulation"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to sign in
                  </button>
                )}

                {/* OTP Verification - lifted for now */}

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
                  disabled={isLoading || (isSignUp && (isDuplicate || isCheckingDuplicate))}
                  style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
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

              {/* Google button for signup */}
              {isSignUp && (
                <GoogleSignInButton
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading || isLoading}
                  isLoading={isGoogleLoading}
                  variant="standard"
                />
              )}

              {/* Forgot phone link */}
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
