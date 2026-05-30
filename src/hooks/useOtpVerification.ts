import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cleanPhoneNumber } from '@/lib/phoneUtils';

export type OtpSendStatus = 'idle' | 'pending' | 'accepted' | 'failed';

// How long / how often we poll the gateway-acceptance status after a send
// that the backend reported as still "pending".
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

export function useOtpVerification() {
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<OtpSendStatus>('idle');

  // Token used to cancel an in-flight polling loop (on resend / reset / unmount).
  const pollTokenRef = useRef(0);

  useEffect(() => {
    // Cancel any polling when the component unmounts.
    return () => {
      pollTokenRef.current += 1;
    };
  }, []);

  const pollSendStatus = useCallback(async (phone: string) => {
    const token = ++pollTokenRef.current;
    const cleaned = cleanPhoneNumber(phone);

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      // A newer send/reset superseded this loop — stop silently.
      if (token !== pollTokenRef.current) return;

      const { data, error } = await supabase.functions.invoke('sms-otp', {
        body: { action: 'status', phone: cleaned },
      });
      if (token !== pollTokenRef.current) return;
      if (error) continue; // transient — keep trying

      const status = data?.status as string | undefined;
      if (status === 'accepted') {
        setSendStatus('accepted');
        return;
      }
      if (status === 'failed') {
        setSendStatus('failed');
        setOtpError('We could not send the code. Please try again.');
        return;
      }
      // 'pending' / 'unknown' — keep polling.
    }
    // Ran out of attempts; leave status as 'pending' (code may still arrive).
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    setOtpLoading(true);
    setOtpError(null);
    setSendStatus('idle');
    // Supersede any prior polling loop.
    pollTokenRef.current += 1;
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
        setSendStatus('failed');
        return false;
      }
      if (data?.error) {
        setOtpError(data.error);
        setSendStatus('failed');
        return false;
      }
      setOtpSent(true);
      setVerifiedPhone(cleanPhoneNumber(phone));
      if (data?.pending) {
        // Gateway acceptance not yet confirmed — poll for it.
        setSendStatus('pending');
        void pollSendStatus(phone);
      } else {
        setSendStatus('accepted');
      }
      return true;
    } catch (e: any) {
      setOtpError(e?.message || 'Failed to send OTP');
      setSendStatus('failed');
      return false;
    } finally {
      setOtpLoading(false);
    }
  }, [pollSendStatus]);

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
    setSendStatus('idle');
    pollTokenRef.current += 1;
  }, []);

  return {
    otpSent,
    otpVerified,
    otpLoading,
    otpError,
    verifiedPhone,
    sendStatus,
    sendOtp,
    verifyOtp,
    resetOtp,
  };
}
