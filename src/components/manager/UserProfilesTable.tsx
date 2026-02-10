import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Search, Star, Banknote, CheckCircle, ChevronRight, Filter, UserCheck, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, Download, FileText, Bell, Square, CheckSquare, UserCog, UserMinus, MoreHorizontal, MessageCircle, Phone, MapPin, Globe, XCircle, Loader2, AlertTriangle, BadgeCheck, ChevronLeft } from 'lucide-react';
import { QuickRoleEditor } from './QuickRoleEditor';
import { formatUGX } from '@/lib/rentCalculations';
import WhatsAppPhoneLink, { WhatsAppVerificationBadge } from '@/components/WhatsAppPhoneLink';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import UserDetailsDialog from './UserDetailsDialog';
import BulkNotificationDialog from './BulkNotificationDialog';
import BulkAssignRoleDialog from './BulkAssignRoleDialog';
import BulkRemoveRoleDialog from './BulkRemoveRoleDialog';
import BulkWhatsAppDialog from './BulkWhatsAppDialog';
import { QuickUserActions } from './QuickUserActions';
import { ManagerTip } from './ManagerTip';
import { CreateUserInviteDialog } from './CreateUserInviteDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { PullToRefresh } from '@/components/PullToRefresh';
import { exportToCSV, exportToPDF, formatDateForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { hapticTap } from '@/lib/haptics';
import { useDuplicatePhoneUsers } from '@/hooks/useDuplicatePhoneUsers';

interface UserWithRating {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  rent_discount_active: boolean;
  monthly_rent: number | null;
  roles: string[];
  roleEnabledStatus: Record<string, boolean>;
  average_rating: number | null;
  rating_count: number;
  created_at: string;
  country: string | null;
  city: string | null;
  country_code: string | null;
  verified: boolean;
  whatsapp_verified: boolean;
}

type RoleFilter = 'all' | 'tenant' | 'agent' | 'supporter' | 'landlord' | 'manager';
type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'rating_high' | 'rating_low';
type VerificationFilter = 'all' | 'verified' | 'pending';

const PAGE_SIZE = 25;

export default function UserProfilesTable() {
  const [users, setUsers] = useState<UserWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRating | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkNotificationOpen, setBulkNotificationOpen] = useState(false);
  const [bulkAssignRoleOpen, setBulkAssignRoleOpen] = useState(false);
  const [bulkRemoveRoleOpen, setBulkRemoveRoleOpen] = useState(false);
  const [bulkWhatsAppOpen, setBulkWhatsAppOpen] = useState(false);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [createUserInviteOpen, setCreateUserInviteOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const selectedUsersRef = useRef<HTMLDivElement>(null);

  // Server-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Counts for filter badges (fetched once, refreshed on data change)
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({ all: 0, tenant: 0, agent: 0, supporter: 0, landlord: 0, manager: 0 });
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [unverifiedCount, setUnverifiedCount] = useState(0);

  const { duplicateUserIds, duplicateCount, refetch: refetchDuplicates } = useDuplicatePhoneUsers();

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, verificationFilter, sortBy]);

  // Fetch counts for badges (lightweight, runs once + on refresh)
  const fetchCounts = useCallback(async () => {
    const [
      { count: totalAll },
      { count: totalVerified },
      { count: totalUnverified },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('verified', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('verified', false),
    ]);

    // Role counts from user_roles
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role');

    const counts: Record<string, number> = { all: totalAll || 0, tenant: 0, agent: 0, supporter: 0, landlord: 0, manager: 0 };
    (roleData || []).forEach(r => {
      if (counts[r.role] !== undefined) counts[r.role]++;
    });

    setRoleCounts(counts);
    setVerifiedCount(totalVerified || 0);
    setUnverifiedCount(totalUnverified || 0);
  }, []);

  // Main data fetcher — server-side search, filter, sort, paginate
  const fetchUsers = useCallback(async () => {
    setLoading(true);

    // 1. Build the profile query with filters
    let query = supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at, country, city, country_code, verified, whatsapp_verified', { count: 'exact' });

    // Search filter — search by name, email or phone
    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);
    }

    // Verification filter
    if (verificationFilter === 'verified') {
      query = query.eq('verified', true);
    } else if (verificationFilter === 'pending') {
      query = query.eq('verified', false);
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'name_asc':
        query = query.order('full_name', { ascending: true });
        break;
      case 'name_desc':
        query = query.order('full_name', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Pagination
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data: profiles, error, count } = await query;

    if (error) {
      console.error('Error fetching profiles:', error);
      setLoading(false);
      return;
    }

    const totalResults = count || 0;
    setTotalCount(totalResults);
    setTotalPages(Math.ceil(totalResults / PAGE_SIZE));

    if (!profiles || profiles.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    // 2. Fetch roles + ratings only for THIS page's users
    const userIds = profiles.map(p => p.id);

    const [{ data: rolesData }, { data: ratingsData }] = await Promise.all([
      supabase.from('user_roles').select('user_id, role, enabled').in('user_id', userIds),
      supabase.from('tenant_ratings').select('tenant_id, rating').in('tenant_id', userIds),
    ]);

    // If role filter is active, filter profiles to those that have the role
    let filteredProfileIds: Set<string> | null = null;
    if (roleFilter !== 'all') {
      filteredProfileIds = new Set(
        (rolesData || []).filter(r => r.role === roleFilter).map(r => r.user_id)
      );
    }

    // Calculate average ratings
    const ratingsByTenant = new Map<string, { sum: number; count: number }>();
    (ratingsData || []).forEach(r => {
      const current = ratingsByTenant.get(r.tenant_id) || { sum: 0, count: 0 };
      ratingsByTenant.set(r.tenant_id, { sum: current.sum + r.rating, count: current.count + 1 });
    });

    const usersWithRatings: UserWithRating[] = (profiles || [])
      .filter(p => !filteredProfileIds || filteredProfileIds.has(p.id))
      .map(p => {
        const userRolesData = rolesData?.filter(r => r.user_id === p.id) || [];
        const userRoles = userRolesData.map(r => r.role);
        const roleEnabledStatus: Record<string, boolean> = {};
        userRolesData.forEach(r => { roleEnabledStatus[r.role] = r.enabled; });
        const ratingInfo = ratingsByTenant.get(p.id);

        return {
          ...p,
          roles: userRoles,
          roleEnabledStatus,
          average_rating: ratingInfo ? ratingInfo.sum / ratingInfo.count : null,
          rating_count: ratingInfo?.count || 0,
          country: p.country || null,
          city: p.city || null,
          country_code: p.country_code || null,
          verified: p.verified || false,
          whatsapp_verified: p.whatsapp_verified || false,
        };
      });

    // Sort by rating client-side if needed (not in DB)
    if (sortBy === 'rating_high') {
      usersWithRatings.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
    } else if (sortBy === 'rating_low') {
      usersWithRatings.sort((a, b) => (a.average_rating || 0) - (b.average_rating || 0));
    }

    setUsers(usersWithRatings);
    setLoading(false);
  }, [debouncedSearch, roleFilter, verificationFilter, sortBy, currentPage]);

  // Initial load
  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Fetch users when query params change
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchUsers(), fetchCounts(), refetchDuplicates()]);
    setRefreshing(false);
  }, [fetchUsers, fetchCounts, refetchDuplicates]);

  const handlePullToRefresh = useCallback(async () => {
    await Promise.all([fetchUsers(), fetchCounts(), refetchDuplicates()]);
  }, [fetchUsers, fetchCounts, refetchDuplicates]);

  // Export functions use current page data only (or all filtered if needed)
  const handleExportCSV = () => {
    if (users.length === 0) {
      toast.error('No users to export');
      return;
    }
    const headers = ['Name', 'Email', 'Phone', 'Country', 'City', 'Roles', 'Rating', 'Monthly Rent', 'Discount Active', 'Joined'];
    const rows = users.map(user => [
      user.full_name, user.email, user.phone,
      user.country || 'Unknown', user.city || 'Unknown',
      user.roles.join(', '),
      user.average_rating ? user.average_rating.toFixed(1) : 'N/A',
      user.monthly_rent ? user.monthly_rent : 'N/A',
      user.rent_discount_active ? 'Yes' : 'No',
      formatDateForExport(user.created_at),
    ]);
    exportToCSV({ headers, rows }, 'users_export');
    toast.success('Users exported to CSV');
  };

  const handleExportPDF = async () => {
    if (users.length === 0) { toast.error('No users to export'); return; }
    if (!tableRef.current) { toast.error('Unable to generate PDF'); return; }
    setExporting(true);
    try {
      await exportToPDF(tableRef.current, 'users_export', 'User Management Report');
      toast.success('Users exported to PDF');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally { setExporting(false); }
  };

  const toggleUserSelection = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === users.length) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(users.map(u => u.id)));
  };

  const clearSelection = () => setSelectedUserIds(new Set());

  const handleBulkNotificationSuccess = () => clearSelection();
  const handleBulkAssignRoleSuccess = () => { clearSelection(); handleRefresh(); };
  const handleBulkRemoveRoleSuccess = () => { clearSelection(); handleRefresh(); };

  const getSelectedUsers = () => users.filter(u => selectedUserIds.has(u.id));

  const handleExportSelectedCSV = () => {
    const selected = getSelectedUsers();
    if (selected.length === 0) { toast.error('No users selected'); return; }
    const headers = ['Name', 'Email', 'Phone', 'Country', 'City', 'Roles', 'Rating', 'Monthly Rent', 'Discount Active', 'Joined'];
    const rows = selected.map(user => [
      user.full_name, user.email, user.phone,
      user.country || 'Unknown', user.city || 'Unknown',
      user.roles.join(', '),
      user.average_rating ? user.average_rating.toFixed(1) : 'N/A',
      user.monthly_rent ? user.monthly_rent : 'N/A',
      user.rent_discount_active ? 'Yes' : 'No',
      formatDateForExport(user.created_at),
    ]);
    exportToCSV({ headers, rows }, 'selected_users_export');
    toast.success(`Exported ${selected.length} users to CSV`);
  };

  const handleExportSelectedPDF = async () => {
    const selected = getSelectedUsers();
    if (selected.length === 0) { toast.error('No users selected'); return; }
    if (!selectedUsersRef.current) { toast.error('Unable to generate PDF'); return; }
    setExportingSelected(true);
    try {
      await exportToPDF(selectedUsersRef.current, 'selected_users_export', `Selected Users Report (${selected.length} users)`);
      toast.success(`Exported ${selected.length} users to PDF`);
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally { setExportingSelected(false); }
  };

  const handleApproveUser = async (userId: string, userName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingUserId(userId);
    try {
      const { error } = await supabase.from('profiles').update({ verified: true }).eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, verified: true } : u));
      toast.success(`${userName} has been approved`);
      fetchCounts(); // refresh counts
    } catch (error) {
      console.error('Error approving user:', error);
      toast.error('Failed to approve user');
    } finally { setApprovingUserId(null); }
  };

  const handleRejectUser = async (userId: string, userName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingUserId(userId);
    try {
      const { error } = await supabase.from('profiles').update({ verified: false }).eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, verified: false } : u));
      toast.success(`${userName} verification revoked`);
      fetchCounts();
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast.error('Failed to reject user');
    } finally { setApprovingUserId(null); }
  };

  const handleMarkWhatsAppVerified = async (userId: string, userName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('profiles').update({ whatsapp_verified: true, whatsapp_verified_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, whatsapp_verified: true } : u));
      toast.success(`${userName}'s WhatsApp verified`);
    } catch (error) {
      console.error('Error verifying WhatsApp:', error);
      toast.error('Failed to verify WhatsApp');
    }
  };

  const sortOptions: { value: SortOption; label: string; icon: typeof ArrowUp }[] = [
    { value: 'newest', label: 'Newest first', icon: ArrowDown },
    { value: 'oldest', label: 'Oldest first', icon: ArrowUp },
    { value: 'name_asc', label: 'Name A-Z', icon: ArrowUp },
    { value: 'name_desc', label: 'Name Z-A', icon: ArrowDown },
    { value: 'rating_high', label: 'Highest rated', icon: ArrowDown },
    { value: 'rating_low', label: 'Lowest rated', icon: ArrowUp },
  ];

  const currentSortLabel = sortOptions.find(s => s.value === sortBy)?.label || 'Sort';

  const roleColors: Record<string, { bg: string; text: string; border: string }> = {
    tenant: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    agent: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
    supporter: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
    landlord: { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30' },
    manager: { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30' },
  };

  const getRoleBadgeColor = (role: string) => {
    const colors = roleColors[role] || { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
    return `${colors.bg} ${colors.text} ${colors.border}`;
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleUserClick = (user: UserWithRating) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const roleFilters: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: roleCounts.all },
    { value: 'tenant', label: 'Tenants', count: roleCounts.tenant },
    { value: 'agent', label: 'Agents', count: roleCounts.agent },
    { value: 'supporter', label: 'Supporters', count: roleCounts.supporter },
    { value: 'landlord', label: 'Landlords', count: roleCounts.landlord },
    { value: 'manager', label: 'Managers', count: roleCounts.manager },
  ];

  // Pagination controls
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setSelectedUserIds(new Set()); // clear selection on page change
    }
  };

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  if (loading && users.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 px-1">
        <ManagerTip />

        <div className="mt-3">
          <QuickUserActions
            totalUsers={roleCounts.all}
            selectedCount={selectedUserIds.size}
            onNotifyAll={() => {
              if (selectedUserIds.size === 0) setSelectedUserIds(new Set(users.map(u => u.id)));
              setBulkNotificationOpen(true);
            }}
            onWhatsAppAll={() => {
              if (selectedUserIds.size === 0) setSelectedUserIds(new Set(users.map(u => u.id)));
              setBulkWhatsAppOpen(true);
            }}
            onExport={handleExportCSV}
            onAddUser={() => setCreateUserInviteOpen(true)}
          />
        </div>

        {/* Sticky Header Section */}
        <div className="sticky top-0 z-20 bg-background pb-3 pt-2 space-y-3">
          {/* Search Bar with instant feedback */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
            <Input
              placeholder="🔍 Search name, email or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-14 pr-14 h-16 rounded-2xl bg-muted/50 border-2 border-border/50 text-lg font-medium focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary ios-input"
              style={{ fontSize: '18px' }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full hover:bg-muted active:scale-95 touch-manipulation"
                style={{ minWidth: '48px', minHeight: '48px' }}
              >
                <X className="h-6 w-6 text-muted-foreground" />
              </button>
            )}
            {/* Loading indicator during search */}
            {loading && searchTerm && (
              <div className="absolute right-14 top-1/2 -translate-y-1/2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>

          {/* Role Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
            {roleFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  hapticTap();
                  setRoleFilter(filter.value);
                }}
                className={`shrink-0 px-5 py-3 rounded-2xl text-base font-bold transition-all active:scale-95 touch-manipulation ${
                  roleFilter === filter.value
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
                style={{ minHeight: '48px' }}
              >
                {filter.label}
                <span className={`ml-2 px-2 py-1 rounded-full text-sm ${
                  roleFilter === filter.value ? 'bg-primary-foreground/20' : 'bg-background/50'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}

            <div className="h-6 w-px bg-border shrink-0 mx-1" />

            {/* Verification Filter Pills */}
            {[
              { value: 'all' as VerificationFilter, label: 'All', count: roleCounts.all },
              { value: 'verified' as VerificationFilter, label: '✓ OK', count: verifiedCount },
              { value: 'pending' as VerificationFilter, label: '⏳ Wait', count: unverifiedCount },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  hapticTap();
                  setVerificationFilter(filter.value);
                }}
                className={`shrink-0 px-5 py-3 rounded-2xl text-base font-bold transition-all active:scale-95 touch-manipulation ${
                  verificationFilter === filter.value
                    ? filter.value === 'verified'
                      ? 'bg-success text-success-foreground shadow-lg shadow-success/25'
                      : filter.value === 'pending'
                      ? 'bg-warning text-warning-foreground shadow-lg shadow-warning/25'
                      : 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
                style={{ minHeight: '48px' }}
              >
                {filter.label}
                <span className={`ml-2 px-2 py-1 rounded-full text-sm ${
                  verificationFilter === filter.value ? 'bg-background/20' : 'bg-background/50'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          {/* Results & Sort Row */}
          <div className="flex items-center justify-between bg-muted/30 rounded-2xl px-4 py-3">
            <button
              onClick={() => { hapticTap(); toggleSelectAll(); }}
              className="flex items-center gap-3 text-base font-semibold text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
              style={{ minHeight: '44px' }}
            >
              {selectedUserIds.size === users.length && users.length > 0 ? (
                <CheckSquare className="h-6 w-6 text-primary" />
              ) : (
                <Square className="h-6 w-6" />
              )}
              <span>{selectedUserIds.size > 0 ? `${selectedUserIds.size} picked` : 'Pick all'}</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="text-base text-muted-foreground font-bold">
                {totalCount.toLocaleString()} total
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 h-11 px-4 rounded-xl font-semibold">
                    <ArrowUpDown className="h-5 w-5" />
                    <span className="hidden sm:inline">{currentSortLabel}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {sortOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setSortBy(option.value)}
                        className={`py-3 text-base ${sortBy === option.value ? 'bg-primary/10' : ''}`}
                      >
                        <Icon className="h-5 w-5 mr-3" />
                        {option.label}
                        {sortBy === option.value && <CheckCircle className="h-5 w-5 ml-auto text-primary" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Scrollable User List */}
        <PullToRefresh onRefresh={handlePullToRefresh} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-40 overscroll-contain touch-pan-y ios-momentum-scroll">
          <div ref={tableRef} className="space-y-3 pb-8">
            <AnimatePresence mode="popLayout">
              {users.length === 0 && !loading ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12"
                >
                  <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-muted-foreground">No users found</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your search or filters</p>
                </motion.div>
              ) : (
                users.map((user, index) => {
                  const isDuplicate = duplicateUserIds.has(user.id);
                  return (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: Math.min(index * 0.02, 0.15) }}
                      onClick={() => handleUserClick(user)}
                      className={`relative bg-card rounded-3xl border-2 p-5 transition-all active:scale-[0.99] cursor-pointer touch-manipulation ${
                        isDuplicate
                          ? 'border-destructive bg-destructive/5 shadow-lg shadow-destructive/10'
                          : selectedUserIds.has(user.id)
                          ? 'border-primary shadow-lg shadow-primary/10'
                          : 'border-border/50 hover:border-primary/40 hover:shadow-md'
                      }`}
                    >
                      {isDuplicate && (
                        <div className="absolute right-14 top-4 z-10">
                          <div className="p-2 rounded-full bg-destructive/20" title="Duplicate Phone Number">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          </div>
                        </div>
                      )}

                      <div
                        className="absolute left-4 top-4 z-10"
                        onClick={(e) => { e.stopPropagation(); hapticTap(); toggleUserSelection(user.id, e); }}
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <div className={`p-2.5 rounded-xl transition-colors ${selectedUserIds.has(user.id) ? 'bg-primary/20' : 'bg-muted/50'}`}>
                          <Checkbox checked={selectedUserIds.has(user.id)} className="h-6 w-6 rounded-lg" />
                        </div>
                      </div>

                      <div className="absolute right-4 top-4">
                        {user.verified ? (
                          <div className="p-2.5 rounded-full bg-success/20" title="Verified">
                            <CheckCircle className="h-5 w-5 text-success" />
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-full bg-warning/20" title="Pending">
                            <XCircle className="h-5 w-5 text-warning" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-4 pl-12">
                        <Avatar className="h-16 w-16 border-2 border-background shadow-lg shrink-0">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                            {getInitials(user.full_name)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg truncate pr-10 flex items-center gap-1.5">
                            {user.full_name}
                            {user.verified ? (
                              <BadgeCheck className="h-5 w-5 text-violet-500 fill-violet-500/20 shrink-0" />
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium shrink-0">Unverified</span>
                            )}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-base text-muted-foreground truncate font-medium">{user.phone}</p>
                            <WhatsAppVerificationBadge
                              verified={user.whatsapp_verified}
                              phone={user.phone}
                              onMarkVerified={() => handleMarkWhatsAppVerified(user.id, user.full_name, { stopPropagation: () => {} } as React.MouseEvent)}
                            />
                          </div>

                          {(user.country || user.city) && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground truncate">
                                {user.city && user.country ? `${user.city}, ${user.country}` : user.country || user.city}
                                {user.country_code && <span className="ml-1 opacity-70">({user.country_code})</span>}
                              </span>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 mt-3">
                            {user.roles.map((role) => {
                              const isEnabled = user.roleEnabledStatus[role] ?? true;
                              return (
                                <Badge
                                  key={role}
                                  variant="outline"
                                  className={`text-sm font-bold px-3 py-1 ${getRoleBadgeColor(role)} ${!isEnabled ? 'opacity-40 line-through' : ''}`}
                                  title={isEnabled ? `${role} dashboard enabled` : `${role} dashboard disabled`}
                                >
                                  {role}
                                  {!isEnabled && <span className="ml-1">🚫</span>}
                                </Badge>
                              );
                            })}
                          </div>

                          {user.rating_count > 0 && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span className="text-sm font-bold">{user.average_rating?.toFixed(1)}</span>
                              <span className="text-sm text-muted-foreground">({user.rating_count})</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-5 pt-4 border-t-2 border-border/30">
                        <div onClick={(e) => e.stopPropagation()}>
                          <QuickRoleEditor
                            userId={user.id}
                            userName={user.full_name}
                            currentRoles={user.roles}
                            roleEnabledStatus={user.roleEnabledStatus}
                            onRolesUpdated={handleRefresh}
                            compact
                          />
                        </div>

                        {!user.verified ? (
                          <Button
                            variant="outline"
                            onClick={(e) => handleApproveUser(user.id, user.full_name, e)}
                            disabled={approvingUserId === user.id}
                            className="flex-1 h-12 gap-2 bg-success/10 border-2 border-success/30 text-success hover:bg-success/20 hover:text-success font-bold text-sm rounded-xl touch-manipulation"
                          >
                            {approvingUserId === user.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                            Approve
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={(e) => handleRejectUser(user.id, user.full_name, e)}
                            disabled={approvingUserId === user.id}
                            className="flex-1 h-12 gap-2 bg-destructive/10 border-2 border-destructive/30 text-destructive hover:bg-destructive/20 hover:text-destructive font-bold text-sm rounded-xl touch-manipulation"
                          >
                            {approvingUserId === user.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
                            Revoke
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); hapticTap(); window.open(getWhatsAppLink(user.phone), '_blank'); }}
                          className="h-12 w-12 p-0 bg-success/10 border-2 border-success/30 text-success hover:bg-success/20 hover:text-success shrink-0 rounded-xl touch-manipulation"
                        >
                          <MessageCircle className="h-6 w-6" />
                        </Button>

                        <Button
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); hapticTap(); window.location.href = `tel:${user.phone}`; }}
                          className="h-12 w-12 p-0 bg-primary/10 border-2 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary shrink-0 rounded-xl touch-manipulation"
                        >
                          <Phone className="h-6 w-6" />
                        </Button>

                        <Button variant="ghost" className="h-12 w-12 rounded-xl bg-muted/50 hover:bg-muted shrink-0 touch-manipulation">
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-11 w-11 p-0 rounded-xl touch-manipulation"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                {getPageNumbers().map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => goToPage(page as number)}
                      className={`h-11 min-w-[44px] rounded-xl font-bold touch-manipulation ${
                        currentPage === page ? 'shadow-lg' : ''
                      }`}
                    >
                      {page}
                    </Button>
                  )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-11 w-11 p-0 rounded-xl touch-manipulation"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Page info */}
            {totalPages > 1 && (
              <p className="text-center text-sm text-muted-foreground pb-4">
                Page {currentPage} of {totalPages} · Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
              </p>
            )}
          </div>
        </PullToRefresh>
      </div>

      <UserDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
        onRolesUpdated={handleRefresh}
        onUserDeleted={handleRefresh}
        onUserUpdated={handleRefresh}
      />

      <BulkNotificationDialog
        open={bulkNotificationOpen}
        onOpenChange={setBulkNotificationOpen}
        selectedUserIds={Array.from(selectedUserIds)}
        onSuccess={handleBulkNotificationSuccess}
      />

      <BulkAssignRoleDialog
        open={bulkAssignRoleOpen}
        onOpenChange={setBulkAssignRoleOpen}
        selectedUserIds={Array.from(selectedUserIds)}
        onSuccess={handleBulkAssignRoleSuccess}
      />

      <BulkRemoveRoleDialog
        open={bulkRemoveRoleOpen}
        onOpenChange={setBulkRemoveRoleOpen}
        selectedUserIds={Array.from(selectedUserIds)}
        onSuccess={handleBulkRemoveRoleSuccess}
      />

      <BulkWhatsAppDialog
        open={bulkWhatsAppOpen}
        onOpenChange={setBulkWhatsAppOpen}
        selectedUsers={getSelectedUsers().map(u => ({
          id: u.id,
          full_name: u.full_name,
          phone: u.phone,
          avatar_url: u.avatar_url,
        }))}
      />

      <CreateUserInviteDialog
        open={createUserInviteOpen}
        onOpenChange={setCreateUserInviteOpen}
      />

      {selectedUserIds.size > 0 && (
        <div className="fixed -left-[9999px] top-0" aria-hidden="true">
          <div ref={selectedUsersRef} className="bg-white p-4 space-y-2 w-[600px]">
            {getSelectedUsers().map(user => (
              <div key={user.id} className="border-b border-gray-200 pb-2 mb-2">
                <div className="font-semibold">{user.full_name}</div>
                <div className="text-sm text-gray-600">{user.email} • {user.phone}</div>
                <div className="text-xs text-gray-500">
                  Roles: {user.roles.join(', ') || 'None'} |
                  Rating: {user.average_rating?.toFixed(1) || 'N/A'} |
                  Joined: {formatDateForExport(user.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Bulk Actions Bar */}
      <AnimatePresence>
        {selectedUserIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-24 left-2 right-2 z-50 bg-card border-2 border-border rounded-3xl shadow-2xl px-4 py-4 flex items-center gap-3 mx-auto max-w-lg"
          >
            <div className="flex items-center gap-3 pr-3 border-r-2 border-border">
              <span className="text-base font-bold whitespace-nowrap">{selectedUserIds.size}</span>
              <button
                onClick={clearSelection}
                className="p-2 rounded-full hover:bg-muted transition-colors touch-manipulation"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <Button variant="ghost" onClick={() => setBulkNotificationOpen(true)} className="h-12 w-12 p-0 rounded-xl touch-manipulation">
              <Bell className="h-6 w-6" />
            </Button>
            <Button variant="ghost" onClick={() => setBulkWhatsAppOpen(true)} className="h-12 w-12 p-0 rounded-xl text-success hover:text-success touch-manipulation">
              <MessageCircle className="h-6 w-6" />
            </Button>
            <Button variant="ghost" onClick={() => setBulkAssignRoleOpen(true)} className="h-12 w-12 p-0 rounded-xl touch-manipulation">
              <UserCog className="h-6 w-6" />
            </Button>
            <Button variant="ghost" onClick={() => setBulkRemoveRoleOpen(true)} className="h-12 w-12 p-0 rounded-xl text-destructive hover:text-destructive touch-manipulation">
              <UserMinus className="h-6 w-6" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-12 w-12 p-0 rounded-xl touch-manipulation">
                  <MoreHorizontal className="h-6 w-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleExportSelectedCSV} className="py-3 text-base">
                  <Download className="h-5 w-5 mr-3" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSelectedPDF} disabled={exportingSelected} className="py-3 text-base">
                  <FileText className="h-5 w-5 mr-3" />
                  {exportingSelected ? 'Exporting...' : 'Export PDF'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
