import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  Users, Search, Star, CheckCircle, X, 
  ArrowLeft, RefreshCw, MoreVertical, Loader2
} from 'lucide-react';
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';

import BulkAssignRoleDialog from '@/components/manager/BulkAssignRoleDialog';
import BulkRemoveRoleDialog from '@/components/manager/BulkRemoveRoleDialog';
import BulkWhatsAppDialog from '@/components/manager/BulkWhatsAppDialog';
import InactiveUsersReachOutDialog from '@/components/manager/InactiveUsersReachOutDialog';
import { CreateUserInviteDialog } from '@/components/manager/CreateUserInviteDialog';
import { CompactUserStats, StatFilter } from '@/components/manager/CompactUserStats';
import { exportToCSV, formatDateForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { ScrollToTopButton } from '@/components/ScrollToTopButton';

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
  subagent_count: number;
  last_active_at: string | null;
}

type RoleFilter = 'all' | 'tenant' | 'agent' | 'supporter' | 'landlord' | 'manager' | 'active' | 'inactive';
type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'rating_high' | 'rating_low' | 'last_active' | 'least_active';
type VerificationFilter = 'all' | 'verified' | 'pending';

const PAGE_SIZE = 25;

const isUserInactive = (lastActiveAt: string | null): boolean => {
  if (!lastActiveAt) return true;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return new Date(lastActiveAt) < thirtyDaysAgo;
};

const formatLastActive = (lastActiveAt: string | null): string => {
  if (!lastActiveAt) return 'Long ago';
  const date = new Date(lastActiveAt);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd/MM/yyyy');
};

const getStatusText = (user: UserWithRating): string => {
  if (user.roles.length === 0) return 'New user';
  return user.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' • ');
};

export default function UserManagement() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { onlineUsers, isOnline } = usePresence();
  const [users, setUsers] = useState<UserWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRating | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('last_active');
  const [totalUserCount, setTotalUserCount] = useState<number>(0);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkNotificationOpen, setBulkNotificationOpen] = useState(false);
  const [bulkAssignRoleOpen, setBulkAssignRoleOpen] = useState(false);
  const [bulkRemoveRoleOpen, setBulkRemoveRoleOpen] = useState(false);
  const [bulkWhatsAppOpen, setBulkWhatsAppOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [reachOutInactiveOpen, setReachOutInactiveOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);

  // Check if user is manager
  useEffect(() => {
    if (!roles.includes('manager')) {
      navigate('/dashboard');
    }
  }, [roles, navigate]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setCurrentPage(0);
    setUsers([]);
    setHasMore(true);
  }, [debouncedSearch, roleFilter, verificationFilter, sortBy, statFilter]);

  // Fetch page when currentPage or filters change
  useEffect(() => {
    fetchUsersPage(currentPage);
  }, [currentPage, debouncedSearch, roleFilter, verificationFilter, sortBy, statFilter]);

  // Fetch counts on mount
  useEffect(() => {
    fetchTotalCount();
  }, []);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMoreRef.current && !loading) {
          setCurrentPage(prev => prev + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  const fetchTotalCount = async () => {
    const roleNames = ['tenant', 'agent', 'supporter', 'landlord', 'manager'] as const;
    const [profileCount, ...roleResults] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ...roleNames.map(role =>
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', role).eq('enabled', true)
      ),
    ]);
    if (profileCount.count !== null) setTotalUserCount(profileCount.count);
    const counts: Record<string, number> = {};
    roleNames.forEach((role, i) => { counts[role] = roleResults[i].count || 0; });
    setRoleCounts(counts);
  };

  const fetchUsersPage = async (page: number) => {
    if (page === 0) setLoading(true);
    else { setLoadingMore(true); loadingMoreRef.current = true; }

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // If filtering by a specific role, get matching user IDs first
      let roleFilteredIds: string[] | null = null;
      const validRoles = ['tenant', 'agent', 'supporter', 'landlord', 'manager'] as const;
      type ValidRole = typeof validRoles[number];
      if ((validRoles as readonly string[]).includes(roleFilter)) {
        const { data: roleUserIds } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', roleFilter as ValidRole)
          .eq('enabled', true);
        roleFilteredIds = (roleUserIds || []).map(r => r.user_id);
        if (roleFilteredIds.length === 0) {
          if (page === 0) setUsers([]);
          setHasMore(false);
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
          return;
        }
      }

      let query = supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at, country, city, country_code, verified, last_active_at', { count: 'exact' });

      // Server-side search
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }

      // Server-side verification filter
      if (verificationFilter === 'verified') query = query.eq('verified', true);
      else if (verificationFilter === 'pending') query = query.eq('verified', false);

      // Server-side inactive filter
      if (statFilter === 'inactive' || roleFilter === 'inactive') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.or(`last_active_at.is.null,last_active_at.lt.${thirtyDaysAgo.toISOString()}`);
      }

      // Apply role-filtered IDs
      if (roleFilteredIds) {
        // Paginate the IDs ourselves
        const paginatedIds = roleFilteredIds.slice(from, to + 1);
        if (paginatedIds.length === 0) {
          setHasMore(false);
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
          return;
        }
        query = query.in('id', paginatedIds);
      } else {
        query = query.range(from, to);
      }

      // Server-side sorting
      switch (sortBy) {
        case 'newest': query = query.order('created_at', { ascending: false }); break;
        case 'oldest': query = query.order('created_at', { ascending: true }); break;
        case 'name_asc': query = query.order('full_name', { ascending: true }); break;
        case 'name_desc': query = query.order('full_name', { ascending: false }); break;
        case 'last_active': query = query.order('last_active_at', { ascending: false, nullsFirst: false }); break;
        case 'least_active': query = query.order('last_active_at', { ascending: true, nullsFirst: true }); break;
        default: query = query.order('last_active_at', { ascending: false, nullsFirst: false }); break;
      }

      const { data: profiles, error } = await query;

      if (error) {
        console.error('Error fetching profiles:', error);
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
        return;
      }

      const userIds = profiles?.map(p => p.id) || [];
      if (userIds.length === 0) {
        if (page === 0) setUsers([]);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
        return;
      }

      // Only fetch roles (core auth data), stub ratings/subagents to reduce DB calls
      const [rolesRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, role, enabled').in('user_id', userIds),
      ]);

      const rolesData = rolesRes.data;
      const subagentCountByAgent = new Map<string, number>();
      const ratingsByTenant = new Map<string, { sum: number; count: number }>();

      const pageUsers: UserWithRating[] = (profiles || []).map(p => {
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
          subagent_count: subagentCountByAgent.get(p.id) || 0,
          last_active_at: p.last_active_at || null,
        };
      });

      const isRoleFiltered = roleFilteredIds !== null;
      if (isRoleFiltered) {
        setHasMore(from + PAGE_SIZE < roleFilteredIds!.length);
      } else {
        setHasMore(pageUsers.length === PAGE_SIZE);
      }

      if (page === 0) setUsers(pageUsers);
      else setUsers(prev => [...prev, ...pageUsers]);
    } catch (err) {
      console.error('Error in fetchUsersPage:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    hapticTap();
    setCurrentPage(0);
    setUsers([]);
    setHasMore(true);
    await fetchTotalCount();
    await fetchUsersPage(0);
    setRefreshing(false);
    hapticSuccess();
  }, [debouncedSearch, roleFilter, verificationFilter, sortBy, statFilter]);

  // --- UI helpers (unchanged logic) ---

  const handleExportCSV = () => {
    const dataToExport = selectedUserIds.size > 0 ? getSelectedUsers() : users;
    if (dataToExport.length === 0) { toast.error('No users to export'); return; }
    const headers = ['Name', 'Email', 'Phone', 'Country', 'City', 'Roles', 'Rating', 'Verified', 'Joined'];
    const rows = dataToExport.map(u => [
      u.full_name, u.email, u.phone, u.country || 'Unknown', u.city || 'Unknown',
      u.roles.join(', '), u.average_rating ? u.average_rating.toFixed(1) : 'N/A',
      u.verified ? 'Yes' : 'No', formatDateForExport(u.created_at)
    ]);
    exportToCSV({ headers, rows }, selectedUserIds.size > 0 ? 'selected_users' : 'all_users');
    toast.success(`Exported ${dataToExport.length} users`);
  };

  const toggleUserSelection = (userId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    hapticTap();
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    hapticTap();
    if (selectedUserIds.size === users.length) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(users.map(u => u.id)));
  };

  const clearSelection = () => { hapticTap(); setSelectedUserIds(new Set()); };
  const getSelectedUsers = () => users.filter(u => selectedUserIds.has(u.id));

  // Client-side filter for presence-based filters only
  const displayUsers = (() => {
    if (roleFilter === 'active' || statFilter === 'online') return users.filter(u => isOnline(u.id));
    if (statFilter === 'verified') return users.filter(u => u.verified);
    return users;
  })();

  const handleUserClick = (user: UserWithRating) => { hapticTap(); setSelectedUser(user); setDialogOpen(true); };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'last_active', label: 'Recently Active' },
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'name_asc', label: 'Name A-Z' },
    { value: 'name_desc', label: 'Name Z-A' },
    { value: 'rating_high', label: 'Top Rated' },
    { value: 'least_active', label: 'Least Active' },
  ];

  const activeUserCount = onlineUsers?.size ?? 0;
  const inactiveUserCount = users.filter(u => isUserInactive(u.last_active_at)).length;

  const roleFilters: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: totalUserCount },
    { value: 'active', label: 'Online', count: activeUserCount },
    { value: 'tenant', label: 'Tenants', count: roleCounts['tenant'] || 0 },
    { value: 'agent', label: 'Agents', count: roleCounts['agent'] || 0 },
    { value: 'supporter', label: 'Supporters', count: roleCounts['supporter'] || 0 },
    { value: 'landlord', label: 'Landlords', count: roleCounts['landlord'] || 0 },
    { value: 'manager', label: 'Managers', count: roleCounts['manager'] || 0 },
  ];

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // --- RENDER ---

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111b21]">
        <div className="sticky top-0 z-50 bg-[#202c33] px-4 py-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24 bg-[#2a3942]" />
            <div className="flex gap-4"><Skeleton className="h-6 w-6 rounded-full bg-[#2a3942]" /></div>
          </div>
        </div>
        <div className="px-3 py-2 bg-[#111b21]"><Skeleton className="h-9 w-full rounded-lg bg-[#202c33]" /></div>
        <div className="divide-y divide-[#222d34]">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-12 w-12 rounded-full bg-[#2a3942]" />
              <div className="flex-1"><Skeleton className="h-4 w-32 mb-2 bg-[#2a3942]" /><Skeleton className="h-3 w-48 bg-[#2a3942]" /></div>
              <Skeleton className="h-3 w-12 bg-[#2a3942]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111b21] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#202c33] safe-area-top">
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8696a0]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search name, phone, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#111b21] text-white placeholder:text-[#8696a0] border border-[#3b4a54]/50 outline-none text-sm focus:border-[#00a884]/50"
              style={{ fontSize: '16px' }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-[#8696a0]" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2">
            <button onClick={() => { hapticTap(); navigate(-1); }} className="p-1 -ml-1 rounded-full hover:bg-white/10 active:scale-95 transition-all touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
              <ArrowLeft className="h-5 w-5 text-[#aebac1]" />
            </button>
            <h1 className="font-semibold text-lg text-white">
              All Users
              <span className="ml-2 text-sm font-normal text-[#8696a0]">({totalUserCount.toLocaleString()})</span>
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button onClick={() => hapticTap()} className="p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition-all touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <MoreVertical className="h-4 w-4 text-[#aebac1]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-[#233138] border-[#3b4a54] text-white">
                <DropdownMenuItem onClick={() => setAddUserOpen(true)} className="hover:bg-[#182229] focus:bg-[#182229] gap-2">
                  <Users className="h-3.5 w-3.5 text-[#00a884]" /> Add User
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkNotificationOpen(true)} className="hover:bg-[#182229] focus:bg-[#182229] gap-2">
                  Notify {selectedUserIds.size > 0 && `(${selectedUserIds.size})`}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkWhatsAppOpen(true)} className="hover:bg-[#182229] focus:bg-[#182229] gap-2">
                  WhatsApp {selectedUserIds.size > 0 && `(${selectedUserIds.size})`}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV} className="hover:bg-[#182229] focus:bg-[#182229] gap-2">Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkAssignRoleOpen(true)} disabled={selectedUserIds.size === 0} className="hover:bg-[#182229] focus:bg-[#182229] gap-2 disabled:opacity-40">Assign Role</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkRemoveRoleOpen(true)} disabled={selectedUserIds.size === 0} className="hover:bg-[#182229] focus:bg-[#182229] gap-2 disabled:opacity-40">Remove Role</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReachOutInactiveOpen(true)} className="hover:bg-[#182229] focus:bg-[#182229] gap-2">Reach Inactive</DropdownMenuItem>
                <DropdownMenuItem onClick={toggleSelectAll} className="hover:bg-[#182229] focus:bg-[#182229]">{selectedUserIds.size === users.length ? 'Deselect All' : 'Select All'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowFilters(true)} className="hover:bg-[#182229] focus:bg-[#182229]">Filters & Sort</DropdownMenuItem>
                <DropdownMenuItem onClick={handleRefresh} className="hover:bg-[#182229] focus:bg-[#182229]">
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-2", refreshing && "animate-spin")} />
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CompactUserStats
          totalUsers={totalUserCount}
          onlineCount={activeUserCount}
          verifiedCount={roleCounts['verified'] ?? 0}
          inactiveCount={inactiveUserCount}
          activeFilter={statFilter}
          onFilterChange={setStatFilter}
        />

        <div className="flex gap-1.5 px-2 pb-2 overflow-x-auto scrollbar-hide">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => { hapticTap(); setRoleFilter(filter.value); }}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 touch-manipulation min-h-[36px]",
                roleFilter === filter.value ? 'bg-[#00a884] text-white' : 'bg-[#2a3942] text-[#8696a0]'
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {filter.label}
              <span className="ml-1 opacity-80">{filter.count.toLocaleString()}</span>
            </button>
          ))}
        </div>

        {selectedUserIds.size > 0 && (
          <div className="px-2 pb-1">
            <div className="flex items-center justify-between bg-[#00a884]/20 rounded-md px-2 py-0.5">
              <span className="text-[9px] font-medium text-[#00a884]">{selectedUserIds.size} selected</span>
              <button onClick={clearSelection} className="text-[9px] text-[#00a884] font-medium">Clear</button>
            </div>
          </div>
        )}
      </header>

      {/* User List with Infinite Scroll */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain will-change-scroll"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', scrollbarColor: '#3b4a54 transparent' }}
      >
        {displayUsers.length === 0 && !loadingMore ? (
          <div className="text-center py-20 px-4">
            <div className="p-4 rounded-full bg-[#202c33] w-fit mx-auto mb-4">
              <Users className="h-12 w-12 text-[#8696a0]" />
            </div>
            <p className="font-semibold text-lg text-white">No users found</p>
            <p className="text-sm text-[#8696a0] mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="divide-y divide-[#222d34]">
            {displayUsers.map((u) => (
              <div
                key={u.id}
                onClick={() => handleUserClick(u)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 active:bg-[#182229] transition-colors cursor-pointer touch-manipulation min-h-[72px]",
                  selectedUserIds.has(u.id) && "bg-[#00a884]/10"
                )}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="relative shrink-0" onClick={(e) => toggleUserSelection(u.id, e)}>
                  {selectedUserIds.has(u.id) ? (
                    <div className="h-12 w-12 rounded-full bg-[#00a884] flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-white" />
                    </div>
                  ) : (
                    <>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={u.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#6b7b8a] text-white font-medium text-sm">{getInitials(u.full_name)}</AvatarFallback>
                      </Avatar>
                      {isOnline(u.id) && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[#00a884] border-2 border-[#111b21]" />}
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-white truncate">{u.full_name}</h3>
                    <span className={cn("text-xs shrink-0", isOnline(u.id) ? "text-[#00a884]" : "text-[#8696a0]")}>{formatLastActive(u.last_active_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-[#8696a0] truncate">{getStatusText(u)}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {u.verified && <CheckCircle className="h-4 w-4 text-[#53bdeb]" />}
                      {u.average_rating && (
                        <span className="text-xs text-[#8696a0] flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-[#ffc107] text-[#ffc107]" />
                          {u.average_rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="py-4 flex justify-center">
          {loadingMore && (
            <div className="flex items-center gap-2 text-[#8696a0] text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more...
            </div>
          )}
          {!hasMore && displayUsers.length > 0 && (
            <p className="text-xs text-[#8696a0]">Showing all {displayUsers.length.toLocaleString()} users</p>
          )}
        </div>

        <div className="h-20" />
      </div>

      {/* Filter Sheet */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl bg-[#111b21] border-[#222d34]">
          <SheetHeader className="pb-4"><SheetTitle className="text-white">Filters & Sort</SheetTitle></SheetHeader>
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-[#8696a0] mb-3">Verification Status</h4>
              <div className="flex gap-2 flex-wrap">
                {([{ value: 'all' as VerificationFilter, label: 'All' }, { value: 'verified' as VerificationFilter, label: '✓ Verified' }, { value: 'pending' as VerificationFilter, label: '⏳ Pending' }]).map((f) => (
                  <button key={f.value} onClick={() => setVerificationFilter(f.value)} className={cn("px-4 py-3 rounded-xl text-sm font-medium transition-all", verificationFilter === f.value ? 'bg-[#00a884] text-white' : 'bg-[#202c33] text-[#8696a0]')}>{f.label}</button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-[#8696a0] mb-3">Sort By</h4>
              <div className="grid grid-cols-2 gap-2">
                {sortOptions.map((o) => (
                  <button key={o.value} onClick={() => setSortBy(o.value)} className={cn("px-4 py-3 rounded-xl text-sm font-medium transition-all", sortBy === o.value ? 'bg-[#00a884] text-white' : 'bg-[#202c33] text-[#8696a0]')}>{o.label}</button>
                ))}
              </div>
            </div>
            <Button onClick={() => setShowFilters(false)} className="w-full h-14 text-base font-semibold bg-[#00a884] hover:bg-[#00a884]/90 text-white">Apply Filters</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <UserDetailsDialog open={dialogOpen} onOpenChange={setDialogOpen} user={selectedUser} onRolesUpdated={handleRefresh} onUserDeleted={handleRefresh} onUserUpdated={handleRefresh} />
      
      <BulkAssignRoleDialog open={bulkAssignRoleOpen} onOpenChange={setBulkAssignRoleOpen} selectedUserIds={Array.from(selectedUserIds)} onSuccess={() => { clearSelection(); handleRefresh(); }} />
      <BulkRemoveRoleDialog open={bulkRemoveRoleOpen} onOpenChange={setBulkRemoveRoleOpen} selectedUserIds={Array.from(selectedUserIds)} onSuccess={() => { clearSelection(); handleRefresh(); }} />
      <BulkWhatsAppDialog open={bulkWhatsAppOpen} onOpenChange={setBulkWhatsAppOpen} selectedUsers={getSelectedUsers().map(u => ({ id: u.id, full_name: u.full_name, phone: u.phone, avatar_url: u.avatar_url }))} />
      <CreateUserInviteDialog open={addUserOpen} onOpenChange={setAddUserOpen} />
      <InactiveUsersReachOutDialog open={reachOutInactiveOpen} onOpenChange={setReachOutInactiveOpen} inactiveUsers={getSelectedUsers().filter(u => isUserInactive(u.last_active_at)).map(u => ({ id: u.id, full_name: u.full_name, phone: u.phone, avatar_url: u.avatar_url, last_active_at: u.last_active_at }))} />
      <ScrollToTopButton scrollThreshold={3200} />
    </div>
  );
}
