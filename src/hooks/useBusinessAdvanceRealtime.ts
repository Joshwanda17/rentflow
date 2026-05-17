import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Shared realtime subscription for the `business_advances` table so the
 * tenant dashboard hero and the public tracking page stay in lockstep with
 * any status change written by agent ops, tenant ops, landlord ops, COO,
 * CFO, or the disbursement engine.
 *
 * Pass a `filter` (e.g. `tenant_id=eq.<uuid>`) when you can scope to a single
 * row server-side; omit it for anonymous public trackers that don't have an
 * auth context to filter against.
 */
export function useBusinessAdvanceRealtime(
  channelKey: string | null | undefined,
  onChange: () => void,
  opts?: { filter?: string }
) {
  const warnedRef = useRef(false);
  const reconnectedRef = useRef(false);

  useEffect(() => {
    if (!channelKey) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimeout: ReturnType<typeof setTimeout> | null = null;

    const startPollingFallback = () => {
      if (pollTimer) return;
      // Light-touch fallback: poll every 15s so the user still sees updates
      // even when the websocket can't reach Realtime.
      pollTimer = setInterval(() => {
        if (!cancelled) onChange();
      }, 15000);
    };

    const stopPollingFallback = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const ch = supabase
      .channel(`business-advance-rt-${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_advances',
          ...(opts?.filter ? { filter: opts.filter } : {}),
        },
        () => onChange()
      )
      .subscribe((status, err) => {
        if (cancelled) return;

        if (status === 'SUBSCRIBED') {
          if (connectTimeout) {
            clearTimeout(connectTimeout);
            connectTimeout = null;
          }
          stopPollingFallback();
          if (warnedRef.current && !reconnectedRef.current) {
            reconnectedRef.current = true;
            toast.success('Live updates reconnected', {
              description: 'You are back in sync with the latest status.',
            });
          }
          return;
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          // Surface a friendly toast at most once, then degrade to polling
          // so the UI doesn't go stale.
          if (!warnedRef.current) {
            warnedRef.current = true;
            toast.error('Live updates paused', {
              description:
                status === 'TIMED_OUT'
                  ? 'Connection timed out — we will keep checking for updates in the background.'
                  : 'We lost the live connection — falling back to periodic refresh.',
            });
            if (err) {
              console.warn('[useBusinessAdvanceRealtime] channel error', err);
            }
          }
          startPollingFallback();
        }
      });

    // Hard timeout: if we never reach SUBSCRIBED within 10s, warn and start
    // polling so the tracker still moves.
    connectTimeout = setTimeout(() => {
      if (cancelled) return;
      if (!warnedRef.current) {
        warnedRef.current = true;
        toast.warning('Taking longer than usual to connect', {
          description: 'We will keep refreshing in the background so you don\'t miss updates.',
        });
      }
      startPollingFallback();
    }, 10000);

    return () => {
      cancelled = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      stopPollingFallback();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, opts?.filter]);
}

export default useBusinessAdvanceRealtime;