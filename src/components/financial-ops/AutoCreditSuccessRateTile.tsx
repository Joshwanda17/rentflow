import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Zap } from 'lucide-react';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';

interface AutoCreditSuccessRateTileProps {
  /** Opens the Auto-Credit Review tool so a low rate is immediately actionable. */
  onClick?: () => void;
}

interface SuccessRateData {
  attempted: number;
  successful: number;
  successRatePct: number | null;
}

export function AutoCreditSuccessRateTile({ onClick }: AutoCreditSuccessRateTileProps) {
  const autoRefresh = useFinOpsAutoRefresh();

  const { data, isLoading } = useQuery({
    queryKey: ['finops-autocredit-success-rate', 24],
    queryFn: async (): Promise<SuccessRateData> => {
      const { data, error } = await supabase.rpc('get_deposit_autocredit_success_rate' as any, { p_window_hours: 24 });
      if (error) throw error;
      const d = data as any;
      return {
        attempted: Number(d.attempted ?? 0),
        successful: Number(d.successful ?? 0),
        successRatePct: d.success_rate_pct === null ? null : Number(d.success_rate_pct),
      };
    },
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  const hasActivity = !isLoading && (data?.attempted ?? 0) > 0;

  const className = `text-left rounded-2xl border border-border bg-card p-5 min-w-0 flex flex-col ${
    onClick ? 'hover:border-primary/40 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : ''
  }`;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Auto-Credit Success</p>
        {hasActivity && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Zap className="h-3 w-3" /> 24h
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span>Parsed MTN/Airtel deposits auto-credited to a wallet</span>
      </div>

      <div className="flex-1" />

      <div className="mt-6 pt-4 border-t border-border">
        <p className={`font-mono text-3xl sm:text-4xl font-black tabular-nums ${isLoading ? 'animate-pulse text-muted-foreground' : 'text-foreground'}`}>
          {isLoading ? '——' : data?.successRatePct === null ? '—' : `${data?.successRatePct}%`}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground font-medium">
          {isLoading
            ? 'Loading…'
            : hasActivity
              ? `${data?.successful} / ${data?.attempted} successful`
              : 'No deposit SMS in the last 24h'}
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
