import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface Props {
  aiId: string;
  className?: string;
}

interface VouchSnapshot {
  borrowing_limit_ugx: number;
  agent_earned_vouch_ugx: number;
}

/**
 * Shows the Welile-vouched amount for a borrower (looked up by AI ID), so
 * lending agents can see the trust-backed limit and the rent-collection
 * portion (2× collected rent) at a glance before lending.
 *
 * Reads the public `welile_trust_score_cache` row joined via AI ID. If the
 * borrower has no cache row yet (new user), the badge silently hides.
 */
export function BorrowerVouchBadge({ aiId, className }: Props) {
  const [snap, setSnap] = useState<VouchSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!aiId) return;

    (async () => {
      const { data } = await supabase
        .from('welile_trust_score_cache')
        .select('borrowing_limit_ugx, agent_earned_vouch_ugx')
        .eq('ai_id', aiId.toUpperCase())
        .maybeSingle();

      if (cancelled) return;
      if (data) {
        setSnap({
          borrowing_limit_ugx: Number(data.borrowing_limit_ugx) || 0,
          agent_earned_vouch_ugx: Number(data.agent_earned_vouch_ugx) || 0,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [aiId]);

  if (!snap || snap.borrowing_limit_ugx <= 0) return null;

  const earned = snap.agent_earned_vouch_ugx;
  // Earned portion comes from 2× collected rent — derive collected for display.
  const collected = earned > 0 ? earned / 2 : 0;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px]',
        className,
      )}
      title={
        collected > 0
          ? `Welile vouches ${formatUGX(snap.borrowing_limit_ugx)} — earned from ${formatUGX(collected)} in rent collected (2×)`
          : `Welile vouches ${formatUGX(snap.borrowing_limit_ugx)}`
      }
    >
      <ShieldCheck className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
      <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
        Welile vouches {formatUGX(snap.borrowing_limit_ugx)}
      </span>
      {collected > 0 && (
        <span className="text-emerald-700/70 dark:text-emerald-400/70">
          · 2× of {formatUGX(collected)} collected
        </span>
      )}
    </div>
  );
}

export default BorrowerVouchBadge;