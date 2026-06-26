import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfMonth, subDays } from 'date-fns';
import {
  Banknote, QrCode, Search, CheckCircle2, Loader2,
  Smartphone, Wallet, Bell, TrendingUp, Clock, Hash, Phone, UserCheck, Coins,
  CalendarIcon, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { WithdrawalPayoutCard } from '@/components/withdrawals/WithdrawalPayoutCard';

// Aligned with FinOps dashboard (FinOpsWithdrawalVerification) so pending counts match across dashboards.
const CASHOUT_QUEUE_STATUSES = ['pending', 'requested', 'manager_approved', 'cfo_approved', 'fin_ops_approved'];
const CLAIM_WINDOW_MINUTES = 15;
const CLAIM_WINDOW_MS = CLAIM_WINDOW_MINUTES * 60 * 1000;

type PayoutChannel = 'momo' | 'cash';

const normalizePayoutMethod = (value?: string | null) =>
  String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const getPayoutChannel = (withdrawal: any): PayoutChannel => {
  const method = normalizePayoutMethod(withdrawal?.payout_method);
  const flatMethod = method.replace(/_/g, '');

  if (['cash', 'cash_pickup', 'cashpickup', 'agent_cash', 'agentcash', 'payout_code', 'payoutcode', 'bank_transfer', 'banktransfer', 'bank', 'bank_account', 'bankaccount'].includes(method) || ['cashpickup', 'agentcash', 'payoutcode', 'banktransfer', 'bankaccount'].includes(flatMethod)) {
    return 'cash';
  }

  if (flatMethod.includes('mobilemoney') || flatMethod.includes('momo') || flatMethod.includes('mtn') || flatMethod.includes('airtel')) {
    return 'momo';
  }

  if (withdrawal?.mobile_money_number || withdrawal?.mobile_money_provider || withdrawal?.mobile_money_name) {
    return 'momo';
  }

  return 'cash';
};

const isClaimExpired = (withdrawal: any) => {
  if (!withdrawal?.assigned_cashout_agent_id || !withdrawal?.dispatched_at) return false;
  return Date.now() - new Date(withdrawal.dispatched_at).getTime() >= CLAIM_WINDOW_MS;
};

const getRecipientPhone = (withdrawal: any) => {
  const channel = getPayoutChannel(withdrawal);
  return channel === 'momo'
    ? withdrawal.mobile_money_number || withdrawal.profiles?.phone || '—'
    : withdrawal.profiles?.phone || withdrawal.mobile_money_number || '—';
};

export function AgentCashPayoutsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payoutCode, setPayoutCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedPayout, setVerifiedPayout] = useState<any>(null);

  // Date range filter for the commission breakdown.
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(undefined);
  const [rangeTo, setRangeTo] = useState<Date | undefined>(undefined);
  const fromKey = rangeFrom ? format(rangeFrom, 'yyyy-MM-dd') : '';
  const toKey = rangeTo ? format(rangeTo, 'yyyy-MM-dd') : '';

  // Per-request submission locks. The refs guard SYNCHRONOUSLY on tap (before any
  // re-render) so a rapid double-tap can never fire the same mutation twice; the
  // state mirrors them only to drive the disabled/loading UI.
  const claimLockRef = useRef<Set<string>>(new Set());
  const completeLockRef = useRef<Set<string>>(new Set());
  const [claimingIds, setClaimingIds] = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const handleClaim = (id: string) => {
    if (claimLockRef.current.has(id)) return; // already submitting this request
    claimLockRef.current.add(id);
    setClaimingIds(new Set(claimLockRef.current));
    toast.info('Claiming withdrawal… please wait', { id: `claim-${id}`, duration: 4000 });
    claimWithdrawal.mutate(id);
  };

  const handleComplete = (data: { id: string; reference: string; method: string }) => {
    if (completeLockRef.current.has(data.id)) return; // already submitting this request
    completeLockRef.current.add(data.id);
    setCompletingIds(new Set(completeLockRef.current));
    toast.info('Confirming payout… please wait', { id: `complete-${data.id}`, duration: 4000 });
    completeWithdrawal.mutate(data);
  };

  // Check if this agent is a cashout agent
  const { data: isCashoutAgent, isLoading: cashoutAgentLoading } = useQuery({
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

  const releaseExpiredClaims = async () => {
    const cutoff = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
    const { error } = await supabase
      .from('withdrawal_requests')
      .update({ assigned_cashout_agent_id: null, dispatched_at: null } as any)
      .not('assigned_cashout_agent_id', 'is', null)
      .lt('dispatched_at', cutoff)
      .in('status', CASHOUT_QUEUE_STATUSES);

    if (error) {
      console.warn('Failed to release expired merchant payout claims', error);
    }
  };

  // ALL pending/approved withdrawal requests
  // NOTE: no FK exists between withdrawal_requests.user_id and profiles.id,
  // so we cannot use a PostgREST embed. We fetch profiles separately and join client-side.
  const { data: allWithdrawals = [], isLoading: loadingAll } = useQuery({
    queryKey: ['cashout-agent-all-withdrawals'],
    queryFn: async () => {
      await releaseExpiredClaims();
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', CASHOUT_QUEUE_STATUSES)
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

  // Commission breakdown — totals by date for ALL payouts this agent has
  // processed (every confirmed payout credits a 0.5% commission into the
  // agent's withdrawable wallet via general_ledger). We read the wallet-scope
  // cash_in legs tagged as the cashout commission and group them by day.
  const { data: commissionBreakdown } = useQuery({
    queryKey: ['cashout-agent-commission-breakdown', user?.id, fromKey, toKey],
    queryFn: async () => {
      if (!user) return { rows: [] as { date: string; count: number; total: number }[], typeRows: [] as { type: string; count: number; total: number }[], grandTotal: 0, grandCount: 0 };
      let q = supabase
        .from('general_ledger')
        .select('amount, transaction_date, created_at, reference_id')
        .eq('user_id', user.id)
        .eq('ledger_scope', 'wallet')
        .eq('direction', 'cash_in')
        .eq('category', 'agent_commission_earned')
        .like('reference_id', '%-cashout-commission');
      if (fromKey) q = q.gte('transaction_date', fromKey);
      if (toKey) q = q.lte('transaction_date', toKey);
      const { data, error } = await q.order('transaction_date', { ascending: false });
      if (error) throw error;

      // Resolve the payout method/type for each commission by stripping the
      // withdrawal id from the reference_id and batch-fetching the withdrawals.
      const withdrawalIds = Array.from(
        new Set(
          (data || [])
            .map((r: any) => String(r.reference_id || '').replace('-cashout-commission', ''))
            .filter(Boolean),
        ),
      );
      const methodById = new Map<string, string>();
      if (withdrawalIds.length > 0) {
        const { data: wrs } = await supabase
          .from('withdrawal_requests')
          .select('id, payout_method')
          .in('id', withdrawalIds);
        for (const w of (wrs || []) as any[]) {
          methodById.set(String(w.id), String(w.payout_method || ''));
        }
      }
      const prettyType = (m: string) => {
        const key = (m || '').toLowerCase();
        if (!key) return 'Other payout';
        if (key.includes('momo') || key.includes('mobile')) return 'Mobile Money';
        if (key.includes('bank')) return 'Bank Transfer';
        if (key.includes('cash')) return 'Cash Pickup';
        if (key.includes('wallet')) return 'Wallet';
        return m.charAt(0).toUpperCase() + m.slice(1);
      };

      const byDate = new Map<string, { count: number; total: number }>();
      const byType = new Map<string, { count: number; total: number }>();
      let grandTotal = 0;
      let grandCount = 0;
      for (const r of (data || []) as any[]) {
        const ts = r.transaction_date || r.created_at;
        if (!ts) continue;
        const day = new Date(ts).toISOString().slice(0, 10);
        const amt = Number(r.amount || 0);
        const prev = byDate.get(day) || { count: 0, total: 0 };
        byDate.set(day, { count: prev.count + 1, total: prev.total + amt });
        const wid = String(r.reference_id || '').replace('-cashout-commission', '');
        const type = prettyType(methodById.get(wid) || '');
        const prevT = byType.get(type) || { count: 0, total: 0 };
        byType.set(type, { count: prevT.count + 1, total: prevT.total + amt });
        grandTotal += amt;
        grandCount += 1;
      }
      const rows = Array.from(byDate.entries())
        .map(([date, v]) => ({ date, count: v.count, total: v.total }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const typeRows = Array.from(byType.entries())
        .map(([type, v]) => ({ type, count: v.count, total: v.total }))
        .sort((a, b) => b.total - a.total);
      return { rows, typeRows, grandTotal, grandCount };
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

  // Auto-release stale claims (>15min) — client-side ticker so the UI updates
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
    onSettled: (_d, _e, withdrawalId) => {
      claimLockRef.current.delete(withdrawalId);
      setClaimingIds(new Set(claimLockRef.current));
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
      toast.success(commission > 0 ? `${baseMsg} · You earned ${formatUGX(commission)} (0.5%)` : baseMsg);
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['cashout-agent-commission-breakdown'] });
      qc.invalidateQueries({ queryKey: ['cashout-agent-daily-stats'] });
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: (_d, _e, vars) => {
      if (vars?.id) {
        completeLockRef.current.delete(vars.id);
        setCompletingIds(new Set(completeLockRef.current));
      }
    },
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

  if (cashoutAgentLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!isCashoutAgent) return null;

  // My ACTIVE claims (claimed by me, awaiting my confirmation) — shown separately
  // at the top so I can complete them. They are EXCLUDED from the main queue and
  // its pending count to prevent double-payment by me or Financial Ops.
  const myActiveClaims = allWithdrawals.filter(
    (w: any) => w.assigned_cashout_agent_id === isCashoutAgent?.id,
  );

  // Available queue: unclaimed withdrawals plus expired claims returning after 15 minutes.
  const availableWithdrawals = allWithdrawals.filter(
    (w: any) => !w.assigned_cashout_agent_id || isClaimExpired(w),
  );

  // Split by method (queue only)
  const momoWithdrawals = availableWithdrawals.filter((w: any) => getPayoutChannel(w) === 'momo');
  const cashWithdrawals = availableWithdrawals.filter((w: any) => getPayoutChannel(w) === 'cash');

  const totalPending = availableWithdrawals.length;

  return (
    <div className="space-y-5">
      {/* Role identity banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20">
        <Banknote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-foreground/80 leading-relaxed">
          You are a <span className="font-semibold text-primary">Merchant Agent</span>. Claim a request, send the money via <span className="font-medium">Mobile Money, Bank, or Cash</span>, then enter the proof (TID or payout code) to confirm.
        </div>
      </div>

      {/* My Active Claims — pinned to the very top so a request YOU claimed is
          always clearly separated from the rest of the queue and can't be missed. */}
      {myActiveClaims.length > 0 && (
        <Card className="border-2 border-amber-500/60 bg-amber-500/10 rounded-2xl shadow-lg ring-2 ring-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <UserCheck className="h-4 w-4" />
              Claimed by you · {myActiveClaims.length}
              <Badge className="ml-auto bg-amber-500 text-white hover:bg-amber-500 h-5 px-2 gap-1 text-[11px]">
                <Clock className="h-3 w-3" /> 15 min to confirm
              </Badge>
            </CardTitle>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
              These are yours to complete. Pay the recipient, then enter the proof to confirm.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {myActiveClaims.map((w: any) => (
              <WithdrawalPayoutCard
                key={w.id}
                withdrawal={w}
                isClaimed
                isClaimedByOther={false}
                onClaim={() => handleClaim(w.id)}
                onComplete={handleComplete}
                claimingId={claimingIds.has(w.id) ? w.id : null}
                completingId={completingIds.has(w.id) ? w.id : null}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Daily summary */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Today's Payouts
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 pt-0">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hash className="h-3.5 w-3.5" /> Done
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">{dailyStats?.codesCount ?? 0}</div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Paid
            </div>
            <div className="text-xl font-bold text-primary tabular-nums leading-tight">{formatUGX(dailyStats?.totalAmount ?? 0)}</div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Avg
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {dailyStats?.avgMinutes ? `${Math.round(dailyStats.avgMinutes)}m` : '—'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commission breakdown — totals by date for all approved payouts */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-600" />
            Commission Earned · 0.5% per payout
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Paid instantly into your withdrawable wallet for every payout you confirm.
          </p>
          {/* Date range filter */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('h-8 justify-start text-left font-normal gap-1.5', !rangeFrom && 'text-muted-foreground')}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {rangeFrom ? format(rangeFrom, 'MMM d, yyyy') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={rangeFrom}
                  onSelect={setRangeFrom}
                  disabled={(d) => (rangeTo ? d > rangeTo : false) || d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">→</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('h-8 justify-start text-left font-normal gap-1.5', !rangeTo && 'text-muted-foreground')}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {rangeTo ? format(rangeTo, 'MMM d, yyyy') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={rangeTo}
                  onSelect={setRangeTo}
                  disabled={(d) => (rangeFrom ? d < rangeFrom : false) || d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            {(rangeFrom || rangeTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => { setRangeFrom(undefined); setRangeTo(undefined); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Button variant="secondary" size="sm" className="h-7 text-xs px-2.5"
              onClick={() => { const t = new Date(); setRangeFrom(t); setRangeTo(t); }}>
              Today
            </Button>
            <Button variant="secondary" size="sm" className="h-7 text-xs px-2.5"
              onClick={() => { setRangeFrom(subDays(new Date(), 6)); setRangeTo(new Date()); }}>
              Last 7 days
            </Button>
            <Button variant="secondary" size="sm" className="h-7 text-xs px-2.5"
              onClick={() => { setRangeFrom(subDays(new Date(), 29)); setRangeTo(new Date()); }}>
              Last 30 days
            </Button>
            <Button variant="secondary" size="sm" className="h-7 text-xs px-2.5"
              onClick={() => { setRangeFrom(startOfMonth(new Date())); setRangeTo(new Date()); }}>
              This month
            </Button>
          </div>
          {(rangeFrom || rangeTo) && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Showing {rangeFrom ? format(rangeFrom, 'MMM d, yyyy') : 'the start'} – {rangeTo ? format(rangeTo, 'MMM d, yyyy') : 'today'}
            </p>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-end justify-between gap-3 pb-3 border-b border-border/60">
            <div>
              <p className="text-xs text-muted-foreground">Total earned</p>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums leading-tight">
                {formatUGX(commissionBreakdown?.grandTotal ?? 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Payouts</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{commissionBreakdown?.grandCount ?? 0}</p>
            </div>
          </div>

          {(commissionBreakdown?.rows?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {(rangeFrom || rangeTo)
                ? 'No commission earned in the selected period.'
                : 'No commission earned yet. Confirm a payout to start earning.'}
            </p>
          ) : (
            <>
              {/* By payout category / type */}
              {(commissionBreakdown?.typeRows?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    By payout type
                  </p>
                  <div className="space-y-1.5">
                    {commissionBreakdown!.typeRows.map((t) => (
                      <div
                        key={t.type}
                        className="flex items-center justify-between gap-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{t.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.count} payout{t.count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <p className="font-bold text-emerald-600 tabular-nums shrink-0">{formatUGX(t.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* By day */}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                By day
              </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {commissionBreakdown!.rows.map((r) => (
                <div
                  key={r.date}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {format(new Date(`${r.date}T00:00:00`), 'EEE, MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.count} payout{r.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="font-bold text-emerald-600 tabular-nums shrink-0">{formatUGX(r.total)}</p>
                </div>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Live status banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400">
          <Bell className="h-5 w-5 animate-pulse shrink-0" />
          <span className="text-sm font-semibold">{totalPending} pending withdrawal{totalPending !== 1 ? 's' : ''} · live</span>
        </div>
      )}

      {/* Payout Code Verification — for users who came in person with a WPO code */}
      <Card className="border-2 border-primary/30 bg-primary/5 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Verify Cash Pickup Code
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">Only when a user arrives in person with a WPO-XXXXX code. Otherwise claim from the queue below.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="WPO-XXXXX"
              value={payoutCode}
              onChange={e => setPayoutCode(e.target.value.toUpperCase())}
              className="text-xl font-mono tracking-wider h-14 text-center"
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
            />
            <Button onClick={handleVerify} disabled={verifying || !payoutCode.trim()} className="h-14 px-6" aria-label="Verify code">
              {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </Button>
          </div>
          {verifiedPayout && (
            <Card className="border-green-500/30 bg-green-500/5 rounded-2xl">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <span className="font-bold text-lg text-green-700">Code Verified</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-base">
                  <div><p className="text-muted-foreground text-sm">Name</p><p className="font-semibold">{verifiedPayout.profiles?.full_name}</p></div>
                  <div><p className="text-muted-foreground text-sm">Phone</p><p className="font-semibold">{verifiedPayout.profiles?.phone}</p></div>
                  <div><p className="text-muted-foreground text-sm">Amount</p><p className="font-bold text-xl text-primary">{formatUGX(verifiedPayout.amount)}</p></div>
                  <div><p className="text-muted-foreground text-sm">Expires</p><p className="font-semibold">{format(new Date(verifiedPayout.expires_at), 'MMM d, HH:mm')}</p></div>
                </div>
                <Button className="w-full h-14 text-base font-bold" onClick={() => completePayout.mutate(verifiedPayout.id)} disabled={completePayout.isPending}>
                  {completePayout.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Banknote className="h-5 w-5 mr-2" />}
                  Confirm Cash Paid — {formatUGX(verifiedPayout.amount)}
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal Requests by channel — UNCLAIMED only */}
      <Tabs defaultValue="all">
        <TabsList className="w-full h-12 p-1">
          <TabsTrigger value="all" className="flex-1 gap-1.5 text-sm h-10">
            <Wallet className="h-4 w-4" /> All
            {totalPending > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-xs">{totalPending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="momo" className="flex-1 gap-1.5 text-sm h-10">
            <Smartphone className="h-4 w-4" /> MoMo
            {momoWithdrawals.length > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-xs">{momoWithdrawals.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="cash" className="flex-1 gap-1.5 text-sm h-10">
            <Banknote className="h-4 w-4" /> Cash
            {cashWithdrawals.length > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-xs">{cashWithdrawals.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {['all', 'momo', 'cash'].map(tab => {
          const items = tab === 'all' ? availableWithdrawals : tab === 'momo' ? momoWithdrawals : cashWithdrawals;
          const emptyMsg = tab === 'all' ? 'No pending withdrawals' : `No pending ${tab} payouts`;
          return (
            <TabsContent key={tab} value={tab} className="space-y-2.5 mt-4">
              {loadingAll ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <Card className="rounded-2xl"><CardContent className="py-12 text-center text-base text-muted-foreground">{emptyMsg}</CardContent></Card>
              ) : (
                items.map((w: any) => {
                  const isMoMo = getPayoutChannel(w) === 'momo';
                  const MethodIcon = isMoMo ? Smartphone : Banknote;
                  const methodLabel = isMoMo ? 'Mobile Money' : 'Cash';
                  const name = w.profiles?.full_name || 'Unknown';
                  const phone = getRecipientPhone(w);
                  return (
                    <Card key={w.id} className="rounded-2xl">
                      <CardContent className="p-4 space-y-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-lg truncate leading-tight">{name}</p>
                            <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5 mt-1">
                              <Phone className="h-4 w-4" />
                              <span className="font-mono">{phone}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-xl text-primary tabular-nums leading-tight">{formatUGX(w.amount)}</p>
                            <Badge variant="secondary" className="text-xs gap-1 h-5 px-2 mt-1.5">
                              <MethodIcon className="h-3 w-3" />
                              {methodLabel}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          className="w-full h-12 gap-2 font-semibold text-base"
                          onClick={() => handleClaim(w.id)}
                          disabled={claimingIds.has(w.id)}
                          title={claimingIds.has(w.id) ? 'Request is being processed…' : 'Claim this withdrawal'}
                        >
                          {claimingIds.has(w.id) ? (
                            <><Loader2 className="h-5 w-5 animate-spin" /> Claiming…</>
                          ) : (
                            <><UserCheck className="h-5 w-5" /> Claim</>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// WithdrawalPayoutCard moved to src/components/withdrawals/WithdrawalPayoutCard.tsx
