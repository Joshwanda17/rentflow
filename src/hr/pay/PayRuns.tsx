import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

/** Placeholder so run links resolve. The real screen comes next. */
export function PayRunDetailPlaceholder() {
  const runId = window.location.pathname.split('/').pop() ?? '';
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Run detail</h1>
      <p className="mt-2 font-mono text-sm text-muted-foreground">{runId}</p>
    </div>
  );
}