import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LANDLORD_AGREEMENT_VERSION } from '@/components/landlord/agreement/LandlordAgreementContent';

export function useLandlordAgreement() {
  const { user } = useAuth();
  const [isAccepted, setIsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      checkAgreementStatus();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const checkAgreementStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await (supabase
        .from('landlord_agreement_acceptance' as any)
        .select('id, accepted_at, agreement_version')
        .eq('landlord_id', user.id)
        .eq('agreement_version', LANDLORD_AGREEMENT_VERSION)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle() as any);

      if (error) {
        console.error('[useLandlordAgreement] Error checking status:', error);
      } else if (data) {
        setIsAccepted(true);
        setAcceptedAt(data.accepted_at);
      }
    } catch (err) {
      console.error('[useLandlordAgreement] Exception:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const acceptAgreement = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const deviceInfo = `${navigator.userAgent.substring(0, 100)}`;
      
      const { error } = await (supabase
        .from('landlord_agreement_acceptance' as any)
        .insert({
          landlord_id: user.id,
          agreement_version: LANDLORD_AGREEMENT_VERSION,
          status: 'accepted',
          device_info: deviceInfo,
        }) as any);

      if (error) {
        console.error('[useLandlordAgreement] Error accepting:', error);
        return false;
      }

      setIsAccepted(true);
      setAcceptedAt(new Date().toISOString());
      return true;
    } catch (err) {
      console.error('[useLandlordAgreement] Exception accepting:', err);
      return false;
    }
  };

  return {
    isAccepted,
    isLoading,
    acceptedAt,
    acceptAgreement,
    refetch: checkAgreementStatus,
  };
}
