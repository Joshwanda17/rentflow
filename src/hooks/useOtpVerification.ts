import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cleanPhoneNumber } from '@/lib/phoneUtils';

export function useOtpVerification() {
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);

  const sendOtp = useCallback(async (phone: string) => {
    setOtpLoading(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('sms-otp', {
        body: { action: 'send', phone: cleanPhoneNumber(phone) },
      });
      if (error) {
        // Try to extract error message from response context
        const errMsg = error?.context ? 
          await error.context.json().then((r: any) => r.error).catch(() => error.message) 
          : error.message;
        setOtpError(errMsg || 'Failed to send OTP');
        return false;
      }
      if (data?.error) {
        setOtpError(data.error);
        return false;
      }
      setOtpSent(true);
      setVerifiedPhone(cleanPhoneNumber(phone));
      return true;
    } catch (e: any) {
      setOtpError(e?.message || 'Failed to send OTP');
      return false;
    } finally {
      setOtpLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    setOtpLoading(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('sms-otp', {
        body: { action: 'verify', phone: cleanPhoneNumber(phone), otp },
      });
      if (error) {
        const errMsg = error?.context ?
          await error.context.json().then((r: any) => r.error).catch(() => error.message)
          : error.message;
        setOtpError(errMsg || 'Verification failed');
        return false;
      }
      if (data?.error) {
        setOtpError(data.error);
        return false;
      }
      setOtpVerified(true);
      return true;
    } catch (e: any) {
      setOtpError(e?.message || 'Verification failed');
      return false;
    } finally {
      setOtpLoading(false);
    }
  }, []);

  const resetOtp = useCallback(() => {
    setOtpSent(false);
    setOtpVerified(false);
    setOtpError(null);
    setVerifiedPhone(null);
  }, []);

  return {
    otpSent,
    otpVerified,
    otpLoading,
    otpError,
    verifiedPhone,
    sendOtp,
    verifyOtp,
    resetOtp,
  };
}
