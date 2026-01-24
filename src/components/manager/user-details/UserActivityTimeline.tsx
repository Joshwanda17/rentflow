import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  LogIn, LogOut, UserCog, Shield, CheckCircle, XCircle,
  Wallet, ArrowUpRight, ArrowDownLeft, ShoppingCart, Home,
  CreditCard, PiggyBank, Pencil, Clock, Filter, ChevronDown,
  Activity, Calendar, TrendingUp
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  amount?: number;
  created_at: string;
  metadata?: Record<string, unknown>;
  performed_by?: string;
}

interface UserActivityTimelineProps {
  userId: string;
  userName: string;
}

const ACTIVITY_FILTERS = [
  { value: 'all', label: 'All Activity' },
  { value: 'logins', label: 'Logins' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'actions', label: 'Key Actions' },
];

export default function UserActivityTimeline({ userId, userName }: UserActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    fetchAllActivity();
  }, [userId]);

  const fetchAllActivity = async () => {
    setLoading(true);
    const allActivities: ActivityItem[] = [];

    // Fetch from user_activity_log table
    const { data: activityLogs } = await supabase
      .from('user_activity_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    activityLogs?.forEach(log => {
      allActivities.push({
        id: `activity-${log.id}`,
        type: log.activity_type,
        description: log.description,
        created_at: log.created_at,
        metadata: log.metadata as Record<string, unknown> || {},
        performed_by: log.performed_by
      });
    });

    // Fetch login history
    const { data: loginHistory } = await supabase
      .from('user_login_history')
      .select('*')
      .eq('user_id', userId)
      .order('login_at', { ascending: false })
      .limit(20);

    loginHistory?.forEach(login => {
      allActivities.push({
        id: `login-${login.id}`,
        type: 'login',
        description: `Logged in via ${login.login_method || 'password'}`,
        created_at: login.login_at,
        metadata: { 
          ip_address: login.ip_address,
          user_agent: login.user_agent,
          success: login.success
        }
      });
    });

    // Fetch sent transactions
    const { data: sentTransactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount, description, created_at')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    sentTransactions?.forEach(t => {
      allActivities.push({
        id: `sent-${t.id}`,
        type: 'transaction_sent',
        description: t.description || 'Sent money',
        amount: t.amount,
        created_at: t.created_at
      });
    });

    // Fetch received transactions
    const { data: receivedTransactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount, description, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    receivedTransactions?.forEach(t => {
      allActivities.push({
        id: `received-${t.id}`,
        type: 'transaction_received',
        description: t.description || 'Received money',
        amount: t.amount,
        created_at: t.created_at
      });
    });

    // Fetch deposits
    const { data: deposits } = await supabase
      .from('wallet_deposits')
      .select('id, amount, created_at, deposit_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    deposits?.forEach(d => {
      allActivities.push({
        id: `deposit-${d.id}`,
        type: 'deposit',
        description: `${d.deposit_type === 'cash' ? 'Cash' : 'Mobile'} deposit`,
        amount: d.amount,
        created_at: d.created_at
      });
    });

    // Fetch withdrawals
    const { data: withdrawals } = await supabase
      .from('wallet_withdrawals')
      .select('id, amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    withdrawals?.forEach(w => {
      allActivities.push({
        id: `withdrawal-${w.id}`,
        type: 'withdrawal',
        description: 'Wallet withdrawal',
        amount: w.amount,
        created_at: w.created_at
      });
    });

    // Fetch rent requests
    const { data: rentRequests } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, created_at, status')
      .eq('tenant_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    rentRequests?.forEach(r => {
      allActivities.push({
        id: `rent-${r.id}`,
        type: 'rent_request',
        description: `Rent request (${r.status})`,
        amount: r.rent_amount,
        created_at: r.created_at
      });
    });

    // Fetch repayments
    const { data: repayments } = await supabase
      .from('repayments')
      .select('id, amount, created_at')
      .eq('tenant_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    repayments?.forEach(r => {
      allActivities.push({
        id: `repayment-${r.id}`,
        type: 'repayment',
        description: 'Rent repayment',
        amount: r.amount,
        created_at: r.created_at
      });
    });

    // Fetch product orders
    const { data: orders } = await supabase
      .from('product_orders')
      .select('id, total_price, created_at, status')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    orders?.forEach(o => {
      allActivities.push({
        id: `order-${o.id}`,
        type: 'order',
        description: `Product order (${o.status})`,
        amount: o.total_price,
        created_at: o.created_at
      });
    });

    // Fetch audit logs (role changes, verifications, etc.)
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('record_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    auditLogs?.forEach(log => {
      let description = log.action_type;
      let type = 'admin_action';
      
      const newValues = log.new_values as Record<string, unknown> | null;
      const oldValues = log.old_values as Record<string, unknown> | null;
      
      if (log.table_name === 'user_roles') {
        type = 'role_change';
        const newRole = newValues?.role as string | undefined;
        const oldRole = oldValues?.role as string | undefined;
        if (log.action_type === 'INSERT') {
          description = `Role "${newRole}" added`;
        } else if (log.action_type === 'DELETE') {
          description = `Role "${oldRole}" removed`;
        } else if (log.action_type === 'UPDATE') {
          const enabled = newValues?.enabled as boolean | undefined;
          description = enabled ? `Role "${newRole}" enabled` : `Role "${newRole}" disabled`;
        }
      } else if (log.table_name === 'profiles' && newValues?.verified !== undefined) {
        type = 'verification';
        description = newValues.verified ? 'Account verified' : 'Verification revoked';
      }
      
      allActivities.push({
        id: `audit-${log.id}`,
        type,
        description,
        created_at: log.created_at,
        performed_by: log.performed_by || undefined,
        metadata: { reason: log.reason, ...log.metadata as Record<string, unknown> }
      });
    });

    // Sort all activities by date
    allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setActivities(allActivities);
    setLoading(false);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'login':
        return <LogIn className="h-4 w-4" />;
      case 'logout':
        return <LogOut className="h-4 w-4" />;
      case 'role_change':
        return <UserCog className="h-4 w-4" />;
      case 'verification':
        return <Shield className="h-4 w-4" />;
      case 'profile_update':
        return <Pencil className="h-4 w-4" />;
      case 'transaction_sent':
        return <ArrowUpRight className="h-4 w-4" />;
      case 'transaction_received':
        return <ArrowDownLeft className="h-4 w-4" />;
      case 'deposit':
        return <Wallet className="h-4 w-4" />;
      case 'withdrawal':
        return <CreditCard className="h-4 w-4" />;
      case 'rent_request':
        return <Home className="h-4 w-4" />;
      case 'repayment':
        return <TrendingUp className="h-4 w-4" />;
      case 'order':
        return <ShoppingCart className="h-4 w-4" />;
      case 'admin_action':
        return <UserCog className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'login':
        return 'bg-blue-500/20 text-blue-600 border-blue-500/30';
      case 'logout':
        return 'bg-slate-500/20 text-slate-600 border-slate-500/30';
      case 'role_change':
        return 'bg-purple-500/20 text-purple-600 border-purple-500/30';
      case 'verification':
        return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
      case 'transaction_sent':
        return 'bg-red-500/20 text-red-600 border-red-500/30';
      case 'transaction_received':
        return 'bg-green-500/20 text-green-600 border-green-500/30';
      case 'deposit':
        return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
      case 'withdrawal':
        return 'bg-amber-500/20 text-amber-600 border-amber-500/30';
      case 'rent_request':
        return 'bg-indigo-500/20 text-indigo-600 border-indigo-500/30';
      case 'repayment':
        return 'bg-teal-500/20 text-teal-600 border-teal-500/30';
      case 'order':
        return 'bg-pink-500/20 text-pink-600 border-pink-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getDateGroup = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return 'This Week';
    if (isThisMonth(date)) return 'This Month';
    return format(date, 'MMMM yyyy');
  };

  const filteredActivities = useMemo(() => {
    let filtered = activities;
    
    if (filter === 'logins') {
      filtered = activities.filter(a => a.type === 'login' || a.type === 'logout');
    } else if (filter === 'transactions') {
      filtered = activities.filter(a => 
        ['transaction_sent', 'transaction_received', 'deposit', 'withdrawal', 'repayment'].includes(a.type)
      );
    } else if (filter === 'actions') {
      filtered = activities.filter(a => 
        ['role_change', 'verification', 'profile_update', 'admin_action', 'rent_request', 'order'].includes(a.type)
      );
    }
    
    return filtered.slice(0, limit);
  }, [activities, filter, limit]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    
    filteredActivities.forEach(activity => {
      const group = getDateGroup(activity.created_at);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(activity);
    });
    
    return groups;
  }, [filteredActivities]);

  const stats = useMemo(() => {
    const loginCount = activities.filter(a => a.type === 'login').length;
    const transactionCount = activities.filter(a => 
      ['transaction_sent', 'transaction_received', 'deposit', 'withdrawal'].includes(a.type)
    ).length;
    const lastLogin = activities.find(a => a.type === 'login');
    
    return { loginCount, transactionCount, lastLogin };
  }, [activities]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 flex-1 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <LogIn className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Logins</span>
          </div>
          <p className="font-bold text-lg">{stats.loginCount}</p>
        </div>
        
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Transactions</span>
          </div>
          <p className="font-bold text-lg">{stats.transactionCount}</p>
        </div>
        
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Last Seen</span>
          </div>
          <p className="font-bold text-sm truncate">
            {stats.lastLogin 
              ? formatDistanceToNow(new Date(stats.lastLogin.created_at), { addSuffix: true })
              : 'Never'
            }
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Activity Timeline
        </h4>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {ACTIVITY_FILTERS.find(f => f.value === filter)?.label}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ACTIVITY_FILTERS.map(f => (
              <DropdownMenuItem 
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={filter === f.value ? 'bg-primary/10' : ''}
              >
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Timeline */}
      <ScrollArea className="h-[400px]">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No activity yet</p>
            <p className="text-sm text-muted-foreground">
              Activity will appear here as {userName.split(' ')[0]} uses the app
            </p>
          </div>
        ) : (
          <div className="space-y-4 pr-4">
            {Object.entries(groupedActivities).map(([dateGroup, items]) => (
              <div key={dateGroup}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {dateGroup}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                
                <div className="relative pl-6 space-y-2">
                  {/* Timeline line */}
                  <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                  
                  {items.map((activity, index) => (
                    <div 
                      key={activity.id}
                      className="relative flex items-start gap-3 p-3 rounded-xl bg-card border hover:bg-muted/50 transition-colors"
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-4 top-4 w-2 h-2 rounded-full bg-primary ring-4 ring-background" />
                      
                      {/* Icon */}
                      <div className={`p-2 rounded-lg shrink-0 ${getActivityColor(activity.type)}`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{activity.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(activity.created_at), 'h:mm a')}
                          </span>
                          {activity.amount !== undefined && (
                            <Badge variant="outline" className="text-xs py-0 h-5">
                              {formatUGX(activity.amount)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Load More */}
            {filteredActivities.length >= limit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLimit(prev => prev + 20)}
                className="w-full"
              >
                Load More
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
