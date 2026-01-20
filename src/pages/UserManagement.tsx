import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Users, Search, Star, CheckCircle, ChevronRight, X, ArrowUpDown, ArrowUp, ArrowDown, 
  Download, Bell, Square, CheckSquare, UserCog, UserMinus, MoreHorizontal, MessageCircle, 
  Phone, MapPin, XCircle, Loader2, ArrowLeft, Filter, RefreshCw, FileText, UsersRound, UserPlus
} from 'lucide-react';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';
import BulkNotificationDialog from '@/components/manager/BulkNotificationDialog';
import BulkAssignRoleDialog from '@/components/manager/BulkAssignRoleDialog';
import BulkRemoveRoleDialog from '@/components/manager/BulkRemoveRoleDialog';
import BulkWhatsAppDialog from '@/components/manager/BulkWhatsAppDialog';
import { CreateUserInviteDialog } from '@/components/manager/CreateUserInviteDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToCSV, formatDateForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';

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
}

type RoleFilter = 'all' | 'tenant' | 'agent' | 'supporter' | 'landlord' | 'manager';
type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'rating_high' | 'rating_low';
type VerificationFilter = 'all' | 'verified' | 'pending';

export default function UserManagement() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
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
      .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at, country, city, country_code, verified')
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
        subagent_count: subagentCountByAgent.get(p.id) || 0
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

  const toggleUserSelection = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
        default:
          return 0;
      }
    });
  };

  const filteredUsers = sortUsers(users.filter(u => {
    const matchesSearch = 
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone.includes(searchTerm);
    
    const matchesRole = roleFilter === 'all' || u.roles.includes(roleFilter);
    
    const matchesVerification = 
      verificationFilter === 'all' || 
      (verificationFilter === 'verified' && u.verified) ||
      (verificationFilter === 'pending' && !u.verified);
    
    return matchesSearch && matchesRole && matchesVerification;
  }));

  const handleApproveUser = async (userId: string, userName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingUserId(userId);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verified: true })
        .eq('id', userId);
      
      if (error) throw error;
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, verified: true } : u
      ));
      
      hapticSuccess();
      toast.success(`${userName} approved`);
    } catch (error) {
      console.error('Error approving user:', error);
      toast.error('Failed to approve user');
    } finally {
      setApprovingUserId(null);
    }
  };

  const handleRejectUser = async (userId: string, userName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingUserId(userId);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verified: false })
        .eq('id', userId);
      
      if (error) throw error;
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, verified: false } : u
      ));
      
      hapticSuccess();
      toast.success(`${userName} verification revoked`);
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast.error('Failed to reject user');
    } finally {
      setApprovingUserId(null);
    }
  };

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
  ];

  const roleFilters: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: users.length },
    { value: 'tenant', label: 'Tenants', count: users.filter(u => u.roles.includes('tenant')).length },
    { value: 'agent', label: 'Agents', count: users.filter(u => u.roles.includes('agent')).length },
    { value: 'supporter', label: 'Supporters', count: users.filter(u => u.roles.includes('supporter')).length },
    { value: 'landlord', label: 'Landlords', count: users.filter(u => u.roles.includes('landlord')).length },
    { value: 'manager', label: 'Managers', count: users.filter(u => u.roles.includes('manager')).length },
  ];

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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header Skeleton */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        
        {/* Search Skeleton */}
        <div className="px-4 py-3">
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
        
        {/* Filter Pills Skeleton */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-10 w-24 rounded-full shrink-0" />
          ))}
        </div>
        
        {/* User Cards Skeleton */}
        <div className="px-4 space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="font-bold text-lg">Users</h1>
              <p className="text-xs text-muted-foreground">{filteredUsers.length} total</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                hapticTap();
                setAddUserOpen(true);
              }}
              size="sm"
              className="h-10 gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              <UserPlus className="h-4 w-4" />
              Add
            </Button>
            
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => {
                  hapticTap();
                  setAddUserOpen(true);
                }}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add User
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowFilters(true)}>
                  <Filter className="h-4 w-4 mr-2" />
                  Filters & Sort
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-12 h-14 rounded-2xl bg-muted/50 border-2 border-border/50 text-base"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Filter Pills */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                hapticTap();
                setRoleFilter(filter.value);
              }}
              className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                roleFilter === filter.value
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'bg-muted/70 text-muted-foreground'
              }`}
            >
              {filter.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                roleFilter === filter.value ? 'bg-primary-foreground/20' : 'bg-background/50'
              }`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {/* Selection & Sort Row */}
        <div className="flex items-center justify-between px-4 pb-3 bg-muted/30">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground active:scale-95"
          >
            {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0 ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : (
              <Square className="h-5 w-5" />
            )}
            <span>{selectedUserIds.size > 0 ? `${selectedUserIds.size} selected` : 'Select all'}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50 text-sm font-medium active:scale-95">
                <ArrowUpDown className="h-4 w-4" />
                Sort
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
      </header>

      {/* User List - Full Height Scrollable */}
      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="px-4 py-2 pb-40 space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredUsers.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16"
              >
                <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                  <Users className="h-10 w-10 text-muted-foreground" />
                </div>
                <p className="font-semibold text-lg">No users found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
              </motion.div>
            ) : (
              filteredUsers.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: Math.min(index * 0.02, 0.15) }}
                  onClick={() => handleUserClick(user)}
                  className={`relative bg-card rounded-2xl border-2 p-4 transition-all active:scale-[0.98] cursor-pointer ${
                    selectedUserIds.has(user.id) 
                      ? 'border-primary shadow-lg shadow-primary/10' 
                      : 'border-border/50'
                  }`}
                >
                  {/* Selection Checkbox */}
                  <div 
                    className="absolute left-3 top-3 z-10"
                    onClick={(e) => toggleUserSelection(user.id, e)}
                  >
                    <div className={`p-2 rounded-xl transition-colors ${selectedUserIds.has(user.id) ? 'bg-primary/20' : 'bg-muted/50'}`}>
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        className="h-6 w-6 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Verified Badge */}
                  <div className="absolute right-3 top-3">
                    {user.verified ? (
                      <div className="p-2 rounded-full bg-success/20">
                        <CheckCircle className="h-5 w-5 text-success" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-full bg-warning/20">
                        <XCircle className="h-5 w-5 text-warning" />
                      </div>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex items-start gap-4 pl-12">
                    <Avatar className="h-16 w-16 border-2 border-background shadow-lg shrink-0">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg truncate pr-10">{user.full_name}</h3>
                      <p className="text-base text-muted-foreground">{user.phone}</p>
                      
                      {/* Location */}
                      {(user.country || user.city) && (
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground truncate">
                            {user.city && user.country ? `${user.city}, ${user.country}` : user.country || user.city}
                          </span>
                        </div>
                      )}
                      
                      {/* Roles */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {user.roles.map((role) => {
                          const isEnabled = user.roleEnabledStatus[role] ?? true;
                          return (
                            <Badge 
                              key={role} 
                              variant="outline"
                              className={`text-xs font-semibold px-2.5 py-1 ${getRoleBadgeColor(role)} ${!isEnabled ? 'opacity-40 line-through' : ''}`}
                            >
                              {role}
                            </Badge>
                          );
                        })}
                        
                        {/* Sub-agents count badge for agents */}
                        {user.roles.includes('agent') && user.subagent_count > 0 && (
                          <Badge 
                            variant="outline"
                            className="text-xs font-semibold px-2.5 py-1 bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30"
                          >
                            <UsersRound className="h-3 w-3 mr-1" />
                            {user.subagent_count} sub-agent{user.subagent_count !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>

                      {/* Rating */}
                      {user.rating_count > 0 && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-medium">{user.average_rating?.toFixed(1)}</span>
                          <span className="text-sm text-muted-foreground">({user.rating_count})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                    {!user.verified ? (
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={(e) => handleApproveUser(user.id, user.full_name, e)}
                        disabled={approvingUserId === user.id}
                        className="flex-1 h-12 gap-2 bg-success/10 border-success/30 text-success font-semibold text-base"
                      >
                        {approvingUserId === user.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <CheckCircle className="h-5 w-5" />
                        )}
                        Approve
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={(e) => handleRejectUser(user.id, user.full_name, e)}
                        disabled={approvingUserId === user.id}
                        className="flex-1 h-12 gap-2 bg-destructive/10 border-destructive/30 text-destructive font-semibold text-base"
                      >
                        {approvingUserId === user.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <XCircle className="h-5 w-5" />
                        )}
                        Revoke
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        window.open(getWhatsAppLink(user.phone), '_blank');
                      }}
                      className="h-12 w-12 p-0 bg-success/10 border-success/30 text-success shrink-0"
                    >
                      <MessageCircle className="h-6 w-6" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        window.location.href = `tel:${user.phone}`;
                      }}
                      className="h-12 w-12 p-0 bg-primary/10 border-primary/30 text-primary shrink-0"
                    >
                      <Phone className="h-6 w-6" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 rounded-xl bg-muted/50 shrink-0"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Bulk Actions Bar */}
      <AnimatePresence>
        {selectedUserIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-6 left-4 right-4 z-50 bg-card border-2 border-border rounded-2xl shadow-2xl px-4 py-3 safe-area-bottom"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">{selectedUserIds.size}</span>
                <span className="text-sm text-muted-foreground">selected</span>
                <button
                  onClick={clearSelection}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkNotificationOpen(true)}
                  className="h-10 w-10 p-0"
                >
                  <Bell className="h-5 w-5" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkWhatsAppOpen(true)}
                  className="h-10 w-10 p-0 text-success border-success/30"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkAssignRoleOpen(true)}
                  className="h-10 w-10 p-0"
                >
                  <UserCog className="h-5 w-5" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkRemoveRoleOpen(true)}
                  className="h-10 w-10 p-0 text-destructive border-destructive/30"
                >
                  <UserMinus className="h-5 w-5" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCSV}
                  className="h-10 w-10 p-0"
                >
                  <Download className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Floating Add User Button - visible when no selection */}
      <AnimatePresence>
        {selectedUserIds.size === 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => {
              hapticTap();
              setAddUserOpen(true);
            }}
            className="fixed bottom-6 right-6 z-40 h-16 w-16 rounded-full bg-primary text-primary-foreground shadow-2xl flex items-center justify-center active:scale-95 transition-transform safe-area-bottom"
          >
            <UserPlus className="h-7 w-7" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
