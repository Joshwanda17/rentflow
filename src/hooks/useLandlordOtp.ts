import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cleanPhoneNumber } from '@/lib/phoneUtils';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';

export function useLandlordOtp() {
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const sendOtp = useCallback(async (phone: string) => {
    setOtpLoading(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('sms-otp', {
        body: { action: 'send', phone: cleanPhoneNumber(phone) },
      });
      if (error) {
        const errMsg = await extractFromErrorObject(error, 'Failed to send OTP to landlord');
        setOtpError(errMsg);
        return false;
      }
      if (data?.error) {
        setOtpError(data.error);
        return false;
      }
      setOtpSent(true);
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
        const errMsg = await extractFromErrorObject(error, 'Verification failed');
        setOtpError(errMsg);
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
  }, []);

  return {
    otpSent,
    otpVerified,
    otpLoading,
    otpError,
    sendOtp,
    verifyOtp,
    resetOtp,
  };
}
