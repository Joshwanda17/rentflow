import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowDownToLine, CheckCircle, XCircle, Loader2, RefreshCw,
  Smartphone, ArrowRight, Banknote,
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
  reason: string | null;
  created_at: string;
  fin_ops_reference: string | null;
  user?: { full_name: string; phone: string; avatar_url: string | null };
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(v);

export function FinOpsWithdrawalVerification() {
  const { user } = useAuth();
  // Section A: pending requests
  const [pendingRequests, setPendingRequests] = useState<WithdrawalRequest[]>([]);
  // Section B: cfo_approved requests awaiting TID
  const [tidRequests, setTidRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [tidOpen, setTidOpen] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reference, setReference] = useState('');

  const fetchProfiles = async (data: any[]) => {
    if (!data.length) return [];
    const userIds = [...new Set(data.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone, avatar_url')
      .in('id', userIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    return data.map(r => ({
      ...r,
      user: profileMap.get(r.user_id) || { full_name: 'Unknown', phone: '', avatar_url: null },
    }));
  };

  const fetchRequests = useCallback(async () => {
    try {
      const [pendingRes, tidRes] = await Promise.all([
        supabase
          .from('withdrawal_requests')
          .select('*')
          .in('status', ['pending', 'requested'])
          .order('created_at', { ascending: true })
          .limit(100),
        supabase
          .from('withdrawal_requests')
          .select('*')
          .eq('status', 'cfo_approved')
          .order('created_at', { ascending: true })
          .limit(100),
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (tidRes.error) throw tidRes.error;

      const [pendingWithProfiles, tidWithProfiles] = await Promise.all([
        fetchProfiles(pendingRes.data || []),
        fetchProfiles(tidRes.data || []),
      ]);

      setPendingRequests(pendingWithProfiles);
      setTidRequests(tidWithProfiles);
    } catch (e) {
      console.error('FinOps withdrawal fetch error:', e);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Section A: Approve (no TID) → fin_ops_approved
  const handleApprove = async () => {
    if (!user || !selected) return;
    setProcessing(selected.id);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'fin_ops_approved',
          fin_ops_approved_at: new Date().toISOString(),
          fin_ops_approved_by: user.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', selected.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'fin_ops_approve_withdrawal',
        record_id: selected.id,
        table_name: 'withdrawal_requests',
        metadata: { amount: selected.amount, target_user: selected.user_id },
      });

      toast.success('Withdrawal approved & forwarded to CFO');
      setApproveOpen(false);
      setSelected(null);
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  // Section B: Enter TID & complete → approved
  const handleTidComplete = async () => {
    if (!user || !selected || reference.trim().length < 3) return;
    setProcessing(selected.id);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          fin_ops_reference: reference.trim().toUpperCase(),
          fin_ops_verified_by: user.id,
          fin_ops_verified_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', selected.id);
      if (error) throw error;

      // Record cash_out ledger entry with TID reference
      await supabase.from('general_ledger').insert({
        user_id: selected.user_id,
        amount: selected.amount,
        direction: 'cash_out',
        category: 'wallet_withdrawal',
        description: `Wallet withdrawal completed. TID: ${reference.trim().toUpperCase()}`,
        source_table: 'withdrawal_requests',
        source_id: selected.id,
        linked_party: user.id,
      } as any);

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'fin_ops_complete_withdrawal',
        record_id: selected.id,
        table_name: 'withdrawal_requests',
        metadata: {
          amount: selected.amount,
          reference: reference.trim().toUpperCase(),
          target_user: selected.user_id,
        },
      });

      toast.success('Withdrawal completed with TID!');
      setTidOpen(false);
      setSelected(null);
      setReference('');
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to complete');
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
    return null;
  };

  const renderRequestCard = (req: WithdrawalRequest, variant: 'pending' | 'tid') => {
    const bankLabel = getPayoutLabel(req);
    const borderClass = variant === 'pending' ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5';
    return (
      <div key={req.id} className={`p-3 rounded-xl border ${borderClass} space-y-2`}>
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

        {/* Recipient name */}
        {(req.mobile_money_name || req.bank_account_name) && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
            <span className="text-xs font-bold text-foreground">
              Recipient: {req.mobile_money_name || req.bank_account_name}
            </span>
          </div>
        )}

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

        {bankLabel && <p className="text-xs text-muted-foreground">{bankLabel}</p>}

        {/* Reason */}
        {req.reason && (
          <div className="px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Reason</p>
            <p className="text-xs text-foreground">{req.reason}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
          </p>
          <div className="flex gap-2">
            {variant === 'pending' && (
              <>
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
                  onClick={() => { setSelected(req); setApproveOpen(true); }}
                  disabled={!!processing}
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Approve
                </Button>
              </>
            )}
            {variant === 'tid' && (
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setSelected(req); setReference(''); setTidOpen(true); }}
                disabled={!!processing}
              >
                <Banknote className="h-3 w-3 mr-1" />
                Enter TID & Complete
              </Button>
            )}
          </div>
        </div>
      </div>
    );
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
      {/* Section A: Pending Approvals */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              Pending Withdrawals
              {pendingRequests.length > 0 && (
                <Badge variant="destructive" className="text-xs animate-pulse">
                  {pendingRequests.length}
                </Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchRequests}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No pending wallet withdrawals
            </p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map(req => renderRequestCard(req, 'pending'))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B: Awaiting TID Completion (CFO approved) */}
      {tidRequests.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-500" />
              Awaiting TID Completion
              <Badge variant="secondary" className="text-xs">
                {tidRequests.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tidRequests.map(req => renderRequestCard(req, 'tid'))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approve Dialog (no TID required) */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve & Forward to CFO</AlertDialogTitle>
            <AlertDialogDescription>
              Approve <strong>{selected ? formatCurrency(selected.amount) : ''}</strong> withdrawal for {selected?.user?.full_name}. This will forward the request to the CFO for sign-off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={handleApprove}
              disabled={!!processing}
            >
              {processing ? 'Processing...' : 'Approve & Forward'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TID Completion Dialog */}
      <AlertDialog open={tidOpen} onOpenChange={setTidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete with Transaction ID</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the TID for <strong>{selected ? formatCurrency(selected.amount) : ''}</strong> withdrawal to {selected?.user?.full_name}. This finalizes the payout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Enter Transaction ID (TID)"
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="font-mono uppercase"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={handleTidComplete}
              disabled={!!processing || reference.trim().length < 3}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processing ? 'Processing...' : 'Complete Withdrawal'}
            </Button>
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
            <Button
              onClick={handleReject}
              disabled={rejectionReason.trim().length < 10 || !!processing}
              variant="destructive"
            >
              {processing ? 'Rejecting...' : 'Reject'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
