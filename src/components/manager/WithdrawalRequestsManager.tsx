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
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UserAvatar } from '@/components/UserAvatar';
import { formatDistanceToNow } from 'date-fns';
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
  created_at: string;
  rejection_reason: string | null;
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fetchRequests = useCallback(async () => {
    try {
      // Fetch pending withdrawal requests
      const { data: requestsData, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('status', 'pending')
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

  useEffect(() => {
    fetchRequests();

    // Subscribe to real-time updates
    const channel = supabase
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRequests]);

  const handleApproveClick = (request: WithdrawalRequest) => {
    // Check if user has sufficient balance
    if (request.wallet_balance !== undefined && request.amount > request.wallet_balance) {
      toast.error('User has insufficient balance for this withdrawal');
      return;
    }
    setSelectedRequest(request);
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
      // 1. Deduct from user's wallet
      const { error: walletError } = await supabase
        .from('wallets')
        .update({ 
          balance: (selectedRequest.wallet_balance || 0) - selectedRequest.amount 
        })
        .eq('user_id', selectedRequest.user_id);

      if (walletError) throw walletError;

      // 2. Update request status with transaction ID
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

  const pendingCount = requests.length;

  return (
    <>
      <Card className="overflow-hidden border-warning/30">
        <CardHeader className="bg-gradient-to-r from-warning/10 to-warning/5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="h-5 w-5 text-warning" />
              Withdrawal Requests
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-2 animate-pulse">
                  {pendingCount} pending
                </Badge>
              )}
            </CardTitle>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={fetchRequests}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
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
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                onClick={() => copyToClipboard(request.mobile_money_number!, request.id)}
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
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Wallet className="h-3 w-3" />
                              Balance: {formatCurrency(request.wallet_balance || 0)}
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
      </Card>

      {/* Rejection Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Withdrawal Request</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this withdrawal request of{' '}
              <strong>{formatCurrency(selectedRequest?.amount || 0)}</strong> from{' '}
              <strong>{selectedRequest?.user?.full_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="min-h-[100px]"
            />
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
              ) : null}
              Reject Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval Dialog with Transaction ID */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              Approve Withdrawal
            </AlertDialogTitle>
            <AlertDialogDescription>
              Confirm the payout of{' '}
              <strong className="text-foreground">{formatCurrency(selectedRequest?.amount || 0)}</strong> to{' '}
              <strong className="text-foreground">{selectedRequest?.user?.full_name}</strong>
              {selectedRequest?.mobile_money_number && (
                <span className="block mt-1">
                  via <span className="uppercase font-medium">{selectedRequest?.mobile_money_provider}</span>{' '}
                  <span className="font-mono">{selectedRequest?.mobile_money_number}</span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-3">
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