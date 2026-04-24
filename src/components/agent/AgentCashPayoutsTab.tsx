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
  Smartphone, Wallet, Bell, TrendingUp, Clock, Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { WithdrawalPayoutCard } from '@/components/withdrawals/WithdrawalPayoutCard';
import { useAgentCapabilities } from '@/hooks/useAgentCapabilities';

export function AgentCashPayoutsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payoutCode, setPayoutCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedPayout, setVerifiedPayout] = useState<any>(null);
  const { has, isLoading: capsLoading } = useAgentCapabilities();

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
  // NOTE: no FK exists between withdrawal_requests.user_id and profiles.id,
  // so we cannot use a PostgREST embed. We fetch profiles separately and join client-side.
  const { data: allWithdrawals = [], isLoading: loadingAll } = useQuery({
    queryKey: ['cashout-agent-all-withdrawals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', ['pending', 'requested', 'manager_approved', 'cfo_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) return rows;

      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const map = new Map((profs || []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, profiles: map.get(r.user_id) || null }));
    },
    enabled: !!isCashoutAgent,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Daily stats: ONLY count actual cash payouts handled by THIS cash-out agent today.
  // Sources counted:
  //   1. payout_codes marked 'paid' by this agent (cash pickup via WPO code)
  //   2. withdrawal_requests assigned to this cashout agent and completed today
  // We DO NOT include withdrawals where this user is merely 'processed_by' through
  // other approval flows — that would falsely inflate the cash-paid figure.
  const { data: dailyStats } = useQuery({
    queryKey: ['cashout-agent-daily-stats', user?.id, isCashoutAgent?.id],
    queryFn: async () => {
      if (!user || !isCashoutAgent?.id) return { codesCount: 0, totalAmount: 0, avgMinutes: 0 };
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startIso = startOfDay.toISOString();

      const { data: codes } = await supabase
        .from('payout_codes')
        .select('amount, created_at, paid_at')
        .eq('paid_by', user.id)
        .eq('status', 'paid')
        .gte('paid_at', startIso);

      // Only count withdrawals this agent has actually CONFIRMED PAID
      // (status='completed' + processed_by=self + processed_at set today).
      // A "claim" only sets assigned_cashout_agent_id/dispatched_at — it must NEVER count here.
      const { data: wreqs } = await supabase
        .from('withdrawal_requests')
        .select('amount, created_at, processed_at, payout_method, status, processed_by')
        .eq('assigned_cashout_agent_id', isCashoutAgent.id)
        .eq('processed_by', user.id)
        .eq('status', 'completed')
        .in('payout_method', ['cash', 'cash_pickup'])
        .not('processed_at', 'is', null)
        .gte('processed_at', startIso);

      const rows = [
        ...(codes || []).map((r: any) => ({ amount: Number(r.amount || 0), created_at: r.created_at, finished_at: r.paid_at })),
        ...(wreqs || []).map((r: any) => ({ amount: Number(r.amount || 0), created_at: r.created_at, finished_at: r.processed_at })),
      ];

      const codesCount = rows.length;
      const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
      const durations = rows
        .filter(r => r.created_at && r.finished_at)
        .map(r => (new Date(r.finished_at).getTime() - new Date(r.created_at).getTime()) / 60000);
      const avgMinutes = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

      return { codesCount, totalAmount, avgMinutes };
    },
    enabled: !!user && !!isCashoutAgent?.id,
    staleTime: 60_000,
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

  // Auto-release stale claims (>10min) — client-side ticker so the UI updates
  // immediately even between cron runs. Refreshes the list every 30s while open.
  useEffect(() => {
    if (!isCashoutAgent) return;
    const tick = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    }, 30_000);
    return () => clearInterval(tick);
  }, [isCashoutAgent, qc]);

  // Claim a withdrawal request — ATOMIC: only succeeds if no one else has claimed it.
  // The `.is('assigned_cashout_agent_id', null)` guard makes the UPDATE a single-row
  // race-safe operation. If two agents click "Claim" at the same instant, only the
  // first transaction commits; the second matches 0 rows and we surface a clear error.
  const claimWithdrawal = useMutation({
    mutationFn: async (withdrawalId: string) => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .update({
          assigned_cashout_agent_id: isCashoutAgent?.id,
          dispatched_at: new Date().toISOString(),
        } as any)
        .eq('id', withdrawalId)
        .is('assigned_cashout_agent_id', null) // race guard
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Already claimed by another agent — refreshing queue');
      }
    },
    onSuccess: () => {
      toast.success('✅ Withdrawal claimed — proceed with payout');
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    },
    onError: (e: any) => {
      toast.error(e.message);
      // Refresh so the lost-race row disappears from this agent's view immediately.
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    },
  });

  // Complete withdrawal via edge function (ledger-backed)
  const completeWithdrawal = useMutation({
    mutationFn: async ({ id, reference, method }: { id: string; reference: string; method: string }) => {
      const { data, error } = await supabase.functions.invoke('approve-withdrawal', {
        body: { withdrawal_id: id, reference: reference.trim(), payment_method: method },
      });
      if (error || data?.error) {
        const msg = await extractEdgeFunctionError({ data, error }, 'Failed to process withdrawal');
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (data) => {
      const commission = Number(data?.cashout_commission || 0);
      const baseMsg = `✅ Payout completed — ${formatUGX(data?.amount || 0)} sent`;
      toast.success(commission > 0 ? `${baseMsg} · You earned ${formatUGX(commission)} (1%)` : baseMsg);
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

  // Capability gate: must hold `process_cash_out` AND have an active cashout_agents row.
  // Capability is auto-granted by trigger when an active cashout_agents record exists,
  // and revoked when deactivated — so this is a defense-in-depth check.
  if (capsLoading) return null;
  if (!isCashoutAgent || !has('process_cash_out')) return null;

  // My ACTIVE claims (claimed by me, awaiting my confirmation) — shown separately
  // at the top so I can complete them. They are EXCLUDED from the main queue and
  // its pending count to prevent double-payment by me or Financial Ops.
  const myActiveClaims = allWithdrawals.filter(
    (w: any) => w.assigned_cashout_agent_id === isCashoutAgent?.id,
  );

  // Available queue: only UNCLAIMED withdrawals. Items claimed by anyone (me or
  // another agent) are hidden until either confirmed paid (gone forever) or the
  // 10-minute cron auto-releases them back here.
  const availableWithdrawals = allWithdrawals.filter(
    (w: any) => !w.assigned_cashout_agent_id,
  );

  // Split by method (queue only)
  const momoWithdrawals = availableWithdrawals.filter((w: any) => ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(w.payout_method));
  const bankWithdrawals = availableWithdrawals.filter((w: any) => w.payout_method === 'bank_transfer');
  const cashWithdrawals = availableWithdrawals.filter((w: any) => ['cash', 'cash_pickup'].includes(w.payout_method) || !w.payout_method);

  const myClaimedIds = new Set(myActiveClaims.map((w: any) => w.id));
  const totalPending = availableWithdrawals.length;

  return (
    <div className="space-y-4">
      {/* Role identity banner */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
        <Banknote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-[11px] text-foreground/80 leading-snug">
          You are operating as a <span className="font-semibold text-primary">Merchant Agent</span>. You execute user withdrawal payouts via <span className="font-medium">Mobile Money, Bank, or Cash</span> — claim a request, send the money externally, then enter the proof (TID or payout code) to confirm. Financial Ops shares this queue and handles exceptions &amp; high-value payouts.
        </div>
      </div>

      {/* Daily summary */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Today's Merchant Payouts
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 pt-0">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Hash className="h-3 w-3" /> Payouts completed
            </div>
            <div className="text-lg font-bold text-foreground">{dailyStats?.codesCount ?? 0}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Amount paid
            </div>
            <div className="text-lg font-bold text-primary">{formatUGX(dailyStats?.totalAmount ?? 0)}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" /> Avg time
            </div>
            <div className="text-lg font-bold text-foreground">
              {dailyStats?.avgMinutes ? `${Math.round(dailyStats.avgMinutes)}m` : '—'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live status banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400">
          <Bell className="h-4 w-4 animate-pulse" />
          <span className="text-xs font-medium">{totalPending} pending withdrawal{totalPending !== 1 ? 's' : ''} — Live updates</span>
        </div>
      )}

      {/* Payout Code Verification — for users who came in person with a WPO code */}
      <Card className="border-2 border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            Verify Cash Pickup Code (optional)
          </CardTitle>
          <p className="text-[10px] text-muted-foreground mt-1">Use this only when a user came in person with a pre-generated WPO-XXXXX cash pickup code. For Mobile Money, Bank, or coordinated cash payouts, claim from the queue below instead.</p>
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

      {myActiveClaims.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5" />
              My Active Claims · {myActiveClaims.length} · 10 min to confirm
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myActiveClaims.map((w: any) => (
              <WithdrawalPayoutCard
                key={w.id}
                withdrawal={w}
                isClaimed
                isClaimedByOther={false}
                onClaim={() => claimWithdrawal.mutate(w.id)}
                onComplete={completeWithdrawal.mutate}
                isClaimPending={claimWithdrawal.isPending}
                isCompletePending={completeWithdrawal.isPending}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Withdrawal Requests by channel — UNCLAIMED only */}
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
          const items = tab === 'all' ? availableWithdrawals : tab === 'momo' ? momoWithdrawals : tab === 'bank' ? bankWithdrawals : cashWithdrawals;
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

// WithdrawalPayoutCard moved to src/components/withdrawals/WithdrawalPayoutCard.tsx
