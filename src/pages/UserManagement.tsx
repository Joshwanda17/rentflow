import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Users, Search, Star, CheckCircle, ChevronRight, X, ArrowUpDown, ArrowUp, ArrowDown, 
  Download, Bell, Square, CheckSquare, UserCog, UserMinus, MoreHorizontal, MessageCircle, 
  Phone, MapPin, XCircle, Loader2, ArrowLeft, Filter, RefreshCw, FileText, UsersRound, UserPlus, Wifi, Clock
} from 'lucide-react';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';
import BulkNotificationDialog from '@/components/manager/BulkNotificationDialog';
import BulkAssignRoleDialog from '@/components/manager/BulkAssignRoleDialog';
import BulkRemoveRoleDialog from '@/components/manager/BulkRemoveRoleDialog';
import BulkWhatsAppDialog from '@/components/manager/BulkWhatsAppDialog';
import InactiveUsersReachOutDialog from '@/components/manager/InactiveUsersReachOutDialog';
import { CreateUserInviteDialog } from '@/components/manager/CreateUserInviteDialog';
import { FloatingUserActions } from '@/components/manager/FloatingUserActions';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToCSV, formatDateForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { usePresence } from '@/hooks/usePresence';
import OnlineIndicator from '@/components/chat/OnlineIndicator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

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

// Helper to get days since last activity
const getDaysSinceActive = (lastActiveAt: string | null): number => {
  if (!lastActiveAt) return 999;
  const now = new Date();
  const lastActive = new Date(lastActiveAt);
  return Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
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
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkNotificationOpen, setBulkNotificationOpen] = useState(false);
  const [bulkAssignRoleOpen, setBulkAssignRoleOpen] = useState(false);
  const [bulkRemoveRoleOpen, setBulkRemoveRoleOpen] = useState(false);
  const [bulkWhatsAppOpen, setBulkWhatsAppOpen] = useState(false);
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [reachOutInactiveOpen, setReachOutInactiveOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
    
    // Count subagents per parent agent
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
    
    return matchesSearch && matchesRoleFilter && matchesActiveFilter && matchesInactiveFilter && matchesVerification;
  }));

  const handleUserClick = (user: UserWithRating) => {
    hapticTap();
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const sortOptions: { value: SortOption; label: string; icon: typeof ArrowUp }[] = [
    { value: 'newest', label: 'Newest', icon: ArrowDown },
    { value: 'oldest', label: 'Oldest', icon: ArrowUp },
    { value: 'name_asc', label: 'A-Z', icon: ArrowUp },
    { value: 'name_desc', label: 'Z-A', icon: ArrowDown },
    { value: 'rating_high', label: 'Top Rated', icon: ArrowDown },
    { value: 'rating_low', label: 'Low Rated', icon: ArrowUp },
    { value: 'last_active', label: 'Recently Active', icon: ArrowDown },
    { value: 'least_active', label: 'Least Active', icon: ArrowUp },
  ];

  const activeUserCount = users.filter(u => isOnline(u.id)).length;
  const inactiveUserCount = users.filter(u => isUserInactive(u.last_active_at)).length;

  const roleFilters: { value: RoleFilter; label: string; count: number; icon?: typeof Wifi }[] = [
    { value: 'all', label: 'All', count: users.length },
    { value: 'active', label: '🟢 Active', count: activeUserCount, icon: Wifi },
    { value: 'inactive', label: '😴 Inactive', count: inactiveUserCount },
    { value: 'tenant', label: 'Tenants', count: users.filter(u => u.roles.includes('tenant')).length },
    { value: 'agent', label: 'Agents', count: users.filter(u => u.roles.includes('agent')).length },
    { value: 'supporter', label: 'Supporters', count: users.filter(u => u.roles.includes('supporter')).length },
    { value: 'landlord', label: 'Landlords', count: users.filter(u => u.roles.includes('landlord')).length },
    { value: 'manager', label: 'Managers', count: users.filter(u => u.roles.includes('manager')).length },
  ];

  const roleColors: Record<string, string> = {
    tenant: 'text-blue-600 dark:text-blue-400',
    agent: 'text-amber-600 dark:text-amber-400',
    supporter: 'text-emerald-600 dark:text-emerald-400',
    landlord: 'text-purple-600 dark:text-purple-400',
    manager: 'text-rose-600 dark:text-rose-400',
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="px-4 py-3">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-9 w-20 rounded-full shrink-0" />
          ))}
        </div>
        <div className="px-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="h-14 w-full mb-1" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Compact Sticky Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border safe-area-top">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                hapticTap();
                navigate(-1);
              }}
              className="p-2 -ml-1 rounded-full hover:bg-muted active:scale-95 transition-all touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-bold text-base">Users</h1>
              <p className="text-[10px] text-muted-foreground">{filteredUsers.length} of {users.length}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSelectAll}
              className="p-2 rounded-full hover:bg-muted active:scale-95 transition-all touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0 ? (
                <CheckSquare className="h-5 w-5 text-primary" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  onClick={() => hapticTap()}
                  className="p-2 rounded-full hover:bg-muted active:scale-95 transition-all touch-manipulation flex items-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {sortOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setSortBy(option.value)}
                    className={sortBy === option.value ? 'bg-primary/10' : ''}
                  >
                    {option.label}
                    {sortBy === option.value && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Compact Search Bar */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9 h-10 rounded-xl bg-muted/50 border border-border/50 text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Compact Horizontal Filter Pills */}
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                hapticTap();
                setRoleFilter(filter.value);
              }}
              className={cn(
                "shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95",
                roleFilter === filter.value
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted/70 text-muted-foreground'
              )}
            >
              {filter.label}
              <span className={cn(
                "ml-1 text-[10px]",
                roleFilter === filter.value ? 'opacity-80' : 'opacity-60'
              )}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {/* Selection count indicator */}
        {selectedUserIds.size > 0 && (
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between bg-primary/10 rounded-lg px-3 py-1.5">
              <span className="text-xs font-semibold text-primary">
                {selectedUserIds.size} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-xs text-primary font-medium underline"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </header>

      {/* User Table - Full Width Scrollable */}
      <div 
        ref={listRef}
        className="flex-1 overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {filteredUsers.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
              <Users className="h-10 w-10 text-muted-foreground" />
            </div>
            <p className="font-semibold text-lg">No users found</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
              <TableRow className="border-b-2">
                <TableHead className="w-10 px-2">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead className="px-2">User</TableHead>
                <TableHead className="px-2 hidden sm:table-cell">Roles</TableHead>
                <TableHead className="w-10 px-2 text-center">
                  <span className="sr-only">Status</span>
                </TableHead>
                <TableHead className="w-10 px-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow
                  key={user.id}
                  onClick={() => handleUserClick(user)}
                  className={cn(
                    "cursor-pointer transition-colors active:bg-muted/70",
                    selectedUserIds.has(user.id) && "bg-primary/5"
                  )}
                >
                  {/* Checkbox */}
                  <TableCell className="px-2 py-2">
                    <div 
                      onClick={(e) => toggleUserSelection(user.id, e)}
                      className="p-1"
                    >
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        className="h-5 w-5 rounded"
                      />
                    </div>
                  </TableCell>

                  {/* User Info */}
                  <TableCell className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9 border border-border">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                            {getInitials(user.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <OnlineIndicator 
                          isOnline={isOnline(user.id)} 
                          size="sm" 
                          className="absolute -bottom-0.5 -right-0.5"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate max-w-[140px] sm:max-w-[200px]">
                          {user.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px] sm:max-w-[200px]">
                          {user.phone}
                        </p>
                        {/* Mobile: Show roles inline */}
                        <div className="flex gap-1 mt-0.5 sm:hidden">
                          {user.roles.slice(0, 2).map((role) => (
                            <span 
                              key={role} 
                              className={cn("text-[10px] font-medium capitalize", roleColors[role])}
                            >
                              {role}
                            </span>
                          ))}
                          {user.roles.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{user.roles.length - 2}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Roles - Hidden on mobile */}
                  <TableCell className="px-2 py-2 hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge 
                          key={role} 
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0 capitalize", roleColors[role])}
                        >
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  {/* Verified Status */}
                  <TableCell className="px-2 py-2 text-center">
                    {user.verified ? (
                      <CheckCircle className="h-4 w-4 text-success mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-warning mx-auto" />
                    )}
                  </TableCell>

                  {/* Quick Actions */}
                  <TableCell className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticTap();
                          window.open(getWhatsAppLink(user.phone), '_blank');
                        }}
                        className="p-1.5 rounded-full bg-success/10 text-success hover:bg-success/20 active:scale-95 transition-all touch-manipulation"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        
        {/* Bottom padding for floating buttons */}
        <div className="h-32" />
      </div>

      {/* Floating User Actions Button */}
      <FloatingUserActions
        selectedCount={selectedUserIds.size}
        totalCount={filteredUsers.length}
        onAddUser={() => setAddUserOpen(true)}
        onNotify={() => setBulkNotificationOpen(true)}
        onWhatsApp={() => setBulkWhatsAppOpen(true)}
        onExport={handleExportCSV}
        onAssignRole={() => setBulkAssignRoleOpen(true)}
        onRemoveRole={() => setBulkRemoveRoleOpen(true)}
        onFilter={() => setShowFilters(true)}
        onRefresh={handleRefresh}
        onReachOutInactive={() => setReachOutInactiveOpen(true)}
        refreshing={refreshing}
      />

      {/* Filter Sheet */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="h-[60vh] rounded-t-3xl">
          <SheetHeader className="pb-4">
            <SheetTitle>Filters & Sort</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-6">
            {/* Verification Filter */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Verification Status</h4>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'all' as VerificationFilter, label: 'All' },
                  { value: 'verified' as VerificationFilter, label: '✓ Verified' },
                  { value: 'pending' as VerificationFilter, label: '⏳ Pending' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setVerificationFilter(filter.value)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      verificationFilter === filter.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Sort Options */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Sort By</h4>
              <div className="grid grid-cols-2 gap-2">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSortBy(option.value)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      sortBy === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            
            <Button 
              onClick={() => setShowFilters(false)} 
              className="w-full h-14 text-base font-semibold"
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
