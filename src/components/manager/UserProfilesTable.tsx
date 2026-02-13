import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Search, Star, Banknote, CheckCircle, ChevronRight, Filter, UserCheck, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, Download, FileText, Bell, Square, CheckSquare, UserCog, UserMinus, MoreHorizontal, MessageCircle, Phone, MapPin, Globe, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { QuickRoleEditor } from './QuickRoleEditor';
import { formatUGX } from '@/lib/rentCalculations';
import WhatsAppPhoneLink, { WhatsAppVerificationBadge } from '@/components/WhatsAppPhoneLink';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import UserDetailsDialog from './UserDetailsDialog';

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
  
  // Hook to detect duplicate phone numbers
  const { duplicateUserIds, duplicateCount, refetch: refetchDuplicates } = useDuplicatePhoneUsers();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);

    try {
      // Fetch ALL profiles using pagination to bypass 1000-row limit
      const allProfiles: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, avatar_url, rent_discount_active, monthly_rent, created_at, country, city, country_code, verified, whatsapp_verified')
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('Error fetching profiles:', error);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          allProfiles.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Fetch ALL roles using pagination (also can exceed 1000)
      const allRoles: any[] = [];
      offset = 0;
      hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('user_roles')
          .select('user_id, role, enabled')
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('Error fetching roles:', error);
          break;
        }

        if (data && data.length > 0) {
          allRoles.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

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

      // Build roles lookup map for performance
      const rolesMap = new Map<string, { role: string; enabled: boolean }[]>();
      allRoles.forEach(r => {
        const existing = rolesMap.get(r.user_id) || [];
        existing.push({ role: r.role, enabled: r.enabled });
        rolesMap.set(r.user_id, existing);
      });

      // Combine data
      const usersWithRatings: UserWithRating[] = allProfiles.map(p => {
        const userRolesData = rolesMap.get(p.id) || [];
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
    } catch (err) {
      console.error('Error in fetchUsers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchUsers(), refetchDuplicates()]);
    setRefreshing(false);
  }, [refetchDuplicates]);

  const handlePullToRefresh = useCallback(async () => {
    await Promise.all([fetchUsers(), refetchDuplicates()]);
  }, [refetchDuplicates]);

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

  const handleExportByRole = async (role: 'tenant' | 'agent' | 'landlord') => {
    const roleUsers = users.filter(u => u.roles.includes(role));
    if (roleUsers.length === 0) {
      toast.error(`No ${role}s to export`);
      return;
    }

    toast.loading(`Generating ${role}s PDF...`, { id: 'role-pdf' });

    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const roleName = role.charAt(0).toUpperCase() + role.slice(1);

      // Title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${roleName}s Report`, margin, 18);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated: ${new Date().toLocaleDateString()} | Total: ${roleUsers.length}`, margin, 24);
      pdf.setTextColor(0, 0, 0);

      // Table headers
      const cols = ['#', 'Name', 'Phone', 'Country', 'City', 'Rating', 'Rent', 'Joined'];
      const colWidths = [8, 55, 40, 30, 30, 18, 25, 25];
      let y = 32;

      const drawHeader = () => {
        pdf.setFillColor(30, 30, 30);
        pdf.rect(margin, y - 4, pageWidth - margin * 2, 7, 'F');
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        let x = margin + 2;
        cols.forEach((col, i) => {
          pdf.text(col, x, y);
          x += colWidths[i];
        });
        pdf.setTextColor(0, 0, 0);
        y += 6;
      };

      drawHeader();

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);

      roleUsers.forEach((user, idx) => {
        if (y > pageHeight - 15) {
          pdf.addPage();
          y = 15;
          drawHeader();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
        }

        if (idx % 2 === 0) {
          pdf.setFillColor(245, 245, 245);
          pdf.rect(margin, y - 3.5, pageWidth - margin * 2, 5.5, 'F');
        }

        let x = margin + 2;
        const row = [
          String(idx + 1),
          user.full_name?.substring(0, 28) || 'N/A',
          user.phone || 'N/A',
          user.country?.substring(0, 15) || 'N/A',
          user.city?.substring(0, 15) || 'N/A',
          user.average_rating ? user.average_rating.toFixed(1) : '-',
          user.monthly_rent ? String(user.monthly_rent) : '-',
          formatDateForExport(user.created_at)
        ];

        row.forEach((val, i) => {
          pdf.text(val, x, y);
          x += colWidths[i];
        });
        y += 5.5;
      });

      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${role}s_report_${new Date().toISOString().split('T')[0]}.pdf`;

      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        window.open(blobUrl, '_blank');
      } else {
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      toast.success(`Exported ${roleUsers.length} ${role}s to PDF`, { id: 'role-pdf' });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to generate PDF', { id: 'role-pdf' });
    }
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
      <div className="flex flex-col h-full min-h-0 px-1">
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
            onExportByRole={handleExportByRole}
            onAddUser={() => setCreateUserInviteOpen(true)}
          />
        </div>

        {/* Sticky Header Section */}
        <div className="sticky top-0 z-20 bg-background pb-3 pt-2 space-y-3">
          {/* Modern Search Bar - Extra large for smartphones */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
            <Input
              placeholder="🔍 Search name or phone..."
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
          </div>

          {/* Role Filter Pills - Extra large for smartphones */}
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
              { value: 'all' as VerificationFilter, label: 'All', count: users.length },
              { value: 'verified' as VerificationFilter, label: '✓ OK', count: users.filter(u => u.verified).length },
              { value: 'pending' as VerificationFilter, label: '⏳ Wait', count: users.filter(u => !u.verified).length },
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
                  verificationFilter === filter.value 
                    ? 'bg-background/20' 
                    : 'bg-background/50'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          {/* Results & Sort Row - Larger for smartphones */}
          <div className="flex items-center justify-between bg-muted/30 rounded-2xl px-4 py-3">
            <button
              onClick={() => {
                hapticTap();
                toggleSelectAll();
              }}
              className="flex items-center gap-3 text-base font-semibold text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
              style={{ minHeight: '44px' }}
            >
              {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0 ? (
                <CheckSquare className="h-6 w-6 text-primary" />
              ) : (
                <Square className="h-6 w-6" />
              )}
              <span>
                {selectedUserIds.size > 0 ? `${selectedUserIds.size} picked` : 'Pick all'}
              </span>
            </button>

            <div className="flex items-center gap-3">
              <span className="text-base text-muted-foreground font-bold">
                {filteredUsers.length}
              </span>
              
              {/* Sort Dropdown */}
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
                        {sortBy === option.value && (
                          <CheckCircle className="h-5 w-5 ml-auto text-primary" />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Scrollable User List - Extra padding for mobile */}
        <PullToRefresh onRefresh={handlePullToRefresh} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-40 overscroll-contain touch-pan-y ios-momentum-scroll">
          <div ref={tableRef} className="space-y-3 pb-8">
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
                filteredUsers.map((user, index) => {
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
                    {/* Duplicate Phone Warning Badge */}
                    {isDuplicate && (
                      <div className="absolute right-14 top-4 z-10">
                        <div className="p-2 rounded-full bg-destructive/20" title="Duplicate Phone Number">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        </div>
                      </div>
                    )}
                    
                    {/* Selection Checkbox - Extra large touch target */}
                    <div 
                      className="absolute left-4 top-4 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        toggleUserSelection(user.id, e);
                      }}
                      style={{ minWidth: '44px', minHeight: '44px' }}
                    >
                      <div className={`p-2.5 rounded-xl transition-colors ${selectedUserIds.has(user.id) ? 'bg-primary/20' : 'bg-muted/50'}`}>
                        <Checkbox
                          checked={selectedUserIds.has(user.id)}
                          className="h-6 w-6 rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Verified Badge - Larger */}
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

                    {/* User Info - Larger text */}
                    <div className="flex items-start gap-4 pl-12">
                      <Avatar className="h-16 w-16 border-2 border-background shadow-lg shrink-0">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg truncate pr-10">{user.full_name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-base text-muted-foreground truncate font-medium">{user.phone}</p>
                          <WhatsAppVerificationBadge
                            verified={user.whatsapp_verified}
                            phone={user.phone}
                            onMarkVerified={() => handleMarkWhatsAppVerified(user.id, user.full_name, { stopPropagation: () => {} } as React.MouseEvent)}
                          />
                        </div>
                        
                        {/* Location */}
                        {(user.country || user.city) && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground truncate">
                              {user.city && user.country 
                                ? `${user.city}, ${user.country}` 
                                : user.country || user.city}
                              {user.country_code && (
                                <span className="ml-1 opacity-70">({user.country_code})</span>
                              )}
                            </span>
                          </div>
                        )}
                        
                        {/* Roles - Larger badges */}
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

                        {/* Rating - Larger */}
                        {user.rating_count > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-bold">{user.average_rating?.toFixed(1)}</span>
                            <span className="text-sm text-muted-foreground">({user.rating_count})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons - Extra Large for Smartphones */}
                    <div className="flex items-center gap-3 mt-5 pt-4 border-t-2 border-border/30">
                      {/* Quick Role Editor */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <QuickRoleEditor
                          userId={user.id}
                          userName={user.full_name}
                          onRoleChange={handleRefresh}
                        />
                      </div>
                      
                      {/* Approve/Reject Buttons - Bigger */}
                      {!user.verified ? (
                        <Button
                          variant="outline"
                          onClick={(e) => handleApproveUser(user.id, user.full_name, e)}
                          disabled={approvingUserId === user.id}
                          className="flex-1 h-12 gap-2 bg-success/10 border-2 border-success/30 text-success hover:bg-success/20 hover:text-success font-bold text-sm rounded-xl touch-manipulation"
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
                          onClick={(e) => handleRejectUser(user.id, user.full_name, e)}
                          disabled={approvingUserId === user.id}
                          className="flex-1 h-12 gap-2 bg-destructive/10 border-2 border-destructive/30 text-destructive hover:bg-destructive/20 hover:text-destructive font-bold text-sm rounded-xl touch-manipulation"
                        >
                          {approvingUserId === user.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <XCircle className="h-5 w-5" />
                          )}
                          Revoke
                        </Button>
                      )}
                      
                      {/* WhatsApp Button - Bigger */}
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticTap();
                          window.open(getWhatsAppLink(user.phone), '_blank');
                        }}
                        className="h-12 w-12 p-0 bg-success/10 border-2 border-success/30 text-success hover:bg-success/20 hover:text-success shrink-0 rounded-xl touch-manipulation"
                      >
                        <MessageCircle className="h-6 w-6" />
                      </Button>
                      
                      {/* Call Button - Bigger */}
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticTap();
                          window.location.href = `tel:${user.phone}`;
                        }}
                        className="h-12 w-12 p-0 bg-primary/10 border-2 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary shrink-0 rounded-xl touch-manipulation"
                      >
                        <Phone className="h-6 w-6" />
                      </Button>
                      
                      {/* View Details - Bigger */}
                      <Button
                        variant="ghost"
                        className="h-12 w-12 rounded-xl bg-muted/50 hover:bg-muted shrink-0 touch-manipulation"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>
                    </div>
                  </motion.div>
                  );
                })
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

      {/* Floating Bulk Actions Bar - Larger for smartphones */}
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
            
            {/* Primary Actions - Larger buttons */}
            <Button
              variant="ghost"
              onClick={() => setBulkNotificationOpen(true)}
              className="h-12 w-12 p-0 rounded-xl touch-manipulation"
            >
              <Bell className="h-6 w-6" />
            </Button>

            <Button
              variant="ghost"
              onClick={() => setBulkWhatsAppOpen(true)}
              className="h-12 w-12 p-0 rounded-xl text-success hover:text-success touch-manipulation"
            >
              <MessageCircle className="h-6 w-6" />
            </Button>

            <Button
              variant="ghost"
              onClick={() => setBulkAssignRoleOpen(true)}
              className="h-12 w-12 p-0 rounded-xl touch-manipulation"
            >
              <UserCog className="h-6 w-6" />
            </Button>

            <Button
              variant="ghost"
              onClick={() => setBulkRemoveRoleOpen(true)}
              className="h-12 w-12 p-0 rounded-xl text-destructive hover:text-destructive touch-manipulation"
            >
              <UserMinus className="h-6 w-6" />
            </Button>

            {/* More Actions Dropdown */}
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
