import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  FileText, 
  Banknote, 
  Receipt,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sparkles,
  ShoppingCart,
  CheckCircle,
  Clock,
  ChartBar,
  Package,
  Award,
  Wallet,
  Download,
  UserPlus,
  UserCheck,
  CalendarPlus,
  Crown,
  Calendar,
  FileDown,
  FileSpreadsheet,
  Minus,
  Target,
  Edit3,
  Check,
  X,
  History,
  ChevronDown,
  ChevronUp,
  Trash2,
  Loader2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Save,
  BookmarkPlus,
  Shield,
  AlertTriangle
} from 'lucide-react';
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
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, startOfMonth, formatDistanceToNow, isToday, isThisWeek } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { WalletCard } from '@/components/wallet/WalletCard';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { ManagerDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { FloatingDepositsWidget } from '@/components/manager/FloatingDepositsWidget';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import { CreateUserInviteDialog } from '@/components/manager/CreateUserInviteDialog';
import { SupporterInvitesList } from '@/components/manager/SupporterInvitesList';
import { PendingInvitesWidget } from '@/components/manager/PendingInvitesWidget';
import { PendingInvestmentRequestsWidget } from '@/components/manager/PendingInvestmentRequestsWidget';
import { PaidAgentsHistory } from '@/components/manager/PaidAgentsHistory';
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';
import BulkRemoveRoleDialog from '@/components/manager/BulkRemoveRoleDialog';
import MobileManagerMenu from '@/components/manager/MobileManagerMenu';
import { MobileQuickActions } from '@/components/manager/MobileQuickActions';
import RoleSwitcher from '@/components/RoleSwitcher';
import { UserMinus } from 'lucide-react';
import { WithdrawalRequestsManager } from '@/components/manager/WithdrawalRequestsManager';
import { CollapsibleAgentSection } from '@/components/agent/CollapsibleAgentSection';
import { ForceRefreshManager } from '@/components/manager/ForceRefreshManager';
import { usePresence } from '@/hooks/usePresence';
import { ActiveUsersCard } from '@/components/manager/ActiveUsersCard';
import { ChromecastButton } from '@/components/manager/ChromecastButton';
import { useDuplicatePhoneUsers } from '@/hooks/useDuplicatePhoneUsers';
import { DuplicatePhoneUsersSheet } from '@/components/manager/DuplicatePhoneUsersSheet';
import { OpportunitySummaryForm } from '@/components/manager/OpportunitySummaryForm';

interface ManagerDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

const MANAGER_ACCESS_CODE = 'Manager@welile';

export default function ManagerDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { isOnline } = useOffline();
  const { onlineUsers, isOnline: isUserOnline } = usePresence();
  const { duplicateUserIds, duplicateCount, duplicateGroups } = useDuplicatePhoneUsers();
  const [duplicatePhoneSheetOpen, setDuplicatePhoneSheetOpen] = useState(false);
  const [showOpportunitySummary, setShowOpportunitySummary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasCachedData, setHasCachedData] = useState(false);
  // Auto-verify if manager already authenticated via /manager-login PIN flow
  const [accessVerified, setAccessVerified] = useState(() => {
    return sessionStorage.getItem('manager_access_verified') === 'true';
  });
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [accessError, setAccessError] = useState(false);

  const handleAccessCodeSubmit = () => {
    if (accessCodeInput === MANAGER_ACCESS_CODE) {
      setAccessVerified(true);
      sessionStorage.setItem('manager_access_verified', 'true');
      setAccessError(false);
    } else {
      setAccessError(true);
      toast.error('Invalid access code');
    }
  };
  const [createUserInviteOpen, setCreateUserInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{
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
  } | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalFacilitated, setTotalFacilitated] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingLoans, setPendingLoans] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [newSignupsThisWeek, setNewSignupsThisWeek] = useState(0);
  const [topOnboarders, setTopOnboarders] = useState<{
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string | null;
    referral_count: number;
    roles?: string[];
    created_at?: string;
    updated_at?: string;
  }[]>([]);
  const [productivityFilter, setProductivityFilter] = useState<'week' | 'month' | 'all' | 'custom'>('all');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [trendData, setTrendData] = useState<{ date: string; count: number }[]>([]);
  const [periodComparison, setPeriodComparison] = useState<{
    currentTotal: number;
    previousTotal: number;
    percentChange: number;
    currentRecruiters: number;
    previousRecruiters: number;
    recruitersChange: number;
  } | null>(null);
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null);
  const [monthlyProgress, setMonthlyProgress] = useState(0);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [showTargetHistory, setShowTargetHistory] = useState(false);
  const [targetHistory, setTargetHistory] = useState<{
    month: string;
    target: number;
    actual: number;
    achieved: boolean;
  }[]>([]);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkRoleDialogOpen, setBulkRoleDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkRemoveRoleDialogOpen, setBulkRemoveRoleDialogOpen] = useState(false);
  const [selectedBulkRole, setSelectedBulkRole] = useState<AppRole | ''>('');
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState('Hello! This is a message from Welile.');
  const [savedTemplates, setSavedTemplates] = useState<{ id: string; name: string; message: string }[]>(() => {
    const stored = localStorage.getItem('whatsapp-templates');
    return stored ? JSON.parse(stored) : [
      { id: '1', name: 'Welcome', message: 'Hello! Welcome to Welile. We are excited to have you on board!' },
      { id: '2', name: 'Reminder', message: 'Hi! This is a friendly reminder from Welile. Please check your dashboard for updates.' },
    ];
  });
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortBy, setUserSortBy] = useState<'name' | 'referrals' | 'newest' | 'oldest' | 'last_active'>('referrals');
  const [activityFilter, setActivityFilter] = useState<'all' | 'today' | 'week' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);

  // Compute online users from topOnboarders list
  const activeOnlineUsers = topOnboarders.filter(u => isUserOnline(u.id)).map(u => ({
    id: u.id,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    roles: u.roles || [],
  }));

  // Helper to get activity status
  const getActivityStatus = (updatedAt?: string): 'today' | 'week' | 'inactive' => {
    if (!updatedAt) return 'inactive';
    const lastActive = new Date(updatedAt);
    if (isToday(lastActive)) return 'today';
    if (isThisWeek(lastActive, { weekStartsOn: 1 })) return 'week';
    return 'inactive';
  };

  // Filter and sort users
  const filteredOnboarders = topOnboarders
    .filter(user => user.full_name.toLowerCase().includes(userSearchQuery.toLowerCase()))
    .filter(user => {
      if (activityFilter === 'all') return true;
      return getActivityStatus(user.updated_at) === activityFilter;
    })
    .sort((a, b) => {
      switch (userSortBy) {
        case 'name':
          return a.full_name.localeCompare(b.full_name);
        case 'referrals':
          return b.referral_count - a.referral_count;
        case 'newest':
          return (b.created_at || '').localeCompare(a.created_at || '');
        case 'oldest':
          return (a.created_at || '').localeCompare(b.created_at || '');
        case 'last_active':
          return (b.updated_at || '').localeCompare(a.updated_at || '');
        default:
          return 0;
      }
    });

  // Pagination calculations
  const totalPages = Math.ceil(filteredOnboarders.length / usersPerPage);
  const paginatedOnboarders = filteredOnboarders.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage
  );

  // Reset to page 1 when search/sort changes
  const handleSearchChange = (value: string) => {
    setUserSearchQuery(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: typeof userSortBy) => {
    setUserSortBy(value);
    setCurrentPage(1);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredOnboarders.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredOnboarders.map(o => o.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      const userIds = Array.from(selectedUserIds);
      
      // Delete roles for all selected users
      await supabase.from('user_roles').delete().in('user_id', userIds);
      
      // Delete wallets for all selected users
      await supabase.from('wallets').delete().in('user_id', userIds);
      
      // Delete profiles for all selected users
      const { error } = await supabase.from('profiles').delete().in('id', userIds);
      
      if (error) throw error;
      
      toast.success(`${userIds.length} users deleted successfully`);
      setSelectedUserIds(new Set());
      setBulkDeleteDialogOpen(false);
      fetchProductivityData();
    } catch (error) {
      console.error('Error bulk deleting users:', error);
      toast.error('Failed to delete users');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkAssignRole = async () => {
    if (!selectedBulkRole) {
      toast.error('Please select a role');
      return;
    }
    
    setBulkActionLoading(true);
    try {
      const userIds = Array.from(selectedUserIds);
      
      // Insert roles for all selected users (ignore conflicts)
      for (const userId of userIds) {
        await supabase.from('user_roles').upsert(
          { user_id: userId, role: selectedBulkRole },
          { onConflict: 'user_id,role' }
        );
      }
      
      toast.success(`Role "${selectedBulkRole}" assigned to ${userIds.length} users`);
      setSelectedUserIds(new Set());
      setBulkRoleDialogOpen(false);
      setSelectedBulkRole('');
      fetchProductivityData();
    } catch (error) {
      console.error('Error assigning roles:', error);
      toast.error('Failed to assign roles');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleQuickDeleteUser = async (userId: string, userName: string) => {
    setDeletingUserId(userId);
    try {
      // Delete user roles
      await supabase.from('user_roles').delete().eq('user_id', userId);
      
      // Delete user wallet
      await supabase.from('wallets').delete().eq('user_id', userId);
      
      // Delete user profile
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      
      if (error) throw error;
      
      toast.success(`${userName} has been deleted`);
      
      // Refresh the list
      fetchProductivityData();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  // Load cached data first for offline support
  useEffect(() => {
    const cached = localStorage.getItem(`manager_dashboard_${user.id}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setPendingRequests(data.pendingRequests ?? 0);
        setTotalUsers(data.totalUsers ?? 0);
        setTotalFacilitated(data.totalFacilitated ?? 0);
        setPendingOrders(data.pendingOrders ?? 0);
        setPendingLoans(data.pendingLoans ?? 0);
        setActiveUsers(data.activeUsers ?? 0);
        setNewSignupsThisWeek(data.newSignupsThisWeek ?? 0);
        setHasCachedData(true);
      } catch (e) {
        console.warn('[ManagerDashboard] Failed to load cached data');
      }
    }
  }, [user.id]);

  // Run ALL initial data fetches in parallel with 8s timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Force-stop loading after 8s so dashboard is usable
      setLoading(false);
    }, 8000);

    Promise.all([
      fetchData(),
      fetchMonthlyTarget(),
      fetchProductivityData()
    ]).catch(console.error).finally(() => clearTimeout(timeout));
  }, []);

  // Re-fetch productivity when filter changes (after initial load)
  useEffect(() => {
    if (productivityFilter !== 'custom' || (customDateRange.start && customDateRange.end)) {
      fetchProductivityData();
    }
  }, [productivityFilter, customDateRange]);

  const fetchProductivityData = async () => {
    try {
      const customStart = productivityFilter === 'custom' && customDateRange.start ? customDateRange.start.toISOString() : null;
      const customEnd = productivityFilter === 'custom' && customDateRange.end ? new Date(customDateRange.end.getTime()).toISOString() : null;

      const { data, error } = await supabase.rpc('get_manager_productivity', {
        p_filter: productivityFilter,
        p_custom_start: customStart,
        p_custom_end: customEnd
      });

      if (error) {
        console.error('[ManagerDashboard] Productivity RPC error:', error);
        return;
      }

      const result = data as {
        onboarders: { id: string; full_name: string; email: string; phone: string; avatar_url: string | null; created_at: string; updated_at: string; referral_count: number; roles: string[] }[];
        current_total: number;
        previous_total: number;
        previous_recruiters: number;
        trend_data: { date: string; count: number }[];
      };

      setTopOnboarders(result.onboarders || []);
      setTrendData(result.trend_data || []);

      const currentTotal = result.current_total || 0;
      const activeRecruiters = (result.onboarders || []).filter(o => o.referral_count > 0).length;
      const prevTotal = result.previous_total || 0;
      const prevRecruiters = result.previous_recruiters || 0;

      if (prevTotal > 0 || currentTotal > 0) {
        setPeriodComparison({
          currentTotal,
          previousTotal: prevTotal,
          percentChange: prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100) : (currentTotal > 0 ? 100 : 0),
          currentRecruiters: activeRecruiters,
          previousRecruiters: prevRecruiters,
          recruitersChange: prevRecruiters > 0 ? Math.round(((activeRecruiters - prevRecruiters) / prevRecruiters) * 100) : (activeRecruiters > 0 ? 100 : 0)
        });
      } else {
        setPeriodComparison(null);
      }
    } catch (err) {
      console.error('[ManagerDashboard] fetchProductivityData error:', err);
    }
  };

  const fetchMonthlyTarget = async () => {
    const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthStart = startOfMonth(new Date()).toISOString();
    
    // Fetch target and progress in parallel
    const [targetRes, countRes] = await Promise.all([
      supabase
        .from('onboarding_targets')
        .select('target_count')
        .eq('target_month', currentMonth)
        .maybeSingle(),
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart)
    ]);
    
    if (targetRes.data) {
      setMonthlyTarget(targetRes.data.target_count);
      setTargetInput(String(targetRes.data.target_count));
    }
    
    setMonthlyProgress(countRes.count || 0);
  };

  const handleSaveTarget = async () => {
    const targetValue = parseInt(targetInput);
    if (isNaN(targetValue) || targetValue <= 0) {
      toast.error('Please enter a valid target number');
      return;
    }
    
    const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    
    const { error } = await supabase
      .from('onboarding_targets')
      .upsert({
        target_month: currentMonth,
        target_count: targetValue,
        set_by: user.id
      }, { onConflict: 'target_month' });
    
    if (error) {
      toast.error('Failed to save target');
      return;
    }
    
    setMonthlyTarget(targetValue);
    setIsEditingTarget(false);
    toast.success('Monthly target updated!');
  };

  const fetchTargetHistory = async () => {
    // Get all past targets
    const { data: targets } = await supabase
      .from('onboarding_targets')
      .select('target_month, target_count')
      .order('target_month', { ascending: false })
      .limit(6);
    
    if (!targets || targets.length === 0) {
      setTargetHistory([]);
      return;
    }
    
    // Fetch referrals for each month
    const historyPromises = targets.map(async (target) => {
      const monthStart = new Date(target.target_month);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', monthEnd.toISOString());
      
      return {
        month: format(monthStart, 'MMM yyyy'),
        target: target.target_count,
        actual: count || 0,
        achieved: (count || 0) >= target.target_count
      };
    });
    
    const history = await Promise.all(historyPromises);
    setTargetHistory(history);
  };

  const toggleTargetHistory = () => {
    if (!showTargetHistory) {
      fetchTargetHistory();
    }
    setShowTargetHistory(!showTargetHistory);
  };

  const fetchData = async () => {
    // Skip network fetch if offline and we have cached data
    if (!navigator.onLine && hasCachedData) {
      setLoading(false);
      return;
    }
    
    // Don't reset loading to true if we have cached data — show cache first
    if (!hasCachedData) {
      setLoading(true);
    }
    
    try {
      // Single RPC call replaces 7 parallel queries — much faster on mobile
      const { data, error } = await supabase.rpc('get_manager_dashboard_stats');
      
      if (error) {
        console.error('[ManagerDashboard] Stats RPC error:', error);
        setLoading(false);
        return;
      }

      const stats = data as {
        pending_requests: number;
        total_facilitated: number;
        total_users: number;
        active_users: number;
        new_signups_this_week: number;
        pending_orders: number;
        pending_loans: number;
      };
      
      setPendingRequests(stats.pending_requests);
      setTotalFacilitated(stats.total_facilitated);
      setTotalUsers(stats.total_users);
      setActiveUsers(stats.active_users);
      setNewSignupsThisWeek(stats.new_signups_this_week);
      setPendingOrders(stats.pending_orders);
      setPendingLoans(stats.pending_loans);
      
      // Cache the data for offline use
      localStorage.setItem(`manager_dashboard_${user.id}`, JSON.stringify({
        pendingRequests: stats.pending_requests,
        totalFacilitated: stats.total_facilitated,
        totalUsers: stats.total_users,
        activeUsers: stats.active_users,
        newSignupsThisWeek: stats.new_signups_this_week,
        pendingOrders: stats.pending_orders,
        pendingLoans: stats.pending_loans,
        timestamp: Date.now()
      }));
      setHasCachedData(true);
    } catch (error) {
      console.error('[ManagerDashboard] Error fetching data:', error);
    }
    
    setLoading(false);
  };

  const handleSelectOnboarder = async (userId: string) => {
    // Fetch full user details including roles and ratings
    const [profileRes, rolesRes, ratingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('tenant_ratings').select('rating').eq('tenant_id', userId)
    ]);

    if (profileRes.data) {
      const roles = (rolesRes.data || []).map(r => r.role);
      const ratings = (ratingsRes.data || []).map(r => r.rating);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
        : null;

      setSelectedUser({
        id: profileRes.data.id,
        full_name: profileRes.data.full_name,
        email: profileRes.data.email,
        phone: profileRes.data.phone,
        avatar_url: profileRes.data.avatar_url,
        rent_discount_active: profileRes.data.rent_discount_active,
        monthly_rent: profileRes.data.monthly_rent,
        roles,
        average_rating: avgRating,
        rating_count: ratings.length
      });
    }
  };

  const getFilterLabel = () => {
    switch (productivityFilter) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      default: return 'All Time';
    }
  };

  const exportToCSV = () => {
    if (filteredOnboarders.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Rank', 'Name', 'Email', 'Phone', 'Roles', 'Users Onboarded', 'Last Active'];
    const rows = filteredOnboarders.map((o, i) => [
      i + 1,
      `"${o.full_name}"`,
      `"${o.email}"`,
      `"${o.phone}"`,
      `"${o.roles?.join(', ') || 'No role'}"`,
      o.referral_count,
      o.updated_at ? format(new Date(o.updated_at), 'yyyy-MM-dd HH:mm') : 'N/A'
    ]);

    const filterInfo = userSearchQuery ? ` (filtered by "${userSearchQuery}")` : '';
    const sortInfo = userSortBy === 'referrals' ? 'Most Referrals' : 
                     userSortBy === 'name' ? 'Name (A-Z)' : 
                     userSortBy === 'newest' ? 'Newest First' :
                     userSortBy === 'oldest' ? 'Oldest First' :
                     userSortBy === 'last_active' ? 'Recently Active' : '';

    const csvContent = [
      `User Productivity Report - ${getFilterLabel()}${filterInfo}`,
      `Sorted by: ${sortInfo}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      `Total Users: ${filteredOnboarders.length}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `user-productivity-${productivityFilter}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredOnboarders.length} users to CSV`);
  };

  const exportToPDF = () => {
    if (filteredOnboarders.length === 0) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('User Productivity Report', pageWidth / 2, 20, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${getFilterLabel()}`, pageWidth / 2, 30, { align: 'center' });
    if (userSearchQuery) {
      doc.text(`Filter: "${userSearchQuery}"`, pageWidth / 2, 38, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 46, { align: 'center' });
    } else {
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 38, { align: 'center' });
    }
    
    // Summary stats
    const summaryY = userSearchQuery ? 60 : 52;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, summaryY);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const totalOnboarded = filteredOnboarders.reduce((sum, o) => sum + o.referral_count, 0);
    doc.text(`Total Users Onboarded: ${totalOnboarded}`, 20, summaryY + 10);
    doc.text(`Users in Report: ${filteredOnboarders.length}`, 20, summaryY + 18);
    
    // Leaderboard table
    const tableStartY = summaryY + 35;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('User List', 20, tableStartY);
    
    // Table header
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Rank', 20, tableStartY + 10);
    doc.text('Name', 35, tableStartY + 10);
    doc.text('Roles', 95, tableStartY + 10);
    doc.text('Referrals', 145, tableStartY + 10);
    doc.text('Last Active', 170, tableStartY + 10);
    
    // Table line
    doc.setDrawColor(200);
    doc.line(20, tableStartY + 13, 190, tableStartY + 13);
    
    // Table rows (limit to prevent overflow)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const maxRows = Math.min(filteredOnboarders.length, 25);
    filteredOnboarders.slice(0, maxRows).forEach((onboarder, index) => {
      const y = tableStartY + 20 + (index * 8);
      const medal = index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}`;
      doc.text(medal, 20, y);
      doc.text(onboarder.full_name.substring(0, 25), 35, y);
      doc.text((onboarder.roles?.slice(0, 2).join(', ') || 'No role').substring(0, 20), 95, y);
      doc.text(String(onboarder.referral_count), 145, y);
      doc.text(onboarder.updated_at ? format(new Date(onboarder.updated_at), 'MMM d') : 'N/A', 170, y);
    });
    
    if (filteredOnboarders.length > maxRows) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`... and ${filteredOnboarders.length - maxRows} more users`, 20, tableStartY + 20 + (maxRows * 8) + 5);
    }
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text('Welile Platform - User Productivity Report', pageWidth / 2, 280, { align: 'center' });
    
    doc.save(`user-productivity-${productivityFilter}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success(`Exported ${filteredOnboarders.length} users to PDF`);
  };

  // Access code gate - show BEFORE loading check
  if (!accessVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Manager Access</h2>
              <p className="text-muted-foreground">
                Enter the manager access code to view the dashboard
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Enter access code"
                  value={accessCodeInput}
                  onChange={(e) => {
                    setAccessCodeInput(e.target.value);
                    setAccessError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAccessCodeSubmit();
                    }
                  }}
                  className={accessError ? 'border-destructive' : ''}
                />
                {accessError && (
                  <p className="text-sm text-destructive">Invalid access code. Please try again.</p>
                )}
              </div>
              
              <Button 
                onClick={handleAccessCodeSubmit} 
                className="w-full"
                size="lg"
              >
                Access Dashboard
              </Button>
              
              <Button 
                variant="ghost" 
                className="w-full"
                onClick={() => onRoleChange(availableRoles.find(r => r !== 'manager') || 'tenant')}
              >
                Switch to Another Role
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only show skeleton if loading AND online AND no cached data
  if (loading && isOnline && !hasCachedData) {
    return <ManagerDashboardSkeleton />;
  }

  const scrollToProductivity = () => {
    const element = document.getElementById('productivity-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const menuItems = [
    { icon: Award, label: 'Productivity', onClick: scrollToProductivity },
    { icon: FileText, label: 'Rent Requests', onClick: () => navigate('/manager-access') },
    { icon: Banknote, label: 'Loan Applications', onClick: () => navigate('/manager-access?tab=loans') },
    { icon: ShoppingCart, label: 'Product Orders', onClick: () => navigate('/manager-access?tab=orders') },
    { icon: Users, label: 'User Management', onClick: () => navigate('/manager-access?tab=users'), separator: true },
    { icon: Receipt, label: 'Receipt Management', onClick: () => navigate('/manager-access?tab=receipts') },
    { icon: ChartBar, label: 'Financial Overview', onClick: () => navigate('/manager-access?tab=financials') },
    { icon: Wallet, label: 'Investment Accounts', onClick: () => navigate('/manager-access?tab=investments') },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts'), separator: true },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
  ];

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <main className="px-3 py-3 space-y-3 animate-fade-in">
        {/* Opportunity Summary Form - Full page when open */}
        {showOpportunitySummary ? (
          <OpportunitySummaryForm onBack={() => setShowOpportunitySummary(false)} />
        ) : (
        <>
        {/* Role Switcher - Prominent placement for multi-role users */}
        {availableRoles.length > 1 && (
          <RoleSwitcher
            currentRole={currentRole}
            availableRoles={availableRoles}
            onRoleChange={onRoleChange}
            variant="prominent"
          />
        )}

        {/* 🔥 Prominent Opportunity Summary Button */}
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowOpportunitySummary(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground p-5 shadow-xl shadow-primary/25 touch-manipulation text-left relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-white/20">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-lg">Post Opportunity Summary</p>
                <p className="text-xs opacity-80">Update rent totals for all supporters</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 opacity-70" />
          </div>
        </motion.button>

        {/* Mobile Quick Actions Grid - Shows on all screens but optimized for mobile */}
        <div className="block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Quick Actions
            </h2>
            <ChromecastButton />
          </div>
          <MobileQuickActions
            pendingRequests={pendingRequests}
            pendingLoans={pendingLoans}
            pendingOrders={pendingOrders}
            totalUsers={totalUsers}
          />
        </div>

        {/* Withdrawal Requests - Priority Section for Manager (Collapsible) */}
        <CollapsibleAgentSection
          icon={Wallet}
          label="Wallet Withdrawals"
          iconColor="text-warning"
        >
          <WithdrawalRequestsManager />
        </CollapsibleAgentSection>

        {/* Pending Invites Widget - Quick view of unactivated users (Collapsible) */}
        <CollapsibleAgentSection
          icon={UserCheck}
          label="Pending Activations"
          iconColor="text-warning"
        >
          <PendingInvitesWidget minimal />
        </CollapsibleAgentSection>

        {/* Pending Investment Requests - Quick view of supporter requests */}
        <PendingInvestmentRequestsWidget />

        {/* Paid Agents History */}
        <CollapsibleAgentSection
          icon={CheckCircle}
          label="Paid Agents"
          iconColor="text-success"
        >
          <PaidAgentsHistory />
        </CollapsibleAgentSection>

        {/* Force Refresh Manager - Push updates to users */}
        <ForceRefreshManager />

        {/* Stats Summary - Larger cards for mobile */}
        <div className="grid grid-cols-2 gap-3">
          <Card 
            className="border-2 border-success/30 bg-gradient-to-br from-success/10 to-background touch-manipulation cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => navigate('/users?filter=active')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-success/20 relative">
                  <UserCheck className="h-6 w-6 text-success" />
                  {activeOnlineUsers.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-success">{activeOnlineUsers.length}</p>
                  <p className="text-xs text-muted-foreground font-medium">Online Now</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-background touch-manipulation">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/20">
                  <CalendarPlus className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{newSignupsThisWeek}</p>
                  <p className="text-xs text-muted-foreground font-medium">This week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Duplicate Phone Numbers Alert */}
        {duplicateCount > 0 && (
          <Card 
            className="border-2 border-destructive/40 bg-gradient-to-br from-destructive/10 to-background touch-manipulation cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => setDuplicatePhoneSheetOpen(true)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-destructive/20">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-destructive">{duplicateCount}</p>
                  <p className="text-xs text-muted-foreground font-medium">Duplicate Phone Numbers</p>
                </div>
                <Badge variant="destructive" className="shrink-0">
                  Action Needed
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Users with the same phone number detected. Tap to view and resolve.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Duplicate Phone Users Sheet */}
        <DuplicatePhoneUsersSheet
          open={duplicatePhoneSheetOpen}
          onOpenChange={setDuplicatePhoneSheetOpen}
          duplicateGroups={duplicateGroups}
          onUserClick={(userId) => {
            setDuplicatePhoneSheetOpen(false);
            const user = topOnboarders.find(u => u.id === userId);
            if (user) {
              setSelectedUser({
                ...user,
                avatar_url: user.avatar_url,
                rent_discount_active: false,
                monthly_rent: null,
                roles: user.roles || [],
                average_rating: null,
                rating_count: 0,
              });
            }
          }}
        />
        <ActiveUsersCard 
          activeUsers={activeOnlineUsers}
          totalUsers={totalUsers}
          onUserClick={(userId) => {
            const user = topOnboarders.find(u => u.id === userId);
            if (user) {
              setSelectedUser({
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                avatar_url: user.avatar_url,
                roles: user.roles || [],
                rent_discount_active: false,
                monthly_rent: null,
                average_rating: null,
                rating_count: 0,
              });
            }
          }}
        />

        {/* Manager Productivity - Top Onboarders Menu */}
        <Card id="productivity-section" className="border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-background overflow-hidden shadow-lg scroll-mt-20">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-amber-500/20 ring-2 ring-amber-500/30">
                    <Award className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">User Productivity</h3>
                      <Badge className="bg-amber-500 text-white">
                        <Crown className="h-3 w-3 mr-1" />
                        Leaderboard
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">All users and their onboarding performance</p>
                  </div>
                </div>
              </div>
              
              {/* Date Filter */}
              <Tabs value={productivityFilter} onValueChange={(v) => setProductivityFilter(v as 'week' | 'month' | 'all' | 'custom')} className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-9">
                  <TabsTrigger value="week" className="text-xs gap-1">
                    This Week
                  </TabsTrigger>
                  <TabsTrigger value="month" className="text-xs gap-1">
                    This Month
                  </TabsTrigger>
                  <TabsTrigger value="all" className="text-xs gap-1">
                    All Time
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="text-xs gap-1">
                    Custom
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Custom Date Range Picker */}
              {productivityFilter === 'custom' && (
                <div className="mt-3 p-3 rounded-xl bg-muted/50 border border-border">
                  <p className="text-xs font-medium mb-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Select Date Range
                  </p>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">From</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={customDateRange.start ? format(customDateRange.start, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setCustomDateRange(prev => ({ 
                          ...prev, 
                          start: e.target.value ? new Date(e.target.value) : null 
                        }))}
                        max={customDateRange.end ? format(customDateRange.end, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">To</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={customDateRange.end ? format(customDateRange.end, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setCustomDateRange(prev => ({ 
                          ...prev, 
                          end: e.target.value ? new Date(e.target.value) : null 
                        }))}
                        min={customDateRange.start ? format(customDateRange.start, 'yyyy-MM-dd') : undefined}
                        max={format(new Date(), 'yyyy-MM-dd')}
                      />
                    </div>
                  </div>
                  {customDateRange.start && customDateRange.end && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Showing data from {format(customDateRange.start, 'MMM d, yyyy')} to {format(customDateRange.end, 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Monthly Target Section */}
            <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Monthly Target</span>
                </div>
                {!isEditingTarget ? (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => setIsEditingTarget(true)}
                  >
                    <Edit3 className="h-3 w-3 mr-1" />
                    {monthlyTarget ? 'Edit' : 'Set'}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      placeholder="Enter target"
                      className="h-6 w-20 text-xs px-2"
                      min={1}
                    />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 text-success"
                      onClick={handleSaveTarget}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => {
                        setIsEditingTarget(false);
                        setTargetInput(monthlyTarget ? String(monthlyTarget) : '');
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              
              {monthlyTarget ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg font-bold">{monthlyProgress} / {monthlyTarget}</span>
                    <span className={`text-xs font-medium ${
                      monthlyProgress >= monthlyTarget 
                        ? 'text-success' 
                        : monthlyProgress >= monthlyTarget * 0.75 
                        ? 'text-amber-500' 
                        : 'text-muted-foreground'
                    }`}>
                      {Math.round((monthlyProgress / monthlyTarget) * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={Math.min((monthlyProgress / monthlyTarget) * 100, 100)} 
                    className="h-2"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {monthlyProgress >= monthlyTarget 
                      ? '🎉 Target achieved!' 
                      : `${monthlyTarget - monthlyProgress} more to go for ${format(new Date(), 'MMMM')}`
                    }
                  </p>
                  
                  {/* History Toggle */}
                  <button
                    onClick={toggleTargetHistory}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-2"
                  >
                    <History className="h-3 w-3" />
                    View History
                    {showTargetHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Set a monthly onboarding target to track progress
                </p>
              )}

              {/* Target History */}
              {showTargetHistory && (
                <div className="mt-3 pt-3 border-t border-primary/20 space-y-2">
                  <p className="text-xs font-medium text-primary flex items-center gap-1">
                    <History className="h-3 w-3" />
                    Performance History
                  </p>
                  {targetHistory.length > 0 ? (
                    <div className="space-y-2">
                      {targetHistory.map((item, idx) => (
                        <div 
                          key={idx} 
                          className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                            item.achieved 
                              ? 'bg-success/10 border border-success/20' 
                              : 'bg-muted/50 border border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={item.achieved ? 'text-success' : ''}>
                              {item.achieved ? '✅' : '📊'}
                            </span>
                            <span className="font-medium">{item.month}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className={`font-bold ${item.achieved ? 'text-success' : ''}`}>
                                {item.actual}
                              </span>
                              <span className="text-muted-foreground"> / {item.target}</span>
                            </div>
                            <Badge 
                              variant={item.achieved ? "default" : "secondary"}
                              className={`text-[10px] px-1.5 py-0 ${item.achieved ? 'bg-success' : ''}`}
                            >
                              {Math.round((item.actual / item.target) * 100)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No historical data yet
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {topOnboarders.length > 0 ? (
              <>
                {/* Onboarding Trend Chart */}
                {trendData.length > 0 && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Onboarding Trend
                    </p>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="onboardingGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="rgb(245 158 11)" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="rgb(245 158 11)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            allowDecimals={false}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="count" 
                            stroke="rgb(245 158 11)" 
                            strokeWidth={2}
                            fill="url(#onboardingGradient)" 
                            name="Users Onboarded"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Total Onboarded</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">{topOnboarders.reduce((sum, o) => sum + o.referral_count, 0)}</p>
                      {periodComparison && productivityFilter !== 'all' && (
                        <div className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          periodComparison.percentChange > 0 
                            ? 'bg-success/20 text-success' 
                            : periodComparison.percentChange < 0 
                            ? 'bg-destructive/20 text-destructive' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {periodComparison.percentChange > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : periodComparison.percentChange < 0 ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {periodComparison.percentChange > 0 ? '+' : ''}{periodComparison.percentChange}%
                        </div>
                      )}
                    </div>
                    {periodComparison && productivityFilter !== 'all' && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        vs {periodComparison.previousTotal} last {productivityFilter}
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className="h-4 w-4 text-success" />
                      <span className="text-xs font-medium text-success">Active Recruiters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">{topOnboarders.length}</p>
                      {periodComparison && productivityFilter !== 'all' && (
                        <div className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          periodComparison.recruitersChange > 0 
                            ? 'bg-success/20 text-success' 
                            : periodComparison.recruitersChange < 0 
                            ? 'bg-destructive/20 text-destructive' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {periodComparison.recruitersChange > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : periodComparison.recruitersChange < 0 ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {periodComparison.recruitersChange > 0 ? '+' : ''}{periodComparison.recruitersChange}%
                        </div>
                      )}
                    </div>
                    {periodComparison && productivityFilter !== 'all' && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        vs {periodComparison.previousRecruiters} last {productivityFilter}
                      </p>
                    )}
                  </div>
                </div>

                {/* Search and Sort Controls */}
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users by name..."
                      value={userSearchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                    {userSearchQuery && (
                      <button
                        onClick={() => handleSearchChange('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Select 
                    value={activityFilter} 
                    onValueChange={(v) => {
                      setActivityFilter(v as typeof activityFilter);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[110px] h-9 text-xs">
                      <SelectValue placeholder="Activity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Activity</SelectItem>
                      <SelectItem value="today">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Active Today
                        </span>
                      </SelectItem>
                      <SelectItem value="week">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          This Week
                        </span>
                      </SelectItem>
                      <SelectItem value="inactive">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={userSortBy} onValueChange={(v) => handleSortChange(v as typeof userSortBy)}>
                    <SelectTrigger className="w-[130px] h-9 text-xs">
                      <ArrowUpDown className="h-3 w-3 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="referrals">Most Referrals</SelectItem>
                      <SelectItem value="last_active">Recently Active</SelectItem>
                      <SelectItem value="name">Name (A-Z)</SelectItem>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Activity Statistics */}
                <div className="flex items-center gap-1 mb-3">
                  <button
                    onClick={() => { setActivityFilter(activityFilter === 'today' ? 'all' : 'today'); setCurrentPage(1); }}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      activityFilter === 'today' 
                        ? 'bg-green-500/20 text-green-700 dark:text-green-300 ring-1 ring-green-500/30' 
                        : 'bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    <span className="font-medium">{topOnboarders.filter(u => getActivityStatus(u.updated_at) === 'today').length}</span>
                    <span className={activityFilter === 'today' ? '' : 'text-muted-foreground'}>today</span>
                  </button>
                  <button
                    onClick={() => { setActivityFilter(activityFilter === 'week' ? 'all' : 'week'); setCurrentPage(1); }}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      activityFilter === 'week' 
                        ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 ring-1 ring-yellow-500/30' 
                        : 'bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                    <span className="font-medium">{topOnboarders.filter(u => getActivityStatus(u.updated_at) === 'week').length}</span>
                    <span className={activityFilter === 'week' ? '' : 'text-muted-foreground'}>this week</span>
                  </button>
                  <button
                    onClick={() => { setActivityFilter(activityFilter === 'inactive' ? 'all' : 'inactive'); setCurrentPage(1); }}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      activityFilter === 'inactive' 
                        ? 'bg-gray-500/20 text-gray-700 dark:text-gray-300 ring-1 ring-gray-500/30' 
                        : 'bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                    <span className="font-medium">{topOnboarders.filter(u => getActivityStatus(u.updated_at) === 'inactive').length}</span>
                    <span className={activityFilter === 'inactive' ? '' : 'text-muted-foreground'}>inactive</span>
                  </button>
                  {activityFilter !== 'all' && (
                    <button
                      onClick={() => { setActivityFilter('all'); setCurrentPage(1); }}
                      className="text-xs text-muted-foreground hover:text-foreground ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* User Performance List Header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {userSearchQuery || activityFilter !== 'all'
                      ? `${filteredOnboarders.length} of ${topOnboarders.length} users`
                      : `All Users (${topOnboarders.length})`
                    }
                  </p>
                  {filteredOnboarders.length > 0 && (
                    <button 
                      onClick={toggleSelectAll}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Checkbox 
                        checked={selectedUserIds.size === filteredOnboarders.length && filteredOnboarders.length > 0}
                        className="h-3 w-3"
                      />
                      {selectedUserIds.size === filteredOnboarders.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {/* Bulk Actions Bar */}
                {selectedUserIds.size > 0 && (
                  <div className="mb-3 p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {selectedUserIds.size} user{selectedUserIds.size > 1 ? 's' : ''} selected
                    </span>
                    <div className="flex items-center gap-2">
                      {/* Bulk Assign Role */}
                      <AlertDialog open={bulkRoleDialogOpen} onOpenChange={setBulkRoleDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <UserPlus className="h-3 w-3" />
                            Assign Role
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Assign Role to {selectedUserIds.size} Users</AlertDialogTitle>
                            <AlertDialogDescription>
                              Select a role to assign to all selected users. Existing roles will be kept.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="py-4">
                            <Select value={selectedBulkRole} onValueChange={(v) => setSelectedBulkRole(v as AppRole)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tenant">Tenant</SelectItem>
                                <SelectItem value="agent">Agent</SelectItem>
                                <SelectItem value="landlord">Landlord</SelectItem>
                                <SelectItem value="supporter">Supporter</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleBulkAssignRole}
                              disabled={bulkActionLoading || !selectedBulkRole}
                            >
                              {bulkActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                              Assign Role
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      {/* Bulk Email */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          const selectedUsers = filteredOnboarders.filter(u => selectedUserIds.has(u.id));
                          const emails = selectedUsers.map(u => u.email).filter(Boolean);
                          if (emails.length === 0) {
                            toast.error('No email addresses found for selected users');
                            return;
                          }
                          window.location.href = `mailto:${emails.join(',')}?subject=Hello from Welile`;
                          toast.success(`Opening email for ${emails.length} users`);
                        }}
                      >
                        <Mail className="h-3 w-3" />
                        Email
                      </Button>

                      {/* Bulk WhatsApp */}
                      <AlertDialog open={whatsAppDialogOpen} onOpenChange={setWhatsAppDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
                            onClick={() => {
                              const selectedUsers = filteredOnboarders.filter(u => selectedUserIds.has(u.id));
                              const phones = selectedUsers.map(u => u.phone).filter(Boolean);
                              if (phones.length === 0) {
                                toast.error('No phone numbers found for selected users');
                                return;
                              }
                              setWhatsAppDialogOpen(true);
                            }}
                          >
                            <MessageCircle className="h-3 w-3" />
                            WhatsApp
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <MessageCircle className="h-5 w-5 text-green-600" />
                              Send WhatsApp Message
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {(() => {
                                const selectedUsers = filteredOnboarders.filter(u => selectedUserIds.has(u.id));
                                const phones = selectedUsers.map(u => u.phone).filter(Boolean);
                                return phones.length === 1 
                                  ? 'Customize your message before opening WhatsApp.'
                                  : `Send to ${phones.length} users. Messages will open in separate tabs.`;
                              })()}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="py-4 space-y-3">
                            {/* Saved Templates */}
                            {savedTemplates.length > 0 && (
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Saved Templates</label>
                                <div className="flex flex-wrap gap-2">
                                  {savedTemplates.map((template) => (
                                    <div key={template.id} className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => setWhatsAppMessage(template.message)}
                                      >
                                        {template.name}
                                      </Button>
                                      <button
                                        onClick={() => {
                                          const updated = savedTemplates.filter(t => t.id !== template.id);
                                          setSavedTemplates(updated);
                                          localStorage.setItem('whatsapp-templates', JSON.stringify(updated));
                                          toast.success('Template deleted');
                                        }}
                                        className="text-muted-foreground hover:text-destructive p-1"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Message</label>
                              <Textarea
                                value={whatsAppMessage}
                                onChange={(e) => setWhatsAppMessage(e.target.value)}
                                placeholder="Enter your message..."
                                className="min-h-[100px]"
                                maxLength={1000}
                              />
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  {whatsAppMessage.length}/1000 characters
                                </p>
                                {!showSaveTemplate ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs gap-1"
                                    onClick={() => setShowSaveTemplate(true)}
                                  >
                                    <BookmarkPlus className="h-3 w-3" />
                                    Save as template
                                  </Button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={newTemplateName}
                                      onChange={(e) => setNewTemplateName(e.target.value)}
                                      placeholder="Template name..."
                                      className="h-6 text-xs w-32"
                                      maxLength={20}
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-xs gap-1"
                                      onClick={() => {
                                        if (!newTemplateName.trim()) {
                                          toast.error('Please enter a template name');
                                          return;
                                        }
                                        const newTemplate = {
                                          id: Date.now().toString(),
                                          name: newTemplateName.trim(),
                                          message: whatsAppMessage
                                        };
                                        const updated = [...savedTemplates, newTemplate];
                                        setSavedTemplates(updated);
                                        localStorage.setItem('whatsapp-templates', JSON.stringify(updated));
                                        setNewTemplateName('');
                                        setShowSaveTemplate(false);
                                        toast.success('Template saved!');
                                      }}
                                    >
                                      <Save className="h-3 w-3" />
                                    </Button>
                                    <button
                                      onClick={() => {
                                        setShowSaveTemplate(false);
                                        setNewTemplateName('');
                                      }}
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                const selectedUsers = filteredOnboarders.filter(u => selectedUserIds.has(u.id));
                                const usersWithPhones = selectedUsers.filter(u => u.phone);
                                const encodedMessage = encodeURIComponent(whatsAppMessage);
                                
                                if (usersWithPhones.length === 1) {
                                  const phone = usersWithPhones[0].phone.replace(/\D/g, '');
                                  window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
                                  toast.success('Opening WhatsApp...');
                                } else {
                                  // Open first 5 in new tabs, copy rest
                                  const maxTabs = 5;
                                  usersWithPhones.slice(0, maxTabs).forEach((user, index) => {
                                    const phone = user.phone.replace(/\D/g, '');
                                    setTimeout(() => {
                                      window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
                                    }, index * 500);
                                  });
                                  
                                  if (usersWithPhones.length > maxTabs) {
                                    const remaining = usersWithPhones.slice(maxTabs).map(u => u.phone).join('\n');
                                    navigator.clipboard.writeText(remaining);
                                    toast.success(`Opened ${maxTabs} chats. ${usersWithPhones.length - maxTabs} more numbers copied to clipboard.`);
                                  } else {
                                    toast.success(`Opening ${usersWithPhones.length} WhatsApp chats...`);
                                  }
                                }
                              }}
                            >
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Send Messages
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      {/* Bulk Remove Role */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs gap-1"
                        onClick={() => setBulkRemoveRoleDialogOpen(true)}
                      >
                        <UserMinus className="h-3 w-3" />
                        Remove Role
                      </Button>

                      {/* Bulk Delete */}
                      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="h-7 text-xs gap-1">
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {selectedUserIds.size} Users</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {selectedUserIds.size} users? This will remove their profiles, roles, and wallets. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={handleBulkDelete}
                              disabled={bulkActionLoading}
                            >
                              {bulkActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                              Delete All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => setSelectedUserIds(new Set())}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {paginatedOnboarders.length > 0 ? paginatedOnboarders.map((onboarder, index) => {
                    const globalIndex = (currentPage - 1) * usersPerPage + index;
                    return (
                    <div 
                      key={onboarder.id}
                      className={`flex items-center gap-2 p-3 rounded-xl transition-all ${
                        selectedUserIds.has(onboarder.id) 
                          ? 'bg-primary/10 border-2 border-primary/40' 
                          : globalIndex === 0 
                          ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/10 border-2 border-amber-500/40 shadow-md' 
                          : globalIndex === 1 
                          ? 'bg-muted/60 border border-border' 
                          : globalIndex === 2 
                          ? 'bg-orange-500/10 border border-orange-500/20' 
                          : 'border border-transparent hover:bg-muted/30'
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <Checkbox
                        checked={selectedUserIds.has(onboarder.id)}
                        onCheckedChange={() => toggleUserSelection(onboarder.id)}
                        className="shrink-0"
                      />
                      
                      <button 
                        onClick={() => handleSelectOnboarder(onboarder.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 shadow-sm"
                          style={{
                            backgroundColor: globalIndex === 0 ? 'rgb(245 158 11)' : globalIndex === 1 ? 'rgb(156 163 175)' : globalIndex === 2 ? 'rgb(180 83 9)' : 'transparent',
                            color: globalIndex < 3 ? 'white' : 'inherit',
                            border: globalIndex >= 3 ? '2px solid hsl(var(--border))' : 'none'
                          }}
                        >
                          {globalIndex === 0 ? '🥇' : globalIndex === 1 ? '🥈' : globalIndex === 2 ? '🥉' : globalIndex + 1}
                        </div>
                        <div className="relative">
                          <UserAvatar 
                            avatarUrl={onboarder.avatar_url} 
                            fullName={onboarder.full_name} 
                            size="sm" 
                          />
                          {onboarder.updated_at && (() => {
                            const lastActive = new Date(onboarder.updated_at);
                            const isActiveToday = isToday(lastActive);
                            const isActiveThisWeek = isThisWeek(lastActive, { weekStartsOn: 1 });
                            return (
                              <span 
                                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                                  isActiveToday 
                                    ? 'bg-green-500' 
                                    : isActiveThisWeek 
                                      ? 'bg-yellow-500' 
                                      : 'bg-gray-400'
                                }`}
                                title={isActiveToday ? 'Active today' : isActiveThisWeek ? 'Active this week' : 'Inactive'}
                              />
                            );
                          })()}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`font-medium truncate ${index === 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>
                            {onboarder.full_name}
                          </p>
                          <div className="flex items-center gap-1 flex-wrap">
                            {onboarder.roles && onboarder.roles.length > 0 ? (
                              onboarder.roles.slice(0, 2).map((role) => (
                                <Badge 
                                  key={role} 
                                  variant="outline" 
                                  className="text-[9px] px-1 py-0 capitalize"
                                >
                                  {role}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No role</span>
                            )}
                            {onboarder.roles && onboarder.roles.length > 2 && (
                              <span className="text-[9px] text-muted-foreground">+{onboarder.roles.length - 2}</span>
                            )}
                          </div>
                          {onboarder.updated_at && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {formatDistanceToNow(new Date(onboarder.updated_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                        <Badge 
                          variant={index === 0 ? "default" : "secondary"}
                          className={`text-sm px-3 py-1 ${index === 0 ? "bg-amber-500 text-white shadow-md" : ""}`}
                        >
                          {onboarder.referral_count} users
                        </Badge>
                      </button>
                      
                      {/* Quick Delete Button */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {deletingUserId === onboarder.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete <strong>{onboarder.full_name}</strong>? This will remove their profile, roles, and wallet. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleQuickDeleteUser(onboarder.id, onboarder.full_name)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  );
                  }) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No users found matching "{userSearchQuery}"</p>
                    </div>
                  )}
                </div>

                {/* Pagination Controls */}
                {filteredOnboarders.length > 0 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Showing {(currentPage - 1) * usersPerPage + 1}-{Math.min(currentPage * usersPerPage, filteredOnboarders.length)} of {filteredOnboarders.length}
                      </p>
                      <Select 
                        value={usersPerPage.toString()} 
                        onValueChange={(v) => {
                          setUsersPerPage(Number(v));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="h-7 w-[70px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                              const page = parseInt(e.target.value);
                              if (page >= 1 && page <= totalPages) {
                                setCurrentPage(page);
                              }
                            }}
                            className="h-7 w-12 text-xs text-center p-1"
                          />
                          <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Export Buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-amber-500/20">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-2"
                    onClick={exportToCSV}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-2"
                    onClick={exportToPDF}
                  >
                    <FileDown className="h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No referrals yet</p>
                <p className="text-sm">Users who onboard others will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Profile Card - Clickable */}
        <button 
          onClick={() => navigate('/settings')}
          className="w-full wa-list-item rounded-xl border border-border/50 shadow-sm hover:bg-muted/50 active:scale-[0.99] transition-all"
        >
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
          <div className="flex-1 min-w-0 text-left">
            <h2 className="font-semibold text-base truncate">
              {profile?.full_name || 'Manager'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Platform Administrator
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* Wallet Card */}
        <WalletCard />

        {/* Platform Overview - Clickable */}
        <button 
          onClick={() => navigate('/manager-access')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-success/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/20 ring-2 ring-primary/30">
                    <ChartBar className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">Platform Overview</h3>
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Tap to manage platform</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="text-xs font-medium text-success">Facilitated</span>
                  </div>
                  <p className="text-lg font-bold">{formatUGX(totalFacilitated)}</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Users</span>
                  </div>
                  <p className="text-lg font-bold">{totalUsers}</p>
                </div>
              </div>

              {/* Pending Items */}
              <div className="flex flex-wrap gap-2">
                {pendingRequests > 0 && (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1">
                    <Clock className="h-3 w-3" />
                    {pendingRequests} Rent Requests
                  </Badge>
                )}
                {pendingLoans > 0 && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                    <Banknote className="h-3 w-3" />
                    {pendingLoans} Loan Apps
                  </Badge>
                )}
                {pendingOrders > 0 && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
                    <Package className="h-3 w-3" />
                    {pendingOrders} Orders
                  </Badge>
                )}
                {pendingRequests === 0 && pendingLoans === 0 && pendingOrders === 0 && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    All caught up!
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Prominent Financial Dashboard Button */}
        <button 
          onClick={() => navigate('/manager-access?tab=financials')}
          className="w-full p-5 rounded-2xl bg-gradient-to-r from-chart-1 to-chart-2 text-white hover:opacity-90 active:scale-[0.99] transition-all shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20">
                <ChartBar className="h-7 w-7" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg">Financial Dashboard</p>
                <p className="text-sm opacity-90">View all financial metrics & reports</p>
              </div>
            </div>
            <ArrowRight className="h-6 w-6" />
          </div>
        </button>

        {/* Prominent Create Receipts Button */}
        <button 
          onClick={() => navigate('/manager-access?tab=receipts')}
          className="w-full p-5 rounded-2xl bg-gradient-to-r from-success to-success/80 text-success-foreground hover:opacity-90 active:scale-[0.99] transition-all shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20">
                <Receipt className="h-7 w-7" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg">Create Receipt Codes</p>
                <p className="text-sm opacity-90">Generate & share with vendors</p>
              </div>
            </div>
            <ArrowRight className="h-6 w-6" />
          </div>
        </button>

        {/* Create User Invite Button */}
        <Button 
          onClick={() => setCreateUserInviteOpen(true)}
          className="w-full h-auto p-5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 shadow-lg"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20">
                <UserPlus className="h-7 w-7" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg">Sign Up New User</p>
                <p className="text-sm opacity-90">Create tenant, agent, or supporter</p>
              </div>
            </div>
            <ArrowRight className="h-6 w-6" />
          </div>
        </Button>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-4 gap-3">
          <button 
            onClick={() => navigate('/manager-access?tab=financials')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-chart-1/10 w-fit mb-2">
              <ChartBar className="h-5 w-5 text-chart-1" />
            </div>
            <p className="font-semibold text-sm">Finances</p>
            <p className="text-xs text-muted-foreground">Reports</p>
          </button>
          
          <button 
            onClick={() => navigate('/manager-access?tab=users')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="font-semibold text-sm">Users</p>
            <p className="text-xs text-muted-foreground">{totalUsers}</p>
          </button>
          
          <button 
            onClick={() => navigate('/manager-access?tab=loans')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-warning/10 w-fit mb-2">
              <Banknote className="h-5 w-5 text-warning" />
            </div>
            <p className="font-semibold text-sm">Loans</p>
            <p className="text-xs text-muted-foreground">{pendingLoans} pending</p>
          </button>
          
          <button 
            onClick={() => navigate('/referrals')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-chart-5/10 w-fit mb-2">
              <Award className="h-5 w-5 text-chart-5" />
            </div>
            <p className="font-semibold text-sm">Rewards</p>
            <p className="text-xs text-muted-foreground">Leaderboard</p>
          </button>
        </div>

        {/* Supporter Invites List */}
        <SupporterInvitesList />

        {/* Food Receipt Promo */}
        <FoodReceiptPromoCard userId={user.id} />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />
        </>
        )}
      </main>

      {/* Floating Deposits Widget */}
      <FloatingDepositsWidget />
      
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
      
      {/* Floating Action Button */}
      <FloatingActionButton 
        actions={[
          {
            icon: ChartBar,
            label: 'Financial Dashboard',
            onClick: () => navigate('/manager-access?tab=financials'),
          },
          {
            icon: FileText,
            label: 'Rent Requests',
            onClick: () => navigate('/manager-access?tab=rent-requests'),
          },
          {
            icon: Banknote,
            label: 'Loan Applications',
            onClick: () => navigate('/manager-access?tab=loans'),
          },
          {
            icon: ShoppingCart,
            label: 'Orders',
            onClick: () => navigate('/manager-access?tab=orders'),
          },
          {
            icon: Users,
            label: 'Users',
            onClick: () => navigate('/manager-access?tab=users'),
          },
          {
            icon: Receipt,
            label: 'Receipts',
            onClick: () => navigate('/manager-access?tab=receipts'),
          },
        ]}
      />
      
      <CreateUserInviteDialog 
        open={createUserInviteOpen} 
        onOpenChange={setCreateUserInviteOpen} 
      />
      
      <UserDetailsDialog
        user={selectedUser}
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        onRolesUpdated={() => fetchData()}
      />

      <BulkRemoveRoleDialog
        open={bulkRemoveRoleDialogOpen}
        onOpenChange={setBulkRemoveRoleDialogOpen}
        selectedUserIds={Array.from(selectedUserIds)}
        onSuccess={() => {
          setSelectedUserIds(new Set());
          fetchData();
        }}
      />

      {/* Mobile Quick Actions Menu - Always visible for easy navigation */}
      <MobileManagerMenu onScrollToProductivity={scrollToProductivity} />
    </div>
  );
}
