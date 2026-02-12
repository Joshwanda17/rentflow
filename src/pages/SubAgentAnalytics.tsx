import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, 
  Users, 
  TrendingUp, 
  Loader2, 
  UserPlus,
  Calendar,
  Coins,
  Target,
  ChevronRight,
  BarChart3,
  Download,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import { SetTeamGoalDialog } from '@/components/agent/SetTeamGoalDialog';
import { TeamGoalProgress } from '@/components/agent/TeamGoalProgress';
import { exportToCSV, exportToPDF, formatNumberForExport, formatDateForExport } from '@/lib/exportUtils';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface SubAgent {
  id: string;
  sub_agent_id: string;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
    avatar_url: string | null;
  };
  totalEarnings: number;
  tenantsCount: number;
  monthlyEarnings: { month: string; amount: number }[];
  tenants: { id: string; name: string; totalRepaid: number }[];
}

interface MonthlyData {
  month: string;
  earnings: number;
  subAgentsJoined: number;
}

interface TeamGoal {
  id: string;
  goal_month: string;
  target_registrations: number;
  target_earnings: number;
  notes: string | null;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)'];

export default function SubAgentAnalytics() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedSubAgent, setSelectedSubAgent] = useState<SubAgent | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [currentGoal, setCurrentGoal] = useState<TeamGoal | null>(null);
  const [currentMonthRegistrations, setCurrentMonthRegistrations] = useState(0);
  const [currentMonthEarnings, setCurrentMonthEarnings] = useState(0);
  const [totalEarningsFromSubAgents, setTotalEarningsFromSubAgents] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchSubAgentAnalytics();
      fetchCurrentGoal();
    }
  }, [user, authLoading, navigate]);

  const fetchCurrentGoal = async () => {
    if (!user) return;

    try {
      const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      
      // subagent_team_goals table removed - use null
      setCurrentGoal(null);
    } catch (error) {
      console.error('Error fetching goal:', error);
    }
  };

  const fetchSubAgentAnalytics = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch sub-agents
      const { data: subAgentsData, error } = await supabase
        .from('agent_subagents')
        .select('*')
        .eq('parent_agent_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!subAgentsData || subAgentsData.length === 0) {
        setSubAgents([]);
        setLoading(false);
        return;
      }

      const subAgentIds = subAgentsData.map(sa => sa.sub_agent_id);

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, avatar_url')
        .in('id', subAgentIds);

      // Fetch all earnings from sub-agent commissions
      const { data: allEarnings } = await supabase
        .from('agent_earnings')
        .select('*')
        .eq('agent_id', user.id)
        .eq('earning_type', 'subagent_commission')
        .order('created_at', { ascending: false });

      // Fetch tenants per sub-agent
      const tenantsData: Record<string, { id: string; name: string; totalRepaid: number }[]> = {};
      const earningsPerSubAgent: Record<string, number> = {};
      const monthlyEarningsPerSubAgent: Record<string, Record<string, number>> = {};

      for (const subAgentId of subAgentIds) {
        // Get rent requests for this sub-agent's tenants
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('tenant_id')
          .eq('agent_id', subAgentId);

        const tenantIds = [...new Set(rentRequests?.map(rr => rr.tenant_id) || [])];
        
        if (tenantIds.length > 0) {
          // Get tenant profiles
          const { data: tenantProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', tenantIds);

          // repayments table removed - use empty array
          const repayments: any[] = [];

          const tenantRepayments: Record<string, number> = {};
          repayments?.forEach((r: any) => {
            tenantRepayments[r.tenant_id] = (tenantRepayments[r.tenant_id] || 0) + Number(r.amount);
          });

          tenantsData[subAgentId] = tenantProfiles?.map(tp => ({
            id: tp.id,
            name: tp.full_name,
            totalRepaid: tenantRepayments[tp.id] || 0,
          })) || [];
        } else {
          tenantsData[subAgentId] = [];
        }

        earningsPerSubAgent[subAgentId] = 0;
        monthlyEarningsPerSubAgent[subAgentId] = {};
      }

      // Calculate earnings per sub-agent from our earnings
      let totalEarnings = 0;
      if (allEarnings) {
        for (const earning of allEarnings) {
          // Find which sub-agent's tenant made this repayment
          for (const subAgentId of subAgentIds) {
            const tenants = tenantsData[subAgentId] || [];
            const isTenantOfSubAgent = tenants.some(t => t.id === earning.source_user_id);
            
            if (isTenantOfSubAgent) {
              earningsPerSubAgent[subAgentId] = (earningsPerSubAgent[subAgentId] || 0) + Number(earning.amount);
              totalEarnings += Number(earning.amount);

              const monthKey = format(new Date(earning.created_at), 'yyyy-MM');
              if (!monthlyEarningsPerSubAgent[subAgentId]) {
                monthlyEarningsPerSubAgent[subAgentId] = {};
              }
              monthlyEarningsPerSubAgent[subAgentId][monthKey] = 
                (monthlyEarningsPerSubAgent[subAgentId][monthKey] || 0) + Number(earning.amount);
              break;
            }
          }
        }
      }

      // Build enriched sub-agents data
      const enrichedSubAgents: SubAgent[] = subAgentsData.map(sa => {
        const monthlyEarnings = Object.entries(monthlyEarningsPerSubAgent[sa.sub_agent_id] || {})
          .map(([month, amount]) => ({ month, amount }))
          .sort((a, b) => a.month.localeCompare(b.month));

        return {
          ...sa,
          profile: profiles?.find(p => p.id === sa.sub_agent_id),
          totalEarnings: earningsPerSubAgent[sa.sub_agent_id] || 0,
          tenantsCount: tenantsData[sa.sub_agent_id]?.length || 0,
          monthlyEarnings,
          tenants: tenantsData[sa.sub_agent_id] || [],
        };
      });

      setSubAgents(enrichedSubAgents);
      setTotalEarningsFromSubAgents(totalEarnings);

      // Build monthly overview data (last 6 months)
      const currentMonthKey = format(new Date(), 'yyyy-MM');
      const last6Months: MonthlyData[] = [];
      let thisMonthRegs = 0;
      let thisMonthEarnings = 0;

      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthKey = format(monthDate, 'yyyy-MM');
        const monthLabel = format(monthDate, 'MMM');

        const monthEarnings = allEarnings
          ?.filter(e => format(new Date(e.created_at), 'yyyy-MM') === monthKey)
          .reduce((sum, e) => sum + Number(e.amount), 0) || 0;

        const subAgentsJoined = subAgentsData.filter(sa => 
          format(new Date(sa.created_at), 'yyyy-MM') === monthKey
        ).length;

        if (monthKey === currentMonthKey) {
          thisMonthRegs = subAgentsJoined;
          thisMonthEarnings = monthEarnings;
        }

        last6Months.push({
          month: monthLabel,
          earnings: monthEarnings,
          subAgentsJoined,
        });
      }
      setMonthlyData(last6Months);
      setCurrentMonthRegistrations(thisMonthRegs);
      setCurrentMonthEarnings(thisMonthEarnings);

    } catch (error) {
      console.error('Error fetching sub-agent analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (subAgents.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    const headers = [
      'Sub-Agent Name',
      'Phone',
      'Joined Date',
      'Total Tenants',
      'Your 1% Earnings (UGX)',
    ];

    const rows = subAgents.map(sa => [
      sa.profile?.full_name || 'Unknown',
      sa.profile?.phone || '',
      formatDateForExport(sa.created_at),
      sa.tenantsCount,
      sa.totalEarnings,
    ]);

    // Add summary row
    rows.push([
      'TOTAL',
      '',
      '',
      subAgents.reduce((sum, sa) => sum + sa.tenantsCount, 0),
      totalEarningsFromSubAgents,
    ]);

    exportToCSV({ headers, rows }, 'sub_agent_performance_report');
    toast({ title: '✅ CSV exported successfully!' });
  };

  const handleExportDetailedCSV = () => {
    if (subAgents.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    const headers = [
      'Sub-Agent Name',
      'Tenant Name',
      'Total Repaid by Tenant (UGX)',
      'Your 1% Share (UGX)',
    ];

    const rows: (string | number)[][] = [];

    subAgents.forEach(sa => {
      if (sa.tenants.length > 0) {
        sa.tenants.forEach(tenant => {
          rows.push([
            sa.profile?.full_name || 'Unknown',
            tenant.name,
            tenant.totalRepaid,
            Math.round(tenant.totalRepaid * 0.01),
          ]);
        });
      } else {
        rows.push([
          sa.profile?.full_name || 'Unknown',
          'No tenants yet',
          0,
          0,
        ]);
      }
    });

    exportToCSV({ headers, rows }, 'sub_agent_tenant_breakdown');
    toast({ title: '✅ Detailed CSV exported successfully!' });
  };

  const handleExportPDF = async () => {
    if (!reportRef.current || subAgents.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    setExporting(true);
    try {
      await exportToPDF(
        reportRef.current,
        'sub_agent_performance_report',
        'Sub-Agent Performance Report'
      );
      toast({ title: '✅ PDF exported successfully!' });
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({ 
        title: 'Export failed', 
        description: 'Try using CSV export instead',
        variant: 'destructive' 
      });
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pieData = subAgents.map((sa, idx) => ({
    name: sa.profile?.full_name?.split(' ')[0] || 'Unknown',
    value: sa.totalEarnings,
    color: COLORS[idx % COLORS.length],
  })).filter(d => d.value > 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-lg">Sub-Agent Analytics</h1>
            <p className="text-xs text-muted-foreground">Track your team performance</p>
          </div>
          
          {subAgents.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  Summary CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportDetailedCSV} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  Detailed CSV (Tenants)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                  <FileText className="h-4 w-4 text-red-600" />
                  PDF Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          <Button onClick={() => setRegisterDialogOpen(true)} size="sm" className="gap-1">
            <UserPlus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <main className="p-4 space-y-5">
        {subAgents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-orange-500" />
              </div>
              <h3 className="font-bold text-lg mb-2">No Sub-Agents Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Build your team by registering sub-agents. You'll earn 1% of all their tenants' repayments!
              </p>
              <Button onClick={() => setRegisterDialogOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Register Your First Sub-Agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div ref={reportRef} className="space-y-4">
            {/* Team Goal Progress */}
            <TeamGoalProgress
              goal={currentGoal}
              currentRegistrations={currentMonthRegistrations}
              currentEarnings={currentMonthEarnings}
              onSetGoal={() => setGoalDialogOpen(true)}
              onEditGoal={() => setGoalDialogOpen(true)}
            />

            {/* Overview Stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/20">
                <CardContent className="p-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-orange-500 mb-1" />
                  <p className="font-bold text-2xl">{subAgents.length}</p>
                  <p className="text-xs text-muted-foreground">Sub-Agents</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-success/10 to-emerald-500/10 border-success/20">
                <CardContent className="p-4 text-center">
                  <Coins className="h-5 w-5 mx-auto text-success mb-1" />
                  <p className="font-bold text-lg">{formatUGX(totalEarningsFromSubAgents)}</p>
                  <p className="text-xs text-muted-foreground">Total Earned</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-primary/10 to-blue-500/10 border-primary/20">
                <CardContent className="p-4 text-center">
                  <Target className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="font-bold text-2xl">
                    {subAgents.reduce((sum, sa) => sum + sa.tenantsCount, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Team Tenants</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Earnings Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-success" />
                  Monthly Earnings (1% from Sub-Agents)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                      <Tooltip 
                        formatter={(value: number) => [formatUGX(value), 'Earnings']}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="earnings" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Earnings Distribution Pie Chart */}
            {pieData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-orange-500" />
                    Earnings by Sub-Agent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-center">
                    <div className="w-1/2 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => formatUGX(value)}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-1/2 space-y-2">
                      {pieData.slice(0, 4).map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="truncate flex-1">{entry.name}</span>
                          <span className="font-medium text-xs">{formatUGX(entry.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sub-Agents List */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  Your Sub-Agents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {subAgents.map((subAgent) => (
                  <button
                    key={subAgent.id}
                    onClick={() => setSelectedSubAgent(subAgent)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold">
                        {subAgent.profile?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{subAgent.profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{subAgent.tenantsCount} tenant{subAgent.tenantsCount !== 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span>Joined {format(new Date(subAgent.created_at), 'MMM d, yyyy')}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="font-bold text-sm text-success">{formatUGX(subAgent.totalEarnings)}</p>
                        <p className="text-[10px] text-muted-foreground">your 1%</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Sub-Agent Detail Modal */}
      {selectedSubAgent && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={() => setSelectedSubAgent(null)}
        >
          <div 
            className="fixed bottom-0 left-0 right-0 bg-background border-t rounded-t-3xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-background p-4 border-b">
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                  {selectedSubAgent.profile?.full_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{selectedSubAgent.profile?.full_name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedSubAgent.profile?.phone}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedSubAgent(null)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-success/10 rounded-xl p-3 text-center">
                  <p className="font-bold text-success">{formatUGX(selectedSubAgent.totalEarnings)}</p>
                  <p className="text-xs text-muted-foreground">Your 1%</p>
                </div>
                <div className="bg-primary/10 rounded-xl p-3 text-center">
                  <p className="font-bold text-primary">{selectedSubAgent.tenantsCount}</p>
                  <p className="text-xs text-muted-foreground">Tenants</p>
                </div>
                <div className="bg-muted rounded-xl p-3 text-center">
                  <p className="font-bold">{format(new Date(selectedSubAgent.created_at), 'MMM yyyy')}</p>
                  <p className="text-xs text-muted-foreground">Joined</p>
                </div>
              </div>

              {/* Monthly Earnings Chart */}
              {selectedSubAgent.monthlyEarnings.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Monthly Earnings History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedSubAgent.monthlyEarnings}>
                          <XAxis 
                            dataKey="month" 
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => format(new Date(v + '-01'), 'MMM')}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                          <Tooltip 
                            formatter={(value: number) => [formatUGX(value), 'Your Earnings']}
                            labelFormatter={(label) => format(new Date(label + '-01'), 'MMMM yyyy')}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="amount" 
                            stroke="hsl(var(--success))" 
                            strokeWidth={2}
                            dot={{ fill: 'hsl(var(--success))' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tenants List */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Tenants ({selectedSubAgent.tenants.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedSubAgent.tenants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No tenants registered yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedSubAgent.tenants.map((tenant) => (
                        <div key={tenant.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">{tenant.name}</span>
                          <div className="text-right">
                            <p className="text-xs font-medium">{formatUGX(tenant.totalRepaid)}</p>
                            <p className="text-[10px] text-muted-foreground">total repaid</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <RegisterSubAgentDialog 
        open={registerDialogOpen}
        onOpenChange={setRegisterDialogOpen}
        onSuccess={fetchSubAgentAnalytics}
      />

      <SetTeamGoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        onSuccess={() => {
          fetchCurrentGoal();
          fetchSubAgentAnalytics();
        }}
        existingGoal={currentGoal}
      />
    </div>
  );
}
