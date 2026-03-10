import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';

interface OtpVerificationStepProps {
  phone: string;
  otpSent: boolean;
  otpVerified: boolean;
  otpLoading: boolean;
  otpError: string | null;
  onSendOtp: () => void;
  onVerifyOtp: (otp: string) => void;
  onResendOtp: () => void;
}

export function OtpVerificationStep({
  phone,
  otpSent,
  otpVerified,
  otpLoading,
  otpError,
  onSendOtp,
  onVerifyOtp,
  onResendOtp,
}: OtpVerificationStepProps) {
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(cooldownRef.current);
  }, [resendCooldown]);

  const handleSend = () => {
    onSendOtp();
    setResendCooldown(60);
  };

  const handleResend = () => {
    setOtp('');
    onResendOtp();
    setResendCooldown(60);
  };

  const handleOtpComplete = (value: string) => {
    setOtp(value);
    if (value.length === 6) {
      onVerifyOtp(value);
    }
  };

  if (otpVerified) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          Phone verified successfully
        </span>
      </div>
    );
  }

  if (!otpSent) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={handleSend}
        disabled={otpLoading || !phone}
        className="w-full gap-2 h-12 rounded-xl"
      >
        {otpLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        Verify Phone Number via SMS
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to <span className="font-medium text-foreground">{phone}</span>
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP maxLength={6} value={otp} onChange={handleOtpComplete}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {otpLoading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying...
        </div>
      )}

      {otpError && (
        <p className="text-sm text-destructive text-center">{otpError}</p>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || otpLoading}
          className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {resendCooldown > 0 ? (
            <span className="flex items-center gap-1 justify-center">
              <RefreshCw className="h-3 w-3" />
              Resend in {resendCooldown}s
            </span>
          ) : (
            <span className="flex items-center gap-1 justify-center">
              <RefreshCw className="h-3 w-3" />
              Resend code
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
