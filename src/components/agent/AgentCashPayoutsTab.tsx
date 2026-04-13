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
import { Banknote, QrCode, Search, CheckCircle2, Loader2, Building2, Clock, Smartphone, Wallet, Bell } from 'lucide-react';
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

  // ALL pending/approved withdrawal requests — cash-out agents see everything
  const { data: allWithdrawals = [], isLoading: loadingAll } = useQuery({
    queryKey: ['cashout-agent-all-withdrawals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles:user_id(full_name, phone)')
        .in('status', ['pending', 'requested', 'manager_approved', 'cfo_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isCashoutAgent,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Pending cash withdrawal requests (with payout codes) — legacy code verification
  const { data: cashPayouts = [], isLoading: loadingCash } = useQuery({
    queryKey: ['agent-cash-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_codes')
        .select('*, profiles:user_id(full_name, phone), withdrawal_requests:withdrawal_request_id(amount, payout_method, agent_location, status)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isCashoutAgent,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  // ── Realtime subscription for withdrawal_requests ──
  useEffect(() => {
    if (!isCashoutAgent) return;

    const channel = supabase
      .channel('cashout-agent-withdrawals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
        },
        (payload) => {
          // Refresh all withdrawal queries on any change
          qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
          qc.invalidateQueries({ queryKey: ['agent-cash-payouts'] });

          // Toast on new inserts
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as any;
            const method = newRow.payout_method || 'wallet';
            const amount = Number(newRow.amount || 0);
            toast.info(`🔔 New withdrawal request: ${formatUGX(amount)} via ${method}`, {
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCashoutAgent, qc]);

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
      if (!data) {
        toast.error('Invalid or expired payout code');
        setVerifiedPayout(null);
        return;
      }
      
      if (new Date(data.expires_at) < new Date()) {
        toast.error('This payout code has expired');
        setVerifiedPayout(null);
        return;
      }
      
      setVerifiedPayout(data);
      toast.success('Payout code verified! ✅');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  // Complete payout via code
  const completePayout = useMutation({
    mutationFn: async (codeId: string) => {
      const { error } = await supabase
        .from('payout_codes')
        .update({
          status: 'paid',
          paid_by: user!.id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', codeId);
      if (error) throw error;
      
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cash_payout_completed',
        metadata: { payout_code_id: codeId, code: verifiedPayout?.code },
      });
    },
    onSuccess: () => {
      toast.success('Cash payout completed! 💰');
      setVerifiedPayout(null);
      setPayoutCode('');
      qc.invalidateQueries({ queryKey: ['agent-cash-payouts'] });
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Complete any withdrawal (bank, MoMo, cash) with a reference
  const completeWithdrawal = useMutation({
    mutationFn: async ({ id, reference, method }: { id: string; reference: string; method: string }) => {
      // Use the approve-withdrawal edge function for proper ledger handling
      const { data, error } = await supabase.functions.invoke('approve-withdrawal', {
        body: {
          withdrawal_id: id,
          reference: reference.trim(),
          payment_method: method,
        },
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

  if (!isCashoutAgent) {
    return null;
  }

  // Split withdrawals by method
  const momoWithdrawals = allWithdrawals.filter((w: any) =>
    ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(w.payout_method)
  );
  const bankWithdrawals = allWithdrawals.filter((w: any) => w.payout_method === 'bank_transfer');
  const cashWithdrawals = allWithdrawals.filter((w: any) =>
    ['cash', 'cash_pickup'].includes(w.payout_method) || (!w.payout_method)
  );

  const totalPending = allWithdrawals.length;

  return (
    <div className="space-y-4">
      {/* Live status banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400">
          <Bell className="h-4 w-4 animate-pulse" />
          <span className="text-xs font-medium">{totalPending} pending withdrawal{totalPending !== 1 ? 's' : ''} — Live updates enabled</span>
        </div>
      )}

      {/* Payout Code Verification - PRIMARY ACTION */}
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
                  <div>
                    <p className="text-muted-foreground text-xs">Name</p>
                    <p className="font-medium">{verifiedPayout.profiles?.full_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-medium">{verifiedPayout.profiles?.phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Amount</p>
                    <p className="font-bold text-lg text-primary">{formatUGX(verifiedPayout.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Expires</p>
                    <p className="font-medium">{format(new Date(verifiedPayout.expires_at), 'MMM d, HH:mm')}</p>
                  </div>
                </div>
                <Button
                  className="w-full h-12 text-base font-bold"
                  onClick={() => completePayout.mutate(verifiedPayout.id)}
                  disabled={completePayout.isPending}
                >
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
            {(cashWithdrawals.length + cashPayouts.length) > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{cashWithdrawals.length + cashPayouts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ALL tab */}
        <TabsContent value="all" className="space-y-2 mt-3">
          {loadingAll ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : allWithdrawals.length === 0 ? (
            <EmptyState message="No pending withdrawal requests" />
          ) : (
            allWithdrawals.map((w: any) => (
              <WithdrawalPayoutCard
                key={w.id}
                withdrawal={w}
                onComplete={completeWithdrawal.mutate}
                isPending={completeWithdrawal.isPending}
              />
            ))
          )}
        </TabsContent>

        {/* MoMo tab */}
        <TabsContent value="momo" className="space-y-2 mt-3">
          {loadingAll ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : momoWithdrawals.length === 0 ? (
            <EmptyState message="No pending MoMo payouts" />
          ) : (
            momoWithdrawals.map((w: any) => (
              <WithdrawalPayoutCard
                key={w.id}
                withdrawal={w}
                onComplete={completeWithdrawal.mutate}
                isPending={completeWithdrawal.isPending}
              />
            ))
          )}
        </TabsContent>

        {/* Bank tab */}
        <TabsContent value="bank" className="space-y-2 mt-3">
          {loadingAll ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : bankWithdrawals.length === 0 ? (
            <EmptyState message="No pending bank payouts" />
          ) : (
            bankWithdrawals.map((w: any) => (
              <WithdrawalPayoutCard
                key={w.id}
                withdrawal={w}
                onComplete={completeWithdrawal.mutate}
                isPending={completeWithdrawal.isPending}
              />
            ))
          )}
        </TabsContent>

        {/* Cash tab */}
        <TabsContent value="cash" className="space-y-2 mt-3">
          {(loadingAll || loadingCash) ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (cashWithdrawals.length + cashPayouts.length) === 0 ? (
            <EmptyState message="No pending cash payouts" />
          ) : (
            <>
              {cashPayouts.map((p: any) => (
                <Card key={p.id} className="border-l-4 border-l-orange-500">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{p.profiles?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{p.profiles?.phone}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatUGX(p.amount)}</p>
                        <Badge variant="outline" className="text-[9px] font-mono">{p.code}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Expires {format(new Date(p.expires_at), 'MMM d, HH:mm')}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {cashWithdrawals.map((w: any) => (
                <WithdrawalPayoutCard
                  key={w.id}
                  withdrawal={w}
                  onComplete={completeWithdrawal.mutate}
                  isPending={completeWithdrawal.isPending}
                />
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

function WithdrawalPayoutCard({
  withdrawal,
  onComplete,
  isPending,
}: {
  withdrawal: any;
  onComplete: (data: { id: string; reference: string; method: string }) => void;
  isPending: boolean;
}) {
  const [reference, setReference] = useState('');
  const [expanded, setExpanded] = useState(false);

  const method = withdrawal.payout_method || 'cash';
  const isMoMo = ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(method);
  const isBank = method === 'bank_transfer';

  const borderColor = isBank ? 'border-l-blue-500' : isMoMo ? 'border-l-yellow-500' : 'border-l-orange-500';
  const methodLabel = isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash';
  const MethodIcon = isBank ? Building2 : isMoMo ? Smartphone : Banknote;
  const refPlaceholder = isBank ? 'Bank reference / TID...' : isMoMo ? 'MoMo TID...' : 'Cash receipt ref...';

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div>
            <p className="font-semibold text-sm">{withdrawal.profiles?.full_name || 'User'}</p>
            <p className="text-xs text-muted-foreground">{withdrawal.profiles?.phone}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-primary">{formatUGX(withdrawal.amount)}</p>
            <Badge variant="outline" className="text-[9px] gap-1">
              <MethodIcon className="h-3 w-3" />
              {methodLabel}
            </Badge>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[9px]">{withdrawal.status?.replace(/_/g, ' ')}</Badge>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(withdrawal.created_at), 'MMM d, HH:mm')}
          </span>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="text-xs space-y-1 pt-1 border-t border-border/50">
            {isBank && (
              <>
                <p><span className="text-muted-foreground">Bank:</span> {withdrawal.bank_name || '—'}</p>
                <p><span className="text-muted-foreground">Account:</span> {withdrawal.bank_account_number || '—'}</p>
                <p><span className="text-muted-foreground">Name:</span> {withdrawal.bank_account_name || '—'}</p>
              </>
            )}
            {isMoMo && (
              <>
                <p><span className="text-muted-foreground">Phone:</span> {withdrawal.mobile_money_number || withdrawal.profiles?.phone || '—'}</p>
                <p><span className="text-muted-foreground">Provider:</span> {withdrawal.mobile_money_provider || method}</p>
              </>
            )}
            {withdrawal.notes && (
              <p><span className="text-muted-foreground">Notes:</span> {withdrawal.notes}</p>
            )}
          </div>
        )}

        {/* Action: enter reference and confirm payout */}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder={refPlaceholder}
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="text-xs h-9"
          />
          <Button
            size="sm"
            className="h-9 gap-1"
            disabled={!reference.trim() || reference.trim().length < 3 || isPending}
            onClick={() => onComplete({ id: withdrawal.id, reference, method: methodLabel })}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Pay
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
