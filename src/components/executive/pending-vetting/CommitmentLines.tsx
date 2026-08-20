import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2 } from 'lucide-react';

/** Tenant-level detail for a self-support portfolio, loaded on demand. */
export function CommitmentLines({ portfolioId }: { portfolioId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pending-portfolio-lines', portfolioId],
    staleTime: 30_000,
    queryFn: async () => {
      // Ops roles cannot read rent_requests / profiles directly (no RLS policy),
      // so tenant detail comes from a security-definer helper instead.
      const { data, error } = await supabase.rpc('partner_ops_pending_portfolio_lines' as any, {
        p_portfolio_id: portfolioId,
      });
      if (error) throw error;
      return ((data as any[]) || []).map(r => ({
        id: r.line_id,
        principal: Number(r.principal) || 0,
        tenant_name: r.tenant_name || 'Tenant',
        tenant_phone: r.tenant_phone || null,
        location: r.location || null,
        daily: Number(r.daily_repayment) || 0,
      }));
    },
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the tenants on this portfolio…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="text-xs text-destructive">
        Tenant detail could not load: {(error as Error)?.message || 'unknown error'}
      </p>
    );
  }
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">No tenant lines recorded.</p>;

  return (
    <div className="rounded-xl border border-border/60 divide-y divide-border/60 overflow-hidden">
      {data.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{l.tenant_name}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {[l.tenant_phone, l.location].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black text-foreground tabular-nums">{formatUGX(l.principal)}</p>
            {l.daily > 0 && (
              <p className="text-[10px] text-muted-foreground tabular-nums">{formatUGX(l.daily)} / day</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}