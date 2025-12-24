import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, parseISO } from 'date-fns';
import { TrendingUp, BarChart3, PieChartIcon } from 'lucide-react';

interface ChartData {
  date: string;
  deposits: number;
  withdrawals: number;
  transfers: number;
  rentRequests: number;
  earnings: number;
}

interface FinancialChartsProps {
  startDate?: Date;
  endDate?: Date;
}

const CHART_COLORS = {
  deposits: 'hsl(var(--success))',
  withdrawals: 'hsl(var(--destructive))',
  transfers: 'hsl(var(--primary))',
  rentRequests: 'hsl(var(--warning))',
  earnings: 'hsl(var(--chart-5))',
};

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--chart-5))',
];

export function FinancialCharts({ startDate, endDate }: FinancialChartsProps) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);
  const [userDistribution, setUserDistribution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, [startDate, endDate]);

  const fetchChartData = async () => {
    setLoading(true);

    const effectiveEndDate = endDate || new Date();
    const effectiveStartDate = startDate || subDays(effectiveEndDate, 30);

    // Generate date range
    const dateRange = eachDayOfInterval({
      start: startOfDay(effectiveStartDate),
      end: startOfDay(effectiveEndDate)
    });

    // Fetch all data
    const [depositsRes, withdrawalsRes, transfersRes, requestsRes, earningsRes, rolesRes] = await Promise.all([
      supabase
        .from('wallet_deposits')
        .select('amount, created_at')
        .gte('created_at', effectiveStartDate.toISOString())
        .lte('created_at', effectiveEndDate.toISOString()),
      supabase
        .from('wallet_withdrawals')
        .select('amount, created_at')
        .gte('created_at', effectiveStartDate.toISOString())
        .lte('created_at', effectiveEndDate.toISOString()),
      supabase
        .from('wallet_transactions')
        .select('amount, created_at')
        .gte('created_at', effectiveStartDate.toISOString())
        .lte('created_at', effectiveEndDate.toISOString()),
      supabase
        .from('rent_requests')
        .select('rent_amount, created_at')
        .gte('created_at', effectiveStartDate.toISOString())
        .lte('created_at', effectiveEndDate.toISOString()),
      supabase
        .from('agent_earnings')
        .select('amount, created_at')
        .gte('created_at', effectiveStartDate.toISOString())
        .lte('created_at', effectiveEndDate.toISOString()),
      supabase.from('user_roles').select('role')
    ]);

    const deposits = depositsRes.data || [];
    const withdrawals = withdrawalsRes.data || [];
    const transfers = transfersRes.data || [];
    const requests = requestsRes.data || [];
    const earnings = earningsRes.data || [];
    const roles = rolesRes.data || [];

    // Aggregate by date
    const dataByDate = dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const displayDate = format(date, 'MMM d');

      const dayDeposits = deposits
        .filter(d => format(parseISO(d.created_at), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, d) => sum + Number(d.amount), 0);

      const dayWithdrawals = withdrawals
        .filter(w => format(parseISO(w.created_at), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, w) => sum + Number(w.amount), 0);

      const dayTransfers = transfers
        .filter(t => format(parseISO(t.created_at), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const dayRequests = requests
        .filter(r => format(parseISO(r.created_at), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, r) => sum + Number(r.rent_amount), 0);

      const dayEarnings = earnings
        .filter(e => format(parseISO(e.created_at), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, e) => sum + Number(e.amount), 0);

      return {
        date: displayDate,
        deposits: dayDeposits,
        withdrawals: dayWithdrawals,
        transfers: dayTransfers,
        rentRequests: dayRequests,
        earnings: dayEarnings
      };
    });

    setChartData(dataByDate);

    // Calculate totals for pie chart
    const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + Number(w.amount), 0);
    const totalTransfers = transfers.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalRent = requests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
    const totalEarnings = earnings.reduce((sum, e) => sum + Number(e.amount), 0);

    setDistributionData([
      { name: 'Deposits', value: totalDeposits },
      { name: 'Withdrawals', value: totalWithdrawals },
      { name: 'Transfers', value: totalTransfers },
      { name: 'Rent Requests', value: totalRent },
      { name: 'Agent Earnings', value: totalEarnings }
    ].filter(d => d.value > 0));

    // User distribution
    const tenants = roles.filter(r => r.role === 'tenant').length;
    const agents = roles.filter(r => r.role === 'agent').length;
    const supporters = roles.filter(r => r.role === 'supporter').length;
    const landlords = roles.filter(r => r.role === 'landlord').length;
    const managers = roles.filter(r => r.role === 'manager').length;

    setUserDistribution([
      { name: 'Tenants', value: tenants },
      { name: 'Agents', value: agents },
      { name: 'Supporters', value: supporters },
      { name: 'Landlords', value: landlords },
      { name: 'Managers', value: managers }
    ].filter(d => d.value > 0));

    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }} 
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-mono font-medium">UGX {entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading charts...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Financial Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList className="w-full">
            <TabsTrigger value="trends" className="flex-1">
              <TrendingUp className="h-4 w-4 mr-1" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex-1">
              <BarChart3 className="h-4 w-4 mr-1" />
              Comparison
            </TabsTrigger>
            <TabsTrigger value="distribution" className="flex-1">
              <PieChartIcon className="h-4 w-4 mr-1" />
              Distribution
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4">
            {/* Money Flow Area Chart */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Money Flow Over Time</h4>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDeposits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.deposits} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.deposits} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorWithdrawals" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.withdrawals} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.withdrawals} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }} 
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={formatCurrency}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="deposits" 
                      name="Deposits"
                      stroke={CHART_COLORS.deposits} 
                      fill="url(#colorDeposits)"
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="withdrawals" 
                      name="Withdrawals"
                      stroke={CHART_COLORS.withdrawals} 
                      fill="url(#colorWithdrawals)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Rent & Earnings Chart */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Rent Requests & Agent Earnings</h4>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.rentRequests} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.rentRequests} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.earnings} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.earnings} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={formatCurrency}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="rentRequests" 
                      name="Rent Requests"
                      stroke={CHART_COLORS.rentRequests} 
                      fill="url(#colorRent)"
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="earnings" 
                      name="Agent Earnings"
                      stroke={CHART_COLORS.earnings} 
                      fill="url(#colorEarnings)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            {/* Daily Comparison Bar Chart */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Daily Transaction Comparison</h4>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={formatCurrency}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="deposits" name="Deposits" fill={CHART_COLORS.deposits} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="withdrawals" name="Withdrawals" fill={CHART_COLORS.withdrawals} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="transfers" name="Transfers" fill={CHART_COLORS.transfers} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Transaction Distribution */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground text-center">Transaction Volume Distribution</h4>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {distributionData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `UGX ${value.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* User Distribution */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground text-center">User Role Distribution</h4>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={userDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {userDistribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
