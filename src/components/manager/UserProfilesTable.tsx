import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Search, Star, Banknote, CheckCircle, ChevronRight, Filter, UserCheck, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, Download, FileText, Bell, Square, CheckSquare, UserCog, UserMinus, MoreHorizontal, MessageCircle, Phone, MapPin, Globe, XCircle, Loader2 } from 'lucide-react';
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


export default function UserProfilesTable() {
  const [users, setUsers] = useState<UserWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRating | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
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

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);

    // Fetch profiles with location data and verified status
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at, country, city, country_code, verified, whatsapp_verified')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      setLoading(false);
      return;
    }

    // Fetch roles with enabled status
    const userIds = profiles?.map(p => p.id) || [];
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role, enabled')
      .in('user_id', userIds);

    // Fetch ratings
    const { data: ratingsData } = await supabase
      .from('tenant_ratings')
      .select('tenant_id, rating');

    // Calculate average ratings per tenant
    const ratingsByTenant = new Map<string, { sum: number; count: number }>();
    (ratingsData || []).forEach(r => {
      const current = ratingsByTenant.get(r.tenant_id) || { sum: 0, count: 0 };
      ratingsByTenant.set(r.tenant_id, {
        sum: current.sum + r.rating,
        count: current.count + 1
      });
    });

    // Combine data
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
        whatsapp_verified: p.whatsapp_verified || false
      };
    });

    setUsers(usersWithRatings);
    setLoading(false);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }, []);

  const handlePullToRefresh = useCallback(async () => {
    await fetchUsers();
  }, []);

  const handleExportCSV = () => {
    if (filteredUsers.length === 0) {
      toast.error('No users to export');
      return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Country', 'City', 'Roles', 'Rating', 'Monthly Rent', 'Discount Active', 'Joined'];
    const rows = filteredUsers.map(user => [
      user.full_name,
      user.email,
      user.phone,
      user.country || 'Unknown',
      user.city || 'Unknown',
      user.roles.join(', '),
      user.average_rating ? user.average_rating.toFixed(1) : 'N/A',
      user.monthly_rent ? user.monthly_rent : 'N/A',
      user.rent_discount_active ? 'Yes' : 'No',
      formatDateForExport(user.created_at)
    ]);

    exportToCSV({ headers, rows }, 'users_export');
    toast.success('Users exported to CSV');
  };

  const handleExportPDF = async () => {
    if (filteredUsers.length === 0) {
      toast.error('No users to export');
      return;
    }

    if (!tableRef.current) {
      toast.error('Unable to generate PDF');
      return;
    }

    setExporting(true);
    try {
      await exportToPDF(tableRef.current, 'users_export', 'User Management Report');
      toast.success('Users exported to PDF');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const toggleUserSelection = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const clearSelection = () => {
    setSelectedUserIds(new Set());
  };

  const handleBulkNotificationSuccess = () => {
    clearSelection();
  };

  const handleBulkAssignRoleSuccess = () => {
    clearSelection();
    fetchUsers(); // Refresh to show updated roles
  };

  const handleBulkRemoveRoleSuccess = () => {
    clearSelection();
    fetchUsers(); // Refresh to show updated roles
  };

  const getSelectedUsers = () => {
    return filteredUsers.filter(u => selectedUserIds.has(u.id));
  };

  const handleExportSelectedCSV = () => {
    const selected = getSelectedUsers();
    if (selected.length === 0) {
      toast.error('No users selected');
      return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Country', 'City', 'Roles', 'Rating', 'Monthly Rent', 'Discount Active', 'Joined'];
    const rows = selected.map(user => [
      user.full_name,
      user.email,
      user.phone,
      user.country || 'Unknown',
      user.city || 'Unknown',
      user.roles.join(', '),
      user.average_rating ? user.average_rating.toFixed(1) : 'N/A',
      user.monthly_rent ? user.monthly_rent : 'N/A',
      user.rent_discount_active ? 'Yes' : 'No',
      formatDateForExport(user.created_at)
    ]);

    exportToCSV({ headers, rows }, 'selected_users_export');
    toast.success(`Exported ${selected.length} users to CSV`);
  };

  const handleExportSelectedPDF = async () => {
    const selected = getSelectedUsers();
    if (selected.length === 0) {
      toast.error('No users selected');
      return;
    }

    if (!selectedUsersRef.current) {
      toast.error('Unable to generate PDF');
      return;
    }

    setExportingSelected(true);
    try {
      await exportToPDF(selectedUsersRef.current, 'selected_users_export', `Selected Users Report (${selected.length} users)`);
      toast.success(`Exported ${selected.length} users to PDF`);
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setExportingSelected(false);
    }
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
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, verified: true } : u
      ));
      
      toast.success(`${userName} has been approved`);
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
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, verified: false } : u
      ));
      
      toast.success(`${userName} verification revoked`);
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast.error('Failed to reject user');
    } finally {
      setApprovingUserId(null);
    }
  };

  const handleMarkWhatsAppVerified = async (userId: string, userName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          whatsapp_verified: true,
          whatsapp_verified_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, whatsapp_verified: true } : u
      ));
      
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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/20'
            }`}
          />
        ))}
      </div>
    );
  };

  const handleUserClick = (user: UserWithRating) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const roleFilters: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: users.length },
    { value: 'tenant', label: 'Tenants', count: users.filter(u => u.roles.includes('tenant')).length },
    { value: 'agent', label: 'Agents', count: users.filter(u => u.roles.includes('agent')).length },
    { value: 'supporter', label: 'Supporters', count: users.filter(u => u.roles.includes('supporter')).length },
    { value: 'landlord', label: 'Landlords', count: users.filter(u => u.roles.includes('landlord')).length },
    { value: 'manager', label: 'Managers', count: users.filter(u => u.roles.includes('manager')).length },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        
        {/* Search Skeleton */}
        <Skeleton className="h-12 w-full rounded-xl" />
        
        {/* Filter Skeleton */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
          ))}
        </div>
        
        {/* User Cards Skeleton */}
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
      <div className="flex flex-col h-[calc(100vh-180px)] sm:h-[calc(100vh-160px)] min-h-0">
        {/* Tips for managers */}
        <ManagerTip />

        {/* Quick Actions Card */}
        <div className="mt-3">
          <QuickUserActions
            totalUsers={users.length}
            selectedCount={selectedUserIds.size}
            onNotifyAll={() => {
              if (selectedUserIds.size === 0) {
                // Select all first
                setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
              }
              setBulkNotificationOpen(true);
            }}
            onWhatsAppAll={() => {
              if (selectedUserIds.size === 0) {
                setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
              }
              setBulkWhatsAppOpen(true);
            }}
            onExport={handleExportCSV}
            onAddUser={() => setCreateUserInviteOpen(true)}
          />
        </div>

        {/* Sticky Header Section */}
        <div className="sticky top-0 z-20 bg-background pb-3 pt-3 space-y-3">
          {/* Modern Search Bar - Larger for easy touch */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="🔍 Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-12 h-14 rounded-2xl bg-muted/50 border-2 border-border/50 text-base focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-muted active:scale-95"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Role Filter Pills - Larger touch targets */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
            {roleFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  hapticTap();
                  setRoleFilter(filter.value);
                }}
                className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                  roleFilter === filter.value
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                {filter.label}
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                  roleFilter === filter.value 
                    ? 'bg-primary-foreground/20' 
                    : 'bg-background/50'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
            
            {/* Separator */}
            <div className="h-6 w-px bg-border shrink-0 mx-1" />
            
            {/* Verification Filter Pills */}
            {[
              { value: 'all' as VerificationFilter, label: 'All Status', count: users.length },
              { value: 'verified' as VerificationFilter, label: '✓ Verified', count: users.filter(u => u.verified).length },
              { value: 'pending' as VerificationFilter, label: '⏳ Pending', count: users.filter(u => !u.verified).length },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  hapticTap();
                  setVerificationFilter(filter.value);
                }}
                className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                  verificationFilter === filter.value
                    ? filter.value === 'verified' 
                      ? 'bg-success text-success-foreground shadow-lg shadow-success/25'
                      : filter.value === 'pending'
                      ? 'bg-warning text-warning-foreground shadow-lg shadow-warning/25'
                      : 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                {filter.label}
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                  verificationFilter === filter.value 
                    ? 'bg-background/20' 
                    : 'bg-background/50'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          {/* Results & Sort Row */}
          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2">
            <button
              onClick={() => {
                hapticTap();
                toggleSelectAll();
              }}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0 ? (
                <CheckSquare className="h-5 w-5 text-primary" />
              ) : (
                <Square className="h-5 w-5" />
              )}
              <span>
                {selectedUserIds.size > 0 ? `${selectedUserIds.size} selected` : 'Select all'}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">
                {filteredUsers.length} users
              </span>
              
              {/* Sort Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-9">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="hidden sm:inline">{currentSortLabel}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {sortOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setSortBy(option.value)}
                        className={sortBy === option.value ? 'bg-primary/10' : ''}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {option.label}
                        {sortBy === option.value && (
                          <CheckCircle className="h-4 w-4 ml-auto text-primary" />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Scrollable User List */}
        <PullToRefresh onRefresh={handlePullToRefresh} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-1 px-1 pb-32 overscroll-contain touch-pan-y">
          <div ref={tableRef} className="space-y-2 sm:space-y-3 pb-8">
            <AnimatePresence mode="popLayout">
              {filteredUsers.length === 0 ? (
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
                filteredUsers.map((user, index) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(index * 0.03, 0.2) }}
                    onClick={() => handleUserClick(user)}
                    className={`relative bg-card rounded-2xl border-2 p-4 transition-all active:scale-[0.98] cursor-pointer ${
                      selectedUserIds.has(user.id) 
                        ? 'border-primary shadow-lg shadow-primary/10' 
                        : 'border-border/50 hover:border-primary/40 hover:shadow-md'
                    }`}
                  >
                    {/* Selection Checkbox - Large touch target */}
                    <div 
                      className="absolute left-3 top-3 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        toggleUserSelection(user.id, e);
                      }}
                    >
                      <div className={`p-1.5 rounded-lg transition-colors ${selectedUserIds.has(user.id) ? 'bg-primary/20' : 'bg-muted/50'}`}>
                        <Checkbox
                          checked={selectedUserIds.has(user.id)}
                          className="h-5 w-5 rounded-md"
                        />
                      </div>
                    </div>

                    {/* Verified Badge */}
                    <div className="absolute right-3 top-3">
                      {user.verified ? (
                        <div className="p-1.5 rounded-full bg-success/20" title="Verified">
                          <CheckCircle className="h-4 w-4 text-success" />
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-full bg-warning/20" title="Pending Verification">
                          <XCircle className="h-4 w-4 text-warning" />
                        </div>
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex items-start gap-3 pl-10">
                      <Avatar className="h-14 w-14 border-2 border-background shadow-lg shrink-0">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base truncate pr-8">{user.full_name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-muted-foreground truncate">{user.phone}</p>
                          <WhatsAppVerificationBadge
                            verified={user.whatsapp_verified}
                            phone={user.phone}
                            onMarkVerified={() => handleMarkWhatsAppVerified(user.id, user.full_name, { stopPropagation: () => {} } as React.MouseEvent)}
                          />
                        </div>
                        
                        {/* Location */}
                        {(user.country || user.city) && (
                          <div className="flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">
                              {user.city && user.country 
                                ? `${user.city}, ${user.country}` 
                                : user.country || user.city}
                              {user.country_code && (
                                <span className="ml-1 opacity-70">({user.country_code})</span>
                              )}
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
                                className={`text-xs font-semibold px-2 py-0.5 ${getRoleBadgeColor(role)} ${!isEnabled ? 'opacity-40 line-through' : ''}`}
                                title={isEnabled ? `${role} dashboard enabled` : `${role} dashboard disabled by manager`}
                              >
                                {role}
                                {!isEnabled && <span className="ml-1">🚫</span>}
                              </Badge>
                            );
                          })}
                        </div>

                        {/* Rating */}
                        {user.rating_count > 0 && (
                          <div className="flex items-center gap-1 mt-2">
                            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-medium">{user.average_rating?.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground">({user.rating_count})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons - Large and Clear */}
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
                      {/* Quick Role Editor */}
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
                      
                      {/* Approve/Reject Buttons */}
                      {!user.verified ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleApproveUser(user.id, user.full_name, e)}
                          disabled={approvingUserId === user.id}
                          className="flex-1 h-10 gap-1.5 bg-success/10 border-success/30 text-success hover:bg-success/20 hover:text-success font-semibold text-xs"
                        >
                          {approvingUserId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Approve
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleRejectUser(user.id, user.full_name, e)}
                          disabled={approvingUserId === user.id}
                          className="flex-1 h-10 gap-1.5 bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20 hover:text-destructive font-semibold text-xs"
                        >
                          {approvingUserId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          Revoke
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticTap();
                          window.open(getWhatsAppLink(user.phone), '_blank');
                        }}
                        className="h-10 w-10 p-0 bg-success/10 border-success/30 text-success hover:bg-success/20 hover:text-success shrink-0"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticTap();
                          window.location.href = `tel:${user.phone}`;
                        }}
                        className="h-10 w-10 p-0 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary shrink-0"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl bg-muted/50 hover:bg-muted shrink-0"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
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
          avatar_url: u.avatar_url
        }))}
      />

      <CreateUserInviteDialog
        open={createUserInviteOpen}
        onOpenChange={setCreateUserInviteOpen}
      />

      {/* Hidden container for selected users PDF export */}
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
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-2xl shadow-xl px-3 py-2.5 flex items-center gap-2 max-w-[95vw]"
          >
            <div className="flex items-center gap-2 pr-2 border-r border-border">
              <span className="text-sm font-medium whitespace-nowrap">{selectedUserIds.size} selected</span>
              <button
                onClick={clearSelection}
                className="p-1 rounded-full hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            
            {/* Primary Actions - visible */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBulkNotificationOpen(true)}
              className="gap-1.5 px-2.5"
            >
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notify</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBulkWhatsAppOpen(true)}
              className="gap-1.5 px-2.5 text-success hover:text-success"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBulkAssignRoleOpen(true)}
              className="gap-1.5 px-2.5"
            >
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">Add Role</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBulkRemoveRoleOpen(true)}
              className="gap-1.5 px-2.5 text-destructive hover:text-destructive"
            >
              <UserMinus className="h-4 w-4" />
              <span className="hidden sm:inline">Remove Role</span>
            </Button>

            {/* More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleExportSelectedCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSelectedPDF} disabled={exportingSelected}>
                  <FileText className="h-4 w-4 mr-2" />
                  {exportingSelected ? 'Exporting...' : 'Export to PDF'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
