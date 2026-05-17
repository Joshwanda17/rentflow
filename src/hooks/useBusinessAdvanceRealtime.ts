import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  useEffect(() => {
    if (!channelKey) return;
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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, opts?.filter]);
}

export default useBusinessAdvanceRealtime;