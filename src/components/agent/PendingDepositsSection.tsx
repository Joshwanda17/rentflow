import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Clock, CheckCircle2, XCircle, User, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

interface DepositRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  user_name?: string;
  user_phone?: string;
  notes?: string;
}

export function PendingDepositsSection() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fetchDeposits = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('agent_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch user profiles for each deposit
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(d => d.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enrichedDeposits = data.map(d => ({
          ...d,
          user_name: profileMap.get(d.user_id)?.full_name || 'Unknown',
          user_phone: profileMap.get(d.user_id)?.phone || '',
        }));

        setDeposits(enrichedDeposits);
      } else {
        setDeposits([]);
      }
    } catch (error) {
      console.error('Error fetching deposits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
    // Realtime removed — deposit_requests not in realtime whitelist
  }, [user]);

  const handleApprove = async (deposit: DepositRequest) => {
    setProcessingId(deposit.id);

    try {
      const { data, error } = await supabase.functions.invoke('approve-deposit', {
        body: {
          deposit_request_id: deposit.id,
          action: 'approve',
        },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Failed to approve deposit');
        throw new Error(msg);
      }

      toast.success(`Deposit of ${formatCurrency(deposit.amount)} approved!`);
      fetchDeposits();
    } catch (error) {
      console.error('Error approving deposit:', error);
      toast.error('Failed to approve deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedDeposit) return;

    setProcessingId(selectedDeposit.id);

    try {
      const { data, error } = await supabase.functions.invoke('approve-deposit', {
        body: {
          deposit_request_id: selectedDeposit.id,
          action: 'reject',
          rejection_reason: rejectionReason || 'Rejected by agent',
        },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Failed to reject deposit');
        throw new Error(msg);
      }

      toast.success('Deposit request rejected');
      setRejectDialogOpen(false);
      setSelectedDeposit(null);
      setRejectionReason('');
      fetchDeposits();
    } catch (error) {
      console.error('Error rejecting deposit:', error);
      toast.error('Failed to reject deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectDialog = (deposit: DepositRequest) => {
    setSelectedDeposit(deposit);
    setRejectDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Deposits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            Pending Deposits
            {deposits.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {deposits.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="popLayout">
            {deposits.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-muted-foreground"
              >
                <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No pending deposit requests</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {deposits.map((deposit) => (
                  <motion.div
                    key={deposit.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{deposit.user_name}</p>
                         <p className="text-sm text-muted-foreground">{deposit.user_phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-primary">
                          {formatCurrency(deposit.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(deposit.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    {deposit.notes && (
                      <p className="text-xs text-muted-foreground mb-3 bg-muted/50 p-2 rounded italic">
                        Reason: {deposit.notes}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApprove(deposit)}
                        disabled={processingId === deposit.id}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        {processingId === deposit.id ? 'Processing...' : 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => openRejectDialog(deposit)}
                        disabled={processingId === deposit.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Deposit Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this deposit request of{' '}
              {selectedDeposit && formatCurrency(selectedDeposit.amount)}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder="Reason for rejection (optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setSelectedDeposit(null)}>
              ← Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
