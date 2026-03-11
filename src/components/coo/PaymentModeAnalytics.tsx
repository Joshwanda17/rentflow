import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PieChart } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

const COLORS = ['hsl(var(--primary))', '#f59e0b', '#10b981', '#6366f1', '#ec4899'];

export default function PaymentModeAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['coo-payment-mode-analytics'],
    queryFn: async () => {
      const { data: collections } = await supabase.from('agent_collections').select('payment_method, amount');

      const modeMap = new Map<string, number>();
      for (const c of collections || []) {
        const method = c.payment_method || 'unknown';
        modeMap.set(method, (modeMap.get(method) || 0) + (c.amount || 0));
      }

      const labels: Record<string, string> = {
        mobile_money_mtn: 'MTN MoMo',
        mobile_money_airtel: 'Airtel Money',
        cash: 'Cash',
        wallet: 'Wallet',
        mobile_money: 'Mobile Money',
      };

      const total = [...modeMap.values()].reduce((s, v) => s + v, 0);

      return [...modeMap.entries()].map(([key, value]) => ({
        name: labels[key] || key.replace(/_/g, ' '),
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      })).sort((a, b) => b.value - a.value);
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <PieChart className="h-4 w-4 text-primary" /> Payment Mode Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : !data || data.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No payment data available</p>
        ) : (
          <div className="space-y-3">
            {data.map((item, i) => (
              <div key={item.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{formatUGX(item.value)}</span>
                    <span className="font-semibold text-xs min-w-[36px] text-right">{item.percentage}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
