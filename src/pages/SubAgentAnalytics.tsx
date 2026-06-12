import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
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
  FileSpreadsheet,
  Phone,
  Mail,
  MapPin,
  Wallet,
  IdCard,
  Briefcase,
  Search,
  X,
  Filter,
  ArrowUpDown,
  Sparkles,
  Plus
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import { AddSubAgentSearch } from '@/components/agent/AddSubAgentSearch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { SetTeamGoalDialog } from '@/components/agent/SetTeamGoalDialog';
import { TeamGoalProgress } from '@/components/agent/TeamGoalProgress';
import { exportToCSV, exportToPDF, formatNumberForExport, formatDateForExport } from '@/lib/exportUtils';
import { useToast } from '@/hooks/use-toast';
import { hapticTap } from '@/lib/haptics';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { FloatingActionButton } from '@/components/FloatingActionButton';
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
  status?: string;
  invite_sms_status?: string | null;
  invite_email_status?: string | null;
  invite_sent_at?: string | null;
  profile?: {
    full_name: string;
    phone: string;
    avatar_url: string | null;
    email?: string | null;
    national_id?: string | null;
    district?: string | null;
    region?: string | null;
    occupation?: string | null;
    joined_at?: string | null;
  };
  wallet?: {
    balance: number;
    withdrawable_balance: number;
    float_balance: number;
    advance_balance: number;
    locked_balance: number;
  };
  totalEarnings: number;
  tenantsCount: number;
  monthlyEarnings: { month: string; amount: number }[];
  tenants: { id: string; name: string; phone: string | null; totalRepaid: number }[];
  facilitatedRentVolume: number;
  accessedFunds: number;
  platformRewards: number;
  serviceFees: number;
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

interface RecruiterSplit {
  trace_id: string;
  created_at: string;
  tracking_id: string | null;
  tenant_name: string;
  amount: number;
  total_commission: number;
  subagent_share: number;
  recruiter_override: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)'];

export default function SubAgentAnalytics() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedSubAgent, setSelectedSubAgent] = useState<SubAgent | null>(null);
  const [recruiterSplits, setRecruiterSplits] = useState<RecruiterSplit[]>([]);
  const [splitsLoading, setSplitsLoading] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [currentGoal, setCurrentGoal] = useState<TeamGoal | null>(null);
  const [currentMonthRegistrations, setCurrentMonthRegistrations] = useState(0);
  const [currentMonthEarnings, setCurrentMonthEarnings] = useState(0);
  const [totalEarningsFromSubAgents, setTotalEarningsFromSubAgents] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  // Search & filter state
  const [subAgentSearch, setSubAgentSearch] = useState('');
  const [subAgentStatusFilter, setSubAgentStatusFilter] = useState<'all' | 'with_tenants' | 'no_tenants'>('all');
  const [tenantSearch, setTenantSearch] = useState('');
  const [subAgentSort, setSubAgentSort] = useState<'newest' | 'name_asc' | 'withdrawable_desc'>('newest');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchSubAgentAnalytics();
      fetchCurrentGoal();
    }
  }, [user, authLoading, navigate]);

  // Auto-open detail when ?id=xxx is present in URL
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || subAgents.length === 0) return;
    const match = subAgents.find(sa => sa.sub_agent_id === id);
    if (match) setSelectedSubAgent(match);
  }, [searchParams, subAgents]);

  // Load per-transaction recruiter splits (8% sub-agent vs 2% recruiter) for the open sub-agent
  useEffect(() => {
    if (!selectedSubAgent) {
      setRecruiterSplits([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSplitsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_subagent_recruiter_splits', {
          p_sub_agent_id: selectedSubAgent.sub_agent_id,
        });
        if (error) throw error;
        if (!cancelled) setRecruiterSplits((data as RecruiterSplit[]) || []);
      } catch (err) {
        console.error('Error fetching recruiter splits:', err);
        if (!cancelled) setRecruiterSplits([]);
      } finally {
        if (!cancelled) setSplitsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSubAgent]);

  const closeDetail = () => {
    setSelectedSubAgent(null);
    setTenantSearch('');
    // Clear the id param from URL so back/refresh doesn't reopen
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  };

  // Clear tenant search when switching sub-agents
  useEffect(() => {
    setTenantSearch('');
  }, [selectedSubAgent?.sub_agent_id]);

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
        .select('id, full_name, phone, avatar_url, email, national_id, district, region, occupation, created_at')
        .in('id', subAgentIds);

      // Fetch sub-agents' wallets
      const { data: wallets } = await supabase
        .from('wallets')
        .select('user_id, balance, withdrawable_balance, float_balance, advance_balance, locked_balance')
        .in('user_id', subAgentIds);

      // Fetch all earnings from sub-agent commissions
      const { data: allEarnings } = await supabase
        .from('agent_earnings')
        .select('*')
        .eq('agent_id', user.id)
        .eq('earning_type', 'subagent_commission')
        .order('created_at', { ascending: false });

      // Fetch sub-agents' own earnings (platform rewards)
      const { data: ownEarnings } = await supabase
        .from('agent_earnings')
        .select('agent_id, amount')
        .in('agent_id', subAgentIds);

      // Fetch business advances (accessed funds)
      const { data: advances } = await supabase
        .from('business_advances')
        .select('agent_id, principal')
        .in('agent_id', subAgentIds)
        .in('status', ['active', 'completed', 'cfo_disbursed']);

      // Fetch tenants per sub-agent
      const tenantsData: Record<string, { id: string; name: string; phone: string | null; totalRepaid: number }[]> = {};
      const earningsPerSubAgent: Record<string, number> = {};
      const monthlyEarningsPerSubAgent: Record<string, Record<string, number>> = {};
      const rentVolumePerSubAgent: Record<string, number> = {};
      const serviceFeesPerSubAgent: Record<string, number> = {};

      for (const subAgentId of subAgentIds) {
        // Get rent requests for this sub-agent's tenants
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('tenant_id, total_repayment, request_fee')
          .eq('agent_id', subAgentId);

        const tenantIds = [...new Set(rentRequests?.map(rr => rr.tenant_id) || [])];
        
        // Sum facilitated rent volume and service fees
        rentVolumePerSubAgent[subAgentId] = (rentRequests || []).reduce((sum, rr) => sum + Number(rr.total_repayment || 0), 0);
        serviceFeesPerSubAgent[subAgentId] = (rentRequests || []).reduce((sum, rr) => sum + Number(rr.request_fee || 0), 0);

        if (tenantIds.length > 0) {
          // Get tenant profiles
          const { data: tenantProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, phone')
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
            phone: tp.phone ?? null,
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

      // Pre-compute aggregates from batched queries
      const platformRewardsPerSubAgent: Record<string, number> = {};
      (ownEarnings || []).forEach(e => {
        const id = e.agent_id as string;
        platformRewardsPerSubAgent[id] = (platformRewardsPerSubAgent[id] || 0) + Number(e.amount || 0);
      });

      const accessedFundsPerSubAgent: Record<string, number> = {};
      (advances || []).forEach(a => {
        const id = a.agent_id as string;
        accessedFundsPerSubAgent[id] = (accessedFundsPerSubAgent[id] || 0) + Number(a.principal || 0);
      });

      // Build enriched sub-agents data
      const enrichedSubAgents: SubAgent[] = subAgentsData.map(sa => {
        const monthlyEarnings = Object.entries(monthlyEarningsPerSubAgent[sa.sub_agent_id] || {})
          .map(([month, amount]) => ({ month, amount }))
          .sort((a, b) => a.month.localeCompare(b.month));

        return {
          ...sa,
          profile: (() => {
            const p = profiles?.find(pr => pr.id === sa.sub_agent_id);
            if (!p) return undefined;
            return {
              full_name: p.full_name,
              phone: p.phone,
              avatar_url: p.avatar_url,
              email: p.email,
              national_id: p.national_id,
              district: p.district,
              region: p.region,
              occupation: p.occupation,
              joined_at: p.created_at,
            };
          })(),
          wallet: (() => {
            const w = wallets?.find(wt => wt.user_id === sa.sub_agent_id);
            if (!w) return undefined;
            return {
              balance: Number(w.balance || 0),
              withdrawable_balance: Number(w.withdrawable_balance || 0),
              float_balance: Number(w.float_balance || 0),
              advance_balance: Number(w.advance_balance || 0),
              locked_balance: Number(w.locked_balance || 0),
            };
          })(),
          totalEarnings: earningsPerSubAgent[sa.sub_agent_id] || 0,
          tenantsCount: tenantsData[sa.sub_agent_id]?.length || 0,
          monthlyEarnings,
          tenants: tenantsData[sa.sub_agent_id] || [],
          facilitatedRentVolume: rentVolumePerSubAgent[sa.sub_agent_id] || 0,
          accessedFunds: accessedFundsPerSubAgent[sa.sub_agent_id] || 0,
          platformRewards: platformRewardsPerSubAgent[sa.sub_agent_id] || 0,
          serviceFees: serviceFeesPerSubAgent[sa.sub_agent_id] || 0,
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

  const handleResendInvite = async (subAgent: SubAgent) => {
    setResendingId(subAgent.sub_agent_id);
    try {
      const { error } = await invokeEdgeFunction('add-existing-subagent', {
        body: { subAgentId: subAgent.sub_agent_id, origin: getPublicOrigin() },
        errorTitle: 'Resend failed',
        fallbackMessage: 'Could not resend the invite. Please try again.',
      });
      if (error) return;
      toast({
        title: 'Invite resent',
        description: `A fresh SMS invite was sent to ${subAgent.profile?.full_name || 'the user'}.`,
      });
      fetchSubAgentAnalytics();
    } finally {
      setResendingId(null);
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
      'Your 2% Earnings (UGX)',
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
      'Your 2% Share (UGX)',
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

  // Filtered & sorted sub-agents
  const filteredSubAgents = useMemo(() => {
    let result = subAgents;
    const q = subAgentSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(sa =>
        (sa.profile?.full_name?.toLowerCase().includes(q)) ||
        (sa.profile?.phone?.toLowerCase().includes(q))
      );
    }
    if (subAgentStatusFilter === 'with_tenants') {
      result = result.filter(sa => sa.tenantsCount > 0);
    } else if (subAgentStatusFilter === 'no_tenants') {
      result = result.filter(sa => sa.tenantsCount === 0);
    }

    // Sort
    const sorted = [...result];
    if (subAgentSort === 'newest') {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (subAgentSort === 'name_asc') {
      sorted.sort((a, b) => (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '', undefined, { sensitivity: 'base' }));
    } else if (subAgentSort === 'withdrawable_desc') {
      sorted.sort((a, b) => (b.wallet?.withdrawable_balance || 0) - (a.wallet?.withdrawable_balance || 0));
    }
    return sorted;
  }, [subAgents, subAgentSearch, subAgentStatusFilter, subAgentSort]);

  // Filtered tenants (inside detail modal)
  const filteredTenants = useMemo(() => {
    if (!selectedSubAgent) return [];
    const q = tenantSearch.trim().toLowerCase();
    if (!q) return selectedSubAgent.tenants;
    return selectedSubAgent.tenants.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.phone?.toLowerCase().includes(q) ?? false)
    );
  }, [selectedSubAgent, tenantSearch]);

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
          
          <Button 
            onClick={() => { hapticTap(); setInviteSheetOpen(true); }} 
            size="sm" 
            className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Invite Sub-Agent</span>
            <span className="sm:hidden">Invite</span>
          </Button>
        </div>
      </div>

      {/* Quick Jump Navigation */}
      {subAgents.length > 0 && (
        <div className="sticky top-[73px] z-20 bg-background/95 backdrop-blur border-b px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'subagent-overview', label: 'Summary', icon: BarChart3 },
              { id: 'subagent-invite', label: 'Invites', icon: Sparkles },
              { id: 'subagent-team', label: 'Team', icon: Users },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  hapticTap();
                  document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex items-center gap-1.5 shrink-0 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted active:scale-95 transition-colors"
              >
                <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="p-4 space-y-5">
        {subAgents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-orange-500" />
              </div>
              <h3 className="font-bold text-lg mb-2">No Sub-Agents Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Build your team by registering sub-agents. You'll earn 2% of all their tenants' repayments!
              </p>
              <Button onClick={() => setInviteSheetOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Invite Your First Sub-Agent
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
            <div id="subagent-overview" className="scroll-mt-24">
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
            </div>

            {/* Monthly Earnings Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-success" />
                  Monthly Earnings (2% from Sub-Agents)
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

            {/* Invite Banner — always visible to encourage growth */}
            <div 
              id="subagent-invite"
              onClick={() => { hapticTap(); setInviteSheetOpen(true); }}
              className="scroll-mt-24 relative overflow-hidden rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-background p-4 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-xl bg-orange-500/15 shrink-0">
                  <Sparkles className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">Grow Your Team</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Invite more sub-agents and earn <span className="font-semibold text-orange-500">2%</span> from every tenant they register. More agents = more passive income.
                  </p>
                </div>
                <div className="shrink-0 self-center">
                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/25">
                    <Plus className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Agents List */}
            <Card id="subagent-team" className="scroll-mt-24">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-5 w-5 text-orange-500" />
                    Your Sub-Agents
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {filteredSubAgents.length} of {subAgents.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Search & filter bar */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by name or phone..."
                      value={subAgentSearch}
                      onChange={(e) => setSubAgentSearch(e.target.value)}
                      className="pl-9 pr-9 h-10"
                    />
                    {subAgentSearch && (
                      <button
                        onClick={() => setSubAgentSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <Button
                      size="sm"
                      variant={subAgentStatusFilter === 'all' ? 'default' : 'outline'}
                      onClick={() => setSubAgentStatusFilter('all')}
                      className="text-xs shrink-0 h-8"
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant={subAgentStatusFilter === 'with_tenants' ? 'default' : 'outline'}
                      onClick={() => setSubAgentStatusFilter('with_tenants')}
                      className="text-xs shrink-0 h-8"
                    >
                      With Tenants
                    </Button>
                    <Button
                      size="sm"
                      variant={subAgentStatusFilter === 'no_tenants' ? 'default' : 'outline'}
                      onClick={() => setSubAgentStatusFilter('no_tenants')}
                      className="text-xs shrink-0 h-8"
                    >
                      No Tenants
                    </Button>

                    {/* Sort Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs shrink-0 h-8 gap-1 ml-auto"
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          Sort
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem
                          onClick={() => setSubAgentSort('newest')}
                          className={subAgentSort === 'newest' ? 'bg-muted font-medium' : ''}
                        >
                          Newest First
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setSubAgentSort('name_asc')}
                          className={subAgentSort === 'name_asc' ? 'bg-muted font-medium' : ''}
                        >
                          Name (A–Z)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setSubAgentSort('withdrawable_desc')}
                          className={subAgentSort === 'withdrawable_desc' ? 'bg-muted font-medium' : ''}
                        >
                          Highest Withdrawable
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {filteredSubAgents.length === 0 ? (
                  <div className="text-center py-6">
                    <Search className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {subAgentSearch || subAgentStatusFilter !== 'all'
                        ? 'No sub-agents match your search'
                        : 'No sub-agents yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSubAgents.map((subAgent) => {
                      const accepted = subAgent.status === 'verified' || !!subAgent.accepted_at;
                      const smsStatus = subAgent.invite_sms_status;
                      const openDetail = () => {
                        setSelectedSubAgent(subAgent);
                        const next = new URLSearchParams(searchParams);
                        next.set('id', subAgent.sub_agent_id);
                        setSearchParams(next, { replace: true });
                      };
                      return (
                        <div
                          key={subAgent.id}
                          className="rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <button
                            onClick={openDetail}
                            className="w-full flex items-center justify-between p-3 text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold shrink-0">
                                {subAgent.profile?.full_name?.charAt(0) || '?'}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium text-sm truncate">{subAgent.profile?.full_name || 'Unknown'}</p>
                                  {/* Invite delivery / acceptance status */}
                                  {accepted ? (
                                    <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-4 bg-success/10 text-success border-success/20">
                                      <CheckCircle2 className="h-3 w-3" /> Accepted
                                    </Badge>
                                  ) : smsStatus === 'failed' ? (
                                    <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-4 bg-destructive/10 text-destructive border-destructive/20">
                                      <AlertCircle className="h-3 w-3" /> Failed
                                    </Badge>
                                  ) : smsStatus === 'sent' ? (
                                    <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-600 border-blue-500/20">
                                      <Send className="h-3 w-3" /> Sent
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-4 bg-warning/10 text-warning border-warning/20">
                                      <Clock className="h-3 w-3" /> Pending
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-2">
                                  <span>{subAgent.tenantsCount} tenant{subAgent.tenantsCount !== 1 ? 's' : ''}</span>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="hidden sm:inline">Joined {format(new Date(subAgent.created_at), 'MMM d, yyyy')}</span>
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-2 shrink-0">
                              <div>
                                <p className="font-bold text-sm text-success">{formatUGX(subAgent.totalEarnings)}</p>
                                <p className="text-[10px] text-muted-foreground">your 2%</p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </button>
                          {/* Resend invite — only while not yet accepted */}
                          {!accepted && (
                            <div className="px-3 pb-3 -mt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={resendingId === subAgent.sub_agent_id}
                                onClick={() => { hapticTap(); handleResendInvite(subAgent); }}
                              >
                                {resendingId === subAgent.sub_agent_id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                                {smsStatus === 'failed' ? 'Retry invite SMS' : 'Resend invite'}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Sub-Agent Detail Modal */}
      {selectedSubAgent && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={closeDetail}
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
                <Button variant="ghost" size="sm" onClick={closeDetail}>
                  Close
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Quick contact actions */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={selectedSubAgent.profile?.phone ? `tel:${selectedSubAgent.profile.phone}` : undefined}
                  className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium border transition-colors ${
                    selectedSubAgent.profile?.phone
                      ? 'bg-success/10 text-success border-success/20 active:bg-success/20'
                      : 'bg-muted text-muted-foreground border-border pointer-events-none opacity-60'
                  }`}
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
                <a
                  href={selectedSubAgent.profile?.phone ? `https://wa.me/${selectedSubAgent.profile.phone.replace(/[^0-9]/g, '')}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium border transition-colors ${
                    selectedSubAgent.profile?.phone
                      ? 'bg-primary/10 text-primary border-primary/20 active:bg-primary/20'
                      : 'bg-muted text-muted-foreground border-border pointer-events-none opacity-60'
                  }`}
                >
                  <Mail className="h-4 w-4" />
                  WhatsApp
                </a>
              </div>

              {/* Profile Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <IdCard className="h-4 w-4 text-orange-500" />
                    Profile Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="flex items-start gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Phone</p>
                      <p className="font-medium break-all">{selectedSubAgent.profile?.phone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Email</p>
                      <p className="font-medium break-all">{selectedSubAgent.profile?.email || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <IdCard className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">National ID</p>
                      <p className="font-medium break-all">{selectedSubAgent.profile?.national_id || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Location</p>
                      <p className="font-medium">
                        {[selectedSubAgent.profile?.district, selectedSubAgent.profile?.region]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Occupation</p>
                      <p className="font-medium">{selectedSubAgent.profile?.occupation || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Joined</p>
                      <p className="font-medium">
                        {selectedSubAgent.profile?.joined_at
                          ? format(new Date(selectedSubAgent.profile.joined_at), 'MMM d, yyyy')
                          : format(new Date(selectedSubAgent.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Wallet Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-success" />
                    Wallet Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedSubAgent.wallet ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-success/10 rounded-xl p-3 border border-success/20 col-span-2 text-center">
                        <p className="text-[11px] text-muted-foreground">Withdrawable Balance</p>
                        <p className="font-bold text-success text-xl mt-0.5">
                          {formatUGX(selectedSubAgent.wallet.withdrawable_balance)}
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center border border-border">
                        <p className="text-[11px] text-muted-foreground">Float Balance</p>
                        <p className="font-bold text-foreground text-base mt-0.5">
                          {formatUGX(selectedSubAgent.wallet.float_balance)}
                        </p>
                      </div>
                      <div className="bg-warning/10 rounded-xl p-3 text-center border border-warning/20">
                        <p className="text-[11px] text-muted-foreground">Advance (owed)</p>
                        <p className="font-bold text-warning text-base mt-0.5">
                          {formatUGX(selectedSubAgent.wallet.advance_balance)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No wallet found for this sub-agent
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Primary KPI — Parent earnings from this sub-agent */}
              <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-2xl p-5 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  Your Earnings from {selectedSubAgent.profile?.full_name?.split(' ')[0] || 'This Sub-Agent'}
                </p>
                <p className="text-3xl font-bold text-orange-600 mt-1">
                  {formatUGX(selectedSubAgent.totalEarnings)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  2% of all collections facilitated
                </p>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-success/10 rounded-xl p-3 text-center border border-success/20">
                  <p className="text-[11px] text-muted-foreground">Facilitated Rent Volume</p>
                  <p className="font-bold text-success text-base mt-0.5">{formatUGX(selectedSubAgent.facilitatedRentVolume)}</p>
                </div>
                <div className="bg-primary/10 rounded-xl p-3 text-center border border-primary/20">
                  <p className="text-[11px] text-muted-foreground">Accessed Funds</p>
                  <p className="font-bold text-primary text-base mt-0.5">{formatUGX(selectedSubAgent.accessedFunds)}</p>
                </div>
                <div className="bg-warning/10 rounded-xl p-3 text-center border border-warning/20">
                  <p className="text-[11px] text-muted-foreground">Platform Rewards</p>
                  <p className="font-bold text-warning text-base mt-0.5">{formatUGX(selectedSubAgent.platformRewards)}</p>
                </div>
                <div className="bg-muted rounded-xl p-3 text-center border border-border">
                  <p className="text-[11px] text-muted-foreground">Service Fees Generated</p>
                  <p className="font-bold text-foreground text-base mt-0.5">{formatUGX(selectedSubAgent.serviceFees)}</p>
                </div>
              </div>

              {/* Tenants & Joined mini row */}
              <div className="flex items-center justify-between text-sm px-1">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-orange-500" />
                  <span className="text-muted-foreground">{selectedSubAgent.tenantsCount} tenant{selectedSubAgent.tenantsCount !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  Joined {format(new Date(selectedSubAgent.created_at), 'MMM yyyy')}
                </span>
              </div>

              {/* Recruiter-split breakdown (8% sub-agent vs 2% recruiter) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Coins className="h-4 w-4 text-orange-500" />
                    Recruiter Split Breakdown
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Sub-agent keeps 8% · you earn 2% on each rent allocation
                  </p>
                </CardHeader>
                <CardContent>
                  {splitsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : recruiterSplits.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No rent allocations yet
                    </p>
                  ) : (
                    <>
                      {/* Totals */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Allocated</p>
                          <p className="text-xs font-bold">
                            {formatUGX(recruiterSplits.reduce((s, r) => s + Number(r.amount), 0))}
                          </p>
                        </div>
                        <div className="bg-primary/10 rounded-lg p-2 text-center border border-primary/20">
                          <p className="text-[10px] text-muted-foreground">Sub-agent 8%</p>
                          <p className="text-xs font-bold text-primary">
                            {formatUGX(recruiterSplits.reduce((s, r) => s + Number(r.subagent_share), 0))}
                          </p>
                        </div>
                        <div className="bg-orange-500/10 rounded-lg p-2 text-center border border-orange-500/20">
                          <p className="text-[10px] text-muted-foreground">Your 2%</p>
                          <p className="text-xs font-bold text-orange-600">
                            {formatUGX(recruiterSplits.reduce((s, r) => s + Number(r.recruiter_override), 0))}
                          </p>
                        </div>
                      </div>

                      {/* Per-transaction rows */}
                      <div className="space-y-2">
                        {recruiterSplits.map((r) => (
                          <div key={r.trace_id} className="rounded-lg border border-border p-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{r.tenant_name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {format(new Date(r.created_at), 'dd MMM yyyy · HH:mm')}
                                  {r.tracking_id ? ` · ${r.tracking_id}` : ''}
                                </p>
                              </div>
                              <span className="text-xs font-semibold shrink-0 ml-2">
                                {formatUGX(Number(r.amount))}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-primary/10 rounded-md px-2 py-1 text-center">
                                <span className="text-[10px] text-muted-foreground">8% </span>
                                <span className="text-xs font-semibold text-primary">
                                  {formatUGX(Number(r.subagent_share))}
                                </span>
                              </div>
                              <div className="flex-1 bg-orange-500/10 rounded-md px-2 py-1 text-center">
                                <span className="text-[10px] text-muted-foreground">2% </span>
                                <span className="text-xs font-semibold text-orange-600">
                                  {formatUGX(Number(r.recruiter_override))}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

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
                <CardHeader className="pb-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Tenants ({filteredTenants.length})</CardTitle>
                  </div>
                  {selectedSubAgent.tenants.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Find tenant by name or phone..."
                        value={tenantSearch}
                        onChange={(e) => setTenantSearch(e.target.value)}
                        className="pl-9 pr-9 h-9 text-sm"
                      />
                      {tenantSearch && (
                        <button
                          onClick={() => setTenantSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {selectedSubAgent.tenants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No tenants registered yet
                    </p>
                  ) : filteredTenants.length === 0 ? (
                    <div className="text-center py-6">
                      <Search className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No tenants match your search</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTenants.map((tenant) => (
                        <div key={tenant.id} className="flex items-center justify-between gap-2 p-2.5 bg-muted/50 rounded-lg">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{tenant.name}</p>
                            {tenant.phone ? (
                              <a
                                href={`tel:${tenant.phone}`}
                                className="inline-flex items-center gap-1 text-xs text-primary mt-0.5"
                              >
                                <Phone className="h-3 w-3" />
                                {tenant.phone}
                              </a>
                            ) : (
                              <p className="text-[11px] text-muted-foreground mt-0.5">No phone</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-xs font-medium">{formatUGX(tenant.totalRepaid)}</p>
                              <p className="text-[10px] text-muted-foreground">total repaid</p>
                            </div>
                            {tenant.phone && (
                              <a
                                href={`tel:${tenant.phone}`}
                                className="flex items-center justify-center h-9 w-9 rounded-full bg-success/10 text-success active:bg-success/20"
                                aria-label={`Call ${tenant.name}`}
                              >
                                <Phone className="h-4 w-4" />
                              </a>
                            )}
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

      {/* Invite an existing user as a sub-agent — searches any user and
          auto-sends an SMS + email invite they must accept. */}
      <Sheet open={inviteSheetOpen} onOpenChange={setInviteSheetOpen}>
        <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl overflow-y-auto pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="h-6 w-6 text-orange-500" />
              Invite a Sub-Agent
            </SheetTitle>
            <SheetDescription>
              Search any registered user by name, phone, or email. They'll get an
              SMS (and email) inviting them to accept becoming your sub-agent.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <AddSubAgentSearch
              onAdded={() => {
                fetchSubAgentAnalytics();
                setInviteSheetOpen(false);
              }}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              className="w-full h-12 gap-2 rounded-xl"
              onClick={() => { hapticTap(); setInviteSheetOpen(false); setRegisterDialogOpen(true); }}
            >
              <Sparkles className="h-4 w-4 text-orange-500" />
              Create a brand-new sub-agent account
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <SetTeamGoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        onSuccess={() => {
          fetchCurrentGoal();
          fetchSubAgentAnalytics();
        }}
        existingGoal={currentGoal}
      />
      <FloatingActionButton
        actions={[
          {
            icon: UserPlus,
            label: 'Invite Sub-Agent',
            onClick: () => { hapticTap(); setInviteSheetOpen(true); },
            variant: 'default',
          },
        ]}
        position="bottom-right"
      />
    </div>
  );
}
