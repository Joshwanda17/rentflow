import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
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
  ArrowUpDown
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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, subMonths, eachDayOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek, startOfMonth } from 'date-fns';
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
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';
import BulkRemoveRoleDialog from '@/components/manager/BulkRemoveRoleDialog';
import { UserMinus } from 'lucide-react';

interface ManagerDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function ManagerDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
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
    avatar_url: string | null;
    referral_count: number;
    roles?: string[];
    created_at?: string;
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
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortBy, setUserSortBy] = useState<'name' | 'referrals' | 'newest' | 'oldest'>('referrals');

  // Filter and sort users
  const filteredOnboarders = topOnboarders
    .filter(user => user.full_name.toLowerCase().includes(userSearchQuery.toLowerCase()))
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
        default:
          return 0;
      }
    });

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

  useEffect(() => {
    fetchData();
    fetchMonthlyTarget();
  }, []);

  useEffect(() => {
    if (productivityFilter !== 'custom' || (customDateRange.start && customDateRange.end)) {
      fetchProductivityData();
    }
  }, [productivityFilter, customDateRange]);

  const getFilterDate = (filter: 'week' | 'month' | 'all' | 'custom') => {
    const now = new Date();
    if (filter === 'week') {
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    } else if (filter === 'month') {
      now.setMonth(now.getMonth() - 1);
      return now.toISOString();
    } else if (filter === 'custom' && customDateRange.start) {
      return customDateRange.start.toISOString();
    }
    return null;
  };

  const getFilterEndDate = (filter: 'week' | 'month' | 'all' | 'custom') => {
    if (filter === 'custom' && customDateRange.end) {
      // Set to end of day
      const endOfDay = new Date(customDateRange.end);
      endOfDay.setHours(23, 59, 59, 999);
      return endOfDay.toISOString();
    }
    return null;
  };

  const getPreviousPeriodDates = (filter: 'week' | 'month' | 'all' | 'custom') => {
    const now = new Date();
    if (filter === 'week') {
      const prevEnd = new Date(now);
      prevEnd.setDate(prevEnd.getDate() - 7);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 7);
      return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
    } else if (filter === 'month') {
      const prevEnd = new Date(now);
      prevEnd.setMonth(prevEnd.getMonth() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setMonth(prevStart.getMonth() - 1);
      return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
    } else if (filter === 'custom' && customDateRange.start && customDateRange.end) {
      const duration = customDateRange.end.getTime() - customDateRange.start.getTime();
      const prevEnd = new Date(customDateRange.start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
    }
    return null;
  };

  const fetchProductivityData = async () => {
    const filterDate = getFilterDate(productivityFilter);
    const filterEndDate = getFilterEndDate(productivityFilter);
    const previousPeriod = getPreviousPeriodDates(productivityFilter);
    
    // Query referrals with optional date filter
    let query = supabase
      .from('referrals')
      .select('referrer_id, created_at');
    
    if (filterDate) {
      query = query.gte('created_at', filterDate);
    }
    if (filterEndDate) {
      query = query.lte('created_at', filterEndDate);
    }
    
    const { data: referralsData } = await query;

    // Fetch previous period data for comparison
    let previousReferralsData: { referrer_id: string }[] = [];
    if (previousPeriod) {
      const { data } = await supabase
        .from('referrals')
        .select('referrer_id')
        .gte('created_at', previousPeriod.start)
        .lt('created_at', previousPeriod.end);
      previousReferralsData = data || [];
    }
    
    // Count referrals per user
    const referralCounts: Record<string, number> = {};
    (referralsData || []).forEach(r => {
      referralCounts[r.referrer_id] = (referralCounts[r.referrer_id] || 0) + 1;
    });
    
    // Get all unique referrer IDs (users who have referred others)
    const referrerIds = Object.keys(referralCounts);
    
    // Fetch profiles for all referrers
    let profiles: { id: string; full_name: string; avatar_url: string | null; created_at: string }[] = [];
    if (referrerIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, created_at')
        .in('id', referrerIds);
      profiles = data || [];
    }
    
    // Also fetch all user roles to show their role badges
    const { data: userRolesData } = await supabase
      .from('user_roles')
      .select('user_id, role');
    
    const userRolesMap: Record<string, string[]> = {};
    (userRolesData || []).forEach(r => {
      if (!userRolesMap[r.user_id]) userRolesMap[r.user_id] = [];
      userRolesMap[r.user_id].push(r.role);
    });
    
    // Build performance list (all users who have referred, sorted by count)
    const onboarders = referrerIds.map(id => {
      const profile = profiles.find(p => p.id === id);
      return {
        id,
        full_name: profile?.full_name || 'Unknown',
        avatar_url: profile?.avatar_url || null,
        referral_count: referralCounts[id] || 0,
        roles: userRolesMap[id] || [],
        created_at: profile?.created_at || ''
      };
    }).sort((a, b) => b.referral_count - a.referral_count);
    
    setTopOnboarders(onboarders);
    
    // Calculate comparison data
    const currentTotal = onboarders.reduce((sum, o) => sum + o.referral_count, 0);
    const activeRecruiters = onboarders.filter(o => o.referral_count > 0).length;
    
    if (previousPeriod && previousReferralsData.length > 0) {
      const prevRecruiters = new Set(previousReferralsData.map(r => r.referrer_id)).size;
      const prevTotal = previousReferralsData.length;
      setPeriodComparison({
        currentTotal,
        previousTotal: prevTotal,
        percentChange: prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100) : (currentTotal > 0 ? 100 : 0),
        currentRecruiters: activeRecruiters,
        previousRecruiters: prevRecruiters,
        recruitersChange: prevRecruiters > 0 ? Math.round(((activeRecruiters - prevRecruiters) / prevRecruiters) * 100) : (activeRecruiters > 0 ? 100 : 0)
      });
    } else if (currentTotal > 0) {
      setPeriodComparison({
        currentTotal,
        previousTotal: 0,
        percentChange: 100,
        currentRecruiters: activeRecruiters,
        previousRecruiters: 0,
        recruitersChange: 100
      });
    } else {
      setPeriodComparison(null);
    }

    // Build trend data based on filter
    const now = new Date();
    let trendPoints: { date: string; count: number }[] = [];

    if (productivityFilter === 'week') {
      // Daily data for the past 7 days
      const days = eachDayOfInterval({ start: subDays(now, 6), end: now });
      trendPoints = days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const count = referralsData.filter(r => 
          format(new Date(r.created_at), 'yyyy-MM-dd') === dayStr
        ).length;
        return { date: format(day, 'EEE'), count };
      });
    } else if (productivityFilter === 'month') {
      // Weekly data for the past month
      const weeks = eachWeekOfInterval({ start: subMonths(now, 1), end: now }, { weekStartsOn: 1 });
      trendPoints = weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const count = referralsData.filter(r => {
          const refDate = new Date(r.created_at);
          return refDate >= weekStart && refDate <= weekEnd;
        }).length;
        return { date: format(weekStart, 'MMM d'), count };
      });
    } else {
      // Monthly data for all time (last 6 months)
      const months: { date: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStr = format(monthDate, 'yyyy-MM');
        const count = referralsData.filter(r => 
          format(new Date(r.created_at), 'yyyy-MM') === monthStr
        ).length;
        months.push({ date: format(monthDate, 'MMM'), count });
      }
      trendPoints = months;
    }

    setTrendData(trendPoints);

    // Calculate period comparison
    if (productivityFilter !== 'all' && previousPeriod) {
      const currentTotal = referralsData.length;
      const previousTotal = previousReferralsData.length;
      const currentRecruiters = Object.keys(referralCounts).length;
      const prevRecruiters = new Set(previousReferralsData.map(r => r.referrer_id)).size;

      const percentChange = previousTotal === 0 
        ? (currentTotal > 0 ? 100 : 0)
        : Math.round(((currentTotal - previousTotal) / previousTotal) * 100);
      
      const recruitersChange = prevRecruiters === 0 
        ? (currentRecruiters > 0 ? 100 : 0)
        : Math.round(((currentRecruiters - prevRecruiters) / prevRecruiters) * 100);

      setPeriodComparison({
        currentTotal,
        previousTotal,
        percentChange,
        currentRecruiters,
        previousRecruiters: prevRecruiters,
        recruitersChange
      });
    } else {
      setPeriodComparison(null);
    }
  };

  const fetchMonthlyTarget = async () => {
    const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    
    // Fetch target for current month
    const { data: targetData } = await supabase
      .from('onboarding_targets')
      .select('target_count')
      .eq('target_month', currentMonth)
      .single();
    
    if (targetData) {
      setMonthlyTarget(targetData.target_count);
      setTargetInput(String(targetData.target_count));
    }
    
    // Fetch this month's referrals count for progress
    const monthStart = startOfMonth(new Date()).toISOString();
    const { count } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart);
    
    setMonthlyProgress(count || 0);
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
    setLoading(true);
    
    // Calculate date for one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();
    
    const [requestsRes, usersRes, ordersRes, loansRes, newUsersRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, status, rent_amount'),
      supabase
        .from('profiles')
        .select('id, rent_discount_active, created_at'),
      supabase
        .from('product_orders')
        .select('id, status'),
      supabase
        .from('loan_applications')
        .select('id, status'),
      supabase
        .from('profiles')
        .select('id')
        .gte('created_at', oneWeekAgoISO)
    ]);
    
    const requests = requestsRes.data || [];
    const users = usersRes.data || [];
    
    setPendingRequests(requests.filter(r => r.status === 'pending').length);
    setTotalFacilitated(
      requests
        .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.rent_amount), 0)
    );
    setTotalUsers(users.length);
    setActiveUsers(users.filter(u => u.rent_discount_active).length);
    setNewSignupsThisWeek(newUsersRes.data?.length || 0);
    setPendingOrders((ordersRes.data || []).filter(o => ['pending', 'processing'].includes(o.status)).length);
    setPendingLoans((loansRes.data || []).filter(l => l.status === 'pending').length);
    
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
    if (topOnboarders.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Rank', 'Name', 'Users Onboarded'];
    const rows = topOnboarders.map((o, i) => [
      i + 1,
      o.full_name,
      o.referral_count
    ]);

    const csvContent = [
      `Manager Productivity Report - ${getFilterLabel()}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `productivity-report-${productivityFilter}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  const exportToPDF = () => {
    if (topOnboarders.length === 0) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Manager Productivity Report', pageWidth / 2, 20, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${getFilterLabel()}`, pageWidth / 2, 30, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 38, { align: 'center' });
    
    // Summary stats
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, 55);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const totalOnboarded = topOnboarders.reduce((sum, o) => sum + o.referral_count, 0);
    doc.text(`Total Users Onboarded: ${totalOnboarded}`, 20, 65);
    doc.text(`Active Recruiters: ${topOnboarders.length}`, 20, 73);
    
    // Leaderboard table
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Leaderboard', 20, 90);
    
    // Table header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Rank', 20, 100);
    doc.text('Name', 50, 100);
    doc.text('Users Onboarded', 140, 100);
    
    // Table line
    doc.setDrawColor(200);
    doc.line(20, 103, 190, 103);
    
    // Table rows
    doc.setFont('helvetica', 'normal');
    topOnboarders.forEach((onboarder, index) => {
      const y = 112 + (index * 10);
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
      doc.text(medal, 20, y);
      doc.text(onboarder.full_name, 50, y);
      doc.text(String(onboarder.referral_count), 140, y);
    });
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text('Welile Platform - Manager Productivity Report', pageWidth / 2, 280, { align: 'center' });
    
    doc.save(`productivity-report-${productivityFilter}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported successfully');
  };

  if (loading) {
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

      <main className="px-4 py-4 space-y-4 animate-fade-in">
        {/* PROMINENT User Management Card - First item */}
        <button 
          onClick={() => navigate('/manager-access?tab=users')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-background hover:shadow-xl active:scale-[0.99] transition-all cursor-pointer overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <CardContent className="p-5 relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-2xl bg-primary text-primary-foreground shadow-lg">
                    <Users className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-xl">User Management</h3>
                      <Badge className="bg-primary text-primary-foreground">
                        {totalUsers}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">View, search & manage all users</p>
                  </div>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <ArrowRight className="h-6 w-6 text-primary" />
                </div>
              </div>
              
              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-success/10 border border-success/20">
                  <div className="p-2 rounded-lg bg-success/20">
                    <UserCheck className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-success">{activeUsers}</p>
                    <p className="text-xs text-muted-foreground">Active users</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-chart-5/10 border border-chart-5/20">
                  <div className="p-2 rounded-lg bg-chart-5/20">
                    <CalendarPlus className="h-4 w-4 text-chart-5" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-chart-5">{newSignupsThisWeek}</p>
                    <p className="text-xs text-muted-foreground">New this week</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

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
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                    {userSearchQuery && (
                      <button
                        onClick={() => setUserSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Select value={userSortBy} onValueChange={(v) => setUserSortBy(v as typeof userSortBy)}>
                    <SelectTrigger className="w-[130px] h-9 text-xs">
                      <ArrowUpDown className="h-3 w-3 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="referrals">Most Referrals</SelectItem>
                      <SelectItem value="name">Name (A-Z)</SelectItem>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* User Performance List Header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {userSearchQuery 
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

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredOnboarders.length > 0 ? filteredOnboarders.map((onboarder, index) => (
                    <div 
                      key={onboarder.id}
                      className={`flex items-center gap-2 p-3 rounded-xl transition-all ${
                        selectedUserIds.has(onboarder.id) 
                          ? 'bg-primary/10 border-2 border-primary/40' 
                          : index === 0 
                          ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/10 border-2 border-amber-500/40 shadow-md' 
                          : index === 1 
                          ? 'bg-muted/60 border border-border' 
                          : index === 2 
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
                            backgroundColor: index === 0 ? 'rgb(245 158 11)' : index === 1 ? 'rgb(156 163 175)' : index === 2 ? 'rgb(180 83 9)' : 'transparent',
                            color: index < 3 ? 'white' : 'inherit',
                            border: index >= 3 ? '2px solid hsl(var(--border))' : 'none'
                          }}
                        >
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </div>
                        <UserAvatar 
                          avatarUrl={onboarder.avatar_url} 
                          fullName={onboarder.full_name} 
                          size="sm" 
                        />
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
                  )) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No users found matching "{userSearchQuery}"</p>
                    </div>
                  )}
                </div>

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
        <div className="grid grid-cols-3 gap-3">
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
      </main>

      {/* Floating Deposits Widget */}
      <FloatingDepositsWidget />
      
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
      
      {/* Floating Action Button */}
      <FloatingActionButton 
        actions={[
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
    </div>
  );
}
