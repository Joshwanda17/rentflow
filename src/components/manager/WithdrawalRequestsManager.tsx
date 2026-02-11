import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowDownToLine, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  AlertCircle,
  RefreshCw,
  Phone,
  Wallet,
  Smartphone,
  Copy,
  Check,
  Download,
  History,
  Filter,
  Calendar,
  ChevronDown,
  Square,
  CheckSquare,
  Minus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UserAvatar } from '@/components/UserAvatar';
import { format, formatDistanceToNow } from 'date-fns';
import { exportToCSV } from '@/lib/exportUtils';
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

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  mobile_money_number: string | null;
  mobile_money_provider: string | null;
  mobile_money_name: string | null;
  created_at: string;
  rejection_reason: string | null;
  transaction_id: string | null;
  processed_at: string | null;
  processed_by: string | null;
  user?: {
    full_name: string;
    phone: string;
    avatar_url: string | null;
  };
  wallet_balance?: number;
}

export function WithdrawalRequestsManager() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allRequests, setAllRequests] = useState<WithdrawalRequest[]>([]);
  const [exporting, setExporting] = useState(false);
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<Date>(new Date());
  
  // History state
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [historyRequests, setHistoryRequests] = useState<WithdrawalRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  });
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRejectDialogOpen, setBatchRejectDialogOpen] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  // Selection helpers
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === requests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(requests.map(r => r.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Function to refresh only wallet balances (lightweight)
  const refreshWalletBalances = useCallback(async () => {
    if (requests.length === 0) return;
    
    const userIds = [...new Set(requests.map(r => r.user_id))];
    const { data: wallets } = await supabase
      .from('wallets')
      .select('user_id, balance')
      .in('user_id', userIds);
    
    if (wallets) {
      const walletMap = new Map(wallets.map(w => [w.user_id, w.balance]));
      setRequests(prev => prev.map(r => ({
        ...r,
        wallet_balance: walletMap.get(r.user_id) ?? r.wallet_balance
      })));
      setLastBalanceUpdate(new Date());
    }
  }, [requests]);

  // Auto-refresh wallet balances every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshWalletBalances();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [refreshWalletBalances]);

  const copyToClipboard = async (text: string, requestId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(requestId);
      toast.success('Number copied!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      // Fetch all withdrawal requests for export (not just pending)
      const { data: exportData, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!exportData || exportData.length === 0) {
        toast.error('No withdrawal requests to export');
        return;
      }

      // Fetch user profiles for all requests
      const userIds = [...new Set(exportData.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Format data for CSV
      const headers = [
        'Date',
        'User Name',
        'User Phone',
        'Amount (UGX)',
        'MoMo Provider',
        'MoMo Number',
        'Status',
        'Transaction ID',
        'Rejection Reason',
        'Processed At'
      ];

      const rows = exportData.map(req => {
        const profile = profileMap.get(req.user_id);
        return [
          format(new Date(req.created_at), 'yyyy-MM-dd HH:mm'),
          profile?.full_name || 'Unknown',
          profile?.phone || '',
          req.amount,
          req.mobile_money_provider?.toUpperCase() || '',
          req.mobile_money_number || '',
          req.status,
          req.transaction_id || '',
          req.rejection_reason || '',
          req.processed_at ? format(new Date(req.processed_at), 'yyyy-MM-dd HH:mm') : ''
        ];
      });

      exportToCSV({ headers, rows }, 'withdrawal_requests');
      toast.success(`Exported ${exportData.length} withdrawal requests`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fetchRequests = useCallback(async () => {
    try {
      // Calculate 12 hours ago cutoff
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      // Fetch pending withdrawal requests: exclude ≤500 UGX and older than 12 hours
      const { data: requestsData, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('status', 'pending')
        .gt('amount', 500)
        .gte('created_at', twelveHoursAgo)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (requestsData && requestsData.length > 0) {
        // Fetch user profiles
        const userIds = [...new Set(requestsData.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url')
          .in('id', userIds);

        // Fetch wallet balances
        const { data: wallets } = await supabase
          .from('wallets')
          .select('user_id, balance')
          .in('user_id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const walletMap = new Map(wallets?.map(w => [w.user_id, w.balance]) || []);

        const enrichedRequests = requestsData.map(r => ({
          ...r,
          user: profileMap.get(r.user_id) || { full_name: 'Unknown', phone: '', avatar_url: null },
          wallet_balance: walletMap.get(r.user_id) || 0
        }));

        setRequests(enrichedRequests);
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Error fetching withdrawal requests:', error);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch history with filters
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      let query = supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', statusFilter === 'all' ? ['approved', 'rejected'] : [statusFilter])
        .order('created_at', { ascending: false })
        .limit(50);

      // Apply date filters
      if (dateRange.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data: historyData, error } = await query;

      if (error) throw error;

      if (historyData && historyData.length > 0) {
        const userIds = [...new Set(historyData.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enrichedHistory = historyData.map(r => ({
          ...r,
          user: profileMap.get(r.user_id) || { full_name: 'Unknown', phone: '', avatar_url: null }
        }));

        setHistoryRequests(enrichedHistory);
      } else {
        setHistoryRequests([]);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Failed to load withdrawal history');
    } finally {
      setHistoryLoading(false);
    }
  }, [statusFilter, dateRange]);

  // Apply date presets
  const applyDatePreset = (preset: typeof datePreset) => {
    setDatePreset(preset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (preset) {
      case 'today':
        setDateRange({ from: today, to: today });
        break;
      case '7days':
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        setDateRange({ from: sevenDaysAgo, to: today });
        break;
      case '30days':
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        setDateRange({ from: thirtyDaysAgo, to: today });
        break;
      case 'all':
        setDateRange({ from: undefined, to: undefined });
        break;
      case 'custom':
        // Keep current range for custom
        break;
    }
  };

  // Fetch history when tab changes or filters change
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    fetchRequests();

    // Subscribe to real-time updates for withdrawal requests
    const withdrawalChannel = supabase
      .channel('withdrawal_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests'
        },
        () => {
          fetchRequests();
          if (activeTab === 'history') {
            fetchHistory();
          }
        }
      )
      .subscribe();

    // Subscribe to real-time wallet balance changes
    const walletChannel = supabase
      .channel('wallet_balance_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets'
        },
        () => {
          refreshWalletBalances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(withdrawalChannel);
      supabase.removeChannel(walletChannel);
    };
  }, [fetchRequests, refreshWalletBalances, activeTab, fetchHistory]);

  const handleApproveClick = async (request: WithdrawalRequest) => {
    // Fetch the CURRENT wallet balance to avoid stale data
    const { data: currentWallet, error } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', request.user_id)
      .maybeSingle();
    
    const currentBalance = currentWallet?.balance || 0;
    
    if (error) {
      toast.error('Failed to verify user balance');
      return;
    }
    
    // Check if user has sufficient balance with CURRENT data
    if (request.amount > currentBalance) {
      toast.error(`Insufficient balance! User has ${formatCurrency(currentBalance)} but requested ${formatCurrency(request.amount)}`);
      return;
    }
    
    // Update the request with current balance for the approval flow
    setSelectedRequest({ ...request, wallet_balance: currentBalance });
    setTransactionId('');
    setApproveDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!user || !selectedRequest) return;

    if (!transactionId.trim()) {
      toast.error('Please enter the transaction ID');
      return;
    }

    setProcessing(selectedRequest.id);
    try {
      // Balance deduction is handled automatically by the database trigger
      // when the status changes to 'approved' (with optimistic locking)

      // Update request status — this triggers the balance deduction automatically
      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          transaction_id: transactionId.trim()
        })
        .eq('id', selectedRequest.id);

      if (requestError) throw requestError;

      if (requestError) throw requestError;

      // 3. Send notification to user with transaction ID
      await supabase.from('notifications').insert({
        user_id: selectedRequest.user_id,
        title: 'Withdrawal Approved ✅',
        message: `Your withdrawal of ${formatCurrency(selectedRequest.amount)} has been sent! Transaction ID: ${transactionId.trim()}`,
        type: 'success',
        metadata: { transaction_id: transactionId.trim() }
      });

      toast.success('Withdrawal approved successfully!');
      setApproveDialogOpen(false);
      setTransactionId('');
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      console.error('Error approving withdrawal:', error);
      toast.error(error.message || 'Failed to approve withdrawal');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!user || !selectedRequest) return;

    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setProcessing(selectedRequest.id);
    try {
      // Update request status
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          rejection_reason: rejectionReason
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Send notification to user
      await supabase.from('notifications').insert({
        user_id: selectedRequest.user_id,
        title: 'Withdrawal Rejected ❌',
        message: `Your withdrawal request of ${formatCurrency(selectedRequest.amount)} was rejected. Reason: ${rejectionReason}`,
        type: 'warning'
      });

      toast.success('Withdrawal rejected');
      setRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      console.error('Error rejecting withdrawal:', error);
      toast.error(error.message || 'Failed to reject withdrawal');
    } finally {
      setProcessing(null);
    }
  };

  // Batch reject handler
  const handleBatchReject = async () => {
    if (!user || selectedIds.size === 0 || !rejectionReason.trim()) {
      toast.error('Please select requests and provide a rejection reason');
      return;
    }

    setBatchProcessing(true);
    setBatchProgress(0);
    
    const selectedRequests = requests.filter(r => selectedIds.has(r.id));
    const total = selectedRequests.length;
    let processed = 0;
    let failed = 0;

    for (const request of selectedRequests) {
      try {
        // Update request status
        const { error } = await supabase
          .from('withdrawal_requests')
          .update({
            status: 'rejected',
            processed_by: user.id,
            processed_at: new Date().toISOString(),
            rejection_reason: rejectionReason
          })
          .eq('id', request.id);

        if (error) throw error;

        // Send notification to user
        await supabase.from('notifications').insert({
          user_id: request.user_id,
          title: 'Withdrawal Rejected ❌',
          message: `Your withdrawal request of ${formatCurrency(request.amount)} was rejected. Reason: ${rejectionReason}`,
          type: 'warning'
        });

        processed++;
      } catch (error) {
        console.error('Error rejecting request:', request.id, error);
        failed++;
      }
      
      setBatchProgress(Math.round(((processed + failed) / total) * 100));
    }

    setBatchProcessing(false);
    setBatchRejectDialogOpen(false);
    setRejectionReason('');
    clearSelection();
    fetchRequests();

    if (failed === 0) {
      toast.success(`Successfully rejected ${processed} request${processed > 1 ? 's' : ''}`);
    } else {
      toast.warning(`Rejected ${processed} request${processed > 1 ? 's' : ''}, ${failed} failed`);
    }
  };

  const pendingCount = requests.length;

  return (
    <>
      <Card className="overflow-hidden border-warning/30">
        <CardHeader className="bg-gradient-to-r from-warning/10 to-warning/5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="h-5 w-5 text-warning" />
              Withdrawals
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-2 animate-pulse">
                  {pendingCount} pending
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleExportCSV}
                disabled={exporting}
                title="Export to CSV"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => activeTab === 'pending' ? fetchRequests() : fetchHistory()}
                disabled={loading || historyLoading}
              >
                <RefreshCw className={`h-4 w-4 ${(loading || historyLoading) ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'history')} className="w-full">
          <div className="px-4 pt-2">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="pending" className="gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5" />
                Pending
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs">
                <History className="h-3.5 w-3.5" />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Pending Tab */}
          <TabsContent value="pending" className="mt-0">
            {/* Batch Actions Bar */}
            {requests.length > 0 && (
              <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={selectAll}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {selectedIds.size === 0 ? (
                      <Square className="h-4 w-4" />
                    ) : selectedIds.size === requests.length ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <div className="relative">
                        <Square className="h-4 w-4" />
                        <Minus className="h-2.5 w-2.5 absolute top-0.5 left-0.5 text-primary" />
                      </div>
                    )}
                    <span className="text-xs">
                      {selectedIds.size === 0 
                        ? 'Select all' 
                        : `${selectedIds.size} selected`}
                    </span>
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      onClick={clearSelection}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                
                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 h-8"
                    onClick={() => setBatchRejectDialogOpen(true)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject {selectedIds.size} Request{selectedIds.size > 1 ? 's' : ''}
                  </Button>
                )}
              </div>
            )}

            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : requests.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success/50" />
                  <p className="font-medium">No pending requests</p>
                  <p className="text-sm">All withdrawal requests have been processed</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <AnimatePresence>
                    {requests.map((request) => (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        className={`p-4 hover:bg-muted/30 transition-colors ${
                          selectedIds.has(request.id) ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <div className="pt-1">
                            <Checkbox
                              checked={selectedIds.has(request.id)}
                              onCheckedChange={() => toggleSelection(request.id)}
                              className="h-5 w-5"
                            />
                          </div>
                          <UserAvatar 
                            avatarUrl={request.user?.avatar_url} 
                            fullName={request.user?.full_name} 
                            size="md" 
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold truncate">{request.user?.full_name}</p>
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{request.user?.phone || 'No phone'}</span>
                            </div>

                            {/* Mobile Money Number - Highlighted for easy payout */}
                            {request.mobile_money_number && (
                              <div className={`mt-2 p-2.5 rounded-lg border-2 ${
                                request.mobile_money_provider === 'mtn' 
                                  ? 'bg-yellow-500/10 border-yellow-500/30' 
                                  : 'bg-red-500/10 border-red-500/30'
                              }`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-full ${
                                      request.mobile_money_provider === 'mtn' 
                                        ? 'bg-yellow-500' 
                                        : 'bg-red-500'
                                    }`}>
                                      <Smartphone className={`h-3.5 w-3.5 ${
                                        request.mobile_money_provider === 'mtn' 
                                          ? 'text-black' 
                                          : 'text-white'
                                      }`} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground uppercase">
                                        {request.mobile_money_provider || 'MoMo'} Payout
                                      </p>
                                      <p className="font-bold text-base tracking-wide">
                                        {request.mobile_money_number}
                                      </p>
                                      {request.mobile_money_name && (
                                        <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                          Registered: <span className="font-semibold text-foreground">{request.mobile_money_name}</span>
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => copyToClipboard(request.mobile_money_number || '', request.id)}
                                  >
                                    {copiedId === request.id ? (
                                      <Check className="h-4 w-4 text-success" />
                                    ) : (
                                      <Copy className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {!request.mobile_money_number && (
                              <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border">
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  No mobile money number provided - use account phone
                                </p>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                              <div>
                                <p className="text-2xl font-bold text-primary">
                                  {formatCurrency(request.amount)}
                                </p>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Wallet className="h-3 w-3" />
                                  <span>Balance:</span>
                                  <span className={`font-mono font-semibold ${
                                    (request.wallet_balance || 0) >= request.amount 
                                      ? 'text-success' 
                                      : 'text-destructive'
                                  }`}>
                                    {formatCurrency(request.wallet_balance || 0)}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                                    <span className="relative flex h-1.5 w-1.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                                    </span>
                                    live
                                  </span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setRejectDialogOpen(true);
                                  }}
                                  disabled={processing === request.id}
                                  className="gap-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                >
                                  <XCircle className="h-4 w-4" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveClick(request)}
                                  disabled={processing === request.id || (request.wallet_balance !== undefined && request.amount > request.wallet_balance)}
                                  className="gap-1"
                                >
                                  {processing === request.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                  Approve
                                </Button>
                              </div>
                            </div>

                            {request.wallet_balance !== undefined && request.amount > request.wallet_balance && (
                              <div className="flex items-center gap-2 mt-2 p-2 bg-destructive/10 rounded-lg text-destructive text-sm">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                <span>Insufficient balance for this withdrawal</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-0">
            {/* Filters */}
            <div className="px-4 py-3 border-b bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filters:</span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="approved">✅ Approved</SelectItem>
                    <SelectItem value="rejected">❌ Rejected</SelectItem>
                  </SelectContent>
                </Select>

                {/* Date Presets */}
                <div className="flex gap-1">
                  {[
                    { value: 'all', label: 'All Time' },
                    { value: 'today', label: 'Today' },
                    { value: '7days', label: '7 Days' },
                    { value: '30days', label: '30 Days' },
                  ].map((preset) => (
                    <Button
                      key={preset.value}
                      variant={datePreset === preset.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs px-2.5"
                      onClick={() => applyDatePreset(preset.value as typeof datePreset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                {/* Custom Date Range */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={datePreset === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      Custom
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => {
                        setDateRange({ from: range?.from, to: range?.to });
                        setDatePreset('custom');
                      }}
                      numberOfMonths={1}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Active filters display */}
              {(statusFilter !== 'all' || dateRange.from || dateRange.to) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Active:</span>
                  {statusFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      {statusFilter === 'approved' ? '✅' : '❌'} {statusFilter}
                      <button onClick={() => setStatusFilter('all')} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  )}
                  {dateRange.from && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      📅 {format(dateRange.from, 'MMM d')} - {dateRange.to ? format(dateRange.to, 'MMM d') : 'now'}
                      <button onClick={() => { setDateRange({ from: undefined, to: undefined }); setDatePreset('all'); }} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Summary Statistics */}
            {!historyLoading && historyRequests.length > 0 && (
              <div className="px-4 py-3 border-b">
                <div className="grid grid-cols-2 gap-3">
                  {/* Approved Stats */}
                  <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-xs font-medium text-success">Approved</span>
                    </div>
                    <p className="text-lg font-bold text-success">
                      {formatCurrency(
                        historyRequests
                          .filter(r => r.status === 'approved')
                          .reduce((sum, r) => sum + r.amount, 0)
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {historyRequests.filter(r => r.status === 'approved').length} request{historyRequests.filter(r => r.status === 'approved').length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Rejected Stats */}
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-xs font-medium text-destructive">Rejected</span>
                    </div>
                    <p className="text-lg font-bold text-destructive">
                      {formatCurrency(
                        historyRequests
                          .filter(r => r.status === 'rejected')
                          .reduce((sum, r) => sum + r.amount, 0)
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {historyRequests.filter(r => r.status === 'rejected').length} request{historyRequests.filter(r => r.status === 'rejected').length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Total Summary */}
                <div className="mt-3 p-2 rounded-lg bg-muted/50 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total processed</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium">
                      {historyRequests.length} request{historyRequests.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-bold">
                      {formatCurrency(historyRequests.reduce((sum, r) => sum + r.amount, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              {historyLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : historyRequests.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No history found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {historyRequests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar 
                          avatarUrl={request.user?.avatar_url} 
                          fullName={request.user?.full_name} 
                          size="md" 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold truncate">{request.user?.full_name}</p>
                            <Badge 
                              variant={request.status === 'approved' ? 'default' : 'destructive'}
                              className="gap-1 text-xs"
                            >
                              {request.status === 'approved' ? (
                                <><CheckCircle className="h-3 w-3" /> Approved</>
                              ) : (
                                <><XCircle className="h-3 w-3" /> Rejected</>
                              )}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                            {request.mobile_money_number && (
                              <span className="flex items-center gap-1">
                                <Smartphone className="h-3 w-3" />
                                <span className="uppercase">{request.mobile_money_provider}</span> {request.mobile_money_number}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-2">
                            <p className={`text-xl font-bold ${request.status === 'approved' ? 'text-success' : 'text-destructive'}`}>
                              {formatCurrency(request.amount)}
                            </p>
                          </div>

                          {/* Approved: Show transaction ID and processed time */}
                          {request.status === 'approved' && request.transaction_id && (
                            <div className="mt-2 p-2 rounded-lg bg-success/10 border border-success/20 space-y-1">
                              <div className="flex items-center gap-2 text-xs text-success">
                                <CheckCircle className="h-3 w-3" />
                                <span className="font-medium">Transaction ID:</span>
                                <span className="font-mono font-bold">{request.transaction_id}</span>
                              </div>
                              {request.processed_at && (
                                <p className="text-xs text-muted-foreground">
                                  Processed: {format(new Date(request.processed_at), 'MMM d, yyyy • h:mm:ss a')}
                                </p>
                              )}
                            </div>
                          )}

                          {request.rejection_reason && (
                            <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                              <p className="text-xs text-destructive">
                                <strong>Rejection reason:</strong> {request.rejection_reason}
                              </p>
                              {request.processed_at && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Rejected: {format(new Date(request.processed_at), 'MMM d, yyyy • h:mm:ss a')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Rejection Dialog with Quick Reject Options */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject Withdrawal Request
            </AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting withdrawal of{' '}
              <strong className="text-foreground">{formatCurrency(selectedRequest?.amount || 0)}</strong> from{' '}
              <strong className="text-foreground">{selectedRequest?.user?.full_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Quick Reject Options */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Quick Reject Reasons</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Insufficient balance', icon: '💰' },
                  { label: 'Invalid mobile number', icon: '📱' },
                  { label: 'Number not registered', icon: '❌' },
                  { label: 'Duplicate request', icon: '🔄' },
                  { label: 'Suspicious activity', icon: '⚠️' },
                  { label: 'Try again later', icon: '⏰' },
                ].map((reason) => (
                  <Button
                    key={reason.label}
                    type="button"
                    variant={rejectionReason === reason.label ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => setRejectionReason(reason.label)}
                  >
                    <span>{reason.icon}</span>
                    {reason.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Reason Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Or enter custom reason
              </label>
              <Textarea
                placeholder="Enter rejection reason..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRejectionReason('');
              setSelectedRequest(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectionReason.trim() || processing === selectedRequest?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing === selectedRequest?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Rejection Dialog */}
      <AlertDialog open={batchRejectDialogOpen} onOpenChange={setBatchRejectDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Batch Reject Requests
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to reject <strong className="text-foreground">{selectedIds.size}</strong> withdrawal request{selectedIds.size > 1 ? 's' : ''} totaling{' '}
              <strong className="text-foreground">
                {formatCurrency(
                  requests
                    .filter(r => selectedIds.has(r.id))
                    .reduce((sum, r) => sum + r.amount, 0)
                )}
              </strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Selected requests summary */}
            <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-muted/50 rounded-lg">
              {requests.filter(r => selectedIds.has(r.id)).map(request => (
                <div key={request.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{request.user?.full_name}</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(request.amount)}</span>
                </div>
              ))}
            </div>

            {/* Quick Reject Options */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Select Rejection Reason</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Insufficient balance', icon: '💰' },
                  { label: 'Invalid mobile number', icon: '📱' },
                  { label: 'Number not registered', icon: '❌' },
                  { label: 'Duplicate request', icon: '🔄' },
                  { label: 'Suspicious activity', icon: '⚠️' },
                  { label: 'Try again later', icon: '⏰' },
                ].map((reason) => (
                  <Button
                    key={reason.label}
                    type="button"
                    variant={rejectionReason === reason.label ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => setRejectionReason(reason.label)}
                    disabled={batchProcessing}
                  >
                    <span>{reason.icon}</span>
                    {reason.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Reason Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Or enter custom reason
              </label>
              <Textarea
                placeholder="Enter rejection reason..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[60px] resize-none"
                disabled={batchProcessing}
              />
            </div>

            {/* Progress bar when processing */}
            {batchProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Processing...</span>
                  <span className="font-mono">{batchProgress}%</span>
                </div>
                <Progress value={batchProgress} className="h-2" />
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setRejectionReason('');
              }}
              disabled={batchProcessing}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchReject}
              disabled={!rejectionReason.trim() || batchProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject {selectedIds.size} Request{selectedIds.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval Dialog with Balance Confirmation + Transaction ID */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              Confirm Withdrawal Approval
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the details below before approving this withdrawal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            {/* User Info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <UserAvatar 
                avatarUrl={selectedRequest?.user?.avatar_url} 
                fullName={selectedRequest?.user?.full_name} 
                size="md" 
              />
              <div>
                <p className="font-semibold">{selectedRequest?.user?.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedRequest?.user?.phone}</p>
              </div>
            </div>

            {/* Balance Comparison Card */}
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-muted/30 px-4 py-2 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Balance Summary</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance</span>
                  <span className="font-mono font-bold text-lg">
                    {formatCurrency(selectedRequest?.wallet_balance || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-destructive">
                  <span className="text-sm">Withdrawal Amount</span>
                  <span className="font-mono font-bold text-lg">
                    - {formatCurrency(selectedRequest?.amount || 0)}
                  </span>
                </div>
                <div className="border-t pt-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Balance After</span>
                  <span className={`font-mono font-bold text-lg ${
                    ((selectedRequest?.wallet_balance || 0) - (selectedRequest?.amount || 0)) >= 0 
                      ? 'text-success' 
                      : 'text-destructive'
                  }`}>
                    {formatCurrency((selectedRequest?.wallet_balance || 0) - (selectedRequest?.amount || 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* Insufficient Balance Warning */}
            {selectedRequest && (selectedRequest.wallet_balance || 0) < selectedRequest.amount && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">Warning: Insufficient balance! This will result in a negative balance.</span>
              </div>
            )}

            {/* Mobile Money Details */}
            {selectedRequest?.mobile_money_number && (
              <div className={`p-3 rounded-lg border-2 ${
                selectedRequest?.mobile_money_provider === 'mtn' 
                  ? 'bg-yellow-500/10 border-yellow-500/30' 
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="flex items-center gap-2">
                  <Smartphone className={`h-4 w-4 ${
                    selectedRequest?.mobile_money_provider === 'mtn' ? 'text-yellow-600' : 'text-red-500'
                  }`} />
                  <span className="text-sm font-medium uppercase">{selectedRequest?.mobile_money_provider}</span>
                  <span className="font-mono font-bold">{selectedRequest?.mobile_money_number}</span>
                </div>
              </div>
            )}

            {/* Transaction ID Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Transaction ID <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Enter MoMo transaction ID..."
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="h-12 text-base font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enter the mobile money transaction reference for tracking
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setTransactionId('');
              setSelectedRequest(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={!transactionId.trim() || processing === selectedRequest?.id}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {processing === selectedRequest?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Payout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}