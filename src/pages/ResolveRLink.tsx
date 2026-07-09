import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import PayoutReceipt from './PayoutReceipt';

/**
 * Unified resolver for the shared `/r/:code` namespace. Recruiting / signup
 * short links and public payout-receipt tokens both live under `/r/`. This
 * dispatcher first tries to resolve the code as a short link and redirects to
 * its target; if it's not a short link, it renders the payout receipt (which
 * reads the same `code` param as a token). This removes the earlier route
 * collision that made every short link show "Receipt not found".
 */
export default function ResolveRLink() {
  const { code } = useParams<{ code: string }>();
  const [mode, setMode] = useState<'checking' | 'receipt'>('checking');

  useEffect(() => {
    if (!code) { setMode('receipt'); return; }
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .rpc('resolve_short_link', { p_code: code })
          .maybeSingle();
        if (!active) return;
        const target = data as { target_path?: string; target_params?: Record<string, string> | null } | null;
        if (!error && target?.target_path) {
          const params = new URLSearchParams();
          if (target.target_params) {
            Object.entries(target.target_params).forEach(([k, v]) => params.set(k, String(v)));
          }
          const qs = params.toString();
          const fullUrl = `${target.target_path}${qs ? `?${qs}` : ''}`;
          window.location.replace(`${window.location.origin}${fullUrl}`);
          return;
        }
      } catch {
        /* not a short link — fall through to the receipt view */
      }
      if (active) setMode('receipt');
    })();
    return () => { active = false; };
  }, [code]);

  if (mode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <PayoutReceipt />;
}