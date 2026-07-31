import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import HRPlaceholderPage from '@/hr/pages/HRPlaceholderPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createPeriod,
  createRun,
  listPeriods,
  listRuleVersions,
  listRuns,
  type PayPeriodRow,
  type PayRuleVersionOption,
  type PayRunRow,
} from '@/hr/pay/api/runs';
import { calculateRun, getRunDetail, type RunDetail } from '@/hr/pay/api/calculate';
import { approveRun, lockRun, returnRun, submitRun } from '@/hr/pay/api/workflow';
import PayrollRegister from '@/hr/pay/PayrollRegister';
import { supabase } from '@/hr/api/client';

/**
 * Authority is read from the database authority register via rpc
 * (hr_pay_is_preparer / hr_pay_is_approver / hr_pay_is_releaser). It is never
 * inferred from the signed-in user's roles.
 */
function useRunAuthority() {
  const [authority, setAuthority] = useState({
    preparer: false,
    approver: false,
    releaser: false,
    loaded: false,
  });
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [prep, appr, rel] = await Promise.all([
        (supabase.rpc as any)('hr_pay_is_preparer'),
        (supabase.rpc as any)('hr_pay_is_approver'),
        (supabase.rpc as any)('hr_pay_is_releaser'),
      ]);
      if (!alive) return;
      setAuthority({
        preparer: prep?.data === true,
        approver: appr?.data === true,
        releaser: rel?.data === true,
        loaded: true,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);
  return authority;
}

function RunActionBar({ runId, status, onDone }: { runId: string; status: string; onDone: () => void }) {
  const authority = useRunAuthority();
  const [busy, setBusy] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.success(message);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const showSubmit = status === 'calculated' || status === 'returned';
  const showReview = status === 'in_review';
  const showLock = status === 'paid';
  if (!showSubmit && !showReview && !showLock) return null;

  const submitDenied = !authority.preparer;
  const approveDenied = !authority.approver;
  const lockDenied = !authority.releaser;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {showSubmit && (
          <Button
            size="sm"
            disabled={busy || submitDenied}
            title={
              submitDenied
                ? 'Your position does not hold prepare authority for payroll runs.'
                : 'Send this run to the position holding approve authority.'
            }
            onClick={() => {
              if (!window.confirm('This sends the run to the position holding approve authority.')) return;
              void act(() => submitRun(runId, 'Submitted for approval.'), 'Run submitted for approval.');
            }}
          >
            Submit for approval
          </Button>
        )}
        {showReview && (
          <>
            <Button
              size="sm"
              disabled={busy || approveDenied}
              title={
                approveDenied
                  ? 'Your position does not hold approve authority for payroll runs.'
                  : 'Approve this run.'
              }
              onClick={() => void act(() => approveRun(runId, 'Approved.'), 'Run approved.')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || approveDenied}
              title={
                approveDenied
                  ? 'Your position does not hold approve authority for payroll runs.'
                  : 'Return this run for rework.'
              }
              onClick={() => setReturnOpen(true)}
            >
              Return for rework
            </Button>
          </>
        )}
        {showLock && (
          <Button
            size="sm"
            disabled={busy || lockDenied}
            title={
              lockDenied
                ? 'Your position does not hold release authority for payroll runs.'
                : 'Lock this run.'
            }
            onClick={() => void act(() => lockRun(runId, 'Locked.'), 'Run locked.')}
          >
            Lock
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return for rework</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="return-reason">Reason</Label>
            <Textarea
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Why it is going back. This is the audit record.
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={busy || reason.trim().length < 10}
              onClick={() =>
                void act(() => returnRun(runId, reason), 'Run returned for rework.').then(() => {
                  setReturnOpen(false);
                  setReason('');
                })
              }
            >
              Return run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Whole-shilling display with thousands separators. */
function formatNet(value: number | null): string {
  if (value === null || value === undefined) return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(numeric);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function firstOfNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = String(next.getMonth() + 1).padStart(2, '0');
  return `${next.getFullYear()}-${month}-01`;
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  calculated: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-800',
  returned: 'bg-destructive/15 text-destructive',
  approved: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-emerald-100 text-emerald-700',
  locked: 'bg-slate-700 text-slate-50',
};

function StatusCell({ status }: { status: string }) {
  const cls = STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function RuleStatusBadge({ value }: { value: string | null }) {
  if (value === 'provisional') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        PROVISIONAL
      </span>
    );
  }
  if (value === 'verified') {
    return (
      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Verified
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function NewPeriodDialog({
  disabled,
  onCreated,
}: {
  disabled: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [periodMonth, setPeriodMonth] = useState(firstOfNextMonth());
  const [cutOffDate, setCutOffDate] = useState('');
  const [payDate, setPayDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code.trim()) {
      setError('A period code is required.');
      return;
    }
    if (!periodMonth || !cutOffDate || !payDate) {
      setError('Month, cut-off date and pay date are all required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPeriod({
        code: code.trim(),
        periodMonth,
        cutOffDate,
        payDate,
      });
      setOpen(false);
      setCode('');
      setPeriodMonth(firstOfNextMonth());
      setCutOffDate('');
      setPayDate('');
      onCreated();
      toast.success('Period created.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          New period
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New pay period</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="period-code">Code</Label>
            <Input id="period-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <p className="text-xs text-muted-foreground">For example 2026-08</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-month">Month</Label>
            <Input
              id="period-month"
              type="date"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-cutoff">Cut-off date</Label>
            <Input
              id="period-cutoff"
              type="date"
              value={cutOffDate}
              onChange={(e) => setCutOffDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-pay">Pay date</Label>
            <Input
              id="period-pay"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRunDialog({
  openPeriods,
  ruleVersions,
  onCreated,
}: {
  openPeriods: PayPeriodRow[];
  ruleVersions: PayRuleVersionOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [runType, setRunType] = useState('regular');
  const [ruleVersionId, setRuleVersionId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!periodId || !ruleVersionId) {
      setError('Choose a period and a rule version.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRun({ periodId, runType, ruleVersionId, note: note.trim() });
      setOpen(false);
      setPeriodId('');
      setRunType('regular');
      setRuleVersionId('');
      setNote('');
      onCreated();
      toast.success('Run created.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New run</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New pay run</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="run-period">Period</Label>
            <select
              id="run-period"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Select a period</option>
              {openPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-type">Run type</Label>
            <select
              id="run-type"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={runType}
              onChange={(e) => setRunType(e.target.value)}
            >
              <option value="regular">regular</option>
              <option value="adjustment">adjustment</option>
              <option value="off_cycle">off_cycle</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-rule">Rule version</Label>
            <select
              id="run-rule"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={ruleVersionId}
              onChange={(e) => setRuleVersionId(e.target.value)}
            >
              <option value="">Select a rule version</option>
              {ruleVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.verified_at ? v.code : `${v.code} — PROVISIONAL`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-note">Note</Label>
            <Textarea
              id="run-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PayRuns() {
  const [periods, setPeriods] = useState<PayPeriodRow[]>([]);
  const [runs, setRuns] = useState<PayRunRow[]>([]);
  const [ruleVersions, setRuleVersions] = useState<PayRuleVersionOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, v] = await Promise.all([listPeriods(), listRuns(), listRuleVersions()]);
      setPeriods(p);
      setRuns(r);
      setRuleVersions(v);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPeriods = useMemo(() => periods.filter((p) => p.status === 'open'), [periods]);
  const hasOpenPeriod = openPeriods.length > 0;

  return (
    <HRPlaceholderPage
      heading="Pay runs"
      subtitle="One open period at a time. Status changes are recorded as events, never written directly."
    >
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">Periods</CardTitle>
          {hasOpenPeriod && (
            <p role="alert" className="text-xs font-medium text-amber-700">
              A period is already open. Close it before opening another.
            </p>
          )}
          <div>
            <NewPeriodDialog disabled={hasOpenPeriod} onCreated={() => void load()} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : periods.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No periods yet. Open the first one to begin payroll.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Cut-off</TableHead>
                  <TableHead>Pay date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.code}</TableCell>
                    <TableCell>{formatDate(p.period_month)}</TableCell>
                    <TableCell>{formatDate(p.cut_off_date)}</TableCell>
                    <TableCell>{formatDate(p.pay_date)}</TableCell>
                    <TableCell>{p.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Runs</CardTitle>
          <NewRunDialog
            openPeriods={openPeriods}
            ruleVersions={ruleVersions}
            onCreated={() => void load()}
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No runs yet. Create one against the open period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Rule version</TableHead>
                  <TableHead>Rule status</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prepared at</TableHead>
                  <TableHead className="text-right">Net total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        to={`/hr/pay/runs/${r.id}`}
                        className="font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {r.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>{r.period_code ?? '—'}</TableCell>
                    <TableCell>{r.run_type}</TableCell>
                    <TableCell>{r.rule_version_code ?? '—'}</TableCell>
                    <TableCell>
                      <RuleStatusBadge value={r.rule_status_at_run} />
                    </TableCell>
                    <TableCell>
                      <StatusCell status={r.status} />
                    </TableCell>
                    <TableCell>{formatDate(r.prepared_at)}</TableCell>
                    <TableCell className="text-right">{formatNet(r.total_net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Provisional runs were computed against a rule set that has not been confirmed by a tax
            advisor. They are tracked for settlement once a verified version is loaded.
          </p>
        </CardContent>
      </Card>
    </HRPlaceholderPage>
  );
}

/** Run detail: summary, calculation, payslips and the event timeline. */
export function PayRunDetailPlaceholder() {
  const { runId } = useParams<{ runId: string }>();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setDetail(await getRunDetail(runId));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canCalculate =
    !!detail && ['draft', 'calculated', 'returned'].includes(detail.status) && !calculating;

  const runCalculation = async () => {
    if (!runId) return;
    setCalculating(true);
    setCalcError(null);
    try {
      const res = await calculateRun(runId);
      toast.success(res.message);
      await load();
    } catch (err) {
      setCalcError((err as Error).message);
    } finally {
      setCalculating(false);
    }
  };

  const totals = useMemo(() => {
    const rows = detail?.payslips ?? [];
    return rows.reduce(
      (acc, r) => ({
        gross: acc.gross + r.gross,
        paye: acc.paye + r.paye,
        nssf: acc.nssf + r.nssf_employee,
        lst: acc.lst + r.lst,
        other: acc.other + r.other_deductions,
        net: acc.net + r.net,
      }),
      { gross: 0, paye: 0, nssf: 0, lst: 0, other: 0, net: 0 },
    );
  }, [detail]);

  const provisional = detail?.rule_status_at_run === 'provisional';

  return (
    <HRPlaceholderPage
      heading="Payroll run"
      subtitle={
        detail
          ? `${detail.period_code ?? 'Period'} · ${detail.id.slice(0, 8)} · ${detail.run_type}`
          : (runId ?? '').slice(0, 8)
      }
    >
      {loading && (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
          Loading run…
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {loadError}
        </p>
      )}

      {detail && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  {detail.period_code ?? 'Period'} · {detail.id.slice(0, 8)} · {detail.run_type}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <StatusCell status={detail.status} />
                  <RuleStatusBadge value={detail.rule_status_at_run} />
                </div>
                {provisional && (
                  <p className="text-xs text-muted-foreground">
                    Computed against a rule set that has not been confirmed by a tax advisor.
                    Tracked for settlement once a verified version is loaded.
                  </p>
                )}
              </div>
              <div className="text-right">
                <Button size="sm" onClick={runCalculation} disabled={!canCalculate}>
                  {calculating && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {calculating ? 'Calculating…' : 'Calculate'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {calcError && (
                <p role="alert" className="mb-3 text-xs font-medium text-destructive">
                  {calcError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Employees</p>
                  <p className="text-lg font-semibold">{detail.payslips.length}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Total gross</p>
                  <p className="text-lg font-semibold">{formatNet(detail.total_gross)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Total net</p>
                  <p className="text-lg font-semibold">{formatNet(detail.total_net)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Total employer cost
                  </p>
                  <p className="text-lg font-semibold">
                    {formatNet(detail.total_employer_cost)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Cut-off {formatDate(detail.cut_off_date)} · Pay date {formatDate(detail.pay_date)}
                {detail.rule_version_code ? ` · Rule ${detail.rule_version_code}` : ''}
              </p>
              <RunActionBar runId={detail.id} status={detail.status} onDone={() => void load()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payslips</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.payslips.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not calculated yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff reference</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead className="text-right">NSSF employee</TableHead>
                      <TableHead className="text-right">LST</TableHead>
                      <TableHead className="text-right">Other deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.payslips.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">
                          <Link className="underline" to={`/hr/pay/payslips/${p.id}`}>
                            {p.staff_ref ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link className="underline" to={`/hr/pay/payslips/${p.id}`}>
                            {p.staff_name ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">{formatNet(p.gross)}</TableCell>
                        <TableCell className="text-right">{formatNet(p.paye)}</TableCell>
                        <TableCell className="text-right">
                          {formatNet(p.nssf_employee)}
                        </TableCell>
                        <TableCell className="text-right">{formatNet(p.lst)}</TableCell>
                        <TableCell className="text-right">
                          {formatNet(p.other_deductions)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatNet(p.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell>{detail.payslips.length} employees</TableCell>
                      <TableCell className="text-right">{formatNet(totals.gross)}</TableCell>
                      <TableCell className="text-right">{formatNet(totals.paye)}</TableCell>
                      <TableCell className="text-right">{formatNet(totals.nssf)}</TableCell>
                      <TableCell className="text-right">{formatNet(totals.lst)}</TableCell>
                      <TableCell className="text-right">{formatNet(totals.other)}</TableCell>
                      <TableCell className="text-right">{formatNet(totals.net)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <PayrollRegister runId={detail.id} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {detail.events.map((e) => (
                    <li key={e.id} className="border-l-2 border-border pl-3">
                      <p className="text-sm font-semibold">{e.event_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.actor_name ?? 'System'}
                        {e.actor_position_title ? ` · ${e.actor_position_title}` : ''} ·{' '}
                        {new Date(e.created_at).toLocaleString('en-GB')}
                      </p>
                      {e.note && <p className="mt-1 text-xs">{e.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </HRPlaceholderPage>
  );
}