import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Invite landing page. Accepts `?ref=<referrer_user_id>` and forwards the
 * visitor to the Merchant-Agent-locked signup flow. The `mref` param is what
 * `useAuthForm` reads and persists into signup metadata, so the referrer
 * survives OAuth redirects and email-verification bounces.
 */
export default function InviteMerchantAgent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const ref = (params.get('ref') || '').trim();
    const q = new URLSearchParams({ signup: '1' });
    if (ref) q.set('mref', ref);
    navigate(`/auth?${q.toString()}`, { replace: true });
  }, [navigate, params]);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
      Opening Merchant Agent registration…
    </div>
  );
}