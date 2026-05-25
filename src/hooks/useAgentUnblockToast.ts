import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';

/**
 * Watches `agent_eligibility_unblock_events` for the current agent and shows a
 * celebratory toast the first time they cross the 20% threshold each day.
 * Marks `toast_seen_at` so the toast does not re-fire on every page load.
 *
 * Fires on:
 *   - initial mount (catches events that happened while the app was closed)
 *   - realtime INSERT (catches threshold crossings while the app is open)
 */
export function useAgentUnblockToast(agentId?: string | null) {
  useEffect(() => {
    if (!agentId) return;

    const showAndMark = async (row: any) => {
      if (!row || row.toast_seen_at) return;
      const pct = Math.round(Number(row.ratio_pct) || 0);
      toast.success("You're unblocked! 🎉", {
        description:
          `Collected UGX ${formatUGX(row.paid_today)} of UGX ${formatUGX(row.expected_daily)} ` +
          `today (${pct}%) across ${row.active_count} active rents. ` +
          `You can post new rent requests now.`,
        duration: 10_000,
      });
      await supabase
        .from('agent_eligibility_unblock_events')
        .update({ toast_seen_at: new Date().toISOString() })
        .eq('id', row.id);
    };

    // 1) Check for any unseen event from today on mount
    (async () => {
      const todayKampala = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Africa/Kampala' }),
      )
        .toISOString()
        .slice(0, 10);
      const { data } = await supabase
        .from('agent_eligibility_unblock_events')
        .select('id, paid_today, expected_daily, ratio_pct, active_count, toast_seen_at')
        .eq('agent_id', agentId)
        .eq('kampala_day', todayKampala)
        .is('toast_seen_at', null)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) showAndMark(data);
    })();

    // 2) Realtime: catch the crossing while the dashboard is open
    const channel = supabase
      .channel(`agent-unblock-${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_eligibility_unblock_events',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => showAndMark(payload.new),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);
}

export default useAgentUnblockToast;