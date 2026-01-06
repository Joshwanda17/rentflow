import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Wallet,
  Check,
  X,
  Loader2,
  User,
  Phone,
  Calendar as CalendarIcon,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  ClipboardList,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { exportToCSV, formatDateForExport } from '@/lib/exportUtils';
import { cn } from '@/lib/utils';
import { AuditLogViewer } from '@/components/manager/AuditLogViewer';

interface DepositRequest {
  id: string;
  user_id: string;
  agent_id: string;
  amount: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  processed_by: string | null;
  user_name?: string;
  user_phone?: string;
  agent_name?: string;
  processed_by_name?: string;
}

interface Agent {
  id: string;
  full_name: string;
}

const PAGE_SIZE = 10;

export default function DepositsManagement() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data state
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [agentFilter, setAgentFilter] = useState<string>(searchParams.get('agent') || 'all');
  const [minAmount, setMinAmount] = useState<string>(searchParams.get('minAmount') || '');
  const [maxAmount, setMaxAmount] = useState<string>(searchParams.get('maxAmount') || '');
  const [startDate, setStartDate] = useState<Date | undefined>(
    searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined
  );
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);

  // Processing state
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; deposit: DepositRequest | null }>({
    open: false,
    deposit: null,
  });
  const [rejectionReason, setRejectionReason] = useState('');

  // Redirect non-managers
  useEffect(() => {
    if (!authLoading && (!user || role !== 'manager')) {
      navigate('/dashboard');
    }
  }, [user, role, authLoading, navigate]);

  // Fetch agents for filter
  useEffect(() => {
    const fetchAgents = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');

      if (data && data.length > 0) {
        const agentIds = data.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', agentIds);

        setAgents(profiles?.map(p => ({ id: p.id, full_name: p.full_name })) || []);
      }
    };
    fetchAgents();
  }, []);

  // Fetch deposits with filters and pagination
  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('deposit_requests').select('*', { count: 'exact' });

      // Apply filters
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (agentFilter !== 'all') {
        query = query.eq('agent_id', agentFilter);
      }
      if (minAmount) {
        query = query.gte('amount', Number(minAmount));
      }
      if (maxAmount) {
        query = query.lte('amount', Number(maxAmount));
      }
      if (startDate) {
        query = query.gte('created_at', startOfDay(startDate).toISOString());
      }
      if (endDate) {
        query = query.lte('created_at', endOfDay(endDate).toISOString());
      }

      // Pagination
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setTotalCount(count || 0);

      if (data && data.length > 0) {
        // Get all related user IDs
        const userIds = [...new Set([
          ...data.map(d => d.user_id),
          ...data.filter(d => d.agent_id).map(d => d.agent_id),
          ...data.filter(d => d.processed_by).map(d => d.processed_by),
        ])];

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Filter by search query if present
        let enriched: DepositRequest[] = data.map(d => ({
          ...d,
          user_name: profileMap.get(d.user_id)?.full_name || 'Unknown',
          user_phone: profileMap.get(d.user_id)?.phone || '',
          agent_name: d.agent_id ? profileMap.get(d.agent_id)?.full_name || 'Unknown' : undefined,
          processed_by_name: d.processed_by ? profileMap.get(d.processed_by)?.full_name || 'Unknown' : undefined,
        }));

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          enriched = enriched.filter(
            d =>
              d.user_name?.toLowerCase().includes(q) ||
              d.user_phone?.includes(q) ||
              d.agent_name?.toLowerCase().includes(q)
          );
        }

        setDeposits(enriched);
      } else {
        setDeposits([]);
      }
    } catch (error) {
      console.error('Error fetching deposits:', error);
      toast.error('Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, agentFilter, minAmount, maxAmount, startDate, endDate, page, searchQuery]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (agentFilter !== 'all') params.set('agent', agentFilter);
    if (minAmount) params.set('minAmount', minAmount);
    if (maxAmount) params.set('maxAmount', maxAmount);
    if (startDate) params.set('startDate', startDate.toISOString());
    if (endDate) params.set('endDate', endDate.toISOString());
    if (searchQuery) params.set('q', searchQuery);
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [statusFilter, agentFilter, minAmount, maxAmount, startDate, endDate, page, searchQuery, setSearchParams]);

  const clearFilters = () => {
    setStatusFilter('all');
    setAgentFilter('all');
    setMinAmount('');
    setMaxAmount('');
    setStartDate(undefined);
    setEndDate(undefined);
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters =
    statusFilter !== 'all' ||
    agentFilter !== 'all' ||
    minAmount ||
    maxAmount ||
    startDate ||
    endDate ||
    searchQuery;

  const handleApprove = async (deposit: DepositRequest) => {
    setProcessingIds(prev => new Set(prev).add(deposit.id));
    try {
      const { error } = await supabase.functions.invoke('approve-deposit', {
        body: {
          deposit_request_id: deposit.id,
          action: 'approve',
        },
      });

      if (error) throw error;
      toast.success(`Approved ${formatUGX(deposit.amount)}`);
      fetchDeposits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(deposit.id);
        return next;
      });
    }
  };

  const handleReject = async () => {
    const deposit = rejectDialog.deposit;
    if (!deposit) return;

    setProcessingIds(prev => new Set(prev).add(deposit.id));
    setRejectDialog({ open: false, deposit: null });

    try {
      const { error } = await supabase.functions.invoke('approve-deposit', {
        body: {
          deposit_request_id: deposit.id,
          action: 'reject',
          rejection_reason: rejectionReason || 'Rejected by manager',
        },
      });

      if (error) throw error;
      toast.success('Deposit rejected');
      setRejectionReason('');
      fetchDeposits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(deposit.id);
        return next;
      });
    }
  };

  const handleExport = () => {
    const headers = ['User', 'Phone', 'Amount (UGX)', 'Status', 'Agent', 'Created', 'Processed By'];
    const rows = deposits.map(d => [
      d.user_name || '',
      d.user_phone || '',
      d.amount,
      d.status,
      d.agent_name || '',
      formatDateForExport(d.created_at),
      d.processed_by_name || 'N/A',
    ]);
    exportToCSV({ headers, rows }, 'deposits_export');
    toast.success('Exported to CSV');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || role !== 'manager') return null;

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <header className="sticky top-0 z-50 wa-header shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/manager-access?tab=deposits')}
              className="text-white/90 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-white">Deposits Management</h1>
              <p className="text-xs text-white/70">{totalCount} total requests</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchDeposits}
              className="text-white/90 hover:text-white hover:bg-white/10"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <Tabs defaultValue="deposits" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposits" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Deposits
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="deposits" className="mt-4 space-y-4">
        {/* Search and Filter Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(hasActiveFilters && !showFilters && 'border-primary text-primary')}
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Filters</span>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        Clear all
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Status Filter */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Status</label>
                      <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Agent Filter */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Agent</label>
                      <Select value={agentFilter} onValueChange={v => { setAgentFilter(v); setPage(1); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="All agents" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All agents</SelectItem>
                          {agents.map(agent => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Min Amount */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Min Amount</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={minAmount}
                        onChange={e => { setMinAmount(e.target.value); setPage(1); }}
                      />
                    </div>

                    {/* Max Amount */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Max Amount</label>
                      <Input
                        type="number"
                        placeholder="Any"
                        value={maxAmount}
                        onChange={e => { setMaxAmount(e.target.value); setPage(1); }}
                      />
                    </div>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">From Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            {startDate ? format(startDate, 'MMM d, yyyy') : 'Pick date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={d => { setStartDate(d); setPage(1); }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">To Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            {endDate ? format(endDate, 'MMM d, yyyy') : 'Pick date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={d => { setEndDate(d); setPage(1); }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deposits List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : deposits.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No deposit requests found</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={clearFilters} className="mt-2">
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {deposits.map((deposit, index) => (
                <motion.div
                  key={deposit.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">{deposit.user_name}</span>
                          </div>
                          {deposit.user_phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              <span>{deposit.user_phone}</span>
                            </div>
                          )}
                        </div>
                        {getStatusBadge(deposit.status)}
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl font-bold text-primary">{formatUGX(deposit.amount)}</span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarIcon className="h-3 w-3" />
                          <span>{format(new Date(deposit.created_at), 'MMM d, yyyy h:mm a')}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
                        {deposit.agent_name && (
                          <span>Agent: <strong>{deposit.agent_name}</strong></span>
                        )}
                        {deposit.processed_by_name && (
                          <span>• Processed by: <strong>{deposit.processed_by_name}</strong></span>
                        )}
                      </div>

                      {deposit.rejection_reason && (
                        <p className="text-xs text-destructive mb-3">
                          Reason: {deposit.rejection_reason}
                        </p>
                      )}

                      {deposit.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleApprove(deposit)}
                            disabled={processingIds.has(deposit.id)}
                          >
                            {processingIds.has(deposit.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={() => setRejectDialog({ open: true, deposit })}
                            disabled={processingIds.has(deposit.id)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
          </TabsContent>
          
          <TabsContent value="audit" className="mt-4">
            <AuditLogViewer tableName="deposit_requests" />
          </TabsContent>
        </Tabs>
      </main>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialog.open} onOpenChange={open => setRejectDialog({ open, deposit: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Deposit Request</AlertDialogTitle>
            <AlertDialogDescription>
              Reject deposit of {rejectDialog.deposit && formatUGX(rejectDialog.deposit.amount)}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Reason for rejection (optional)"
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} className="bg-destructive hover:bg-destructive/90">
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
