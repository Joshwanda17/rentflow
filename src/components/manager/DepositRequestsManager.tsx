import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Wallet, Check, X, Loader2, User, Phone, Calendar, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { DepositAnalytics } from './DepositAnalytics';

interface DepositRequest {
  id: string;
  user_id: string;
  agent_id: string | null;
  amount: number;
  status: string;
  created_at: string;
  user_name?: string;
  user_phone?: string;
  agent_name?: string;
}

export function DepositRequestsManager() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; deposit: DepositRequest | null }>({
    open: false,
    deposit: null,
  });
  const [rejectionReason, setRejectionReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const fetchDeposits = async () => {
    try {
      let query = supabase
        .from('deposit_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(d => d.user_id),
          ...data.filter(d => d.agent_id).map(d => d.agent_id)
        ])];

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enriched = data.map(d => ({
          ...d,
          user_name: profileMap.get(d.user_id)?.full_name || 'Unknown',
          user_phone: profileMap.get(d.user_id)?.phone || '',
          agent_name: d.agent_id ? profileMap.get(d.agent_id)?.full_name || 'Unknown' : null,
        }));

        setDeposits(enriched);
      } else {
        setDeposits([]);
      }
    } catch (error) {
      console.error('Error fetching deposits:', error);
      toast.error('Failed to load deposit requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();

    const channel = supabase
      .channel('manager-deposit-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_requests' }, () => {
        fetchDeposits();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter]);

  const handleApprove = async (deposit: DepositRequest) => {
    setProcessingIds(prev => new Set(prev).add(deposit.id));
    try {
      const { data, error } = await supabase.functions.invoke('approve-deposit', {
        body: {
          deposit_request_id: deposit.id,
          action: 'approve',
          is_manager: true,
        },
      });

      if (error) throw error;
      toast.success(`Approved deposit of ${formatUGX(deposit.amount)}`);
      fetchDeposits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve deposit');
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
          is_manager: true,
        },
      });

      if (error) throw error;
      toast.success('Deposit request rejected');
      setRejectionReason('');
      fetchDeposits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject deposit');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(deposit.id);
        return next;
      });
    }
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

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Tabs defaultValue="requests" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="requests" className="gap-2">
          <Wallet className="h-4 w-4" />
          Requests
        </TabsTrigger>
        <TabsTrigger value="analytics" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="requests" className="space-y-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>

        {deposits.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No {statusFilter !== 'all' ? statusFilter : ''} deposit requests</p>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {deposits.map((deposit, index) => (
              <motion.div
                key={deposit.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{deposit.user_name}</span>
                        </div>
                        {deposit.user_phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{deposit.user_phone}</span>
                          </div>
                        )}
                      </div>
                      {getStatusBadge(deposit.status)}
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <span className="text-2xl font-bold text-primary">{formatUGX(deposit.amount)}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(deposit.created_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    </div>

                    {deposit.agent_name && (
                      <p className="text-xs text-muted-foreground mb-3">
                        Assigned Agent: {deposit.agent_name}
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
        )}

        {/* Reject Dialog */}
        <AlertDialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, deposit: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject Deposit Request</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject this deposit of {rejectDialog.deposit && formatUGX(rejectDialog.deposit.amount)}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              placeholder="Reason for rejection (optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReject} className="bg-destructive hover:bg-destructive/90">
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TabsContent>

      <TabsContent value="analytics">
        <DepositAnalytics />
      </TabsContent>
    </Tabs>
  );
}
