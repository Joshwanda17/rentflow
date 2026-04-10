import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { Loader2, Users, TrendingUp, Wallet, Banknote, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth, subDays, format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Area } from 'recharts';

interface AgentSummary {
  agentId: string;
  agentName: string;
  phone: string;
  todayAmount: number;
  weekAmount: number;
  monthAmount: number;
  totalAmount: number;
  walletBalance: number;
  paymentCount: number;
  landlordCount: number;
  lastCollection: string | null;
}

interface ChartDataPoint {
  label: string;
  amount: number;
  count: number;
}

const PAGE_SIZE = 15;

export default function AgentCollectionsOverview() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<'month' | 'total' | 'wallet'>('month');

  const todayISO = startOfDay(new Date()).toISOString();
  const weekISO = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const monthISO = startOfMonth(new Date()).toISOString();

  const dateFrom = useMemo(() => {
    if (period === '7d') return subDays(new Date(), 7);
    if (period === '90d') return subDays(new Date(), 90);
    return subDays(new Date(), 30);
  }, [period]);

  const { data, isLoading } = useQuery({
    queryKey: ['coo-agent-collections-overview-v2', period],
    queryFn: async () => {
      // 1. Get active agents (those with landlord assignments or collections)
      const [collectionsRes, assignmentsRes] = await Promise.all([
        supabase.from('agent_collections').select('agent_id, amount, created_at, tenant_id'),
        supabase.from('agent_landlord_assignments').select('agent_id, landlord_id').eq('status', 'active'),
      ]);

      const collections = collectionsRes.data || [];
      const assignments = assignmentsRes.data || [];

      // Build set of active agent IDs (have landlords OR have collections)
      const agentIdsWithLandlords = new Set(assignments.map(a => a.agent_id));
      const agentIdsWithCollections = new Set(collections.map(c => c.agent_id));
      const activeAgentIds = [...new Set([...agentIdsWithLandlords, ...agentIdsWithCollections])];

      if (activeAgentIds.length === 0) return { agents: [], chartData: [], kpis: { totalToday: 0, totalWeek: 0, totalMonth: 0, totalAll: 0, activeAgents: 0, avgPerAgent: 0, topAgent: '' } };

      // 2. Get profiles and wallets for active agents
      const [profilesRes, walletsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone').in('id', activeAgentIds),
        supabase.from('wallets').select('user_id, balance').in('user_id', activeAgentIds),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, { name: p.full_name || 'Unknown Agent', phone: p.phone || '' }]));
      const walletMap = new Map((walletsRes.data || []).map(w => [w.user_id, Number(w.balance) || 0]));

      // Count landlords per agent
      const landlordCountMap = new Map<string, number>();
      for (const a of assignments) {
        landlordCountMap.set(a.agent_id, (landlordCountMap.get(a.agent_id) || 0) + 1);
      }

      // 3. Build agent summaries
      const agentMap = new Map<string, AgentSummary>();

      // Initialize all active agents
      for (const id of activeAgentIds) {
        const profile = profileMap.get(id);
        agentMap.set(id, {
          agentId: id,
          agentName: profile?.name || 'Unknown Agent',
          phone: profile?.phone || '',
          todayAmount: 0,
          weekAmount: 0,
          monthAmount: 0,
          totalAmount: 0,
          walletBalance: walletMap.get(id) || 0,
          paymentCount: 0,
          landlordCount: landlordCountMap.get(id) || 0,
          lastCollection: null,
        });
      }

      // Aggregate collections
      for (const c of collections) {
        const agent = agentMap.get(c.agent_id);
        if (!agent) continue;
        const d = c.created_at;
        agent.totalAmount += c.amount;
        if (d >= monthISO) agent.monthAmount += c.amount;
        if (d >= weekISO) agent.weekAmount += c.amount;
        if (d >= todayISO) agent.todayAmount += c.amount;
        agent.paymentCount++;
        if (!agent.lastCollection || d > agent.lastCollection) agent.lastCollection = d;
      }

      // 4. Build chart data
      const chartCollections = collections.filter(c => new Date(c.created_at) >= dateFrom);
      const now = new Date();
      let intervals: Date[];
      let formatStr: string;

      if (period === '7d') {
        intervals = eachDayOfInterval({ start: dateFrom, end: now });
        formatStr = 'EEE';
      } else if (period === '30d') {
        intervals = eachDayOfInterval({ start: dateFrom, end: now });
        formatStr = 'dd MMM';
      } else {
        intervals = eachWeekOfInterval({ start: dateFrom, end: now });
        formatStr = 'dd MMM';
      }

      const chartData: ChartDataPoint[] = intervals.map((date, i) => {
        const nextDate = i < intervals.length - 1 ? intervals[i + 1] : new Date(now.getTime() + 86400000);
        const dayCollections = chartCollections.filter(c => {
          const cd = new Date(c.created_at);
          return cd >= date && cd < nextDate;
        });
        return {
          label: format(date, formatStr),
          amount: dayCollections.reduce((s, c) => s + c.amount, 0),
          count: dayCollections.length,
        };
      });

      // 5. KPIs
      const totalToday = [...agentMap.values()].reduce((s, a) => s + a.todayAmount, 0);
      const totalWeek = [...agentMap.values()].reduce((s, a) => s + a.weekAmount, 0);
      const totalMonth = [...agentMap.values()].reduce((s, a) => s + a.monthAmount, 0);
      const totalAll = [...agentMap.values()].reduce((s, a) => s + a.totalAmount, 0);
      const activeWithCollections = [...agentMap.values()].filter(a => a.paymentCount > 0).length;
      const topAgent = [...agentMap.values()].sort((a, b) => b.monthAmount - a.monthAmount)[0]?.agentName || '—';

      const agents = [...agentMap.values()];

      return {
        agents,
        chartData,
        kpis: {
          totalToday,
          totalWeek,
          totalMonth,
          totalAll,
          activeAgents: activeAgentIds.length,
          activeCollecting: activeWithCollections,
          avgPerAgent: activeWithCollections > 0 ? Math.round(totalMonth / activeWithCollections) : 0,
          topAgent,
        },
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const sortedAgents = useMemo(() => {
    if (!data?.agents) return [];
    const sorted = [...data.agents];
    if (sortBy === 'month') sorted.sort((a, b) => b.monthAmount - a.monthAmount);
    else if (sortBy === 'total') sorted.sort((a, b) => b.totalAmount - a.totalAmount);
    else sorted.sort((a, b) => b.walletBalance - a.walletBalance);
    return sorted;
  }, [data?.agents, sortBy]);

  const pagedAgents = useMemo(() => sortedAgents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sortedAgents, page]);
  const totalPages = Math.ceil(sortedAgents.length / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = data?.kpis;
  const chartData = data?.chartData || [];

  return (
    <div className="space-y-5">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Agent Collections Dashboard
        </h2>
        <Select value={period} onValueChange={(v: '7d' | '30d' | '90d') => { setPeriod(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Banknote className="h-3 w-3" /> Today
            </p>
            <p className="text-xl font-bold text-primary mt-1">
              <CompactAmount value={kpis?.totalToday || 0} />
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-accent">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> This Month
            </p>
            <p className="text-xl font-bold mt-1">
              <CompactAmount value={kpis?.totalMonth || 0} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Active Agents
            </p>
            <p className="text-xl font-bold mt-1">{kpis?.activeAgents || 0}</p>
            <p className="text-[10px] text-muted-foreground">{kpis?.activeCollecting || 0} collecting</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Avg/Agent (Month)
            </p>
            <p className="text-xl font-bold mt-1">
              <CompactAmount value={kpis?.avgPerAgent || 0} />
            </p>
            <p className="text-[10px] text-muted-foreground truncate">Top: {kpis?.topAgent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Collections Over Time Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Collections Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-[220px]">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No collection data for this period</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  interval={period === '30d' ? 3 : period === '90d' ? 1 : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'amount' ? `UGX ${value.toLocaleString()}` : value,
                    name === 'amount' ? 'Collections' : 'Txn Count',
                  ]}
                />
                <defs>
                  <linearGradient id="collectionsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="amount" fill="url(#collectionsGradient)" stroke="none" />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} yAxisId={0} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Agent Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Agent Performance ({sortedAgents.length})
            </CardTitle>
            <Select value={sortBy} onValueChange={(v: 'month' | 'total' | 'wallet') => { setSortBy(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Sort: Monthly</SelectItem>
                <SelectItem value="total">Sort: All Time</SelectItem>
                <SelectItem value="wallet">Sort: Wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sortedAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active agents with collections found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Agent</TableHead>
                      <TableHead className="text-right min-w-[80px]">Today</TableHead>
                      <TableHead className="text-right min-w-[90px]">This Week</TableHead>
                      <TableHead className="text-right min-w-[90px]">This Month</TableHead>
                      <TableHead className="text-right min-w-[80px]">Wallet</TableHead>
                      <TableHead className="text-right min-w-[60px]">Landlords</TableHead>
                      <TableHead className="text-right min-w-[50px]">Txns</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedAgents.map((a, i) => {
                      const rank = page * PAGE_SIZE + i + 1;
                      const trend = a.weekAmount > 0 ? 'up' : a.monthAmount > 0 ? 'flat' : 'down';
                      return (
                        <TableRow key={a.agentId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground w-5">{rank}</span>
                              <div>
                                <p className="text-sm font-medium leading-tight">{a.agentName}</p>
                                <p className="text-[10px] text-muted-foreground">{a.phone}</p>
                              </div>
                              {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-green-500 shrink-0" />}
                              {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-destructive shrink-0" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            <CompactAmount value={a.todayAmount} />
                          </TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            <CompactAmount value={a.weekAmount} />
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold whitespace-nowrap">
                            <CompactAmount value={a.monthAmount} />
                          </TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            <CompactAmount value={a.walletBalance} className={a.walletBalance > 0 ? 'text-primary' : ''} />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {a.landlordCount > 0 ? (
                              <Badge variant="secondary" className="text-xs">{a.landlordCount}</Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{a.paymentCount}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
