import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Reads the platform-wide `treasury_controls.withdrawals_paused` flag.
 * When true, all user-facing withdrawal entry points and merchant-agent
 * claim actions must be blocked.
 */
export function useWithdrawalsPaused() {
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('treasury_controls')
        .select('enabled')
        .eq('control_key', 'withdrawals_paused')
        .maybeSingle();
      if (!cancelled) {
        setPaused(Boolean((data as { enabled?: boolean } | null)?.enabled));
        setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel('treasury-controls-withdrawals-paused')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treasury_controls' },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { paused, loading };
}