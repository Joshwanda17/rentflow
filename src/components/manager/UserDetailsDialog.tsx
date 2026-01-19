import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { 
  User, Mail, Phone, Star, Banknote, CheckCircle, XCircle, 
  Calendar, Wallet, TrendingUp, PiggyBank, Clock, Activity,
  ArrowUpRight, ArrowDownLeft, ShoppingCart, Home, CreditCard,
  Send, Download as DownloadIcon, MessageCircle, CalendarDays, X, Filter,
  Shield, Plus, Trash2, UserCog, Loader2, Pencil, AlertTriangle, ToggleLeft, ToggleRight, ChevronLeft,
  FileText, UsersRound
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays, subWeeks, subMonths, isWithinInterval } from 'date-fns';
import WhatsAppPhoneLink from '@/components/WhatsAppPhoneLink';
import StartChatButton from '@/components/chat/StartChatButton';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import UserRentSection from './user-details/UserRentSection';
import UserInvestmentsSection from './user-details/UserInvestmentsSection';
import UserTermsSection from './user-details/UserTermsSection';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

const allRoles: { value: AppRole; label: string; description: string; color: string }[] = [
  { value: 'tenant', label: 'Tenant', description: 'Can request rent assistance', color: 'bg-primary/20 text-primary' },
  { value: 'agent', label: 'Agent', description: 'Manages deposits & loans', color: 'bg-warning/20 text-warning' },
  { value: 'landlord', label: 'Landlord', description: 'Receives rent payments', color: 'bg-chart-5/20 text-chart-5' },
  { value: 'supporter', label: 'Supporter', description: 'Can invest & fund requests', color: 'bg-success/20 text-success' },
  { value: 'manager', label: 'Manager', description: 'Full admin access', color: 'bg-destructive/20 text-destructive' },
];

interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  color: string;
  status: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  type: 'transaction_sent' | 'transaction_received' | 'deposit' | 'withdrawal' | 'order' | 'rent_request' | 'repayment' | 'loan_repayment';
  amount: number;
  description: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface SubAgent {
  id: string;
  sub_agent_id: string;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
    avatar_url: string | null;
  };
  tenants_count: number;
}

interface UserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string | null;
    rent_discount_active: boolean;
    monthly_rent: number | null;
    roles: string[];
    average_rating: number | null;
    rating_count: number;
    verified?: boolean;
  } | null;
  onRolesUpdated?: () => void;
  onUserDeleted?: () => void;
  onUserUpdated?: () => void;
}

export default function UserDetailsDialog({ open, onOpenChange, user, onRolesUpdated, onUserDeleted, onUserUpdated }: UserDetailsDialogProps) {
  const isMobile = useIsMobile();
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('all');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [roleEnabledStatus, setRoleEnabledStatus] = useState<Record<string, boolean>>({});
  const [addingRole, setAddingRole] = useState<AppRole | null>(null);
  const [removingRole, setRemovingRole] = useState<string | null>(null);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Edit profile state
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    monthly_rent: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<boolean>(false);
  const [approvingUser, setApprovingUser] = useState(false);
  const [rejectingUser, setRejectingUser] = useState(false);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [subAgentsLoading, setSubAgentsLoading] = useState(false);
  
  useEffect(() => {
    if (open && user) {
      fetchUserDetails();
      fetchUserRolesWithStatus();
      fetchVerificationStatus();
      // Fetch subagents if user is an agent
      if (user.roles.includes('agent')) {
        fetchSubAgents();
      }
      setEditForm({
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        monthly_rent: user.monthly_rent?.toString() || ''
      });
    }
  }, [open, user]);

  const fetchVerificationStatus = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('verified')
      .eq('id', user.id)
      .single();
    
    if (!error && data) {
      setVerificationStatus(data.verified);
    }
  };

  const fetchSubAgents = async () => {
    if (!user) return;
    setSubAgentsLoading(true);
    
    try {
      // Fetch subagents for this agent
      const { data: subAgentsData, error } = await supabase
        .from('agent_subagents')
        .select('*')
        .eq('parent_agent_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!subAgentsData || subAgentsData.length === 0) {
        setSubAgents([]);
        setSubAgentsLoading(false);
        return;
      }

      // Fetch profiles for subagents
      const subAgentIds = subAgentsData.map(sa => sa.sub_agent_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, avatar_url')
        .in('id', subAgentIds);

      // Count tenants per subagent
      const tenantsCountBySubAgent: Record<string, number> = {};
      for (const subAgentId of subAgentIds) {
        const { count } = await supabase
          .from('rent_requests')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', subAgentId);
        
        tenantsCountBySubAgent[subAgentId] = count || 0;
      }

      // Combine data
      const enrichedSubAgents: SubAgent[] = subAgentsData.map(sa => ({
        ...sa,
        profile: profiles?.find(p => p.id === sa.sub_agent_id),
        tenants_count: tenantsCountBySubAgent[sa.sub_agent_id] || 0,
      }));

      setSubAgents(enrichedSubAgents);
    } catch (error) {
      console.error('Error fetching subagents:', error);
    } finally {
      setSubAgentsLoading(false);
    }
  };

  const handleApproveUser = async () => {
    if (!user) return;
    setApprovingUser(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verified: true })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setVerificationStatus(true);
      toast.success(`${user.full_name} has been approved and verified`);
      onUserUpdated?.();
    } catch (error) {
      console.error('Error approving user:', error);
      toast.error('Failed to approve user');
    } finally {
      setApprovingUser(false);
    }
  };

  const handleRejectUser = async () => {
    if (!user) return;
    setRejectingUser(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verified: false })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setVerificationStatus(false);
      toast.success(`${user.full_name} verification has been revoked`);
      onUserUpdated?.();
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast.error('Failed to reject user');
    } finally {
      setRejectingUser(false);
    }
  };

  const fetchUserRolesWithStatus = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, enabled')
      .eq('user_id', user.id);
    
    if (!error && data) {
      const roles = data.map(r => r.role);
      const enabledMap: Record<string, boolean> = {};
      data.forEach(r => {
        enabledMap[r.role] = r.enabled;
      });
      setUserRoles(roles);
      setRoleEnabledStatus(enabledMap);
    }
  };

  const handleAddRole = async (role: AppRole) => {
    if (!user) return;
    setAddingRole(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: user.id, role });
      
      if (error) {
        if (error.code === '23505') {
          toast.error('User already has this role');
        } else {
          throw error;
        }
      } else {
        setUserRoles(prev => [...prev, role]);
        toast.success(`Added "${role}" role to ${user.full_name}`);
        onRolesUpdated?.();
      }
    } catch (error) {
      console.error('Error adding role:', error);
      toast.error('Failed to add role');
    } finally {
      setAddingRole(null);
    }
  };

  const handleRemoveRole = async (role: AppRole) => {
    if (!user) return;
    
    if (userRoles.length <= 1) {
      toast.error('User must have at least one role');
      return;
    }
    
    setRemovingRole(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user.id)
        .eq('role', role);
      
      if (error) throw error;
      
      setUserRoles(prev => prev.filter(r => r !== role));
      toast.success(`Removed "${role}" role from ${user.full_name}`);
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error removing role:', error);
      toast.error('Failed to remove role');
    } finally {
      setRemovingRole(null);
    }
  };

  const handleToggleRoleEnabled = async (role: AppRole) => {
    if (!user) return;
    
    const currentEnabled = roleEnabledStatus[role] ?? true;
    const newEnabled = !currentEnabled;
    
    // Check if this would disable all enabled roles
    const enabledRolesCount = Object.entries(roleEnabledStatus).filter(([r, enabled]) => enabled && r !== role).length;
    if (!newEnabled && enabledRolesCount === 0) {
      toast.error('User must have at least one enabled dashboard');
      return;
    }
    
    setTogglingRole(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: newEnabled })
        .eq('user_id', user.id)
        .eq('role', role);
      
      if (error) throw error;
      
      setRoleEnabledStatus(prev => ({ ...prev, [role]: newEnabled }));
      toast.success(newEnabled 
        ? `Enabled "${role}" dashboard for ${user.full_name}` 
        : `Disabled "${role}" dashboard for ${user.full_name}`
      );
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error toggling role:', error);
      toast.error('Failed to update dashboard access');
    } finally {
      setTogglingRole(null);
    }
  };

  const availableRolesToAdd = allRoles.filter(r => !userRoles.includes(r.value));

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          email: editForm.email,
          phone: editForm.phone,
          monthly_rent: editForm.monthly_rent ? parseFloat(editForm.monthly_rent) : null
        })
        .eq('id', user.id);
      
      if (error) throw error;
      
      toast.success('Profile updated successfully');
      onUserUpdated?.();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    setDeletingUser(true);
    
    try {
      // Delete user roles first
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user.id);
      
      // Delete wallet
      await supabase
        .from('wallets')
        .delete()
        .eq('user_id', user.id);
      
      // Delete profile
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);
      
      if (error) throw error;
      
      toast.success(`User "${user.full_name}" has been deleted`);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onUserDeleted?.();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };
  const fetchUserDetails = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch investment accounts
    const { data: accounts } = await supabase
      .from('investment_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch wallet balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    setInvestmentAccounts(accounts || []);
    setWalletBalance(wallet?.balance || 0);
    setLoading(false);

    // Fetch activity log in parallel
    fetchActivityLog();
  };

  const fetchActivityLog = async () => {
    if (!user) return;
    setActivityLoading(true);

    const activities: ActivityItem[] = [];

    // Fetch sent transactions
    const { data: sentTransactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount, description, created_at')
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    sentTransactions?.forEach(t => {
      activities.push({
        id: `sent-${t.id}`,
        type: 'transaction_sent',
        amount: t.amount,
        description: t.description || 'Money sent',
        created_at: t.created_at
      });
    });

    // Fetch received transactions
    const { data: receivedTransactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount, description, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    receivedTransactions?.forEach(t => {
      activities.push({
        id: `received-${t.id}`,
        type: 'transaction_received',
        amount: t.amount,
        description: t.description || 'Money received',
        created_at: t.created_at
      });
    });

    // Fetch deposits
    const { data: deposits } = await supabase
      .from('wallet_deposits')
      .select('id, amount, created_at, deposit_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    deposits?.forEach(d => {
      activities.push({
        id: `deposit-${d.id}`,
        type: 'deposit',
        amount: d.amount,
        description: `${d.deposit_type === 'cash' ? 'Cash' : 'Mobile'} deposit`,
        created_at: d.created_at
      });
    });

    // Fetch withdrawals
    const { data: withdrawals } = await supabase
      .from('wallet_withdrawals')
      .select('id, amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    withdrawals?.forEach(w => {
      activities.push({
        id: `withdrawal-${w.id}`,
        type: 'withdrawal',
        amount: w.amount,
        description: 'Wallet withdrawal',
        created_at: w.created_at
      });
    });

    // Fetch product orders
    const { data: orders } = await supabase
      .from('product_orders')
      .select('id, total_price, created_at, status')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    orders?.forEach(o => {
      activities.push({
        id: `order-${o.id}`,
        type: 'order',
        amount: o.total_price,
        description: `Product order (${o.status})`,
        created_at: o.created_at
      });
    });

    // Fetch rent requests
    const { data: rentRequests } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, created_at, status')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    rentRequests?.forEach(r => {
      activities.push({
        id: `rent-${r.id}`,
        type: 'rent_request',
        amount: r.rent_amount,
        description: `Rent request (${r.status})`,
        created_at: r.created_at
      });
    });

    // Fetch repayments
    const { data: repayments } = await supabase
      .from('repayments')
      .select('id, amount, created_at')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    repayments?.forEach(r => {
      activities.push({
        id: `repayment-${r.id}`,
        type: 'repayment',
        amount: r.amount,
        description: 'Rent repayment',
        created_at: r.created_at
      });
    });

    // Fetch loan repayments
    const { data: loanRepayments } = await supabase
      .from('user_loan_repayments')
      .select('id, amount, created_at')
      .eq('borrower_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    loanRepayments?.forEach(l => {
      activities.push({
        id: `loan-repayment-${l.id}`,
        type: 'loan_repayment',
        amount: l.amount,
        description: 'Loan repayment',
        created_at: l.created_at
      });
    });

    // Sort all activities by date
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setActivityLog(activities.slice(0, 30)); // Keep last 30 activities
    setActivityLoading(false);
  };

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'transaction_sent':
        return <ArrowUpRight className="h-4 w-4 text-destructive" />;
      case 'transaction_received':
        return <ArrowDownLeft className="h-4 w-4 text-success" />;
      case 'deposit':
        return <DownloadIcon className="h-4 w-4 text-success" />;
      case 'withdrawal':
        return <Send className="h-4 w-4 text-warning" />;
      case 'order':
        return <ShoppingCart className="h-4 w-4 text-primary" />;
      case 'rent_request':
        return <Home className="h-4 w-4 text-chart-5" />;
      case 'repayment':
      case 'loan_repayment':
        return <CreditCard className="h-4 w-4 text-success" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'transaction_sent':
      case 'withdrawal':
        return 'text-destructive';
      case 'transaction_received':
      case 'deposit':
      case 'repayment':
      case 'loan_repayment':
        return 'text-success';
      case 'order':
        return 'text-primary';
      case 'rent_request':
        return 'text-chart-5';
      default:
        return 'text-foreground';
    }
  };

  // Activity type options for filtering
  const activityTypeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'transaction_sent', label: 'Sent' },
    { value: 'transaction_received', label: 'Received' },
    { value: 'deposit', label: 'Deposits' },
    { value: 'withdrawal', label: 'Withdrawals' },
    { value: 'order', label: 'Orders' },
    { value: 'rent_request', label: 'Rent Requests' },
    { value: 'repayment', label: 'Repayments' },
    { value: 'loan_repayment', label: 'Loan Repayments' },
  ];

  // Filter activities by date range and type
  const filteredActivityLog = useMemo(() => {
    let filtered = activityLog;
    
    // Filter by activity type
    if (activityTypeFilter !== 'all') {
      filtered = filtered.filter(activity => activity.type === activityTypeFilter);
    }
    
    // Filter by date range
    if (dateRange.from || dateRange.to) {
      filtered = filtered.filter(activity => {
        const activityDate = new Date(activity.created_at);
        
        if (dateRange.from && dateRange.to) {
          return isWithinInterval(activityDate, {
            start: startOfDay(dateRange.from),
            end: endOfDay(dateRange.to)
          });
        }
        
        if (dateRange.from) {
          return activityDate >= startOfDay(dateRange.from);
        }
        
        if (dateRange.to) {
          return activityDate <= endOfDay(dateRange.to);
        }
        
        return true;
      });
    }
    
    return filtered;
  }, [activityLog, dateRange, activityTypeFilter]);

  // Calculate activity summary statistics
  const activitySummary = useMemo(() => {
    const summary = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalSent: 0,
      totalReceived: 0,
      totalOrders: 0,
      totalRepayments: 0,
      depositCount: 0,
      withdrawalCount: 0,
      sentCount: 0,
      receivedCount: 0,
      orderCount: 0,
      repaymentCount: 0,
      moneyIn: 0,
      moneyOut: 0,
      netBalance: 0,
    };

    activityLog.forEach(activity => {
      switch (activity.type) {
        case 'deposit':
          summary.totalDeposits += activity.amount;
          summary.depositCount++;
          summary.moneyIn += activity.amount;
          break;
        case 'withdrawal':
          summary.totalWithdrawals += activity.amount;
          summary.withdrawalCount++;
          summary.moneyOut += activity.amount;
          break;
        case 'transaction_sent':
          summary.totalSent += activity.amount;
          summary.sentCount++;
          summary.moneyOut += activity.amount;
          break;
        case 'transaction_received':
          summary.totalReceived += activity.amount;
          summary.receivedCount++;
          summary.moneyIn += activity.amount;
          break;
        case 'order':
          summary.totalOrders += activity.amount;
          summary.orderCount++;
          summary.moneyOut += activity.amount;
          break;
        case 'repayment':
        case 'loan_repayment':
          summary.totalRepayments += activity.amount;
          summary.repaymentCount++;
          summary.moneyOut += activity.amount;
          break;
      }
    });

    summary.netBalance = summary.moneyIn - summary.moneyOut;

    return summary;
  }, [activityLog]);

  const setQuickDateRange = (days: number) => {
    const to = new Date();
    const from = days === 7 ? subWeeks(to, 1) : days === 30 ? subMonths(to, 1) : subDays(to, days);
    setDateRange({ from, to });
  };

  const clearAllFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setActivityTypeFilter('all');
  };

  const clearDateRange = () => {
    setDateRange({ from: undefined, to: undefined });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      tenant: 'bg-primary/20 text-primary',
      agent: 'bg-warning/20 text-warning',
      supporter: 'bg-success/20 text-success',
      landlord: 'bg-chart-5/20 text-chart-5',
      manager: 'bg-destructive/20 text-destructive'
    };
    return colors[role] || 'bg-muted text-muted-foreground';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    );
  };

  const totalInvested = investmentAccounts
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + a.balance, 0);

  if (!user) return null;

  // Shared header component
  const UserHeader = () => (
    <div className="flex items-center gap-3">
      <Avatar className={`${isMobile ? 'h-14 w-14' : 'h-12 w-12'}`}>
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback className="text-lg">{getInitials(user.full_name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className={`${isMobile ? 'text-xl' : 'text-lg'} font-semibold truncate`}>{user.full_name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {user.roles.map((role) => (
            <Badge key={role} className={`text-xs ${getRoleBadgeColor(role)}`}>
              {role}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );

  // Shared tabs component - now with 7 tabs using horizontal scroll on mobile
  const TabsNavigation = () => (
    <div className={isMobile ? 'overflow-x-auto -mx-4 px-4 pb-2' : ''}>
      <TabsList className={`${isMobile ? 'inline-flex w-auto min-w-full gap-1 h-12' : 'grid w-full grid-cols-7'}`}>
        <TabsTrigger value="overview" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <User className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Overview</span>
        </TabsTrigger>
        <TabsTrigger value="rent" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <Home className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Rent</span>
        </TabsTrigger>
        <TabsTrigger value="invest" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <PiggyBank className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Invest</span>
        </TabsTrigger>
        <TabsTrigger value="terms" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <FileText className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Terms</span>
        </TabsTrigger>
        <TabsTrigger value="activity" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <Activity className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Activity</span>
        </TabsTrigger>
        <TabsTrigger value="roles" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <Shield className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Roles</span>
        </TabsTrigger>
        <TabsTrigger value="edit" className={`gap-1.5 ${isMobile ? 'flex-col h-full py-1.5 text-[10px] px-3 shrink-0' : 'gap-2'}`}>
          <Pencil className="h-4 w-4" />
          <span className={isMobile ? '' : 'hidden sm:inline'}>Edit</span>
        </TabsTrigger>
      </TabsList>
    </div>
  );

  // Mobile version uses Sheet for full-screen experience
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 flex flex-col overflow-hidden">
          {/* Fixed Header */}
          <SheetHeader className="p-4 pb-0 shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => onOpenChange(false)}
                className="h-10 w-10 rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <SheetTitle className="flex-1">
                <UserHeader />
              </SheetTitle>
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 pt-2 shrink-0">
              <TabsNavigation />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y pb-safe" style={{ WebkitOverflowScrolling: 'touch' }}>
              <TabsContent value="overview" className="mt-0">
                <div className="p-4 space-y-5">
                  {/* Contact Info */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 pt-0">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${user.email}`} className="text-sm text-primary hover:underline truncate">
                          {user.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <WhatsAppPhoneLink phone={user.phone} />
                      </div>
                      <StartChatButton 
                        userId={user.id} 
                        userName={user.full_name}
                        variant="default"
                        className="w-full h-12"
                      />
                    </CardContent>
                  </Card>

                  {/* Financial Summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Wallet className="h-3 w-3" />
                        Wallet
                      </div>
                      <p className="font-semibold text-sm">{formatUGX(walletBalance)}</p>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <PiggyBank className="h-3 w-3" />
                        Invested
                      </div>
                      <p className="font-semibold text-sm">{formatUGX(totalInvested)}</p>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Banknote className="h-3 w-3" />
                        Monthly Rent
                      </div>
                      <p className="font-semibold text-sm">{user.monthly_rent ? formatUGX(user.monthly_rent) : 'N/A'}</p>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Star className="h-3 w-3" />
                        Rating
                      </div>
                      {user.rating_count > 0 ? (
                        <div className="flex items-center gap-1">
                          {renderStars(user.average_rating || 0)}
                          <span className="text-xs text-muted-foreground">({user.rating_count})</span>
                        </div>
                      ) : (
                        <p className="font-semibold text-sm text-muted-foreground">No ratings</p>
                      )}
                    </Card>
                  </div>

                  {/* Verification Status */}
                  <Card className={`border-2 ${verificationStatus ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {verificationStatus ? (
                            <>
                              <div className="p-2 rounded-full bg-success/20 shrink-0">
                                <CheckCircle className="h-5 w-5 text-success" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-success">Verified</p>
                                <p className="text-xs text-muted-foreground truncate">User is approved</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="p-2 rounded-full bg-warning/20 shrink-0">
                                <XCircle className="h-5 w-5 text-warning" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-warning">Pending</p>
                                <p className="text-xs text-muted-foreground truncate">Needs verification</p>
                              </div>
                            </>
                          )}
                        </div>
                        {!verificationStatus ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={handleApproveUser}
                            disabled={approvingUser}
                            className="gap-1 h-10 shrink-0"
                          >
                            {approvingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Approve
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleRejectUser}
                            disabled={rejectingUser}
                            className="gap-1 h-10 shrink-0"
                          >
                            {rejectingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Revoke
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Status Badges */}
                  {user.rent_discount_active && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Rent Discount Active
                    </Badge>
                  )}

                  {/* Investment Accounts */}
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Investment Accounts ({investmentAccounts.length})
                    </h3>
                    {loading ? (
                      <div className="space-y-3">
                        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                      </div>
                    ) : investmentAccounts.length === 0 ? (
                      <Card className="p-6 text-center">
                        <PiggyBank className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No investment accounts yet</p>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {investmentAccounts.map((account) => (
                          <Card key={account.id} className="overflow-hidden">
                            <div className="h-1" style={{ backgroundColor: account.color }} />
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{account.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(account.created_at), 'MMM d, yyyy')}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold">{formatUGX(account.balance)}</p>
                                  <div className="mt-1">{getStatusBadge(account.status)}</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rent" className="mt-0">
                <div className="p-4">
                  <UserRentSection userId={user.id} />
                </div>
              </TabsContent>

              <TabsContent value="invest" className="mt-0">
                <div className="p-4">
                  <UserInvestmentsSection userId={user.id} />
                </div>
              </TabsContent>

              <TabsContent value="terms" className="mt-0">
                <div className="p-4">
                  <UserTermsSection userId={user.id} userRoles={userRoles} />
                </div>
              </TabsContent>

              <TabsContent value="edit" className="mt-0">
                <div className="p-4 space-y-5">
                  {/* Edit Profile Form */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-primary" />
                        Edit Profile
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-name-mobile">Full Name</Label>
                        <Input
                          id="edit-name-mobile"
                          value={editForm.full_name}
                          onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                          placeholder="Enter full name"
                          className="h-12 text-base"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-email-mobile">Email</Label>
                        <Input
                          id="edit-email-mobile"
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="Enter email"
                          className="h-12 text-base"
                          inputMode="email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-phone-mobile">Phone</Label>
                        <Input
                          id="edit-phone-mobile"
                          value={editForm.phone}
                          onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="Enter phone number"
                          className="h-12 text-base"
                          inputMode="tel"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-rent-mobile">Monthly Rent (UGX)</Label>
                        <Input
                          id="edit-rent-mobile"
                          type="number"
                          value={editForm.monthly_rent}
                          onChange={(e) => setEditForm(prev => ({ ...prev, monthly_rent: e.target.value }))}
                          placeholder="Enter monthly rent"
                          className="h-12 text-base"
                          inputMode="numeric"
                        />
                      </div>
                      <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-12">
                        {savingProfile ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                        ) : (
                          <><CheckCircle className="h-4 w-4 mr-2" />Save Changes</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  <Separator />

                  {/* Danger Zone */}
                  <Card className="border-destructive/50">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Danger Zone
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground mb-4">
                        Permanently delete this user and all their data.
                      </p>
                      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="w-full h-12">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete User
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete <strong>{user.full_name}</strong> and all their data. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteUser}
                              disabled={deletingUser}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deletingUser ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : <><Trash2 className="h-4 w-4 mr-2" />Delete</>}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="roles" className="mt-0">
                <div className="p-4 space-y-5">
                  {/* Dashboard Access Control */}
                  <Card className="border-primary/20">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Dashboard Access
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground mb-4">
                        Toggle which dashboards this user can access.
                      </p>
                      {userRoles.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No roles assigned</p>
                      ) : (
                        <div className="space-y-3">
                          {userRoles.map((role) => {
                            const roleInfo = allRoles.find(r => r.value === role);
                            const isEnabled = roleEnabledStatus[role] ?? true;
                            const enabledCount = Object.values(roleEnabledStatus).filter(Boolean).length;
                            const canDisable = enabledCount > 1 || !isEnabled;
                            
                            return (
                              <div 
                                key={role}
                                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                                  isEnabled ? 'bg-card border-border' : 'bg-muted/30 border-muted opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <Badge className={`${roleInfo?.color || 'bg-muted'} ${!isEnabled ? 'opacity-50' : ''}`}>
                                    {roleInfo?.label || role}
                                  </Badge>
                                  <span className={`text-xs font-medium ${isEnabled ? 'text-success' : 'text-destructive'}`}>
                                    {isEnabled ? '✓ Active' : '✗ Disabled'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleRoleEnabled(role as AppRole)}
                                    disabled={togglingRole === role || (!canDisable && isEnabled)}
                                    className={`h-10 w-10 p-0 ${isEnabled ? 'text-success' : 'text-muted-foreground'}`}
                                  >
                                    {togglingRole === role ? (
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : isEnabled ? (
                                      <ToggleRight className="h-6 w-6" />
                                    ) : (
                                      <ToggleLeft className="h-6 w-6" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveRole(role as AppRole)}
                                    disabled={removingRole === role || userRoles.length <= 1}
                                    className="text-destructive h-10 w-10 p-0"
                                  >
                                    {removingRole === role ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Add New Role */}
                  {availableRolesToAdd.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Plus className="h-4 w-4 text-success" />
                          Add Role
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {availableRolesToAdd.map((role) => (
                            <div 
                              key={role.value}
                              className="flex items-center justify-between p-4 rounded-xl border bg-muted/30"
                            >
                              <Badge variant="outline" className={role.color}>
                                {role.label}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddRole(role.value)}
                                disabled={addingRole === role.value}
                                className="text-success h-10 w-10 p-0"
                              >
                                {addingRole === role.value ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Sub-Agents Section - Only for agents */}
                  {userRoles.includes('agent') && (
                    <Card className="border-orange-500/30">
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <UsersRound className="h-4 w-4 text-orange-500" />
                          Sub-Agents ({subAgents.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {subAgentsLoading ? (
                          <div className="space-y-2">
                            {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                          </div>
                        ) : subAgents.length === 0 ? (
                          <div className="text-center py-6">
                            <UsersRound className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">No sub-agents registered</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {subAgents.map((subAgent) => (
                              <div 
                                key={subAgent.id}
                                className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border"
                              >
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-10 w-10 border">
                                    <AvatarImage src={subAgent.profile?.avatar_url || undefined} />
                                    <AvatarFallback className="bg-orange-500/20 text-orange-600 text-sm font-bold">
                                      {subAgent.profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-medium text-sm">{subAgent.profile?.full_name || 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground">{subAgent.profile?.phone}</p>
                                  </div>
                                </div>
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                                  {subAgent.tenants_count} tenant{subAgent.tenants_count !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-0">
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      Activity
                    </h3>
                    <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                      <SelectTrigger className="w-[120px] h-10">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        {activityTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {activityLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : filteredActivityLog.length === 0 ? (
                    <Card className="p-8 text-center">
                      <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No activity found</p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {filteredActivityLog.map((activity) => (
                        <Card key={activity.id} className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-muted shrink-0">
                              {getActivityIcon(activity.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{activity.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                  </p>
                                </div>
                                <span className={`text-sm font-semibold shrink-0 ${getActivityColor(activity.type)}`}>
                                  {activity.type === 'transaction_sent' || activity.type === 'withdrawal' || activity.type === 'order' ? '-' : '+'}
                                  {formatUGX(activity.amount)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle>
            <UserHeader />
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-6 pt-4 shrink-0">
            <TabsNavigation />
          </div>

          <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: 'calc(90vh - 200px)' }}>
            <TabsContent value="overview" className="mt-0">
              <div className="p-6 pt-4 space-y-6">
                {/* Contact Info */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-0">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${user.email}`} className="text-sm text-primary hover:underline">
                        {user.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <WhatsAppPhoneLink phone={user.phone} />
                    </div>
                    <div className="flex items-center gap-3 md:col-span-2">
                      <StartChatButton userId={user.id} userName={user.full_name} variant="default" className="w-full md:w-auto" />
                    </div>
                  </CardContent>
                </Card>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Wallet className="h-3 w-3" />Wallet</div>
                    <p className="font-semibold text-sm">{formatUGX(walletBalance)}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><PiggyBank className="h-3 w-3" />Invested</div>
                    <p className="font-semibold text-sm">{formatUGX(totalInvested)}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Banknote className="h-3 w-3" />Monthly Rent</div>
                    <p className="font-semibold text-sm">{user.monthly_rent ? formatUGX(user.monthly_rent) : 'N/A'}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Star className="h-3 w-3" />Rating</div>
                    {user.rating_count > 0 ? (
                      <div className="flex items-center gap-1">{renderStars(user.average_rating || 0)}<span className="text-xs text-muted-foreground">({user.rating_count})</span></div>
                    ) : (
                      <p className="font-semibold text-sm text-muted-foreground">No ratings</p>
                    )}
                  </Card>
                </div>

                {/* Verification Status */}
                <Card className={`border-2 ${verificationStatus ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        {verificationStatus ? (
                          <>
                            <div className="p-2 rounded-full bg-success/20"><CheckCircle className="h-5 w-5 text-success" /></div>
                            <div><p className="font-semibold text-success">Verified User</p><p className="text-xs text-muted-foreground">Approved and can access all features</p></div>
                          </>
                        ) : (
                          <>
                            <div className="p-2 rounded-full bg-warning/20"><XCircle className="h-5 w-5 text-warning" /></div>
                            <div><p className="font-semibold text-warning">Pending Verification</p><p className="text-xs text-muted-foreground">This user needs to be verified</p></div>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!verificationStatus ? (
                          <Button size="sm" variant="default" onClick={handleApproveUser} disabled={approvingUser} className="gap-2">
                            {approvingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}Approve
                          </Button>
                        ) : (
                          <Button size="sm" variant="destructive" onClick={handleRejectUser} disabled={rejectingUser} className="gap-2">
                            {rejectingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {user.rent_discount_active && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />Rent Discount Active
                  </Badge>
                )}

                <Separator />

                {/* Investment Accounts */}
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-4"><TrendingUp className="h-5 w-5 text-primary" />Investment Accounts ({investmentAccounts.length})</h3>
                  {loading ? (
                    <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
                  ) : investmentAccounts.length === 0 ? (
                    <Card className="p-6 text-center"><PiggyBank className="h-10 w-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No investment accounts yet</p></Card>
                  ) : (
                    <div className="space-y-3">
                      {investmentAccounts.map((account) => (
                        <Card key={account.id} className="overflow-hidden">
                          <div className="h-1" style={{ backgroundColor: account.color }} />
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div><p className="font-medium">{account.name}</p><div className="flex items-center gap-2 text-xs text-muted-foreground mt-1"><Calendar className="h-3 w-3" />Created {format(new Date(account.created_at), 'MMM d, yyyy')}</div></div>
                              <div className="text-right"><p className="font-semibold">{formatUGX(account.balance)}</p><div className="mt-1">{getStatusBadge(account.status)}</div></div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rent" className="mt-0">
              <div className="p-6 pt-4">
                <UserRentSection userId={user.id} />
              </div>
            </TabsContent>

            <TabsContent value="invest" className="mt-0">
              <div className="p-6 pt-4">
                <UserInvestmentsSection userId={user.id} />
              </div>
            </TabsContent>

            <TabsContent value="terms" className="mt-0">
              <div className="p-6 pt-4">
                <UserTermsSection userId={user.id} userRoles={userRoles} />
              </div>
            </TabsContent>

            <TabsContent value="edit" className="mt-0">
              <div className="p-6 pt-4 space-y-6">
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" />Edit Profile</CardTitle></CardHeader>
                  <CardContent className="pt-0 space-y-4">
                    <div className="space-y-2"><Label htmlFor="edit-name">Full Name</Label><Input id="edit-name" value={editForm.full_name} onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Enter full name" /></div>
                    <div className="space-y-2"><Label htmlFor="edit-email">Email</Label><Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} placeholder="Enter email" /></div>
                    <div className="space-y-2"><Label htmlFor="edit-phone">Phone</Label><Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Enter phone number" /></div>
                    <div className="space-y-2"><Label htmlFor="edit-rent">Monthly Rent (UGX)</Label><Input id="edit-rent" type="number" value={editForm.monthly_rent} onChange={(e) => setEditForm(prev => ({ ...prev, monthly_rent: e.target.value }))} placeholder="Enter monthly rent amount" /></div>
                    <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">{savingProfile ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><CheckCircle className="h-4 w-4 mr-2" />Save Changes</>}</Button>
                  </CardContent>
                </Card>
                <Separator />
                <Card className="border-destructive/50">
                  <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" />Danger Zone</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-4">Permanently delete this user and all their data.</p>
                    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                      <AlertDialogTrigger asChild><Button variant="destructive" className="w-full"><Trash2 className="h-4 w-4 mr-2" />Delete User</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete <strong>{user.full_name}</strong> and all their data. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteUser} disabled={deletingUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deletingUser ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : <><Trash2 className="h-4 w-4 mr-2" />Delete User</>}</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="roles" className="mt-0">
              <div className="p-6 pt-4 space-y-6">
                <Card className="border-primary/20">
                  <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Dashboard Access Control</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground mb-4">Toggle which dashboards this user can access.</p>
                    {userRoles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No roles assigned</p>
                    ) : (
                      <div className="space-y-3">
                        {userRoles.map((role) => {
                          const roleInfo = allRoles.find(r => r.value === role);
                          const isEnabled = roleEnabledStatus[role] ?? true;
                          const enabledCount = Object.values(roleEnabledStatus).filter(Boolean).length;
                          const canDisable = enabledCount > 1 || !isEnabled;
                          return (
                            <div key={role} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isEnabled ? 'bg-card border-border' : 'bg-muted/30 border-muted opacity-60'}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Badge className={`${roleInfo?.color || 'bg-muted'} ${!isEnabled ? 'opacity-50' : ''}`}>{roleInfo?.label || role}</Badge>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs text-muted-foreground truncate">{roleInfo?.description}</span>
                                  <span className={`text-xs font-medium ${isEnabled ? 'text-success' : 'text-destructive'}`}>{isEnabled ? '✓ Can access' : '✗ Disabled'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button variant="ghost" size="sm" onClick={() => handleToggleRoleEnabled(role as AppRole)} disabled={togglingRole === role || (!canDisable && isEnabled)} className={`h-8 px-3 ${isEnabled ? 'text-success hover:bg-success/10' : 'text-muted-foreground hover:bg-muted'}`}>
                                  {togglingRole === role ? <Loader2 className="h-4 w-4 animate-spin" /> : isEnabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleRemoveRole(role as AppRole)} disabled={removingRole === role || userRoles.length <= 1} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0">
                                  {removingRole === role ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
                {availableRolesToAdd.length > 0 && (
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Plus className="h-4 w-4 text-success" />Add Role</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {availableRolesToAdd.map((role) => (
                          <div key={role.value} className="flex items-center justify-between p-3 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3"><Badge variant="outline" className={role.color}>{role.label}</Badge><span className="text-xs text-muted-foreground">{role.description}</span></div>
                            <Button variant="ghost" size="sm" onClick={() => handleAddRole(role.value)} disabled={addingRole === role.value} className="text-success hover:text-success hover:bg-success/10">
                              {addingRole === role.value ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Sub-Agents Section - Only for agents */}
                {userRoles.includes('agent') && (
                  <Card className="border-orange-500/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-orange-500" />
                        Sub-Agents ({subAgents.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {subAgentsLoading ? (
                        <div className="space-y-2">
                          {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                        </div>
                      ) : subAgents.length === 0 ? (
                        <div className="text-center py-6">
                          <UsersRound className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No sub-agents registered</p>
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                          {subAgents.map((subAgent) => (
                            <div 
                              key={subAgent.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border">
                                  <AvatarImage src={subAgent.profile?.avatar_url || undefined} />
                                  <AvatarFallback className="bg-orange-500/20 text-orange-600 text-sm font-bold">
                                    {subAgent.profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{subAgent.profile?.full_name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">{subAgent.profile?.phone}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                                {subAgent.tenants_count} tenant{subAgent.tenants_count !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <div className="p-6 pt-4">
                <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                  <h3 className="font-semibold flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Activity Log</h3>
                  <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                    <SelectTrigger className={`w-[130px] h-8 text-xs ${activityTypeFilter !== 'all' ? 'border-primary text-primary' : ''}`}>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      {activityTypeOptions.map((option) => (<SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {activityLoading ? (
                  <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : filteredActivityLog.length === 0 ? (
                  <Card className="p-8 text-center"><Activity className="h-10 w-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No activity recorded yet</p></Card>
                ) : (
                  <div className="space-y-2">
                    {filteredActivityLog.map((activity) => (
                      <Card key={activity.id} className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-muted shrink-0">{getActivityIcon(activity.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{activity.description}</p>
                                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}<span className="mx-1">•</span>{format(new Date(activity.created_at), 'MMM d, yyyy')}</p>
                              </div>
                              <span className={`text-sm font-semibold shrink-0 ${getActivityColor(activity.type)}`}>{activity.type === 'transaction_sent' || activity.type === 'withdrawal' || activity.type === 'order' ? '-' : '+'}{formatUGX(activity.amount)}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
