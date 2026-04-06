import { Transaction } from '@/types/financial';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { formatDynamic, formatDynamicCompact } from '@/lib/currencyFormat';

interface RevenueChartProps {
  transactions: Transaction[];
}

export function RevenueChart({ transactions }: RevenueChartProps) {
  // Generate last 7 days data
  const today = new Date();
  const days = eachDayOfInterval({
    start: subDays(today, 6),
    end: today,
  });

  const chartData = days.map(day => {
    const dayStart = startOfDay(day);
    const dayTransactions = transactions.filter(tx => {
      const txDay = startOfDay(tx.date);
      return txDay.getTime() === dayStart.getTime();
    });

    const revenue = dayTransactions
      .filter(tx => tx.direction === 'cash_in' && 
        (tx.category === 'tenant_access_fee' || 
         tx.category === 'tenant_request_fee' || 
         tx.category === 'platform_service_income'))
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      date: format(day, 'MMM d'),
      revenue,
    };
  });

  return (
    <div className="glass-card rounded-xl p-6">
      <h3 className="font-semibold mb-4">Revenue Trend (7 Days)</h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 47%, 16%)" />
            <XAxis 
              dataKey="date" 
              stroke="hsl(215, 20%, 55%)"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(215, 20%, 55%)"
              fontSize={12}
              tickFormatter={(value) => formatDynamicCompact(value)}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 8%)',
                border: '1px solid hsl(222, 47%, 16%)',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
              formatter={(value: number) => [
                formatDynamic(value),
                'Revenue'
              ]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(174, 72%, 46%)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
