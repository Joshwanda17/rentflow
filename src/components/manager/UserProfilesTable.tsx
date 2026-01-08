import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Users, Search, Star, Banknote, CheckCircle, ChevronRight, Filter, UserCheck, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, Download, FileText } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import UserDetailsDialog from './UserDetailsDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { PullToRefresh } from '@/components/PullToRefresh';
import { exportToCSV, exportToPDF, formatDateForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';

interface UserWithRating {
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
  created_at: string;
}

type RoleFilter = 'all' | 'tenant' | 'agent' | 'supporter' | 'landlord' | 'manager';
type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'rating_high' | 'rating_low';


export default function UserProfilesTable() {
  const [users, setUsers] = useState<UserWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRating | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);

    // Fetch profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      setLoading(false);
      return;
    }

    // Fetch roles
    const userIds = profiles?.map(p => p.id) || [];
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role')
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
      const userRoles = rolesData?.filter(r => r.user_id === p.id).map(r => r.role) || [];
      const ratingInfo = ratingsByTenant.get(p.id);
      
      return {
        ...p,
        roles: userRoles,
        average_rating: ratingInfo ? ratingInfo.sum / ratingInfo.count : null,
        rating_count: ratingInfo?.count || 0,
        created_at: p.created_at
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

    const headers = ['Name', 'Email', 'Phone', 'Roles', 'Rating', 'Monthly Rent', 'Discount Active', 'Joined'];
    const rows = filteredUsers.map(user => [
      user.full_name,
      user.email,
      user.phone,
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
    
    return matchesSearch && matchesRole;
  }));

  const sortOptions: { value: SortOption; label: string; icon: typeof ArrowUp }[] = [
    { value: 'newest', label: 'Newest first', icon: ArrowDown },
    { value: 'oldest', label: 'Oldest first', icon: ArrowUp },
    { value: 'name_asc', label: 'Name A-Z', icon: ArrowUp },
    { value: 'name_desc', label: 'Name Z-A', icon: ArrowDown },
    { value: 'rating_high', label: 'Highest rated', icon: ArrowDown },
    { value: 'rating_low', label: 'Lowest rated', icon: ArrowUp },
  ];

  const currentSortLabel = sortOptions.find(s => s.value === sortBy)?.label || 'Sort';

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      tenant: 'bg-primary/15 text-primary border-primary/30',
      agent: 'bg-warning/15 text-warning border-warning/30',
      supporter: 'bg-success/15 text-success border-success/30',
      landlord: 'bg-chart-5/15 text-chart-5 border-chart-5/30',
      manager: 'bg-destructive/15 text-destructive border-destructive/30'
    };
    return colors[role] || 'bg-muted text-muted-foreground';
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
      <PullToRefresh onRefresh={handlePullToRefresh} className="space-y-4 max-h-[calc(100vh-200px)] md:max-h-[calc(100vh-150px)]">
        {/* Modern Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Users</h2>
              <p className="text-sm text-muted-foreground">{users.length} registered</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportCSV}
              className="rounded-full"
              title="Export to CSV"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportPDF}
              disabled={exporting}
              className="rounded-full"
              title="Export to PDF"
            >
              <FileText className={`h-5 w-5 ${exporting ? 'animate-pulse' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-full"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Modern Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 pr-10 h-12 rounded-xl bg-muted/50 border-0 text-base focus-visible:ring-2 focus-visible:ring-primary"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Role Filter Pills - Horizontal Scroll */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setRoleFilter(filter.value)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                roleFilter === filter.value
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {filter.label}
              <span className={`ml-1.5 ${roleFilter === filter.value ? 'opacity-90' : 'opacity-60'}`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {/* Sort & Results Row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {filteredUsers.length === users.length 
              ? `${users.length} users` 
              : `${filteredUsers.length} of ${users.length} users`
            }
          </span>
          
          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
            >
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">{currentSortLabel}</span>
            </button>
            
            {/* Sort Menu */}
            <AnimatePresence>
              {showSortMenu && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowSortMenu(false)} 
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden min-w-[180px]"
                  >
                    <div className="p-1">
                      {sortOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSortBy(option.value);
                              setShowSortMenu(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                              sortBy === option.value
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {option.label}
                            {sortBy === option.value && (
                              <CheckCircle className="h-4 w-4 ml-auto" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* User List */}
        <div ref={tableRef} className="space-y-3">
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
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleUserClick(user)}
                  className="group relative bg-card rounded-2xl border border-border/50 p-4 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="relative">
                      <Avatar className="h-14 w-14 border-2 border-background shadow-md">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      {user.rent_discount_active && (
                        <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-success text-success-foreground">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                    
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                            {user.full_name}
                          </h3>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{user.phone}</p>
                        </div>
                        
                        {/* Arrow indicator */}
                        <div className="shrink-0 p-2 rounded-full bg-muted/50 group-hover:bg-primary/10 transition-colors">
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                      
                      {/* Roles */}
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        {user.roles.map((role) => (
                          <Badge 
                            key={role} 
                            variant="outline"
                            className={`text-xs font-medium ${getRoleBadgeColor(role)}`}
                          >
                            {role}
                          </Badge>
                        ))}
                      </div>
                      
                      {/* Rating & Rent - Bottom Row */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center gap-3">
                          {user.rating_count > 0 ? (
                            <div className="flex items-center gap-1.5">
                              {renderStars(user.average_rating || 0)}
                              <span className="text-xs text-muted-foreground font-medium">
                                {user.average_rating?.toFixed(1)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">No ratings</span>
                          )}
                        </div>
                        
                        {user.monthly_rent && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Banknote className="h-3.5 w-3.5" />
                            {formatUGX(user.monthly_rent)}/mo
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </PullToRefresh>

      <UserDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
      />
    </>
  );
}
