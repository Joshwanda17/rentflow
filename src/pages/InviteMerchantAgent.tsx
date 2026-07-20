import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_KEY = 'merchant_agent_ref';

/**
 * Invite landing page. Accepts `?ref=<referrer_user_id>` and forwards the
 * visitor to the Merchant-Agent-locked signup flow. The `mref` param is what
 * `useAuthForm` reads and persists into signup metadata, so the referrer
 * survives OAuth redirects and email-verification bounces.
 */
export default function InviteMerchantAgent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    const ref = (params.get('ref') || '').trim();
    // Always persist mref so it survives OAuth/email bounces and is picked up
    // by MerchantAgentReferralGate once signed in.
    if (ref && UUID_RX.test(ref)) {
      try { localStorage.setItem(STORAGE_KEY, ref); } catch { /* ignore */ }
    }

    // Not signed in → send to signup, locked to the Merchant Agent flow.
    if (!user?.id) {
      const q = new URLSearchParams({ signup: '1' });
      if (ref) q.set('mref', ref);
      navigate(`/auth?${q.toString()}`, { replace: true });
      return;
    }

    // Signed in → stamp pending flag (if applicable) and route to the
    // Merchant Agent surface — never a tenant/regular agent dashboard.
    (async () => {
      if (ref && UUID_RX.test(ref) && ref !== user.id) {
        await supabase
          .from('profiles')
          .update({
            pending_merchant_agent: true,
            merchant_agent_referrer_id: ref,
          })
          .eq('id', user.id)
          .is('merchant_agent_referrer_id', null);
      }

      // If already an active merchant agent, land on the merchant agent
      // dashboard directly; otherwise onboarding.
      const { data: ca } = await supabase
        .from('cashout_agents')
        .select('id, active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (ca?.active) {
        navigate('/dashboard/agent', { replace: true });
      } else {
        navigate('/merchant-agent/onboarding', { replace: true });
      }
    })();
  }, [navigate, params, user?.id, loading]);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
      Opening Merchant Agent registration…
    </div>
  );
}