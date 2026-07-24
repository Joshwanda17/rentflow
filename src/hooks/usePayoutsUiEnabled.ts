import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Reads the CTO Platform Controls flag `payouts_ui_enabled` from
 * `treasury_controls`. When false (default), Claim + Withdraw buttons
 * across the app stay disabled. When the CTO flips it ON, those buttons
 * become functional again.
 *
 * Single source of truth — no cache; small realtime subscription so all
 * dashboards react immediately when the CTO toggles the switch.
 */
export function usePayoutsUiEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('treasury_controls')
        .select('enabled')
        .eq('control_key', 'payouts_ui_enabled')
        .maybeSingle();
      if (!cancelled) {
        setEnabled(!!data?.enabled);
        setLoading(false);
      }
    };
    void load();

    const channel = supabase
      .channel('payouts_ui_enabled_flag')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treasury_controls', filter: 'control_key=eq.payouts_ui_enabled' },
        (payload: any) => {
          const next = payload?.new?.enabled;
          if (typeof next === 'boolean') setEnabled(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { enabled, loading };
}

export default usePayoutsUiEnabled;