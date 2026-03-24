import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Banknote, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface Receivable {
  id: string;
  rent_amount: number;
  amount_repaid: number;
  status: string;
  funded_at: string | null;
  tenant_name: string;
  agent_name: string;
  landlord_name: string;
  daily_repayment: number | null;
  duration_days: number | null;
}

export function CFOReceivablesTracker() {
  const { data: receivables, isLoading } = useQuery({
    queryKey: ['cfo-receivables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rent_requests')
        .select(`
          id, rent_amount, amount_repaid, status, funded_at,
          daily_repayment, duration_days, tenant_id, assigned_agent_id, landlord_id
        `)
        .in('status', ['funded', 'disbursed', 'repaying'])
        .order('funded_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!data || data.length === 0) return [] as Receivable[];

      // Batch-fetch names
      const tenantIds = [...new Set(data.map(r => r.tenant_id).filter(Boolean))] as string[];
      const agentIds = [...new Set(data.map(r => r.assigned_agent_id).filter(Boolean))] as string[];
      const landlordIds = [...new Set(data.map(r => r.landlord_id).filter(Boolean))] as string[];

      const [profilesRes, landlordsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', [...tenantIds, ...agentIds]),
        supabase.from('landlords').select('id, name').in('id', landlordIds),
      ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p.full_name]));
      const landlordMap = Object.fromEntries((landlordsRes.data || []).map(l => [l.id, l.name]));

      return data.map((r: any) => ({
        id: r.id,
        rent_amount: r.rent_amount || 0,
        amount_repaid: r.amount_repaid || 0,
        status: r.status,
        funded_at: r.funded_at,
        daily_repayment: r.daily_repayment,
        duration_days: r.duration_days,
        tenant_name: profileMap[r.tenant_id] || 'Unknown',
        agent_name: profileMap[r.assigned_agent_id] || 'Unassigned',
        landlord_name: landlordMap[r.landlord_id] || 'Unknown',
      })) as Receivable[];
    },
    staleTime: 60000,
    refetchInterval: 30000,
  });

  const rows = receivables || [];
  const totalFunded = rows.reduce((s, r) => s + r.rent_amount, 0);
  const totalRepaid = rows.reduce((s, r) => s + r.amount_repaid, 0);
  const totalOutstanding = totalFunded - totalRepaid;
  const fundedAwaitingPayout = rows.filter(r => r.status === 'funded').length;
  const activeRepaying = rows.filter(r => r.status === 'repaying').length;

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'funded': return 'bg-amber-500';
      case 'disbursed': return 'bg-blue-500';
      case 'repaying': return 'bg-emerald-500';
      default: return 'bg-muted-foreground';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Receivables
        </h3>
        <span className="text-[10px] text-muted-foreground">{rows.length} active</span>
      </div>

      {/* KPI Strip — compact 4-col */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Funded', value: formatUGX(totalFunded) },
          { label: 'Outstanding', value: formatUGX(totalOutstanding), accent: true },
          { label: 'Awaiting', value: String(fundedAwaitingPayout) },
          { label: 'Repaying', value: String(activeRepaying) },
        ].map(k => (
          <div key={k.label} className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className={`text-[11px] font-bold font-mono truncate ${k.accent ? 'text-amber-600' : ''}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Banknote className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
          <p className="text-xs">No active receivables</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-72 overflow-y-auto">
          {rows.map((r) => {
            const pct = r.rent_amount > 0 ? Math.round((r.amount_repaid / r.rent_amount) * 100) : 0;

            return (
              <div key={r.id} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusDot(r.status)}`} />
                    <span className="text-xs font-medium truncate">{r.tenant_name}</span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold shrink-0">{formatUGX(r.rent_amount)}</span>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1">
                    <div
                      className={`h-1 rounded-full transition-all ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-destructive'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct}%</span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">→ {r.landlord_name}</span>
                  {r.funded_at && <span>{format(new Date(r.funded_at), 'dd MMM')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
