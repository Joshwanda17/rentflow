import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PieChart } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#f59e0b', '#10b981', '#6366f1'];

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
        mobile_money_mtn: 'MTN Mobile Money',
        mobile_money_airtel: 'Airtel Money',
        cash: 'Cash',
        wallet: 'Wallet',
        mobile_money: 'Mobile Money',
      };

      return [...modeMap.entries()].map(([key, value]) => ({
        name: labels[key] || key.replace(/_/g, ' '),
        value,
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
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => `UGX ${val.toLocaleString()}`} />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
