import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ArrowDownToLine, CheckCircle, XCircle, Loader2, RefreshCw,
  Smartphone, Shield,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UserAvatar } from '@/components/UserAvatar';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  mobile_money_number: string | null;
  mobile_money_provider: string | null;
  mobile_money_name: string | null;
  created_at: string;
  cfo_approved_at: string | null;
  user?: { full_name: string; phone: string; avatar_url: string | null };
}

export function COOWithdrawalApprovals() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [transactionTime, setTransactionTime] = useState('');

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(v);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('status', 'cfo_approved')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        setRequests(
          (data as any[]).map(r => ({
            ...r,
            user: profileMap.get(r.user_id) || { full_name: 'Unknown', phone: '', avatar_url: null },
          }))
        );
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.error('COO withdrawal fetch error:', e);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleApprove = async () => {
    if (!user || !selected) return;
    if (!transactionId.trim()) {
      toast.error('Please enter the transaction ID');
      return;
    }
    if (!transactionTime.trim()) {
      toast.error('Please enter the transaction time');
      return;
    }
    setProcessing(selected.id);
    try {
      // COO final approval — sets status to 'approved' which triggers wallet deduction
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          coo_approved_at: new Date().toISOString(),
          coo_approved_by: user.id,
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          transaction_id: transactionId.trim(),
        } as any)
        .eq('id', selected.id);
      if (error) throw error;
      toast.success('Withdrawal approved & payment confirmed!');
      setApproveOpen(false);
      setTransactionId('');
      setSelected(null);
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!user || !selected || !rejectionReason.trim()) return;
    setProcessing(selected.id);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          rejection_reason: rejectionReason.trim(),
        })
        .eq('id', selected.id);
      if (error) throw error;
      toast.success('Withdrawal rejected');
      setRejectOpen(false);
      setRejectionReason('');
      setSelected(null);
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Final Withdrawal Approvals (COO)
              {requests.length > 0 && (
                <Badge variant="destructive" className="text-xs animate-pulse">
                  {requests.length}
                </Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchRequests}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No withdrawal requests awaiting final approval
            </p>
          ) : (
            <div className="space-y-2">
              {requests.map(req => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl border-2 border-purple-500/30 bg-purple-500/5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar fullName={req.user?.full_name || ''} avatarUrl={req.user?.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-bold">{req.user?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{req.user?.phone}</p>
                      </div>
                    </div>
                    <p className="text-base font-black">{formatCurrency(req.amount)}</p>
                  </div>

                  {req.mobile_money_number && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Smartphone className="h-3 w-3" />
                      <span className={`uppercase font-medium ${req.mobile_money_provider === 'mtn' ? 'text-yellow-600' : 'text-red-500'}`}>
                        {req.mobile_money_provider || 'MoMo'}
                      </span>
                      <span>•</span>
                      <span>{req.mobile_money_number}</span>
                      {req.mobile_money_name && <><span>•</span><span>{req.mobile_money_name}</span></>}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      CFO approved {req.cfo_approved_at ? formatDistanceToNow(new Date(req.cfo_approved_at), { addSuffix: true }) : ''}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive border-destructive/30"
                        onClick={() => { setSelected(req); setRejectOpen(true); }}
                        disabled={!!processing}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => { setSelected(req); setApproveOpen(true); }}
                        disabled={!!processing}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approve & Pay
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog — requires transaction ID */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Final Approval & Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Approving <strong>{selected ? formatCurrency(selected.amount) : ''}</strong> for {selected?.user?.full_name}. 
              This will trigger the wallet deduction and confirm payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>Transaction ID (from MoMo)</Label>
            <Input
              placeholder="e.g. TXN123456789"
              value={transactionId}
              onChange={e => setTransactionId(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={!transactionId.trim() || !!processing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {processing ? 'Processing...' : 'Approve & Confirm Payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Withdrawal?</AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting <strong>{selected ? formatCurrency(selected.amount) : ''}</strong> for {selected?.user?.full_name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectionReason.trim() || !!processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? 'Rejecting...' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
