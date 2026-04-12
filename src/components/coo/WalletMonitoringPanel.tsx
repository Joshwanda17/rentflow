import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet, Building, Clock, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WalletMonitoringPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['coo-wallet-monitoring'],
    queryFn: async () => {
      const [walletTotalsRes, pendingSettlementsRes, completedSettlementsRes] = await Promise.all([
        supabase.rpc('get_wallet_totals'),
        supabase.from('withdrawal_requests').select('amount').eq('status', 'pending'),
        supabase.from('withdrawal_requests').select('amount').eq('status', 'approved'),
      ]);

      const wt = walletTotalsRes.data as any;
      const walletCount = Number(wt?.total_wallets ?? 0);
      const totalBalance = Number(wt?.total_balance ?? 0);

      // Get agent float totals
      const { data: floats } = await supabase.from('agent_float_limits').select('float_limit');
      const agentWalletTotal = (floats || []).reduce((s, f) => s + (f.float_limit || 0), 0);

      const pendingSettlements = (pendingSettlementsRes.data || []).reduce((s, r) => s + r.amount, 0);
      const completedSettlements = (completedSettlementsRes.data || []).reduce((s, r) => s + r.amount, 0);

      return {
        platformBalance: totalBalance,
        agentWallets: agentWalletTotal,
        pendingSettlements,
        completedSettlements,
        walletCount,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const items = [
    { label: 'Platform Wallet Total', value: formatUGX(data?.platformBalance || 0), icon: Wallet, detail: `${data?.walletCount || 0} wallets`, color: 'text-primary' },
    { label: 'Agent Float Limits', value: formatUGX(data?.agentWallets || 0), icon: Building, color: 'text-amber-600' },
    { label: 'Pending Settlements', value: formatUGX(data?.pendingSettlements || 0), icon: Clock, color: 'text-orange-600' },
    { label: 'Completed Settlements', value: formatUGX(data?.completedSettlements || 0), icon: CheckCircle, color: 'text-emerald-600' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Wallet & Liquidity Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map(item => (
            <div key={item.label} className="p-4 rounded-xl bg-muted/50 border border-border min-w-0">
              <item.icon className={cn('h-5 w-5 mb-2 shrink-0', item.color)} />
              <p className="text-lg sm:text-xl font-bold truncate">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              {item.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
