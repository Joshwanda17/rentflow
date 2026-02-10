import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  Users, Search, Star, CheckCircle, X, 
  ArrowLeft, Filter, RefreshCw, MoreVertical
} from 'lucide-react';
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';
import BulkNotificationDialog from '@/components/manager/BulkNotificationDialog';
import BulkAssignRoleDialog from '@/components/manager/BulkAssignRoleDialog';
import BulkRemoveRoleDialog from '@/components/manager/BulkRemoveRoleDialog';
import BulkWhatsAppDialog from '@/components/manager/BulkWhatsAppDialog';
import InactiveUsersReachOutDialog from '@/components/manager/InactiveUsersReachOutDialog';
import { CreateUserInviteDialog } from '@/components/manager/CreateUserInviteDialog';
import { QuickActionsDropdown } from '@/components/manager/QuickActionsDropdown';
import { CompactUserStats, StatFilter } from '@/components/manager/CompactUserStats';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToCSV, formatDateForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

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

// Helper to check if user is inactive (no activity in last 30 days)
const isUserInactive = (lastActiveAt: string | null): boolean => {
  if (!lastActiveAt) return true;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return new Date(lastActiveAt) < thirtyDaysAgo;
};

// Format last active time like WhatsApp
const formatLastActive = (lastActiveAt: string | null): string => {
  if (!lastActiveAt) return 'Long ago';
  const date = new Date(lastActiveAt);
  if (isToday(date)) {
    return format(date, 'h:mm a');
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  return format(date, 'dd/MM/yyyy');
};

// Get status text for user
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRating | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('last_active');
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
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check if user is manager
  useEffect(() => {
    if (!roles.includes('manager')) {
      navigate('/dashboard');
    }
  }, [roles, navigate]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at, country, city, country_code, verified, last_active_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      setLoading(false);
      return;
    }

    const userIds = profiles?.map(p => p.id) || [];
    
    const [rolesRes, ratingsRes, subagentsRes] = await Promise.all([
      supabase
        .from('user_roles')
        .select('user_id, role, enabled')
        .in('user_id', userIds),
      supabase
        .from('tenant_ratings')
        .select('tenant_id, rating'),
      supabase
        .from('agent_subagents')
        .select('parent_agent_id')
    ]);

    const rolesData = rolesRes.data;
    const ratingsData = ratingsRes.data;
    
    const subagentCountByAgent = new Map<string, number>();
    (subagentsRes.data || []).forEach(s => {
      const current = subagentCountByAgent.get(s.parent_agent_id) || 0;
      subagentCountByAgent.set(s.parent_agent_id, current + 1);
    });

    const ratingsByTenant = new Map<string, { sum: number; count: number }>();
    (ratingsData || []).forEach(r => {
      const current = ratingsByTenant.get(r.tenant_id) || { sum: 0, count: 0 };
      ratingsByTenant.set(r.tenant_id, {
        sum: current.sum + r.rating,
        count: current.count + 1
      });
    });

    const usersWithRatings: UserWithRating[] = (profiles || []).map(p => {
      const userRolesData = rolesData?.filter(r => r.user_id === p.id) || [];
      const userRoles = userRolesData.map(r => r.role);
      const roleEnabledStatus: Record<string, boolean> = {};
      userRolesData.forEach(r => {
        roleEnabledStatus[r.role] = r.enabled;
      });
      const ratingInfo = ratingsByTenant.get(p.id);
      
      return {
        ...p,
        roles: userRoles,
        roleEnabledStatus,
        average_rating: ratingInfo ? ratingInfo.sum / ratingInfo.count : null,
        rating_count: ratingInfo?.count || 0,
        created_at: p.created_at,
        country: p.country || null,
        city: p.city || null,
        country_code: p.country_code || null,
        verified: p.verified || false,
        subagent_count: subagentCountByAgent.get(p.id) || 0,
        last_active_at: p.last_active_at || null
      };
    });

    setUsers(usersWithRatings);
    setLoading(false);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    hapticTap();
    await fetchUsers();
    setRefreshing(false);
    hapticSuccess();
  }, []);

  const handleExportCSV = () => {
    const dataToExport = selectedUserIds.size > 0 ? getSelectedUsers() : filteredUsers;
    if (dataToExport.length === 0) {
      toast.error('No users to export');
      return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Country', 'City', 'Roles', 'Rating', 'Verified', 'Joined'];
    const rows = dataToExport.map(user => [
      user.full_name,
      user.email,
      user.phone,
      user.country || 'Unknown',
      user.city || 'Unknown',
      user.roles.join(', '),
      user.average_rating ? user.average_rating.toFixed(1) : 'N/A',
      user.verified ? 'Yes' : 'No',
      formatDateForExport(user.created_at)
    ]);

    exportToCSV({ headers, rows }, selectedUserIds.size > 0 ? 'selected_users' : 'all_users');
    toast.success(`Exported ${dataToExport.length} users`);
  };

  const toggleUserSelection = (userId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    hapticTap();
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
    hapticTap();
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const clearSelection = () => {
    hapticTap();
    setSelectedUserIds(new Set());
  };

  const getSelectedUsers = () => {
    return filteredUsers.filter(u => selectedUserIds.has(u.id));
  };

  const sortUsers = (usersToSort: UserWithRating[]): UserWithRating[] => {
    return [...usersToSort].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc':
          return a.full_name.localeCompare(b.full_name);
        case 'name_desc':
          return b.full_name.localeCompare(a.full_name);
        case 'rating_high':
          return (b.average_rating || 0) - (a.average_rating || 0);
        case 'rating_low':
          return (a.average_rating || 0) - (b.average_rating || 0);
        case 'last_active':
          return new Date(b.last_active_at || 0).getTime() - new Date(a.last_active_at || 0).getTime();
        case 'least_active':
          return new Date(a.last_active_at || 0).getTime() - new Date(b.last_active_at || 0).getTime();
        default:
          return 0;
      }
    });
  };

  const filteredUsers = sortUsers(users.filter(u => {
    const searchLower = searchTerm.toLowerCase().trim();
    const matchesSearch = 
      u.full_name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      u.phone.includes(searchTerm) ||
      u.phone.replace(/^\+\d+/, '').includes(searchTerm);
    
    const matchesActiveFilter = roleFilter !== 'active' || isOnline(u.id);
    const matchesInactiveFilter = roleFilter !== 'inactive' || isUserInactive(u.last_active_at);
    const matchesRoleFilter = roleFilter === 'all' || roleFilter === 'active' || roleFilter === 'inactive' || u.roles.includes(roleFilter);
    
    const matchesVerification = 
      verificationFilter === 'all' || 
      (verificationFilter === 'verified' && u.verified) ||
      (verificationFilter === 'pending' && !u.verified);
    
    // Apply stat filter from compact stats
    const matchesStatFilter = 
      statFilter === 'all' ||
      (statFilter === 'online' && isOnline(u.id)) ||
      (statFilter === 'verified' && u.verified) ||
      (statFilter === 'inactive' && isUserInactive(u.last_active_at));
    
    return matchesSearch && matchesRoleFilter && matchesActiveFilter && matchesInactiveFilter && matchesVerification && matchesStatFilter;
  }));

  const handleUserClick = (user: UserWithRating) => {
    hapticTap();
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'last_active', label: 'Recently Active' },
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'name_asc', label: 'Name A-Z' },
    { value: 'name_desc', label: 'Name Z-A' },
    { value: 'rating_high', label: 'Top Rated' },
    { value: 'least_active', label: 'Least Active' },
  ];

  const activeUserCount = users.filter(u => isOnline(u.id)).length;
  const inactiveUserCount = users.filter(u => isUserInactive(u.last_active_at)).length;

  const roleFilters: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: users.length },
    { value: 'active', label: 'Online', count: activeUserCount },
    { value: 'inactive', label: 'Inactive', count: inactiveUserCount },
    { value: 'tenant', label: 'Tenants', count: users.filter(u => u.roles.includes('tenant')).length },
    { value: 'agent', label: 'Agents', count: users.filter(u => u.roles.includes('agent')).length },
    { value: 'supporter', label: 'Supporters', count: users.filter(u => u.roles.includes('supporter')).length },
    { value: 'landlord', label: 'Landlords', count: users.filter(u => u.roles.includes('landlord')).length },
    { value: 'manager', label: 'Managers', count: users.filter(u => u.roles.includes('manager')).length },
  ];

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // WhatsApp-style loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-[#111b21]">
        {/* WhatsApp Header Skeleton */}
        <div className="sticky top-0 z-50 bg-[#202c33] px-4 py-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24 bg-[#2a3942]" />
            <div className="flex gap-4">
              <Skeleton className="h-6 w-6 rounded-full bg-[#2a3942]" />
              <Skeleton className="h-6 w-6 rounded-full bg-[#2a3942]" />
            </div>
          </div>
        </div>
        {/* Search Skeleton */}
        <div className="px-3 py-2 bg-[#111b21]">
          <Skeleton className="h-9 w-full rounded-lg bg-[#202c33]" />
        </div>
        {/* List Skeleton */}
        <div className="divide-y divide-[#222d34]">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-12 w-12 rounded-full bg-[#2a3942]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2 bg-[#2a3942]" />
                <Skeleton className="h-3 w-48 bg-[#2a3942]" />
              </div>
              <Skeleton className="h-3 w-12 bg-[#2a3942]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111b21] flex flex-col">
      {/* Compact Header with Quick Actions on Right */}
      <header className="sticky top-0 z-50 bg-[#202c33] safe-area-top">
        {/* Top Row: Back, Title, Quick Actions */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                hapticTap();
                navigate(-1);
              }}
              className="p-1 -ml-1 rounded-full hover:bg-white/10 active:scale-95 transition-all touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ArrowLeft className="h-5 w-5 text-[#aebac1]" />
            </button>
            <h1 className="font-semibold text-lg text-white">All Users</h1>
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Quick Actions Dropdown - Top Right */}
            <QuickActionsDropdown
              selectedCount={selectedUserIds.size}
              onAddUser={() => setAddUserOpen(true)}
              onNotify={() => setBulkNotificationOpen(true)}
              onWhatsApp={() => setBulkWhatsAppOpen(true)}
              onExport={handleExportCSV}
              onAssignRole={() => setBulkAssignRoleOpen(true)}
              onRemoveRole={() => setBulkRemoveRoleOpen(true)}
              onReachOutInactive={() => setReachOutInactiveOpen(true)}
            />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  onClick={() => hapticTap()}
                  className="p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition-all touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <MoreVertical className="h-4 w-4 text-[#aebac1]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-[#233138] border-[#3b4a54] text-white">
                <DropdownMenuItem onClick={toggleSelectAll} className="hover:bg-[#182229] focus:bg-[#182229]">
                  {selectedUserIds.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowFilters(true)} className="hover:bg-[#182229] focus:bg-[#182229]">
                  Filters & Sort
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRefresh} className="hover:bg-[#182229] focus:bg-[#182229]">
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-2", refreshing && "animate-spin")} />
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Compact Stats Row - Clickable to filter */}
        <CompactUserStats
          totalUsers={users.length}
          onlineCount={activeUserCount}
          verifiedCount={users.filter(u => u.verified).length}
          inactiveCount={inactiveUserCount}
          activeFilter={statFilter}
          onFilterChange={setStatFilter}
        />

        {/* Search Bar - Always Visible Above "All Users" */}
        <div className="px-2 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8696a0]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search name, phone, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-[#111b21] text-white placeholder:text-[#8696a0] border border-[#3b4a54]/50 outline-none text-sm focus:border-[#00a884]/50"
              style={{ fontSize: '16px' }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5 text-[#8696a0]" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills - Compact */}
        <div className="flex gap-1 px-2 pb-1.5 overflow-x-auto scrollbar-hide">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                hapticTap();
                setRoleFilter(filter.value);
              }}
              className={cn(
                "shrink-0 px-2 py-0.5 rounded-full text-[9px] font-medium transition-all active:scale-95",
                roleFilter === filter.value
                  ? 'bg-[#00a884] text-white'
                  : 'bg-[#2a3942] text-[#8696a0]'
              )}
            >
              {filter.label}
              <span className="ml-0.5 opacity-80">{filter.count}</span>
            </button>
          ))}
        </div>

        {/* Selection indicator - Compact */}
        {selectedUserIds.size > 0 && (
          <div className="px-2 pb-1">
            <div className="flex items-center justify-between bg-[#00a884]/20 rounded-md px-2 py-0.5">
              <span className="text-[9px] font-medium text-[#00a884]">
                {selectedUserIds.size} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-[9px] text-[#00a884] font-medium"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </header>

      {/* User List - WhatsApp Chat Style */}
      <div 
        ref={listRef}
        className="flex-1 overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {filteredUsers.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="p-4 rounded-full bg-[#202c33] w-fit mx-auto mb-4">
              <Users className="h-12 w-12 text-[#8696a0]" />
            </div>
            <p className="font-semibold text-lg text-white">No users found</p>
            <p className="text-sm text-[#8696a0] mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="divide-y divide-[#222d34]">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => handleUserClick(user)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 active:bg-[#182229] transition-colors cursor-pointer",
                  selectedUserIds.has(user.id) && "bg-[#00a884]/10"
                )}
              >
                {/* Avatar with Online Indicator */}
                <div 
                  className="relative shrink-0"
                  onClick={(e) => toggleUserSelection(user.id, e)}
                >
                  {selectedUserIds.has(user.id) ? (
                    <div className="h-12 w-12 rounded-full bg-[#00a884] flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-white" />
                    </div>
                  ) : (
                    <>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#6b7b8a] text-white font-medium text-sm">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline(user.id) && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[#00a884] border-2 border-[#111b21]" />
                      )}
                    </>
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-white truncate">{user.full_name}</h3>
                    <span className={cn(
                      "text-xs shrink-0",
                      isOnline(user.id) ? "text-[#00a884]" : "text-[#8696a0]"
                    )}>
                      {formatLastActive(user.last_active_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-[#8696a0] truncate">
                      {getStatusText(user)}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {user.verified && (
                        <CheckCircle className="h-4 w-4 text-[#53bdeb]" />
                      )}
                      {user.average_rating && (
                        <span className="text-xs text-[#8696a0] flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-[#ffc107] text-[#ffc107]" />
                          {user.average_rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Bottom padding */}
        <div className="h-20" />
      </div>

      {/* Filter Sheet - WhatsApp Style */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl bg-[#111b21] border-[#222d34]">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-white">Filters & Sort</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-6">
            {/* Verification Filter */}
            <div>
              <h4 className="text-sm font-medium text-[#8696a0] mb-3">Verification Status</h4>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'all' as VerificationFilter, label: 'All' },
                  { value: 'verified' as VerificationFilter, label: '✓ Verified' },
                  { value: 'pending' as VerificationFilter, label: '⏳ Pending' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setVerificationFilter(filter.value)}
                    className={cn(
                      "px-4 py-3 rounded-xl text-sm font-medium transition-all",
                      verificationFilter === filter.value
                        ? 'bg-[#00a884] text-white'
                        : 'bg-[#202c33] text-[#8696a0]'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Sort Options */}
            <div>
              <h4 className="text-sm font-medium text-[#8696a0] mb-3">Sort By</h4>
              <div className="grid grid-cols-2 gap-2">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSortBy(option.value)}
                    className={cn(
                      "px-4 py-3 rounded-xl text-sm font-medium transition-all",
                      sortBy === option.value
                        ? 'bg-[#00a884] text-white'
                        : 'bg-[#202c33] text-[#8696a0]'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            
            <Button 
              onClick={() => setShowFilters(false)} 
              className="w-full h-14 text-base font-semibold bg-[#00a884] hover:bg-[#00a884]/90 text-white"
            >
              Apply Filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
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
        onSuccess={() => {
          clearSelection();
        }}
      />

      <BulkAssignRoleDialog
        open={bulkAssignRoleOpen}
        onOpenChange={setBulkAssignRoleOpen}
        selectedUserIds={Array.from(selectedUserIds)}
        onSuccess={() => {
          clearSelection();
          fetchUsers();
        }}
      />

      <BulkRemoveRoleDialog
        open={bulkRemoveRoleOpen}
        onOpenChange={setBulkRemoveRoleOpen}
        selectedUserIds={Array.from(selectedUserIds)}
        onSuccess={() => {
          clearSelection();
          fetchUsers();
        }}
      />

      <BulkWhatsAppDialog
        open={bulkWhatsAppOpen}
        onOpenChange={setBulkWhatsAppOpen}
        selectedUsers={getSelectedUsers().map(u => ({
          id: u.id,
          full_name: u.full_name,
          phone: u.phone,
          avatar_url: u.avatar_url
        }))}
      />

      <CreateUserInviteDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
      />

      <InactiveUsersReachOutDialog
        open={reachOutInactiveOpen}
        onOpenChange={setReachOutInactiveOpen}
        inactiveUsers={getSelectedUsers()
          .filter(u => isUserInactive(u.last_active_at))
          .map(u => ({
            id: u.id,
            full_name: u.full_name,
            phone: u.phone,
            avatar_url: u.avatar_url,
            last_active_at: u.last_active_at
          }))}
      />
    </div>
  );
}
