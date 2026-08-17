import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const INACTIVITY_DAYS = 5;
const TRANSFER_GRACE_MS = 48 * 60 * 60 * 1000;

interface Props {
  agentId: string;
}

/**
 * Shows a bold red banner when an agent has active tenants but hasn't
 * recorded any rent collection in the past 5 consecutive days. A live
 * 48-hour countdown from the 5-day mark warns the agent that their
 * tenants will be reassigned if activity does not resume.
 */
export function AgentInactivityWarningBanner({ agentId }: Props) {
  const { data } = useQuery({
    queryKey: ['agent-inactivity-warning', agentId],
    enabled: !!agentId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const [{ data: activeRows }, { data: lastCollection }] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('id, funded_at, disbursed_at, created_at')
          .eq('assigned_agent_id', agentId)
          .in('status', ['repaying', 'funded']),
        supabase
          .from('agent_collections')
          .select('created_at')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      // Earliest moment any currently-active tenancy became collectible.
      const starts = (activeRows ?? [])
        .map((r: any) => r.disbursed_at || r.funded_at || r.created_at)
        .filter(Boolean)
        .map((d: string) => new Date(d).getTime())
        .sort((a, b) => a - b);
      return {
        activeCount: activeRows?.length ?? 0,
        oldestActiveStartAt: starts.length ? starts[0] : null,
        lastCollectionAt: lastCollection?.created_at ?? null,
      };
    },
  });

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  if (data.activeCount === 0) return null;

  // Idle clock starts at the LATER of: last collection, or the moment the
  // agent's oldest active tenancy actually became collectible. A tenancy
  // funded 4 days ago cannot be "5 days uncollected".
  const lastCollectionMs = data.lastCollectionAt
    ? new Date(data.lastCollectionAt).getTime()
    : 0;
  const startMs = data.oldestActiveStartAt ?? 0;
  if (!startMs) return null;
  const lastMs = Math.max(lastCollectionMs, startMs);
  const daysSince = (now - lastMs) / (24 * 60 * 60 * 1000);

  if (daysSince < INACTIVITY_DAYS) return null;

  const inactivityStart = lastMs + INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  const deadline = inactivityStart + TRANSFER_GRACE_MS;
  const remaining = Math.max(0, deadline - now);

  const hh = Math.floor(remaining / 3_600_000);
  const mm = Math.floor((remaining % 3_600_000) / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  const countdown = [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
  const expired = remaining === 0;

  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-red-600 bg-red-600 text-white shadow-2xl shadow-red-900/40 overflow-hidden animate-pulse-slow"
    >
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white/15 shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-extrabold tracking-tight uppercase">
              ⚠️ Urgent action required
            </p>
            <p className="text-sm sm:text-[15px] mt-1 leading-snug text-white/95">
              You have not collected rent from your tenants for the past{' '}
              <span className="font-bold">5 days</span>. To ensure uninterrupted
              service for our tenants, your{' '}
              <span className="font-bold">{data.activeCount} active tenant{data.activeCount === 1 ? '' : 's'}</span>{' '}
              will be transferred to another active agent in the next 48 hours
              if no rent collection activity is recorded.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-black/25 border border-white/20 p-3 flex items-center justify-between gap-3">
          <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-white/85">
            Time remaining
          </span>
          <span
            className={`font-mono text-2xl sm:text-3xl font-black tabular-nums ${expired ? 'text-yellow-200' : 'text-white'}`}
            aria-live="polite"
          >
            {expired ? 'EXPIRED' : countdown}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-white/90">
          Collect rent or resume activity before the countdown reaches zero to
          prevent your tenants from being reassigned.
        </p>
      </div>
    </div>
  );
}

export default AgentInactivityWarningBanner;