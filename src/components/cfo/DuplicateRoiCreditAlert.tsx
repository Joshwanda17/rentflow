import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface Props {
  onJump: (tab: string) => void;
}

/**
 * Proactive banner shown across the CFO dashboard whenever duplicate ROI
 * credits (same portfolio + cycle posted within seconds) are detected.
 * Clicking it jumps to the Reconciliation tab where the full report lives.
 */
export function DuplicateRoiCreditAlert({ onJump }: Props) {
  const { data } = useQuery({
    queryKey: ['duplicate-roi-credits-alert'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_duplicate_roi_credits', {
        p_window_seconds: 120,
        p_lookback_days: 30,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ excess_amount: number }>;
    },
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const totalExcess = rows.reduce((s, r) => s + Number(r.excess_amount || 0), 0);

  return (
    <button
      onClick={() => onJump('reconciliation')}
      className="w-full mb-3 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-left transition-colors hover:bg-destructive/15"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-destructive">
          {rows.length} duplicate ROI credit{rows.length === 1 ? '' : 's'} detected
        </div>
        <div className="text-xs text-muted-foreground">
          Same-cycle returns credited twice within seconds • {formatUGX(totalExcess)} overpaid — review &amp; recover
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-destructive" />
    </button>
  );
}

export default DuplicateRoiCreditAlert;
