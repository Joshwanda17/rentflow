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
import { Search, CheckCircle2, XCircle, Clock, ArrowDownToLine, ArrowUpFromLine, Wallet, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { RequestDetailSheet } from './RequestDetailSheet';

type QueueType = 'deposits' | 'withdrawals' | 'wallet_ops';

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
          description: `TID: ${d.transaction_id || '—'} · ${d.provider || 'MoMo'}`,
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

  const queues: Record<QueueType, QueueItem[]> = { deposits, withdrawals, wallet_ops: walletOps };
  const isLoading = activeQueue === 'deposits' ? loadingDeposits : activeQueue === 'withdrawals' ? loadingWithdrawals : loadingWalletOps;

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
  }, [activeQueue, search, deposits, withdrawals, walletOps]);

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
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: `bulk_${bulkAction}_${activeQueue}`,
        metadata: { ids, reason: reason || undefined, count: ids.length },
      });

      toast.success(`${bulkAction === 'approve' ? 'Approved' : 'Rejected'} ${ids.length} items`);
      setSelected(new Set());
      setBulkAction(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: [`approval-queue-${activeQueue}`] });
      queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  }, [bulkAction, selected, activeQueue, user, reason, queryClient]);

  const urgencyBg = { green: 'border-l-emerald-500', amber: 'border-l-amber-500', red: 'border-l-destructive' };
  const queueIcon = { deposits: ArrowDownToLine, withdrawals: ArrowUpFromLine, wallet_ops: Wallet };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Approval Queue
            </CardTitle>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setBulkAction('approve')}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve ({selected.size})
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setBulkAction('reject')}>
                    <XCircle className="h-3 w-3 mr-1" /> Reject ({selected.size})
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={activeQueue} onValueChange={(v) => { setActiveQueue(v as QueueType); setSelected(new Set()); }}>
            <TabsList className="h-8">
              <TabsTrigger value="deposits" className="text-xs gap-1 h-7">
                <ArrowDownToLine className="h-3 w-3" /> Deposits
                {deposits.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{deposits.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="withdrawals" className="text-xs gap-1 h-7">
                <ArrowUpFromLine className="h-3 w-3" /> Withdrawals
                {withdrawals.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{withdrawals.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="wallet_ops" className="text-xs gap-1 h-7">
                <Wallet className="h-3 w-3" /> Wallet Ops
                {walletOps.length > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px]">{walletOps.length}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, TID, or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>

          <ScrollArea className="max-h-[500px]">
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {search ? 'No matching items' : 'Queue is clear 🎉'}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 pb-1">
                  <Checkbox checked={selected.size === items.length && items.length > 0} onCheckedChange={toggleAll} />
                  <span className="text-[11px] text-muted-foreground">
                    {selected.size > 0 ? `${selected.size} selected` : `${items.length} pending`}
                  </span>
                </div>
                {items.map((item) => {
                  const Icon = queueIcon[item.type];
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${urgencyBg[item.urgency]} bg-card hover:bg-muted/40 transition-colors`}
                    >
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                      <div className={`p-1.5 rounded-lg ${item.type === 'deposits' ? 'bg-primary/10' : item.type === 'withdrawals' ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
                        <Icon className={`h-3.5 w-3.5 ${item.type === 'deposits' ? 'text-primary' : item.type === 'withdrawals' ? 'text-destructive' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.userName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                        <p className="text-[10px] text-muted-foreground/70">
                          {item.userPhone && `${item.userPhone} · `}
                          {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                          {item.ageHours >= 1 && ` · ${Math.round(item.ageHours)}h ago`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">{formatUGX(item.amount)}</p>
                        <Badge variant="outline" className="text-[9px] px-1">
                          {item.category.replace(/_/g, ' ')}
                        </Badge>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkAction === 'approve' ? '✅ Approve' : '❌ Reject'} {selected.size} item(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Total amount: <strong>{formatUGX(items.filter(i => selected.has(i.id)).reduce((s, i) => s + i.amount, 0))}</strong>
            </p>
            {bulkAction === 'reject' && (
              <Textarea
                placeholder="Reason for rejection (min 10 characters)…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="text-sm"
              />
            )}
            {bulkAction === 'approve' && (
              <Textarea
                placeholder="Optional note…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="text-sm"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBulkAction(null)}>Cancel</Button>
            <Button
              size="sm"
              variant={bulkAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleBulkAction}
              disabled={processing || (bulkAction === 'reject' && reason.length < 10)}
            >
              {processing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm {bulkAction === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
