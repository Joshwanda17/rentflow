import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Banknote, QrCode, Search, CheckCircle2, Loader2, Building2,
  Clock, Smartphone, Wallet, Bell, UserCheck, ArrowRight, Phone, CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

export function AgentCashPayoutsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payoutCode, setPayoutCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedPayout, setVerifiedPayout] = useState<any>(null);

  // Check if this agent is a cashout agent
  const { data: isCashoutAgent } = useQuery({
    queryKey: ['is-cashout-agent', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('cashout_agents')
        .select('*')
        .eq('agent_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // ALL pending/approved withdrawal requests
  const { data: allWithdrawals = [], isLoading: loadingAll } = useQuery({
    queryKey: ['cashout-agent-all-withdrawals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles:user_id(full_name, phone)')
        .in('status', ['pending', 'requested', 'manager_approved', 'cfo_approved', 'approved', 'fin_ops_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isCashoutAgent,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Realtime subscription
  useEffect(() => {
    if (!isCashoutAgent) return;
    const channel = supabase
      .channel('cashout-agent-withdrawals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
        if (payload.eventType === 'INSERT') {
          const newRow = payload.new as any;
          toast.info(`🔔 New withdrawal: ${formatUGX(Number(newRow.amount || 0))} via ${newRow.payout_method || 'wallet'}`, { duration: 6000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isCashoutAgent, qc]);

  // Claim a withdrawal request
  const claimWithdrawal = useMutation({
    mutationFn: async (withdrawalId: string) => {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          assigned_cashout_agent_id: isCashoutAgent?.id,
          dispatched_at: new Date().toISOString(),
        } as any)
        .eq('id', withdrawalId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('✅ Withdrawal claimed — proceed with payout');
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Complete withdrawal via edge function (ledger-backed)
  const completeWithdrawal = useMutation({
    mutationFn: async ({ id, reference, method }: { id: string; reference: string; method: string }) => {
      const { data, error } = await supabase.functions.invoke('approve-withdrawal', {
        body: { withdrawal_id: id, reference: reference.trim(), payment_method: method },
      });
      if (error) throw new Error(error.message || 'Failed to process withdrawal');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`✅ Payout completed — ${formatUGX(data?.amount || 0)} sent`);
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Verify payout code
  const handleVerify = async () => {
    if (!payoutCode.trim()) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase
        .from('payout_codes')
        .select('*, profiles:user_id(full_name, phone)')
        .eq('code', payoutCode.trim().toUpperCase())
        .eq('status', 'pending')
        .maybeSingle();
      if (error) throw error;
      if (!data) { toast.error('Invalid or expired payout code'); setVerifiedPayout(null); return; }
      if (new Date(data.expires_at) < new Date()) { toast.error('This payout code has expired'); setVerifiedPayout(null); return; }
      setVerifiedPayout(data);
      toast.success('Payout code verified! ✅');
    } catch (err: any) { toast.error(err.message); }
    finally { setVerifying(false); }
  };

  // Complete payout via code
  const completePayout = useMutation({
    mutationFn: async (codeId: string) => {
      const { error } = await supabase.from('payout_codes').update({ status: 'paid', paid_by: user!.id, paid_at: new Date().toISOString() }).eq('id', codeId);
      if (error) throw error;
      await supabase.from('audit_logs').insert({ user_id: user!.id, action_type: 'cash_payout_completed', metadata: { payout_code_id: codeId, code: verifiedPayout?.code } });
    },
    onSuccess: () => { toast.success('Cash payout completed! 💰'); setVerifiedPayout(null); setPayoutCode(''); qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isCashoutAgent) return null;

  // Split by method
  const momoWithdrawals = allWithdrawals.filter((w: any) => ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(w.payout_method));
  const bankWithdrawals = allWithdrawals.filter((w: any) => w.payout_method === 'bank_transfer');
  const cashWithdrawals = allWithdrawals.filter((w: any) => ['cash', 'cash_pickup'].includes(w.payout_method) || !w.payout_method);

  // My claimed vs unclaimed
  const myClaimedIds = new Set(allWithdrawals.filter((w: any) => w.assigned_cashout_agent_id === isCashoutAgent?.id).map((w: any) => w.id));
  const totalPending = allWithdrawals.length;

  return (
    <div className="space-y-4">
      {/* Live status banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400">
          <Bell className="h-4 w-4 animate-pulse" />
          <span className="text-xs font-medium">{totalPending} pending withdrawal{totalPending !== 1 ? 's' : ''} — Live updates</span>
        </div>
      )}

      {/* Payout Code Verification */}
      <Card className="border-2 border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            Verify Payout Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter WPO-XXXXX code..."
              value={payoutCode}
              onChange={e => setPayoutCode(e.target.value.toUpperCase())}
              className="text-lg font-mono tracking-wider h-12 text-center"
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
            />
            <Button onClick={handleVerify} disabled={verifying || !payoutCode.trim()} className="h-12 px-6">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {verifiedPayout && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-bold text-green-700">Code Verified</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-muted-foreground text-xs">Name</p><p className="font-medium">{verifiedPayout.profiles?.full_name}</p></div>
                  <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{verifiedPayout.profiles?.phone}</p></div>
                  <div><p className="text-muted-foreground text-xs">Amount</p><p className="font-bold text-lg text-primary">{formatUGX(verifiedPayout.amount)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Expires</p><p className="font-medium">{format(new Date(verifiedPayout.expires_at), 'MMM d, HH:mm')}</p></div>
                </div>
                <Button className="w-full h-12 text-base font-bold" onClick={() => completePayout.mutate(verifiedPayout.id)} disabled={completePayout.isPending}>
                  {completePayout.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-5 w-5 mr-2" />}
                  Confirm Cash Paid — {formatUGX(verifiedPayout.amount)}
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal Requests by channel */}
      <Tabs defaultValue="all">
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1 gap-1">
            <Wallet className="h-3.5 w-3.5" /> All
            {totalPending > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{totalPending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="momo" className="flex-1 gap-1">
            <Smartphone className="h-3.5 w-3.5" /> MoMo
            {momoWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{momoWithdrawals.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="bank" className="flex-1 gap-1">
            <Building2 className="h-3.5 w-3.5" /> Bank
            {bankWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{bankWithdrawals.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="cash" className="flex-1 gap-1">
            <Banknote className="h-3.5 w-3.5" /> Cash
            {cashWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{cashWithdrawals.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {['all', 'momo', 'bank', 'cash'].map(tab => {
          const items = tab === 'all' ? allWithdrawals : tab === 'momo' ? momoWithdrawals : tab === 'bank' ? bankWithdrawals : cashWithdrawals;
          const emptyMsg = tab === 'all' ? 'No pending withdrawals' : `No pending ${tab} payouts`;
          return (
            <TabsContent key={tab} value={tab} className="space-y-2 mt-3">
              {loadingAll ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyMsg}</CardContent></Card>
              ) : (
                items.map((w: any) => (
                  <WithdrawalPayoutCard
                    key={w.id}
                    withdrawal={w}
                    isClaimed={myClaimedIds.has(w.id)}
                    isClaimedByOther={!!w.assigned_cashout_agent_id && w.assigned_cashout_agent_id !== isCashoutAgent?.id}
                    onClaim={() => claimWithdrawal.mutate(w.id)}
                    onComplete={completeWithdrawal.mutate}
                    isClaimPending={claimWithdrawal.isPending}
                    isCompletePending={completeWithdrawal.isPending}
                  />
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function WithdrawalPayoutCard({
  withdrawal,
  isClaimed,
  isClaimedByOther,
  onClaim,
  onComplete,
  isClaimPending,
  isCompletePending,
}: {
  withdrawal: any;
  isClaimed: boolean;
  isClaimedByOther: boolean;
  onClaim: () => void;
  onComplete: (data: { id: string; reference: string; method: string }) => void;
  isClaimPending: boolean;
  isCompletePending: boolean;
}) {
  const [reference, setReference] = useState('');

  const method = withdrawal.payout_method || 'cash';
  const isMoMo = ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(method);
  const isBank = method === 'bank_transfer';
  const isCash = !isMoMo && !isBank;

  const borderColor = isBank ? 'border-l-blue-500' : isMoMo ? 'border-l-yellow-500' : 'border-l-green-600';
  const methodLabel = isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash';
  const MethodIcon = isBank ? Building2 : isMoMo ? Smartphone : Banknote;

  const recipientName = withdrawal.profiles?.full_name || 'Unknown';
  const recipientPhone = withdrawal.profiles?.phone || '—';

  return (
    <Card className={`border-l-4 ${borderColor} ${isClaimedByOther ? 'opacity-50' : ''}`}>
      <CardContent className="p-3 space-y-2.5">
        {/* Header: Recipient + Amount */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-sm">{recipientName}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Phone className="h-3 w-3" />
              {recipientPhone}
            </div>
          </div>
          <div className="text-right">
            <p className="font-black text-lg text-primary">{formatUGX(withdrawal.amount)}</p>
            <Badge variant="outline" className="text-[9px] gap-1">
              <MethodIcon className="h-3 w-3" />
              {methodLabel}
            </Badge>
          </div>
        </div>

        {/* Recipient Payout Details — always visible */}
        <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5 text-xs">
          <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <CreditCard className="h-3 w-3 inline mr-1" />
            Payout Details
          </p>
          {isBank && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{withdrawal.bank_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account #</span><span className="font-mono font-bold">{withdrawal.bank_account_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account Name</span><span className="font-medium">{withdrawal.bank_account_name || '—'}</span></div>
            </>
          )}
          {isMoMo && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="font-medium">{withdrawal.mobile_money_provider || method}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Number</span><span className="font-mono font-bold">{withdrawal.mobile_money_number || recipientPhone}</span></div>
              {withdrawal.mobile_money_name && (
                <div className="flex justify-between"><span className="text-muted-foreground">Name on MoMo</span><span className="font-medium">{withdrawal.mobile_money_name}</span></div>
              )}
            </>
          )}
          {isCash && (
            <div className="flex justify-between"><span className="text-muted-foreground">Contact</span><span className="font-mono font-bold">{recipientPhone}</span></div>
          )}
        </div>

        {/* Status + Time */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[9px]">{withdrawal.status?.replace(/_/g, ' ')}</Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(withdrawal.created_at), 'MMM d, HH:mm')}
          </span>
          {isClaimed && (
            <Badge className="text-[9px] bg-green-600 gap-1">
              <UserCheck className="h-3 w-3" />
              Claimed by you
            </Badge>
          )}
          {isClaimedByOther && (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">Claimed by another agent</Badge>
          )}
        </div>

        {withdrawal.reason && (
          <p className="text-[10px] text-muted-foreground italic">"{withdrawal.reason}"</p>
        )}

        {/* Actions */}
        {isClaimedByOther ? null : !isClaimed ? (
          /* Step 1: Claim */
          <Button
            className="w-full h-10 gap-2 font-semibold"
            variant="outline"
            onClick={onClaim}
            disabled={isClaimPending}
          >
            {isClaimPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserCheck className="h-4 w-4" /> Claim This Withdrawal</>}
          </Button>
        ) : (
          /* Step 2: Enter reference + confirm payout */
          <div className="space-y-2 pt-1 border-t border-border/50">
            <p className="text-[10px] font-semibold text-primary">
              <ArrowRight className="h-3 w-3 inline mr-1" />
              {isBank ? 'Enter bank transfer reference after depositing' : isMoMo ? 'Enter MoMo TID after sending' : 'Enter cash voucher / receipt number'}
            </p>
            <div className="flex gap-2">
              <Input
                placeholder={isBank ? 'Bank reference / TID...' : isMoMo ? 'MoMo Transaction ID...' : 'Cash voucher number...'}
                value={reference}
                onChange={e => setReference(e.target.value)}
                className="text-xs h-10 font-mono"
              />
              <Button
                className="h-10 gap-1 px-4"
                disabled={!reference.trim() || reference.trim().length < 3 || isCompletePending}
                onClick={() => onComplete({ id: withdrawal.id, reference, method: methodLabel })}
              >
                {isCompletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirm Paid
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
