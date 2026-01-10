import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Users, Building2, TrendingUp, TrendingDown, 
  CheckCircle2, Clock, Target, Percent
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { AgentGoalCard } from './AgentGoalCard';
import { AgentLeaderboard } from './AgentLeaderboard';

interface RegistrationStats {
  total: number;
  pending: number;
  activated: number;
  tenants: number;
  landlords: number;
  conversionRate: number;
  thisWeek: number;
  lastWeek: number;
  weeklyGrowth: number;
}

interface DailyData {
  date: string;
  registrations: number;
  activations: number;
}

const COLORS = ['hsl(var(--success))', 'hsl(var(--warning))'];
const ROLE_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))'];

export function AgentRegistrationAnalytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RegistrationStats>({
    total: 0,
    pending: 0,
    activated: 0,
    tenants: 0,
    landlords: 0,
    conversionRate: 0,
    thisWeek: 0,
    lastWeek: 0,
    weeklyGrowth: 0,
  });
  const [dailyData, setDailyData] = useState<DailyData[]>([]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch all invites by this agent
      const { data: invites, error } = await supabase
        .from('supporter_invites')
        .select('*')
        .eq('created_by', user.id)
        .in('role', ['tenant', 'landlord'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const allInvites = invites || [];
      
      // Calculate stats
      const total = allInvites.length;
      const pending = allInvites.filter(i => i.status === 'pending').length;
      const activated = allInvites.filter(i => i.status === 'activated').length;
      const tenants = allInvites.filter(i => i.role === 'tenant').length;
      const landlords = allInvites.filter(i => i.role === 'landlord').length;
      const conversionRate = total > 0 ? Math.round((activated / total) * 100) : 0;

      // Weekly comparison
      const now = new Date();
      const thisWeekStart = subDays(startOfDay(now), 7);
      const lastWeekStart = subDays(startOfDay(now), 14);

      const thisWeek = allInvites.filter(i => 
        new Date(i.created_at) >= thisWeekStart
      ).length;

      const lastWeek = allInvites.filter(i => 
        new Date(i.created_at) >= lastWeekStart && 
        new Date(i.created_at) < thisWeekStart
      ).length;

      const weeklyGrowth = lastWeek > 0 
        ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) 
        : thisWeek > 0 ? 100 : 0;

      setStats({
        total,
        pending,
        activated,
        tenants,
        landlords,
        conversionRate,
        thisWeek,
        lastWeek,
        weeklyGrowth,
      });

      // Build daily data for last 14 days
      const days = eachDayOfInterval({
        start: subDays(now, 13),
        end: now,
      });

      const dailyStats = days.map(day => {
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const registrations = allInvites.filter(i => {
          const date = new Date(i.created_at);
          return date >= dayStart && date < dayEnd;
        }).length;

        const activations = allInvites.filter(i => {
          if (!i.activated_at) return false;
          const date = new Date(i.activated_at);
          return date >= dayStart && date < dayEnd;
        }).length;

        return {
          date: format(day, 'MMM d'),
          registrations,
          activations,
        };
      });

      setDailyData(dailyStats);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const statusData = [
    { name: 'Activated', value: stats.activated },
    { name: 'Pending', value: stats.pending },
  ];

  const roleData = [
    { name: 'Tenants', value: stats.tenants },
    { name: 'Landlords', value: stats.landlords },
  ];

  return (
    <div className="space-y-4">
      {/* Monthly Goal Card */}
      <AgentGoalCard />
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Registered</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              {stats.weeklyGrowth >= 0 ? (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +{stats.weeklyGrowth}%
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                  <TrendingDown className="h-3 w-3" />
                  {stats.weeklyGrowth}%
                </Badge>
              )}
              <span className="text-muted-foreground">vs last week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{stats.conversionRate}%</p>
              </div>
              <div className="p-2 rounded-lg bg-success/20">
                <Percent className="h-5 w-5 text-success" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" />
                {stats.activated} active
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-warning" />
                {stats.pending} pending
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{stats.thisWeek}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {stats.lastWeek} last week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">By Role</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <Users className="h-3 w-3 text-blue-500" />
                    {stats.tenants}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <Building2 className="h-3 w-3 text-emerald-500" />
                    {stats.landlords}
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tenants & Landlords
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Registration Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Registration Trend (14 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="regGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="actGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="registrations" 
                  stroke="hsl(var(--primary))" 
                  fill="url(#regGradient)"
                  strokeWidth={2}
                  name="Registered"
                />
                <Area 
                  type="monotone" 
                  dataKey="activations" 
                  stroke="hsl(var(--success))" 
                  fill="url(#actGradient)"
                  strokeWidth={2}
                  name="Activated"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-primary" />
              Registered
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-success" />
              Activated
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Status & Role Distribution */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-success" />
                Active
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-warning" />
                Pending
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Roles</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleData} layout="vertical" margin={{ left: -10 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px'
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {roleData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={ROLE_COLORS[index % ROLE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Leaderboard */}
      <AgentLeaderboard />
    </div>
  );
}

export default AgentRegistrationAnalytics;
