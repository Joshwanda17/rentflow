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
      const [walletsRes, profilesRes, pendingSettlementsRes, completedSettlementsRes] = await Promise.all([
        supabase.from('wallets').select('user_id, balance'),
        supabase.from('profiles').select('id, full_name, phone'),
        supabase.from('withdrawal_requests').select('amount').in('status', ['pending', 'manager_approved', 'cfo_approved']),
        supabase.from('withdrawal_requests').select('amount').eq('status', 'approved'),
      ]);

      const wallets = walletsRes.data || [];
      const totalBalance = wallets.reduce((s, w) => s + (w.balance || 0), 0);

      // Get agent wallet balances from float limits
      const { data: floats } = await supabase.from('agent_float_limits').select('agent_id, float_limit, collected_today');
      const agentWalletTotal = (floats || []).reduce((s, f) => s + (f.float_limit || 0), 0);

      const pendingSettlements = (pendingSettlementsRes.data || []).reduce((s, r) => s + r.amount, 0);
      const completedSettlements = (completedSettlementsRes.data || []).reduce((s, r) => s + r.amount, 0);

      return {
        platformBalance: totalBalance,
        agentWallets: agentWalletTotal,
        pendingSettlements,
        completedSettlements,
        walletCount: wallets.length,
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map(item => (
            <div key={item.label} className="p-4 rounded-xl bg-muted/50 border border-border">
              <item.icon className={cn('h-5 w-5 mb-2', item.color)} />
              <p className="text-xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              {item.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
