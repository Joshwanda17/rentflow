import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowDownToLine, CheckCircle, XCircle, Loader2, RefreshCw,
  Smartphone, ArrowRight,
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
  payout_method: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  agent_location: string | null;
  created_at: string;
  user?: { full_name: string; phone: string; avatar_url: string | null };
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(v);

export function FinOpsWithdrawalVerification() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reference, setReference] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', ['pending', 'requested'])
        .order('created_at', { ascending: true })
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
      console.error('FinOps withdrawal fetch error:', e);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleVerify = async () => {
    if (!user || !selected || reference.trim().length < 3) return;
    setProcessing(selected.id);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'fin_ops_verified',
          fin_ops_reference: reference.trim().toUpperCase(),
          fin_ops_verified_by: user.id,
          fin_ops_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', selected.id);
      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'fin_ops_verify_withdrawal',
        record_id: selected.id,
        table_name: 'withdrawal_requests',
        metadata: {
          amount: selected.amount,
          reference: reference.trim().toUpperCase(),
          target_user: selected.user_id,
        },
      });

      toast.success('Withdrawal verified & forwarded to CFO');
      setVerifyOpen(false);
      setSelected(null);
      setReference('');
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to verify');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!user || !selected || rejectionReason.trim().length < 10) return;
    setProcessing(selected.id);
    try {
      const { error: rejectErr } = await supabase.functions.invoke('reject-withdrawal', {
        body: { withdrawal_ids: [selected.id], reason: rejectionReason.trim(), withdrawal_type: 'wallet' },
      });
      if (rejectErr) throw rejectErr;

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

  const getPayoutLabel = (req: WithdrawalRequest) => {
    const method = req.payout_method || 'mobile_money';
    if (method === 'bank_transfer') return `🏦 ${req.bank_name || 'Bank'} · ${req.bank_account_number || '—'}`;
    if (method === 'cash') return `💵 Cash at: ${req.agent_location || 'Agent'}`;
    return null; // MoMo shown separately
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
              Wallet Withdrawals
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
              No pending wallet withdrawals
            </p>
          ) : (
            <div className="space-y-2">
              {requests.map(req => {
                const bankLabel = getPayoutLabel(req);
                return (
                  <div
                    key={req.id}
                    className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2"
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

                    {bankLabel && (
                      <p className="text-xs text-muted-foreground">{bankLabel}</p>
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
                          className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                          onClick={() => { setSelected(req); setReference(''); setVerifyOpen(true); }}
                          disabled={!!processing}
                        >
                          <ArrowRight className="h-3 w-3 mr-1" />
                          Verify & Forward
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verify Dialog */}
      <AlertDialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verify & Forward to CFO</AlertDialogTitle>
            <AlertDialogDescription>
              Verifying <strong>{selected ? formatCurrency(selected.amount) : ''}</strong> withdrawal for {selected?.user?.full_name}. Enter a reference to confirm verification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Enter Reference / TID"
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="font-mono uppercase"
          />
          <p className="text-[10px] text-muted-foreground">
            This will forward the request to the CFO for final approval.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVerify}
              disabled={!!processing || reference.trim().length < 3}
              className="bg-primary hover:bg-primary/90"
            >
              {processing ? 'Processing...' : 'Verify & Forward'}
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
