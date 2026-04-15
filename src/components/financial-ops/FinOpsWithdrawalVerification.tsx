import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowDownToLine, CheckCircle, XCircle, Loader2, RefreshCw,
  Smartphone,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
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

import { formatDynamic } from '@/lib/currencyFormat';
const formatCurrency = formatDynamic;

type ActiveTab = 'pending' | 'rejected';

export function FinOpsWithdrawalVerification() {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<WithdrawalRequest[]>([]);
  const [rejectedRequests, setRejectedRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reference, setReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('pending');

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
      // Fetch pending
      const { data: pendingData, error: pendingErr } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', ['pending', 'requested', 'manager_approved', 'cfo_approved', 'fin_ops_approved'])
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (pendingErr) throw pendingErr;

      // Fetch rejected (last 90 days)
      const { data: rejectedData, error: rejectedErr } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('status', 'rejected')
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (rejectedErr) throw rejectedErr;

      const [pendingWithProfiles, rejectedWithProfiles] = await Promise.all([
        fetchProfiles(pendingData || []),
        fetchProfiles(rejectedData || []),
      ]);

      setPendingRequests(pendingWithProfiles);
      setRejectedRequests(rejectedWithProfiles);
    } catch (e) {
      console.error('FinOps withdrawal fetch error:', e);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Approve with TID/Receipt/Bank Ref → approved (final) via ledger-first edge function
  const handleApprove = async () => {
    if (!user || !selected || reference.trim().length < 3 || !paymentMethod) return;
    setProcessing(selected.id);
    try {
      const { data, error } = await supabase.functions.invoke('approve-withdrawal', {
        body: {
          withdrawal_id: selected.id,
          reference: reference.trim().toUpperCase(),
          payment_method: paymentMethod,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Withdrawal approved & completed!');
      setPendingRequests(prev => prev.filter(r => r.id !== selected.id));
      setRejectedRequests(prev => prev.filter(r => r.id !== selected.id));
      setApproveOpen(false);
      setSelected(null);
      setReference('');
      setPaymentMethod('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!user || !selected || rejectionReason.trim().length < 10) return;
    setProcessing(selected.id);
    try {
      const { data, error: rejectErr } = await supabase.functions.invoke('reject-withdrawal', {
        body: { withdrawal_ids: [selected.id], reason: rejectionReason.trim(), withdrawal_type: 'wallet' },
      });
      if (rejectErr) throw rejectErr;

      const result = data?.results?.find((r: any) => r.id === selected.id);
      if (result?.status !== 'rejected') {
        toast.error(`Rejection failed: ${result?.status || 'unknown error'}`);
        return;
      }

      toast.success('Withdrawal rejected');
      setPendingRequests(prev => prev.filter(r => r.id !== selected.id));
      // Add to rejected list
      const rejectedItem = { ...selected, status: 'rejected' };
      setRejectedRequests(prev => [rejectedItem, ...prev]);
      setRejectOpen(false);
      setRejectionReason('');
      setSelected(null);
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

  const getAgeBadge = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (days >= 30) return <Badge variant="destructive" size="sm">{Math.floor(days / 30)}mo old</Badge>;
    if (days >= 7) return <Badge variant="warning" size="sm">{Math.floor(days / 7)}w old</Badge>;
    return null;
  };

  const renderPendingCard = (req: WithdrawalRequest) => {
    const bankLabel = getPayoutLabel(req);
    const ageBadge = getAgeBadge(req.created_at);
    return (
      <div key={req.id} className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
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

        {req.reason?.includes('[Agent proxy:') && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[10px] font-semibold uppercase tracking-wider">
            👤 Proxy Agent Request
          </div>
        )}

        {req.reason && (
          <div className="px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Reason</p>
            <p className="text-xs text-foreground">{req.reason}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] text-muted-foreground">
              Requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
            </p>
            {ageBadge}
          </div>
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
              onClick={() => { setSelected(req); setApproveOpen(true); }}
              disabled={!!processing}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Approve & Complete
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderRejectedCard = (req: WithdrawalRequest) => {
    const bankLabel = getPayoutLabel(req);
    const ageBadge = getAgeBadge(req.created_at);
    return (
      <div key={req.id} className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserAvatar fullName={req.user?.full_name || ''} avatarUrl={req.user?.avatar_url} size="sm" />
            <div>
              <p className="text-sm font-bold">{req.user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{req.user?.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-black">{formatCurrency(req.amount)}</p>
            <Badge variant="destructive" size="sm">Rejected</Badge>
          </div>
        </div>

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
          </div>
        )}

        {bankLabel && <p className="text-xs text-muted-foreground">{bankLabel}</p>}

        {req.reason && (
          <div className="px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider mb-0.5">Rejection Reason</p>
            <p className="text-xs text-foreground">{req.reason}</p>
          </div>
        )}

        {(req as any).rejection_reason && !(req.reason) && (
          <div className="px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider mb-0.5">Rejection Reason</p>
            <p className="text-xs text-foreground">{(req as any).rejection_reason}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] text-muted-foreground">
              Requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
            </p>
            {ageBadge}
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => { setSelected(req); setApproveOpen(true); }}
            disabled={!!processing}
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Re-Approve & Complete
          </Button>
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
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              Withdrawal Requests
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchRequests}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/50 p-1 rounded-xl mt-2">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pending
              {pendingRequests.length > 0 && (
                <Badge variant="warning" size="sm" className="text-[10px] px-1.5">{pendingRequests.length}</Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'rejected'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Rejected
              {rejectedRequests.length > 0 && (
                <Badge variant="destructive" size="sm" className="text-[10px] px-1.5">{rejectedRequests.length}</Badge>
              )}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === 'pending' ? (
            pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No pending wallet withdrawals
              </p>
            ) : (
              <div className="space-y-2">
                {pendingRequests.map(req => renderPendingCard(req))}
              </div>
            )
          ) : (
            rejectedRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No rejected withdrawals in the last 90 days
              </p>
            ) : (
              <div className="space-y-2">
                {rejectedRequests.map(req => renderRejectedCard(req))}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Approve & Complete Dialog */}
      <AlertDialog open={approveOpen} onOpenChange={(open) => { setApproveOpen(open); if (!open) { setReference(''); setPaymentMethod(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected?.status === 'rejected' ? 'Re-Approve & Complete Withdrawal' : 'Approve & Complete Withdrawal'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                {selected && (
                  <>
                    {selected.status === 'rejected' && (
                      <div className="px-2.5 py-2 rounded-lg bg-warning/10 border border-warning/30">
                        <p className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-0.5">⚠️ Previously Rejected</p>
                        <p className="text-xs text-foreground">This withdrawal was rejected and is being re-approved. Ensure the reason for rejection has been resolved.</p>
                      </div>
                    )}
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-semibold text-foreground">{selected.user?.full_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone</span>
                        <span className="font-mono text-foreground">{selected.user?.phone || '—'}</span>
                      </div>
                      {selected.mobile_money_number && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">MoMo</span>
                          <span className="text-foreground">
                            <span className={`uppercase font-medium ${selected.mobile_money_provider === 'mtn' ? 'text-yellow-600' : 'text-red-500'}`}>
                              {selected.mobile_money_provider || 'MoMo'}
                            </span>
                            {' · '}{selected.mobile_money_number}
                          </span>
                        </div>
                      )}
                      {(selected.mobile_money_name || selected.bank_account_name) && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Recipient</span>
                          <span className="font-semibold text-foreground">{selected.mobile_money_name || selected.bank_account_name}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-black text-foreground">{formatCurrency(selected.amount)}</span>
                      </div>
                    </div>
                    {selected.reason && (
                      <div className="px-2.5 py-2 rounded-lg bg-muted/50 border border-border/50">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Reason</p>
                        <p className="text-xs text-foreground">{selected.reason}</p>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Payment Method Used</p>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mtn_momo">MTN Mobile Money</SelectItem>
                      <SelectItem value="airtel_money">Airtel Money</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    {paymentMethod === 'cash' ? 'Receipt Number' : paymentMethod === 'bank_transfer' ? 'Bank Reference' : 'Transaction ID (TID)'}
                  </p>
                  <Input
                    placeholder={paymentMethod === 'cash' ? 'Enter receipt number' : paymentMethod === 'bank_transfer' ? 'Enter bank reference' : 'Enter TID to confirm payment'}
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="font-mono uppercase"
                  />
                  {reference.length > 0 && reference.trim().length < 3 && (
                    <p className="text-[10px] text-destructive mt-1">Must be at least 3 characters</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={handleApprove}
              disabled={!!processing || reference.trim().length < 3 || !paymentMethod}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processing ? 'Processing...' : selected?.status === 'rejected' ? 'Re-Approve & Complete' : 'Approve & Complete'}
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
