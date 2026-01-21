import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { AGENT_AGREEMENT_VERSION } from '@/components/agent/agreement/AgentAgreementContent';

interface AgentAgreementAcceptance {
  id: string;
  agent_id: string;
  agreement_version: string;
  accepted_at: string;
  ip_address: string | null;
  device_info: string | null;
  status: string;
}

export function useAgentAgreement() {
  const { user } = useAuth();
  const [isAccepted, setIsAccepted] = useState(false);
  const [acceptance, setAcceptance] = useState<AgentAgreementAcceptance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAcceptance = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('agent_agreement_acceptance')
        .select('*')
        .eq('agent_id', user.id)
        .eq('agreement_version', AGENT_AGREEMENT_VERSION)
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[useAgentAgreement] Error checking acceptance:', error);
      } else if (data) {
        setIsAccepted(true);
        setAcceptance(data as AgentAgreementAcceptance);
      } else {
        setIsAccepted(false);
        setAcceptance(null);
      }
    } catch (e) {
      console.error('[useAgentAgreement] Exception:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkAcceptance();
  }, [checkAcceptance]);

  const acceptAgreement = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      // Get IP address
      let ipAddress = null;
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch {
        console.warn('[useAgentAgreement] Could not fetch IP');
      }

      // Get device info
      const deviceInfo = `${navigator.userAgent} | ${navigator.platform} | ${window.screen.width}x${window.screen.height}`;

      const { data, error } = await supabase
        .from('agent_agreement_acceptance')
        .insert({
          agent_id: user.id,
          agreement_version: AGENT_AGREEMENT_VERSION,
          ip_address: ipAddress,
          device_info: deviceInfo,
          status: 'accepted'
        })
        .select()
        .single();

      if (error) {
        console.error('[useAgentAgreement] Error accepting:', error);
        return false;
      }

      setIsAccepted(true);
      setAcceptance(data as AgentAgreementAcceptance);
      return true;
    } catch (e) {
      console.error('[useAgentAgreement] Exception accepting:', e);
      return false;
    }
  }, [user]);

  return {
    isAccepted,
    acceptance,
    isLoading,
    acceptAgreement,
    refreshAcceptance: checkAcceptance,
    currentVersion: AGENT_AGREEMENT_VERSION
  };
}
