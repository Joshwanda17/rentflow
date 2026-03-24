import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Banknote, Clock, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

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
          daily_repayment, duration_days,
          tenant:profiles!rent_requests_user_id_fkey(full_name),
          agent:profiles!rent_requests_assigned_agent_id_fkey(full_name),
          landlord:landlords!rent_requests_landlord_id_fkey(name)
        `)
        .in('status', ['funded', 'disbursed', 'repaying'])
        .order('funded_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map((r: any) => ({
        id: r.id,
        rent_amount: r.rent_amount || 0,
        amount_repaid: r.amount_repaid || 0,
        status: r.status,
        funded_at: r.funded_at,
        daily_repayment: r.daily_repayment,
        duration_days: r.duration_days,
        tenant_name: r.tenant?.full_name || 'Unknown',
        agent_name: r.agent?.full_name || 'Unassigned',
        landlord_name: r.landlord?.name || 'Unknown',
      })) as Receivable[];
    },
    staleTime: 60000,
    refetchInterval: 30000, // Auto-refresh every 30s for live visibility
  });

  const rows = receivables || [];
  const totalFunded = rows.reduce((s, r) => s + r.rent_amount, 0);
  const totalRepaid = rows.reduce((s, r) => s + r.amount_repaid, 0);
  const totalOutstanding = totalFunded - totalRepaid;
  const fundedAwaitingPayout = rows.filter(r => r.status === 'funded').length;
  const activeRepaying = rows.filter(r => r.status === 'repaying').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'funded':
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">Float Funded</Badge>;
      case 'disbursed':
        return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px]">Disbursed</Badge>;
      case 'repaying':
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">Repaying</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground text-[10px]">{status}</Badge>;
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 px-3 sm:px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Receivables — Funded to Float
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 space-y-3">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Funded</p>
            <p className="text-sm font-bold">{formatUGX(totalFunded)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Outstanding</p>
            <p className="text-sm font-bold text-amber-600">{formatUGX(totalOutstanding)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Awaiting Payout</p>
            <p className="text-sm font-bold text-orange-600">{fundedAwaitingPayout}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Repaying</p>
            <p className="text-sm font-bold text-emerald-600">{activeRepaying}</p>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Banknote className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No active receivables</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {rows.map((r) => {
              const pct = r.rent_amount > 0 ? Math.round((r.amount_repaid / r.rent_amount) * 100) : 0;
              const outstanding = r.rent_amount - r.amount_repaid;

              return (
                <div key={r.id} className="py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.tenant_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Agent: {r.agent_name} → Landlord: {r.landlord_name}
                      </p>
                    </div>
                    {getStatusBadge(r.status)}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {formatUGX(r.amount_repaid)} / {formatUGX(r.rent_amount)}
                    </span>
                    <span className={`font-medium ${pct >= 80 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-destructive'}`}>
                      {pct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-destructive'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {r.funded_at && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        Funded {format(new Date(r.funded_at), 'dd MMM yy')}
                      </span>
                    )}
                    {outstanding > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-600">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {formatUGX(outstanding)} remaining
                      </span>
                    )}
                    {r.daily_repayment && (
                      <span>{formatUGX(r.daily_repayment)}/day</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
