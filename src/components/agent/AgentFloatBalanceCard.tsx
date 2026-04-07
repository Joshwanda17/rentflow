import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Banknote, ArrowDownToLine, Wallet } from 'lucide-react';

export function AgentFloatBalanceCard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['agent-float-balance', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Total funded
      const { data: funding } = await supabase
        .from('agent_float_funding')
        .select('amount')
        .eq('agent_id', user.id);
      const totalFunded = (funding || []).reduce((s, f: any) => s + Number(f.amount), 0);

      // Total disbursed
      const { data: withdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount')
        .eq('assigned_cashout_agent_id', user.id)
        .eq('status', 'completed');
      const totalDisbursed = (withdrawals || []).reduce((s, w: any) => s + Number(w.amount), 0);

      return {
        totalFunded,
        totalDisbursed,
        available: totalFunded - totalDisbursed,
        commission: totalDisbursed * 0.01,
      };
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalFunded === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" /> Float Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Banknote className="h-3 w-3" /> Received
            </div>
            <p className="font-bold text-sm">{formatUGX(data.totalFunded)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <ArrowDownToLine className="h-3 w-3" /> Disbursed
            </div>
            <p className="font-bold text-sm">{formatUGX(data.totalDisbursed)}</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/10">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Wallet className="h-3 w-3" /> Available
            </div>
            <p className={`font-bold text-sm ${data.available < 0 ? 'text-destructive' : 'text-primary'}`}>
              {formatUGX(data.available)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Banknote className="h-3 w-3" /> Commission
            </div>
            <p className="font-bold text-sm text-emerald-600">{formatUGX(data.commission)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
