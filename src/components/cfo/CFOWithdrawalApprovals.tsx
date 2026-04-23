import { useState, useEffect, useCallback } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowDownToLine, CheckCircle, XCircle, Loader2, RefreshCw,
  Smartphone,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UserAvatar } from '@/components/UserAvatar';
import { formatDistanceToNow } from 'date-fns';
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
  fin_ops_approved_at: string | null;
  fin_ops_approved_by: string | null;
  user?: { full_name: string; phone: string; avatar_url: string | null };
}

export function CFOWithdrawalApprovals() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const { formatAmount: formatCurrency } = useCurrency();

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('status', 'fin_ops_approved')
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
      console.error('CFO withdrawal fetch error:', e);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // CFO approves → cfo_approved (NOT final approved — TID stage comes next)
  const handleApprove = async () => {
    if (!user || !selected) return;
    setProcessing(selected.id);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'cfo_approved',
          cfo_approved_at: new Date().toISOString(),
          cfo_approved_by: user.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', selected.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'cfo_approve_withdrawal',
        record_id: selected.id,
        table_name: 'withdrawal_requests',
        metadata: { amount: selected.amount, target_user: selected.user_id },
      });

      toast.success('Withdrawal approved — forwarded to Fin Ops for TID completion');
      setRequests(prev => prev.filter(r => r.id !== selected.id));
      setApproveOpen(false);
      setSelected(null);
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
      const { data, error } = await supabase.functions.invoke('reject-withdrawal', {
        body: { withdrawal_ids: [selected.id], reason: rejectionReason.trim(), withdrawal_type: 'wallet' },
      });
      if (error || data?.error) {
        const { extractEdgeFunctionError } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractEdgeFunctionError({ error, data }, 'Failed to reject withdrawal');
        console.error('[CFOWithdrawalApprovals] reject failed:', msg, error);
        throw new Error(msg);
      }

      // Verify the row was actually rejected
      const result = data?.results?.find((r: any) => r.id === selected.id);
      if (result?.status !== 'rejected') {
        toast.error(`Rejection failed: ${result?.status || 'unknown error'}`);
        return;
      }

      toast.success('Withdrawal rejected');
      setRequests(prev => prev.filter(r => r.id !== selected.id));
      setRejectOpen(false);
      setRejectionReason('');
      setSelected(null);
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
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              Withdrawal Approvals (CFO)
              {requests.length > 0 && (
                <Badge variant="secondary" className="text-xs animate-pulse">
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
              No withdrawal requests awaiting CFO approval
            </p>
          ) : (
            <div className="space-y-2">
              {requests.map(req => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2"
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

                  {req.fin_ops_approved_at && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        ✓ Fin Ops approved {formatDistanceToNow(new Date(req.fin_ops_approved_at), { addSuffix: true })}
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      Requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
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
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Withdrawal</AlertDialogTitle>
            <AlertDialogDescription>
              Approving <strong>{selected ? formatCurrency(selected.amount) : ''}</strong> for {selected?.user?.full_name}. After your approval, Financial Ops will enter the TID to complete the payout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={!!processing} className="bg-emerald-600 hover:bg-emerald-700">
              {processing ? 'Processing...' : 'Approve Withdrawal'}
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
            placeholder="Reason for rejection (min 10 characters)..."
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={rejectionReason.trim().length < 10 || !!processing}
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
