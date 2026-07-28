import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { formatUGX, calculateAccessFee, calculateRegistrationFee } from '@/lib/agentAdvanceCalculations';
import { disburseAgentAdvanceRequest } from '@/lib/disburseAgentAdvance';
import { DuplicateAccountAlert, useAgentDuplicateMap } from '@/components/ops/DuplicateAccountAlert';

/** Hard guardrails — deliberately conservative to stop fat-finger issuance. */
const MIN_PRINCIPAL = 50_000;
const MAX_PRINCIPAL = 3_000_000;
const STEP = 1_000;
const MIN_REASON = 15;

const RATE_OPTIONS = [
  { label: '33% / month (standard)', value: '0.33' },
  { label: '28% / month', value: '0.28' },
  { label: '25% / month', value: '0.25' },
];
const CYCLE_OPTIONS = ['30', '60', '90'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function CFOInitiateAdvanceDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [agent, setAgent] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [cycleDays, setCycleDays] = useState('30');
  const [rate, setRate] = useState('0.33');
  const [reason, setReason] = useState('');
  const [confirmAmount, setConfirmAmount] = useState('');
  const [ackRisk, setAckRisk] = useState(false);
  const [overrideLimit, setOverrideLimit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAgent(null); setAmount(''); setCycleDays('30'); setRate('0.33');
    setReason(''); setConfirmAmount(''); setAckRisk(false); setOverrideLimit(false);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  const { data: duplicateMap = {} } = useAgentDuplicateMap(agent ? [agent.id] : []);

  // Eligibility: existing exposure + computed limit for this one agent.
  const [checking, setChecking] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    if (!agent) { setBlockers([]); setLimit(null); return; }
    let active = true;
    (async () => {
      setChecking(true);
      const found: string[] = [];
      try {
        const [{ data: roles }, { data: actives }, { data: pending }] = await Promise.all([
          supabase.from('user_roles').select('role').eq('user_id', agent.id).eq('enabled', true),
          supabase.from('agent_advances').select('id,outstanding_balance,status').eq('agent_id', agent.id).in('status', ['active', 'overdue']),
          supabase.from('agent_advance_requests').select('id,status').eq('agent_id', agent.id)
            .in('status', ['pending', 'agent_ops_approved', 'cfo_approved']),
        ]);
        if (!active) return;
        const roleList = (roles || []).map((r: any) => String(r.role));
        if (!roleList.includes('agent') && !roleList.includes('senior_agent') && !roleList.includes('sub_agent')) {
          found.push('This user does not hold an agent role — advances are for agents only.');
        }
        if ((actives || []).length > 0) {
          const out = (actives || []).reduce((s: number, a: any) => s + Number(a.outstanding_balance || 0), 0);
          found.push(`Agent already has an ongoing advance (outstanding ${formatUGX(out)}). Clear it before issuing another.`);
        }
        if ((pending || []).length > 0) {
          found.push('Agent has a request already moving through the approval pipeline — use that request instead.');
        }

        const { data: limitRows } = await supabase.rpc('get_agent_advance_limits' as any, {
          _search: agent.phone || agent.full_name, _limit: 25, _offset: 0,
        } as any);
        if (!active) return;
        const row = (limitRows as any[] | null)?.find((r) => r.agent_id === agent.id);
        setLimit(row ? Number(row.total_limit || 0) : null);
      } catch (e: any) {
        found.push(e.message || 'Eligibility check failed');
      }
      if (active) { setBlockers(found); setChecking(false); }
    })();
    return () => { active = false; };
  }, [agent]);

  const principal = Number(String(amount).replace(/[^0-9]/g, '')) || 0;
  const days = Number(cycleDays);
  const monthlyRate = Number(rate);
  const accessFee = principal > 0 ? calculateAccessFee(principal, days, monthlyRate) : 0;
  const registrationFee = principal > 0 ? calculateRegistrationFee(principal) : 0;
  const totalPayable = principal + accessFee + registrationFee;
  const daily = principal > 0 ? Math.ceil(totalPayable / days) : 0;

  const overLimit = limit !== null && principal > limit;

  const amountErrors = useMemo(() => {
    const errs: string[] = [];
    if (principal <= 0) errs.push('Enter an amount.');
    else {
      if (principal < MIN_PRINCIPAL) errs.push(`Minimum advance is ${formatUGX(MIN_PRINCIPAL)}.`);
      if (principal > MAX_PRINCIPAL) errs.push(`Maximum staff-initiated advance is ${formatUGX(MAX_PRINCIPAL)}.`);
      if (principal % STEP !== 0) errs.push(`Amount must be a multiple of ${formatUGX(STEP)}.`);
    }
    return errs;
  }, [principal]);

  const canSubmit =
    !!agent &&
    !checking &&
    blockers.length === 0 &&
    amountErrors.length === 0 &&
    reason.trim().length >= MIN_REASON &&
    ackRisk &&
    (!overLimit || overrideLimit) &&
    confirmAmount.replace(/[^0-9]/g, '') === String(principal) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !agent || !user?.id) return;
    setSubmitting(true);
    try {
      // 1. Create the originating request row so the advance keeps a paper trail.
      const { data: req, error: reqErr } = await supabase
        .from('agent_advance_requests')
        .insert({
          agent_id: agent.id,
          principal,
          cycle_days: days,
          monthly_rate: monthlyRate,
          access_fee: accessFee,
          registration_fee: registrationFee,
          total_payable: totalPayable,
          daily_payment: daily,
          reason: `[CFO-initiated] ${reason.trim()}`,
          status: 'cfo_approved',
          cfo_approved_by: user.id,
          cfo_approved_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (reqErr) throw reqErr;

      // 2. Disburse through the single shared disbursement path.
      await disburseAgentAdvanceRequest({
        req,
        actorId: user.id,
        principal,
        cycleDays: days,
        monthlyRate,
        notes: `CFO-initiated advance · ${reason.trim()}`,
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'cfo_initiated_advance',
        table_name: 'agent_advance_requests',
        record_id: req.id,
        metadata: {
          agent_id: agent.id,
          agent_name: agent.full_name,
          principal,
          cycle_days: days,
          monthly_rate: monthlyRate,
          total_payable: totalPayable,
          reason: reason.trim(),
          over_limit: overLimit,
          computed_limit: limit,
        },
      });

      toast.success(`Advance of ${formatUGX(principal)} issued to ${agent.full_name}`);
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Advance issuance failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> CFO-initiated advance
          </DialogTitle>
          <DialogDescription>
            One agent at a time. Bulk issuance is not available by design.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <UserSearchPicker
            label="Agent"
            placeholder="Search agent by name or phone..."
            selectedUser={agent}
            onSelect={(u) => setAgent(u as any)}
          />

          {agent && checking && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running eligibility checks...
            </p>
          )}

          {agent && !checking && blockers.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-1">
              {blockers.map((b) => (
                <p key={b} className="text-xs font-medium text-destructive flex gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {b}
                </p>
              ))}
            </div>
          )}

          {agent && !checking && blockers.length === 0 && (
            <p className="text-xs font-medium text-emerald-600 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Eligible
              {limit !== null && <> · computed limit {formatUGX(limit)}</>}
            </p>
          )}

          {agent && <DuplicateAccountAlert dups={duplicateMap[agent.id]} />}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Amount (UGX)</Label>
              <Input
                inputMode="numeric"
                placeholder={`${MIN_PRINCIPAL.toLocaleString()} – ${MAX_PRINCIPAL.toLocaleString()}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                className="mt-1"
              />
              {amount !== '' && amountErrors.map((e) => (
                <p key={e} className="text-[11px] text-destructive mt-1">{e}</p>
              ))}
              {overLimit && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Above the agent's computed limit of {formatUGX(limit || 0)}.
                </p>
              )}
            </div>
            <div>
              <Label>Cycle (days)</Label>
              <Select value={cycleDays} onValueChange={setCycleDays}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLE_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d} days</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Access fee rate</Label>
              <Select value={rate} onValueChange={setRate}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {principal > 0 && amountErrors.length === 0 && (
            <div className="rounded-xl border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span className="font-semibold">{formatUGX(principal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Access fee</span><span className="font-semibold">{formatUGX(accessFee)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Registration fee</span><span className="font-semibold">{formatUGX(registrationFee)}</span></div>
              <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Total repayable</span><span className="font-bold">{formatUGX(totalPayable)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Daily deduction</span><span className="font-semibold">{formatUGX(daily)}</span></div>
            </div>
          )}

          <div>
            <Label>Reason (min {MIN_REASON} characters)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="Why is the CFO issuing this advance directly?"
              className="mt-1 text-sm"
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground mt-1">{reason.trim().length}/{MIN_REASON}</p>
          </div>

          {overLimit && (
            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={overrideLimit} onCheckedChange={(c) => setOverrideLimit(!!c)} className="mt-0.5" />
              <span>I am knowingly issuing above the agent's computed limit.</span>
            </label>
          )}

          <div>
            <Label>Re-type the amount to confirm</Label>
            <Input
              inputMode="numeric"
              value={confirmAmount}
              onChange={(e) => setConfirmAmount(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Exact amount in figures"
              className="mt-1"
            />
          </div>

          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={ackRisk} onCheckedChange={(c) => setAckRisk(!!c)} className="mt-0.5" />
            <span>
              I confirm this disbursement is intentional, credits the agent's wallet immediately
              and starts daily deductions. It cannot be undone from this screen.
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Issue {principal > 0 ? formatUGX(principal) : 'advance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CFOInitiateAdvanceDialog;
