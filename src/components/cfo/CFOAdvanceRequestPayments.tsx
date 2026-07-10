import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX, calculateAccessFee, calculateRegistrationFee } from '@/lib/agentAdvanceCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format, addDays, differenceInCalendarDays, max as dateMax, min as dateMin, isAfter, startOfMonth, endOfMonth } from 'date-fns';
import { CheckCircle2, Loader2, Pencil, User, Banknote, X, TrendingUp, Percent, Wallet, Users, FileText, CalendarRange, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { AgentAdvanceEvaluationDialog } from '@/components/agent/AgentAdvanceEvaluationDialog';

export function CFOAdvanceRequestPayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [adjustedRates, setAdjustedRates] = useState<Record<string, number>>({});
  const [adjustedPrincipals, setAdjustedPrincipals] = useState<Record<string, number>>({});
  const [adjustedCycles, setAdjustedCycles] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The same advance-eligibility evaluation popup used by Agent Ops. The CFO
  // opens it on any request to see the agent's 360° evaluation before acting.
  const [evalReq, setEvalReq] = useState<any | null>(null);
  const [stageFilter, setStageFilter] = useState<'all' | 'pending' | 'ready' | 'cfo_approved'>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Income Statement Impact preview — date range
  const today = new Date();
  const [rangeStart, setRangeStart] = useState<string>(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState<string>(format(endOfMonth(today), 'yyyy-MM-dd'));

  // Fetch fee config
  const { data: feeConfig } = useQuery({
    queryKey: ['advance-fee-config'],
    queryFn: async () => {
      const { data } = await supabase.from('advance_fee_config').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  // Fetch ALL agent advance applications so CFO sees every stage. After Agent Ops
  // approves, a request lands at 'agent_ops_approved' and comes straight to the CFO —
  // there are no intermediate ops desks.
  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ['cfo-advance-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advance_requests')
        .select('*, profiles!agent_advance_requests_agent_id_fkey(full_name, phone)')
        .in('status', ['pending', 'agent_ops_approved', 'cfo_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const pendingApplications = (allRequests as any[]).filter(r => r.status === 'pending');
  const readyToPay = (allRequests as any[]).filter(r => r.status === 'agent_ops_approved');
  const cfoApproved = (allRequests as any[]).filter(r => r.status === 'cfo_approved');
  const requests = stageFilter === 'pending'
    ? pendingApplications
    : stageFilter === 'ready'
      ? readyToPay
      : stageFilter === 'cfo_approved'
        ? cfoApproved
        : allRequests;

  // Update global default rate
  const updateConfigMutation = useMutation({
    mutationFn: async (newRate: number) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('advance_fee_config')
        .update({ default_monthly_rate: newRate, updated_by: user.id })
        .not('id', 'is', null); // update the single row
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Default rate updated');
      queryClient.invalidateQueries({ queryKey: ['advance-fee-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Pay advance to agent wallet
  const payMutation = useMutation({
    mutationFn: async (req: any) => {
      if (!user?.id) throw new Error('Not authenticated');
      // Approval gate: disbursement is only allowed once the CFO has approved
      // (and edited) the request. Anything not yet at 'cfo_approved' is blocked.
      if (req.status !== 'cfo_approved') {
        throw new Error('Approve the advance before disbursing to the wallet');
      }
      const adjustedRate = adjustedRates[req.id] ?? Number(req.monthly_rate);
      const principal = adjustedPrincipals[req.id] ?? Number(req.principal);
      const cycleDays = adjustedCycles[req.id] ?? Number(req.cycle_days);
      const registrationFee = calculateRegistrationFee(principal);
      const newAccessFee = calculateAccessFee(principal, cycleDays, adjustedRate);
      const newTotal = principal + newAccessFee + registrationFee;
      const newDaily = Math.ceil(newTotal / cycleDays);

      // 1. Update the request as paid
      const { error: updateErr } = await supabase.from('agent_advance_requests').update({
        status: 'cfo_paid',
        paid_by_cfo: user.id,
        cfo_paid_at: new Date().toISOString(),
        cfo_adjusted_rate: adjustedRate !== Number(req.monthly_rate) ? adjustedRate : null,
        cfo_notes: notes[req.id] || null,
        principal,
        cycle_days: cycleDays,
        registration_fee: registrationFee,
        access_fee: newAccessFee,
        total_payable: newTotal,
        daily_payment: newDaily,
        monthly_rate: adjustedRate,
      }).eq('id', req.id);
      if (updateErr) throw updateErr;

      // 2. Create agent_advances record (starts daily deductions via existing edge function)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + cycleDays);
      
      const { error: advErr } = await supabase.from('agent_advances').insert({
        agent_id: req.agent_id,
        issued_by: user.id,
        principal,
        outstanding_balance: newTotal,
        cycle_days: cycleDays,
        monthly_rate: adjustedRate,
        daily_rate: adjustedRate,
        access_fee: newAccessFee,
        registration_fee: registrationFee,
        access_fee_collected: 0,
        access_fee_status: 'unpaid',
        status: 'active',
        expires_at: expiresAt.toISOString(),
      });
      if (advErr) throw advErr;

      // 3. Credit agent wallet via ledger RPC
      const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: req.agent_id,
            ledger_scope: 'wallet',
            direction: 'cash_in',
            amount: principal,
            category: 'agent_advance_credit',
            recipient_type: 'user',
            wallet_bucket: 'withdrawable',
            source_table: 'agent_advance_requests',
            source_id: req.id,
            description: `Agent advance disbursement - ${cycleDays}d @ ${Math.round(adjustedRate * 100)}%`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            user_id: req.agent_id,
            ledger_scope: 'platform',
            direction: 'cash_out',
            amount: principal,
            category: 'rent_disbursement',
            source_table: 'agent_advance_requests',
            source_id: req.id,
            description: `Agent advance disbursed to wallet`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
      });
      if (rpcErr) throw rpcErr;

      // 4. Record registration fee revenue
      if (registrationFee > 0) {
        await supabase.rpc('create_ledger_transaction', {
          entries: [
            {
              user_id: req.agent_id,
              ledger_scope: 'platform',
              direction: 'cash_in',
              amount: registrationFee,
              category: 'registration_fee_collected',
              source_table: 'agent_advance_requests',
              source_id: req.id,
              description: `Registration fee for agent advance`,
              currency: 'UGX',
              transaction_date: new Date().toISOString(),
            },
            {
              user_id: req.agent_id,
              ledger_scope: 'wallet',
              direction: 'cash_out',
              amount: registrationFee,
              category: 'registration_fee_collected',
              source_table: 'agent_advance_requests',
              source_id: req.id,
              description: `Registration fee deducted`,
              currency: 'UGX',
              transaction_date: new Date().toISOString(),
            },
          ],
        });
      }
    },
    onSuccess: () => {
      toast.success('Advance paid to agent wallet!');
      queryClient.invalidateQueries({ queryKey: ['cfo-advance-requests'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Step 1 of the gate: CFO approves (and locks in edits). No money moves here.
  const approveMutation = useMutation({
    mutationFn: async (req: any) => {
      if (!user?.id) throw new Error('Not authenticated');
      const adjustedRate = adjustedRates[req.id] ?? Number(req.monthly_rate);
      const principal = adjustedPrincipals[req.id] ?? Number(req.principal);
      const cycleDays = adjustedCycles[req.id] ?? Number(req.cycle_days);
      if (principal <= 0) throw new Error('Principal must be greater than zero');
      const registrationFee = calculateRegistrationFee(principal);
      const newAccessFee = calculateAccessFee(principal, cycleDays, adjustedRate);
      const newTotal = principal + newAccessFee + registrationFee;
      const newDaily = Math.ceil(newTotal / cycleDays);

      const { error } = await supabase.from('agent_advance_requests').update({
        status: 'cfo_approved',
        cfo_approved_by: user.id,
        cfo_approved_at: new Date().toISOString(),
        cfo_adjusted_rate: adjustedRate !== Number(req.monthly_rate) ? adjustedRate : null,
        cfo_notes: notes[req.id] || null,
        principal,
        cycle_days: cycleDays,
        registration_fee: registrationFee,
        access_fee: newAccessFee,
        total_payable: newTotal,
        daily_payment: newDaily,
        monthly_rate: adjustedRate,
      }).eq('id', req.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Advance approved — ready to disburse');
      queryClient.invalidateQueries({ queryKey: ['cfo-advance-requests'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Allow the CFO to re-open an approved request for further editing before payout.
  const revokeApprovalMutation = useMutation({
    mutationFn: async (req: any) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase.from('agent_advance_requests').update({
        status: 'pending',
        cfo_approved_by: null,
        cfo_approved_at: null,
      }).eq('id', req.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Approval revoked — request re-opened for editing');
      queryClient.invalidateQueries({ queryKey: ['cfo-advance-requests'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Portfolio-level revenue economics across all pending requests
  const revenueTotals = useMemo(() => {
    let principal = 0, accessFee = 0, regFee = 0;
    for (const req of readyToPay) {
      const p = adjustedPrincipals[req.id] ?? Number(req.principal);
      const d = adjustedCycles[req.id] ?? Number(req.cycle_days);
      const r = adjustedRates[req.id] ?? Number(req.monthly_rate);
      principal += p;
      accessFee += calculateAccessFee(p, d, r);
      regFee += calculateRegistrationFee(p);
    }
    return { principal, accessFee, regFee, gross: accessFee + regFee };
  }, [readyToPay, adjustedPrincipals, adjustedCycles, adjustedRates]);

  // Income Statement Impact — recognize Registration Fee at payout date,
  // Access Fee straight-line across cycle days. Only counts revenue whose
  // recognition window overlaps the selected [rangeStart, rangeEnd].
  const incomeImpact = useMemo(() => {
    const startD = new Date(rangeStart + 'T00:00:00');
    const endD = new Date(rangeEnd + 'T23:59:59');
    if (isNaN(startD.getTime()) || isNaN(endD.getTime()) || isAfter(startD, endD)) {
      return { rows: [] as any[], regFee: 0, accessFee: 0, principalDisbursed: 0, total: 0 };
    }
    let regFeeTotal = 0, accessFeeTotal = 0, principalDisbursed = 0;
    const rows: Array<{
      id: string; name: string; principal: number; cycleDays: number;
      regFee: number; accessFeeInRange: number; daysInRange: number; total: number;
    }> = [];

    for (const req of readyToPay) {
      const p = adjustedPrincipals[req.id] ?? Number(req.principal);
      const d = adjustedCycles[req.id] ?? Number(req.cycle_days);
      const r = adjustedRates[req.id] ?? Number(req.monthly_rate);
      const payoutDate = today; // payout is "now" in the preview
      const cycleEnd = addDays(payoutDate, d - 1);

      const regFee = (payoutDate >= startD && payoutDate <= endD) ? calculateRegistrationFee(p) : 0;

      const overlapStart = dateMax([payoutDate, startD]);
      const overlapEnd = dateMin([cycleEnd, endD]);
      const daysInRange = isAfter(overlapStart, overlapEnd)
        ? 0
        : differenceInCalendarDays(overlapEnd, overlapStart) + 1;

      const fullAccessFee = calculateAccessFee(p, d, r);
      const accessFeeInRange = d > 0 ? Math.round((fullAccessFee * daysInRange) / d) : 0;

      const principalIfInRange = (payoutDate >= startD && payoutDate <= endD) ? p : 0;
      principalDisbursed += principalIfInRange;
      regFeeTotal += regFee;
      accessFeeTotal += accessFeeInRange;

      const total = regFee + accessFeeInRange;
      rows.push({
        id: req.id,
        name: req.profiles?.full_name || 'Agent',
        principal: p,
        cycleDays: d,
        regFee,
        accessFeeInRange,
        daysInRange,
        total,
      });
    }

    return {
      rows,
      regFee: regFeeTotal,
      accessFee: accessFeeTotal,
      principalDisbursed,
      total: regFeeTotal + accessFeeTotal,
    };
  }, [readyToPay, adjustedPrincipals, adjustedCycles, adjustedRates, rangeStart, rangeEnd]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Banknote className="h-4 w-4 text-primary" />
          <Badge className="text-[10px] bg-primary text-primary-foreground uppercase tracking-widest">Agent Advance</Badge>
          <h2 className="text-base font-bold">Applications &amp; Payouts</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Live view of every agent advance application. Review &amp; edit a request, then <strong>Approve</strong> it. Disbursement to the agent&apos;s wallet only unlocks <em>after</em> CFO approval.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={stageFilter === 'all' ? 'default' : 'outline'}
            className="h-7 text-[11px]"
            onClick={() => setStageFilter('all')}
          >
            All <span className="ml-1 opacity-70">{allRequests.length}</span>
          </Button>
          <Button
            size="sm"
            variant={stageFilter === 'pending' ? 'default' : 'outline'}
            className="h-7 text-[11px]"
            onClick={() => setStageFilter('pending')}
          >
            Agent Applied <span className="ml-1 opacity-70">{pendingApplications.length}</span>
          </Button>
          <Button
            size="sm"
            variant={stageFilter === 'ready' ? 'default' : 'outline'}
            className="h-7 text-[11px]"
            onClick={() => setStageFilter('ready')}
          >
            Ready to Pay <span className="ml-1 opacity-70">{readyToPay.length}</span>
          </Button>
          <Button
            size="sm"
            variant={stageFilter === 'cfo_approved' ? 'default' : 'outline'}
            className="h-7 text-[11px]"
            onClick={() => setStageFilter('cfo_approved')}
          >
            Approved · Disburse <span className="ml-1 opacity-70">{cfoApproved.length}</span>
          </Button>
        </div>
      </div>

      {/* Portfolio-level "how we make money" panel — based on COO-approved (payable) pool */}
      {readyToPay.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
          <p className="text-xs font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            How we make money on agent advances
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                <Wallet className="h-2.5 w-2.5" /> Principal Out
              </p>
              <p className="font-bold text-sm text-orange-600">{formatUGX(revenueTotals.principal)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                <Percent className="h-2.5 w-2.5" /> Access Fees
              </p>
              <p className="font-bold text-sm text-emerald-600">+{formatUGX(revenueTotals.accessFee)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                <Users className="h-2.5 w-2.5" /> Registration Fees
              </p>
              <p className="font-bold text-sm text-emerald-600">+{formatUGX(revenueTotals.regFee)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                <TrendingUp className="h-2.5 w-2.5" /> Gross Revenue
              </p>
              <p className="font-bold text-sm text-primary">{formatUGX(revenueTotals.gross)}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Revenue model: 28–33% monthly compounding access fee on principal · flat registration fee (10K ≤ 200K · 20K &gt; 200K).
          </p>
        </div>
      )}

      {/* Income Statement Impact — real-time preview by date range */}
      {readyToPay.length > 0 && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400">Income Statement Impact</p>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/30 dark:text-blue-300">
              Live Preview
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            If you pay every COO-approved advance today, this is the revenue recognised in your selected period.
            Registration fee hits the payout day; access fee is recognised straight-line over the cycle.
          </p>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <CalendarRange className="h-2.5 w-2.5" /> From
              </Label>
              <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <CalendarRange className="h-2.5 w-2.5" /> To
              </Label>
              <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {/* Quick range chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'This month', from: startOfMonth(today), to: endOfMonth(today) },
              { label: 'Next 7d', from: today, to: addDays(today, 6) },
              { label: 'Next 30d', from: today, to: addDays(today, 29) },
              { label: 'Next 90d', from: today, to: addDays(today, 89) },
            ].map((r) => (
              <Button
                key={r.label}
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2"
                onClick={() => {
                  setRangeStart(format(r.from, 'yyyy-MM-dd'));
                  setRangeEnd(format(r.to, 'yyyy-MM-dd'));
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>

          {/* Aggregate impact rows */}
          <div className="rounded-md border bg-background/60 divide-y text-xs">
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">Registration Fees recognised</span>
              <span className="font-mono font-bold text-emerald-600">+{formatUGX(incomeImpact.regFee)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">Access Fees recognised (pro-rata)</span>
              <span className="font-mono font-bold text-emerald-600">+{formatUGX(incomeImpact.accessFee)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">Principal disbursed (Balance Sheet, not P&amp;L)</span>
              <span className="font-mono text-orange-600">−{formatUGX(incomeImpact.principalDisbursed)}</span>
            </div>
            <div className="flex justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20">
              <span className="font-bold">Δ Net Income (in range)</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">+{formatUGX(incomeImpact.total)}</span>
            </div>
          </div>

          {/* Per-request contribution */}
          {incomeImpact.rows.length > 0 && (
            <details className="group">
              <summary className="text-[11px] font-semibold cursor-pointer text-blue-700 dark:text-blue-400 hover:underline">
                Show per-request contribution ({incomeImpact.rows.length})
              </summary>
              <div className="mt-2 rounded-md border bg-background/60 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold">Agent</th>
                      <th className="text-right px-2 py-1 font-semibold">Days in range</th>
                      <th className="text-right px-2 py-1 font-semibold">Reg fee</th>
                      <th className="text-right px-2 py-1 font-semibold">Access fee</th>
                      <th className="text-right px-2 py-1 font-semibold">Δ Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incomeImpact.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-1 truncate max-w-[140px]">{r.name}</td>
                        <td className="px-2 py-1 text-right font-mono">{r.daysInRange}/{r.cycleDays}</td>
                        <td className="px-2 py-1 text-right font-mono text-emerald-600">+{formatUGX(r.regFee)}</td>
                        <td className="px-2 py-1 text-right font-mono text-emerald-600">+{formatUGX(r.accessFeeInRange)}</td>
                        <td className="px-2 py-1 text-right font-mono font-bold">+{formatUGX(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Global Fee Config */}
      {feeConfig && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Global Default Rate</p>
                <p className="text-2xl font-bold text-primary">{Math.round(Number(feeConfig.default_monthly_rate) * 100)}%</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingRate(editingRate ? null : 'global')}
                className="gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            </div>
            {editingRate === 'global' && (
              <div className="space-y-2 mt-3 p-3 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  Range: {Math.round(Number(feeConfig.min_rate) * 100)}% – {Math.round(Number(feeConfig.max_rate) * 100)}%
                </p>
                <Slider
                  min={Number(feeConfig.min_rate) * 100}
                  max={Number(feeConfig.max_rate) * 100}
                  step={1}
                  value={[Math.round(Number(feeConfig.default_monthly_rate) * 100)]}
                  onValueChange={([v]) => {
                    updateConfigMutation.mutate(v / 100);
                    setEditingRate(null);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Requests */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Banknote className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No advance requests pending payment</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {stageFilter === 'pending' ? 'Agent-Submitted Applications' : stageFilter === 'ready' ? 'Agent Ops-Approved · Awaiting CFO Approval' : stageFilter === 'cfo_approved' ? 'CFO-Approved · Ready to Disburse' : 'All Agent Advance Applications'}
            </h3>
            <Badge variant="secondary">{requests.length} shown</Badge>
          </div>
          {requests.map((req: any) => {
            const profile = req.profiles;
            const isExpanded = expandedId === req.id;
            const isPending = req.status === 'pending';
            const isCfoApproved = req.status === 'cfo_approved';
            const currentRate = adjustedRates[req.id] ?? Number(req.monthly_rate);
            const currentPrincipal = adjustedPrincipals[req.id] ?? Number(req.principal);
            const currentCycle = adjustedCycles[req.id] ?? Number(req.cycle_days);
            const currentRegFee = calculateRegistrationFee(currentPrincipal);
            const adjAccessFee = calculateAccessFee(currentPrincipal, currentCycle, currentRate);
            const adjTotal = currentPrincipal + adjAccessFee + currentRegFee;
            const adjDaily = Math.ceil(adjTotal / currentCycle);
            const profitPerRequest = adjAccessFee + currentRegFee;

            return (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <button onClick={() => setEvalReq(req)} className="w-full text-left">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{profile?.full_name || 'Agent'}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1.5 py-0 h-4 uppercase tracking-wider',
                              isCfoApproved
                                ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400'
                                : isPending
                                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400'
                            )}
                          >
                            {isCfoApproved ? 'CFO Approved' : isPending ? 'Agent Applied' : 'Agent Ops Approved'}
                          </Badge>
                          <span>{profile?.phone} • {format(new Date(req.created_at), 'MMM d')}</span>
                          {!isPending && <span>• We earn <span className="text-emerald-600 font-bold">+{formatUGX(profitPerRequest)}</span></span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">{formatUGX(currentPrincipal)}</p>
                        <p className="text-[10px] text-muted-foreground">{currentCycle}d</p>
                      </div>
                    </div>
                  </button>

                  {/* Eligibility evaluation + edit toggle */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1"
                      onClick={() => setEvalReq(req)}
                    >
                      <Sparkles className="h-3 w-3 text-primary" /> View evaluation
                    </Button>
                    <Button
                      size="sm"
                      variant={isExpanded ? 'default' : 'outline'}
                      className="h-7 text-[11px] gap-1"
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    >
                      <Pencil className="h-3 w-3" /> {isExpanded ? 'Close editor' : 'Edit & disburse'}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {/* Editable principal & cycle days */}
                      <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/50">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Principal (UGX)</Label>
                          <Input
                            type="number"
                            value={currentPrincipal}
                            min={1000}
                            step={1000}
                            onChange={e => setAdjustedPrincipals(prev => ({ ...prev, [req.id]: Math.max(0, Number(e.target.value) || 0) }))}
                            disabled={isCfoApproved}
                            className="h-8 text-sm disabled:opacity-70"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cycle Days</Label>
                          <Input
                            type="number"
                            value={currentCycle}
                            min={1}
                            max={365}
                            onChange={e => setAdjustedCycles(prev => ({ ...prev, [req.id]: Math.max(1, Number(e.target.value) || 1) }))}
                            disabled={isCfoApproved}
                            className="h-8 text-sm disabled:opacity-70"
                          />
                        </div>
                      </div>

                      {/* Fee adjustment */}
                      <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold">Access Fee Rate</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-primary">{Math.round(currentRate * 100)}%</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              disabled={isCfoApproved}
                              onClick={() => setEditingRate(editingRate === req.id ? null : req.id)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {editingRate === req.id && !isCfoApproved && (
                          <Slider
                            min={28}
                            max={33}
                            step={1}
                            value={[Math.round(currentRate * 100)]}
                            onValueChange={([v]) => setAdjustedRates(prev => ({ ...prev, [req.id]: v / 100 }))}
                          />
                        )}
                      </div>

                      {/* Breakdown — live revenue preview */}
                      <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Principal Out</span><br /><span className="font-bold text-orange-600">{formatUGX(currentPrincipal)}</span></div>
                          <div><span className="text-muted-foreground">Access Fee</span><br /><span className="font-bold text-emerald-600">+{formatUGX(adjAccessFee)}</span></div>
                          <div><span className="text-muted-foreground">Registration Fee</span><br /><span className="font-bold text-emerald-600">+{formatUGX(currentRegFee)}</span></div>
                          <div><span className="text-muted-foreground">Total Payable by Agent</span><br /><span className="font-bold text-primary">{formatUGX(adjTotal)}</span></div>
                          <div><span className="text-muted-foreground">Daily Deduction</span><br /><span className="font-bold text-red-500">{formatUGX(adjDaily)}/d</span></div>
                          <div><span className="text-muted-foreground">We Earn (gross)</span><br /><span className="font-bold text-emerald-700">+{formatUGX(profitPerRequest)}</span></div>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-muted/30">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Reason</p>
                        <p className="text-xs">{req.reason}</p>
                      </div>

                      <Textarea
                        placeholder="CFO notes..."
                        value={notes[req.id] || ''}
                        onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                        rows={2}
                        className="text-sm"
                      />

                      {isCfoApproved ? (
                        <>
                          <Button
                            onClick={() => setConfirmingId(req.id)}
                            disabled={payMutation.isPending}
                            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-muted disabled:text-muted-foreground"
                          >
                            {payMutation.isPending
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <><Banknote className="h-4 w-4" /> Disburse {formatUGX(currentPrincipal)} to Withdrawable Wallet</>}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeApprovalMutation.mutate(req)}
                            disabled={revokeApprovalMutation.isPending || payMutation.isPending}
                            className="w-full h-7 text-[11px] text-muted-foreground"
                          >
                            {revokeApprovalMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke approval & re-open for editing'}
                          </Button>
                          <p className="text-[10px] text-muted-foreground text-center">
                            Approved by CFO{req.cfo_approved_at ? ` on ${format(new Date(req.cfo_approved_at), 'MMM d, HH:mm')}` : ''}. Edits are locked — revoke to change.
                          </p>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={() => approveMutation.mutate(req)}
                            disabled={approveMutation.isPending || currentPrincipal <= 0}
                            className="w-full gap-2 disabled:bg-muted disabled:text-muted-foreground"
                          >
                            {approveMutation.isPending
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <><CheckCircle2 className="h-4 w-4" /> Approve advance ({formatUGX(currentPrincipal)})</>}
                          </Button>
                          <p className="text-[10px] text-muted-foreground text-center">
                            Disbursement is locked until you approve. Principal, cycle days, and rate stay editable until then.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {/* Confirmation Dialog */}
      {(() => {
        const req = requests.find((r: any) => r.id === confirmingId);
        if (!req) return null;
        const profile = req.profiles;
        const principal = adjustedPrincipals[req.id] ?? Number(req.principal);
        const cycleDays = adjustedCycles[req.id] ?? Number(req.cycle_days);
        const rate = adjustedRates[req.id] ?? Number(req.monthly_rate);
        const regFee = calculateRegistrationFee(principal);
        const accessFee = calculateAccessFee(principal, cycleDays, rate);
        const totalPayable = principal + accessFee + regFee;
        const daily = Math.ceil(totalPayable / cycleDays);
        const weEarn = accessFee + regFee;
        const originalPrincipal = Number(req.principal);
        const originalCycle = Number(req.cycle_days);
        const principalChanged = principal !== originalPrincipal;
        const cycleChanged = cycleDays !== originalCycle;

        return (
          <Dialog open={!!confirmingId} onOpenChange={(open) => !open && setConfirmingId(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Confirm Agent Advance Payout
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Review the edited details before crediting {profile?.full_name || 'Agent'}&apos;s wallet.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {/* Agent identity */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{profile?.full_name || 'Agent'}</p>
                    <p className="text-[10px] text-muted-foreground">{profile?.phone}</p>
                  </div>
                </div>

                {/* Key figures */}
                <div className="rounded-lg border divide-y text-xs">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Principal to Wallet</span>
                    <span className={cn('font-mono font-bold', principalChanged ? 'text-amber-600' : 'text-foreground')}>
                      {formatUGX(principal)}
                      {principalChanged && <span className="ml-1 text-[10px] text-muted-foreground">(was {formatUGX(originalPrincipal)})</span>}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Cycle Days</span>
                    <span className={cn('font-mono font-bold', cycleChanged ? 'text-amber-600' : 'text-foreground')}>
                      {cycleDays} days
                      {cycleChanged && <span className="ml-1 text-[10px] text-muted-foreground">(was {originalCycle})</span>}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Monthly Rate</span>
                    <span className="font-mono font-bold">{Math.round(rate * 100)}%</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Access Fee</span>
                    <span className="font-mono font-bold text-emerald-600">+{formatUGX(accessFee)}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Registration Fee</span>
                    <span className="font-mono font-bold text-emerald-600">+{formatUGX(regFee)}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 bg-muted/30">
                    <span className="font-bold">Total Payable by Agent</span>
                    <span className="font-mono font-bold text-primary">{formatUGX(totalPayable)}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 bg-muted/30">
                    <span className="font-bold">Daily Deduction</span>
                    <span className="font-mono font-bold text-red-500">{formatUGX(daily)}/d</span>
                  </div>
                </div>

                {/* Ledger entries preview — exactly what create_ledger_transaction will post */}
                <div className="rounded-lg border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Ledger entries to be posted
                    </p>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                      {regFee > 0 ? '4 legs · 2 txns' : '2 legs · 1 txn'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Double-entry, balanced. <span className="font-mono">source_table=agent_advance_requests</span>, <span className="font-mono">source_id={req.id.slice(0, 8)}…</span>
                  </p>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-[10px] font-mono">
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th className="text-left px-1 py-1">#</th>
                          <th className="text-left px-1 py-1">Scope</th>
                          <th className="text-left px-1 py-1">Dir</th>
                          <th className="text-left px-1 py-1">Category</th>
                          <th className="text-right px-1 py-1">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="px-1 py-1">1</td>
                          <td className="px-1 py-1">wallet</td>
                          <td className="px-1 py-1 text-emerald-600">cash_in</td>
                          <td className="px-1 py-1">agent_advance_credit</td>
                          <td className="px-1 py-1 text-right text-emerald-600">+{formatUGX(principal)}</td>
                        </tr>
                        <tr className="border-b">
                          <td className="px-1 py-1">2</td>
                          <td className="px-1 py-1">platform</td>
                          <td className="px-1 py-1 text-red-600">cash_out</td>
                          <td className="px-1 py-1">rent_disbursement</td>
                          <td className="px-1 py-1 text-right text-red-600">-{formatUGX(principal)}</td>
                        </tr>
                        {regFee > 0 && (
                          <>
                            <tr className="border-b">
                              <td className="px-1 py-1">3</td>
                              <td className="px-1 py-1">platform</td>
                              <td className="px-1 py-1 text-emerald-600">cash_in</td>
                              <td className="px-1 py-1">registration_fee_collected</td>
                              <td className="px-1 py-1 text-right text-emerald-600">+{formatUGX(regFee)}</td>
                            </tr>
                            <tr>
                              <td className="px-1 py-1">4</td>
                              <td className="px-1 py-1">wallet</td>
                              <td className="px-1 py-1 text-red-600">cash_out</td>
                              <td className="px-1 py-1">registration_fee_collected</td>
                              <td className="px-1 py-1 text-right text-red-600">-{formatUGX(regFee)}</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/40">
                          <td colSpan={3} className="px-1 py-1 font-bold">Net (must balance)</td>
                          <td className="px-1 py-1 text-right text-muted-foreground">wallet / platform</td>
                          <td className="px-1 py-1 text-right font-bold">
                            {formatUGX(0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t">
                    <p>· Also inserts <span className="font-mono">agent_advances</span> row (principal {formatUGX(principal)}, outstanding {formatUGX(totalPayable)}, {cycleDays}d, rate {Math.round(rate * 100)}%).</p>
                    <p>· Access fee <span className="font-mono text-emerald-700">+{formatUGX(accessFee)}</span> is recognised over {cycleDays}d by the daily deduction engine — not posted now.</p>
                  </div>
                </div>

                {/* Revenue summary */}
                <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">How Welile earns</p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Gross revenue on this advance</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">+{formatUGX(weEarn)}</span>
                  </div>
                </div>

                {notes[req.id] && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 p-2">
                    <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">CFO Note</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">{notes[req.id]}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setConfirmingId(null)}
                  className="w-full sm:w-auto"
                >
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button
                  onClick={() => {
                    payMutation.mutate(req);
                    setConfirmingId(null);
                  }}
                  disabled={payMutation.isPending}
                  className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {payMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm &amp; Disburse {formatUGX(principal)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Shared advance-eligibility evaluation popup — identical to Agent Ops */}
      <AgentAdvanceEvaluationDialog
        req={evalReq}
        agentId={evalReq?.agent_id}
        agentName={evalReq?.profiles?.full_name}
        onClose={() => setEvalReq(null)}
        footer={evalReq ? (
          <Button
            className="w-full gap-1.5"
            onClick={() => {
              const id = evalReq.id;
              setEvalReq(null);
              setExpandedId(id);
            }}
          >
            <Pencil className="h-4 w-4" /> Edit &amp; disburse this advance
          </Button>
        ) : null}
      />
    </div>
  );
}
