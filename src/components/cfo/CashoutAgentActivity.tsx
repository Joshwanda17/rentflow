import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Banknote, Building2, ArrowDownToLine, ArrowUpFromLine, Clock, CheckCircle2, User, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';

export function CashoutAgentActivity() {
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');

  // Fetch all active cashout agents
  const { data: agents = [] } = useQuery({
    queryKey: ['cashout-agents-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashout_agents')
        .select('*, profiles:agent_id(id, full_name, phone)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch audit logs for cashout agent actions
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['cashout-agent-activity', agentFilter],
    queryFn: async () => {
      const agentIds = agents.map((a: any) => a.agent_id);
      if (agentIds.length === 0) return [];

      const targetIds = agentFilter === 'all' ? agentIds : [agentFilter];

      let q = supabase
        .from('audit_logs')
        .select('*')
        .in('user_id', targetIds)
        .in('action_type', [
          'cash_payout_completed',
          'bank_payout_completed',
          'wallet_deposit_approved',
          'wallet_withdrawal_approved',
          'proxy_deposit',
          'proxy_withdrawal',
          'wallet_credit',
          'wallet_debit',
        ])
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: agents.length > 0,
  });

  // Also fetch payout_codes completed by these agents
  const { data: payoutActions = [] } = useQuery({
    queryKey: ['cashout-payout-actions', agentFilter],
    queryFn: async () => {
      const agentIds = agents.map((a: any) => a.agent_id);
      if (agentIds.length === 0) return [];

      const targetIds = agentFilter === 'all' ? agentIds : [agentFilter];

      const { data, error } = await supabase
        .from('payout_codes')
        .select('*, profiles:user_id(full_name, phone)')
        .in('paid_by', targetIds)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: agents.length > 0,
  });

  // Merge and sort all activities
  const agentNameMap = new Map<string, string>();
  agents.forEach((a: any) => {
    agentNameMap.set(a.agent_id, a.profiles?.full_name || 'Agent');
  });

  type ActivityItem = {
    id: string;
    agentId: string;
    agentName: string;
    type: string;
    description: string;
    amount: number | null;
    timestamp: string;
    icon: 'cash' | 'bank' | 'deposit' | 'withdrawal' | 'other';
    beneficiary?: string;
  };

  const mergedActivities: ActivityItem[] = [];

  // From audit logs
  activities.forEach((log: any) => {
    const meta = log.metadata || {};
    mergedActivities.push({
      id: log.id,
      agentId: log.user_id,
      agentName: agentNameMap.get(log.user_id) || 'Unknown',
      type: log.action_type,
      description: formatActionType(log.action_type),
      amount: meta.amount || meta.payout_amount || null,
      timestamp: log.created_at,
      icon: getIconType(log.action_type),
      beneficiary: meta.beneficiary_name || meta.code || undefined,
    });
  });

  // From payout codes
  payoutActions.forEach((p: any) => {
    mergedActivities.push({
      id: `payout-${p.id}`,
      agentId: p.paid_by,
      agentName: agentNameMap.get(p.paid_by) || 'Unknown',
      type: 'cash_payout_verified',
      description: 'Cash Payout Verified',
      amount: p.amount,
      timestamp: p.paid_at,
      icon: 'cash',
      beneficiary: p.profiles?.full_name || p.code,
    });
  });

  // Sort by timestamp desc
  mergedActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter by search
  const filtered = search.trim()
    ? mergedActivities.filter(a =>
        a.agentName.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase()) ||
        (a.beneficiary && a.beneficiary.toLowerCase().includes(search.toLowerCase()))
      )
    : mergedActivities;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Cashout Agent Activity</h2>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((a: any) => (
              <SelectItem key={a.agent_id} value={a.agent_id}>
                {a.profiles?.full_name || 'Agent'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {agents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard label="Active Agents" value={agents.length.toString()} icon={<User className="h-4 w-4 text-primary" />} />
          <SummaryCard
            label="Cash Payouts"
            value={payoutActions.length.toString()}
            icon={<Banknote className="h-4 w-4 text-orange-500" />}
          />
          <SummaryCard
            label="Total Paid Out"
            value={formatUGX(payoutActions.reduce((s: number, p: any) => s + (p.amount || 0), 0))}
            icon={<ArrowDownToLine className="h-4 w-4 text-destructive" />}
          />
          <SummaryCard
            label="Actions Today"
            value={mergedActivities.filter(a => {
              const d = new Date(a.timestamp);
              const today = new Date();
              return d.toDateString() === today.toDateString();
            }).length.toString()}
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      )}

      {/* Activity Feed */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No agent activity found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map(item => (
            <Card key={item.id} className="border-l-4" style={{ borderLeftColor: getColorForIcon(item.icon) }}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getActivityIcon(item.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{item.agentName}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.timestamp), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.amount && (
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {formatUGX(item.amount)}
                        </Badge>
                      )}
                      {item.beneficiary && (
                        <Badge variant="outline" className="text-[10px]">
                          → {item.beneficiary}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        {icon}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-sm font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatActionType(type: string): string {
  const map: Record<string, string> = {
    cash_payout_completed: 'Cash Payout Completed',
    bank_payout_completed: 'Bank Payout Completed',
    wallet_deposit_approved: 'Deposit Approved',
    wallet_withdrawal_approved: 'Withdrawal Approved',
    proxy_deposit: 'Proxy Deposit',
    proxy_withdrawal: 'Proxy Withdrawal',
    wallet_credit: 'Wallet Credited',
    wallet_debit: 'Wallet Debited',
    cash_payout_verified: 'Cash Payout Verified',
  };
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getIconType(type: string): 'cash' | 'bank' | 'deposit' | 'withdrawal' | 'other' {
  if (type.includes('cash')) return 'cash';
  if (type.includes('bank')) return 'bank';
  if (type.includes('deposit') || type.includes('credit')) return 'deposit';
  if (type.includes('withdrawal') || type.includes('debit')) return 'withdrawal';
  return 'other';
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'cash': return <Banknote className="h-4 w-4 text-orange-500" />;
    case 'bank': return <Building2 className="h-4 w-4 text-blue-500" />;
    case 'deposit': return <ArrowUpFromLine className="h-4 w-4 text-green-500" />;
    case 'withdrawal': return <ArrowDownToLine className="h-4 w-4 text-red-500" />;
    default: return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
  }
}

function getColorForIcon(type: string): string {
  switch (type) {
    case 'cash': return 'hsl(25, 95%, 53%)';
    case 'bank': return 'hsl(217, 91%, 60%)';
    case 'deposit': return 'hsl(142, 71%, 45%)';
    case 'withdrawal': return 'hsl(0, 84%, 60%)';
    default: return 'hsl(215, 20%, 65%)';
  }
}
