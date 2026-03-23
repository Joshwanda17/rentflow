import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatUGX } from '@/lib/rentCalculations';
import { format, differenceInHours } from 'date-fns';
import { Search, CheckCircle2, XCircle, Clock, ArrowDownToLine, ArrowUpFromLine, Wallet, Loader2, Hash, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { RequestDetailSheet } from './RequestDetailSheet';

type QueueType = 'deposits' | 'withdrawals' | 'wallet_withdrawals' | 'wallet_ops';

interface QueueItem {
  id: string;
  type: QueueType;
  userId: string | null;
  userName: string;
  userPhone: string;
  amount: number;
  description: string;
  category: string;
  createdAt: string;
  ageHours: number;
  urgency: 'green' | 'amber' | 'red';
  rawData: any;
  payoutDetails?: {
    method: string;
    provider?: string;
    number?: string;
    name?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
    agentLocation?: string;
    status?: string;
  };
}

export function ApprovalQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeQueue, setActiveQueue] = useState<QueueType>('deposits');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [inspectItem, setInspectItem] = useState<QueueItem | null>(null);

  const { data: deposits = [], isLoading: loadingDeposits } = useQuery({
    queryKey: ['approval-queue-deposits'],
    queryFn: async () => {
      const { data } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200);
      if (!data?.length) return [];

      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pm = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(d => {
        const profile = pm.get(d.user_id);
        const ageH = differenceInHours(new Date(), new Date(d.created_at));
        return {
          id: d.id,
          type: 'deposits' as QueueType,
          userId: d.user_id,
          userName: profile?.full_name || 'Unknown',
          userPhone: profile?.phone || '',
          amount: d.amount,
          description: `${d.status === 'approved' ? `TID: ${d.transaction_id || '—'} · ` : ''}${d.provider || 'MoMo'}`,
          category: 'deposit',
          createdAt: d.created_at,
          ageHours: ageH,
          urgency: ageH < 1 ? 'green' as const : ageH < 4 ? 'amber' as const : 'red' as const,
          rawData: d,
        };
      });
    },
    staleTime: 15000,
  });

  const { data: withdrawals = [], isLoading: loadingWithdrawals } = useQuery({
    queryKey: ['approval-queue-withdrawals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('investment_withdrawal_requests')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
        .limit(200);
      if (!data?.length) return [];

      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pm = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(w => {
        const profile = pm.get(w.user_id);
        const ageH = differenceInHours(new Date(), new Date(w.requested_at));
        return {
          id: w.id,
          type: 'withdrawals' as QueueType,
          userId: w.user_id,
          userName: profile?.full_name || 'Unknown',
          userPhone: profile?.phone || '',
          amount: w.amount,
          description: w.reason || 'Withdrawal request',
          category: 'withdrawal',
          createdAt: w.requested_at,
          ageHours: ageH,
          urgency: ageH < 1 ? 'green' as const : ageH < 4 ? 'amber' as const : 'red' as const,
          rawData: w,
        };
      });
    },
    staleTime: 15000,
  });

  // Wallet withdrawal requests (from withdrawal_requests table)
  const { data: walletWithdrawals = [], isLoading: loadingWalletWithdrawals } = useQuery({
    queryKey: ['approval-queue-wallet-withdrawals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', ['requested', 'manager_approved', 'cfo_approved'])
        .order('created_at', { ascending: true })
        .limit(200);
      if (!data?.length) return [];

      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pm = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(w => {
        const profile = pm.get(w.user_id);
        const ageH = differenceInHours(new Date(), new Date(w.created_at));
        const method = w.payout_method || 'mobile_money';
        const payoutLabel = method === 'bank_transfer'
          ? `🏦 Bank: ${w.bank_name || '—'} · ${w.bank_account_number || '—'}`
          : method === 'cash'
          ? `💵 Cash at: ${w.agent_location || 'Agent'}`
          : `📱 ${w.mobile_money_provider || 'MoMo'}: ${w.mobile_money_number || '—'}`;

        return {
          id: w.id,
          type: 'wallet_withdrawals' as QueueType,
          userId: w.user_id,
          userName: profile?.full_name || 'Unknown',
          userPhone: profile?.phone || '',
          amount: w.amount,
          description: payoutLabel,
          category: 'wallet_withdrawal',
          createdAt: w.created_at,
          ageHours: ageH,
          urgency: ageH < 1 ? 'green' as const : ageH < 4 ? 'amber' as const : 'red' as const,
          rawData: w,
          payoutDetails: {
            method,
            provider: w.mobile_money_provider || undefined,
            number: w.mobile_money_number || undefined,
            name: w.mobile_money_name || undefined,
            bankName: w.bank_name || undefined,
            bankAccountNumber: w.bank_account_number || undefined,
            bankAccountName: w.bank_account_name || undefined,
            agentLocation: w.agent_location || undefined,
            status: w.status,
          },
        };
      });
    },
    staleTime: 15000,
  });

  const { data: walletOps = [], isLoading: loadingWalletOps } = useQuery({
    queryKey: ['approval-queue-wallet-ops'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pending_wallet_operations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200);
      if (!data?.length) return [];

      const userIds = [...new Set(data.filter(d => d.user_id).map(d => d.user_id!))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds.length ? userIds : ['__none__']);
      const pm = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(w => {
        const profile = w.user_id ? pm.get(w.user_id) : null;
        const ageH = differenceInHours(new Date(), new Date(w.created_at));
        return {
          id: w.id,
          type: 'wallet_ops' as QueueType,
          userId: w.user_id,
          userName: profile?.full_name || 'Pending Activation',
          userPhone: profile?.phone || '',
          amount: w.amount,
          description: w.description || w.category,
          category: w.category,
          createdAt: w.created_at,
          ageHours: ageH,
          urgency: ageH < 1 ? 'green' as const : ageH < 4 ? 'amber' as const : 'red' as const,
          rawData: w,
        };
      });
    },
    staleTime: 15000,
  });

  const queues: Record<QueueType, QueueItem[]> = { deposits, withdrawals, wallet_withdrawals: walletWithdrawals, wallet_ops: walletOps };
  const isLoading = activeQueue === 'deposits' ? loadingDeposits : activeQueue === 'withdrawals' ? loadingWithdrawals : activeQueue === 'wallet_withdrawals' ? loadingWalletWithdrawals : loadingWalletOps;

  const items = useMemo(() => {
    let list = queues[activeQueue];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.userName.toLowerCase().includes(q) ||
        i.userPhone.includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.id.startsWith(q)
      );
    }
    return list;
  }, [activeQueue, search, deposits, withdrawals, walletWithdrawals, walletOps]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  };

  const handleBulkAction = useCallback(async () => {
    if (!bulkAction || selected.size === 0 || !user) return;
    if (bulkAction === 'reject' && reason.length < 10) {
      toast.error('Rejection reason must be at least 10 characters');
      return;
    }

    setProcessing(true);
    try {
      const ids = Array.from(selected);

      if (activeQueue === 'deposits') {
        const status = bulkAction === 'approve' ? 'approved' : 'rejected';
        const updateFields: any = {
          status,
          processed_by: user.id,
          ...(bulkAction === 'approve' ? { approved_at: new Date().toISOString() } : { rejected_at: new Date().toISOString(), rejection_reason: reason }),
        };
        const { error } = await supabase.from('deposit_requests').update(updateFields).in('id', ids);
        if (error) throw error;
      } else if (activeQueue === 'wallet_ops') {
        // Use the approve-wallet-operation edge function for proper ledger entries
        const response = await supabase.functions.invoke('approve-wallet-operation', {
          body: { ids, action: bulkAction, reason: bulkAction === 'reject' ? reason : undefined },
        });
        if (response.error) throw response.error;
      } else if (activeQueue === 'withdrawals') {
        const status = bulkAction === 'approve' ? 'approved' : 'rejected';
        const { error } = await supabase.from('investment_withdrawal_requests')
          .update({
            status,
            processed_by: user.id,
            processed_at: new Date().toISOString(),
            ...(bulkAction === 'reject' ? { rejection_reason: reason } : {}),
          })
          .in('id', ids);
        if (error) throw error;
      } else if (activeQueue === 'wallet_withdrawals') {
        // For wallet withdrawals, update manager_approved status
        const updateFields: Record<string, unknown> = {
          manager_approved_by: user.id,
          manager_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (bulkAction === 'approve') {
          updateFields.status = 'manager_approved';
        } else {
          updateFields.status = 'rejected';
          updateFields.rejection_reason = reason;
        }
        const { error } = await supabase.from('withdrawal_requests')
          .update(updateFields)
          .in('id', ids);
        if (error) throw error;
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: `bulk_${bulkAction}_${activeQueue}`,
        metadata: { ids, reason: reason || undefined, count: ids.length },
      });

      toast.success(`${bulkAction === 'approve' ? 'Approved' : 'Rejected'} ${ids.length} items`);

      // Optimistically remove processed items from the queue instantly
      const cacheKey = `approval-queue-${activeQueue}`;
      queryClient.setQueryData<QueueItem[]>([cacheKey], (old) =>
        (old || []).filter(item => !ids.includes(item.id))
      );

      setSelected(new Set());
      setBulkAction(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: [cacheKey] });
      queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  }, [bulkAction, selected, activeQueue, user, reason, queryClient]);

  const urgencyBg = { green: 'border-l-emerald-500', amber: 'border-l-amber-500', red: 'border-l-destructive' };
  const queueIcon: Record<QueueType, typeof ArrowDownToLine> = { deposits: ArrowDownToLine, withdrawals: ArrowUpFromLine, wallet_withdrawals: Banknote, wallet_ops: Wallet };

  return (
    <>
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 justify-between">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Approval Queue
            </CardTitle>
            <div className="flex items-center gap-2">
              {selected.size > 0 && activeQueue !== 'deposits' && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="default" className="h-7 text-[11px] sm:text-xs px-2 sm:px-3" onClick={() => setBulkAction('approve')}>
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> Approve ({selected.size})
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-[11px] sm:text-xs px-2 sm:px-3" onClick={() => setBulkAction('reject')}>
                    <XCircle className="h-3 w-3 mr-0.5" /> Reject ({selected.size})
                  </Button>
                </div>
              )}
              {activeQueue === 'deposits' && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Hash className="h-3 w-3" /> Review only — approve via TID
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6">
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-none">
            <Tabs value={activeQueue} onValueChange={(v) => { setActiveQueue(v as QueueType); setSelected(new Set()); }}>
              <TabsList className="h-8 w-max sm:w-auto">
                <TabsTrigger value="deposits" className="text-[10px] sm:text-xs gap-1 h-7 px-2 sm:px-3">
                  <ArrowDownToLine className="h-3 w-3" /> Deposits
                  {deposits.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{deposits.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="wallet_withdrawals" className="text-[10px] sm:text-xs gap-1 h-7 px-2 sm:px-3">
                  <Banknote className="h-3 w-3" /> Cash Out
                  {walletWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{walletWithdrawals.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="wallet_ops" className="text-[10px] sm:text-xs gap-1 h-7 px-2 sm:px-3">
                  <Wallet className="h-3 w-3" /> Wallet Ops
                  {walletOps.length > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px]">{walletOps.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="withdrawals" className="text-[10px] sm:text-xs gap-1 h-7 px-2 sm:px-3">
                  <ArrowUpFromLine className="h-3 w-3" /> Invest W/D
                  {withdrawals.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{withdrawals.length}</Badge>}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, TID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>

          <ScrollArea className="max-h-[60vh] sm:max-h-[500px]">
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {search ? 'No matching items' : 'Queue is clear 🎉'}
              </div>
            ) : (
              <div className="space-y-1">
                {activeQueue !== 'deposits' ? (
                  <div className="flex items-center gap-2 px-2 pb-1">
                    <Checkbox checked={selected.size === items.length && items.length > 0} onCheckedChange={toggleAll} />
                    <span className="text-[11px] text-muted-foreground">
                      {selected.size > 0 ? `${selected.size} selected` : `${items.length} pending`}
                    </span>
                  </div>
                ) : (
                  <div className="px-2 pb-1">
                    <span className="text-[11px] text-muted-foreground">{items.length} pending — use TID tab to verify & approve</span>
                  </div>
                )}
                {items.map((item) => {
                  const Icon = queueIcon[item.type];
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start sm:items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border-l-4 ${urgencyBg[item.urgency]} bg-card hover:bg-muted/40 transition-colors cursor-pointer`}
                      onClick={() => setInspectItem(item)}
                    >
                      {activeQueue !== 'deposits' && (
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 sm:mt-0 shrink-0"
                        />
                      )}
                      <div className={`p-1 sm:p-1.5 rounded-lg shrink-0 ${item.type === 'deposits' ? 'bg-primary/10' : item.type === 'wallet_withdrawals' ? 'bg-orange-500/10' : item.type === 'withdrawals' ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
                        <Icon className={`h-3 sm:h-3.5 w-3 sm:w-3.5 ${item.type === 'deposits' ? 'text-primary' : item.type === 'wallet_withdrawals' ? 'text-orange-600' : item.type === 'withdrawals' ? 'text-destructive' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-1">
                          <p className="text-xs sm:text-sm font-medium truncate">{item.userName}</p>
                          <p className="text-xs sm:text-sm font-bold tabular-nums shrink-0">{formatUGX(item.amount)}</p>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">{item.description}</p>
                        {item.payoutDetails?.status && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] mt-0.5">
                            {item.payoutDetails.status.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground/70">
                          {item.userPhone && `${item.userPhone} · `}
                          {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                          {item.ageHours >= 1 && ` · ${Math.round(item.ageHours)}h`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Bulk Action Dialog */}
      <Dialog open={!!bulkAction} onOpenChange={() => { setBulkAction(null); setReason(''); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">
              {bulkAction === 'approve' ? '✅ Approve' : '❌ Reject'} {selected.size} item(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-muted-foreground">
              Total: <strong>{formatUGX(items.filter(i => selected.has(i.id)).reduce((s, i) => s + i.amount, 0))}</strong>
            </p>
            {bulkAction === 'reject' && (
              <Textarea
                placeholder="Reason for rejection (min 10 characters)…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="text-sm min-h-[80px]"
              />
            )}
            {bulkAction === 'approve' && (
              <Textarea
                placeholder="Optional note…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="text-sm min-h-[60px]"
              />
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkAction(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button
              size="sm"
              variant={bulkAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleBulkAction}
              disabled={processing || (bulkAction === 'reject' && reason.length < 10)}
              className="w-full sm:w-auto"
            >
              {processing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm {bulkAction === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Drill-Down Sheet */}
      <RequestDetailSheet
        open={!!inspectItem}
        onOpenChange={(open) => !open && setInspectItem(null)}
        userId={inspectItem?.userId || null}
        requestType={inspectItem?.type || 'deposits'}
        requestData={inspectItem?.rawData}
      />
    </>
  );
}
