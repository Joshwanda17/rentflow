import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listComponents, listGrades, type PayComponentRow, type PayGradeRow } from '@/hr/pay/api/config';
import { supabase } from '@/integrations/supabase/client';
import {
  addCompensation,
  listCompensation,
  listStaffForPayroll,
  type CompensationRow,
  type PayrollStaffOption,
} from '@/hr/pay/api/compensation';

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value);
}

/** Raw database / network error, verbatim. Never a generic phrase. */
function rawError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

const EFFECTIVE_FROM_HELP =
  "The month this amount starts. To include someone in a payroll run, this date must be on or before the last day of that run's period.";
const NO_OPEN_PERIOD = 'Open a pay period first.';

/** First day of the OPEN pay period, resolved from hr_pay_periods.period_month. */
async function openPeriodFirstDay(): Promise<string | null> {
  const { data, error } = await supabase
    .from('hr_pay_periods')
    .select('period_month')
    .eq('status', 'open')
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.period_month) return null;
  return `${String(data.period_month).slice(0, 7)}-01`;
}

function AddRecordDialog({
  components,
  grades,
  onSave,
}: {
  components: PayComponentRow[];
  grades: PayGradeRow[];
  onSave: (
    componentId: string,
    gradeId: string | null,
    amount: number,
    effectiveFrom: string,
    reason: string,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [componentId, setComponentId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void openPeriodFirstDay().then((first) => {
      if (cancelled) return;
      setPeriodStart(first);
      setEffectiveFrom(first ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const earnings = components.filter((c) => c.kind === 'earning');
  const deductions = components.filter((c) => c.kind === 'deduction');

  const reset = () => {
    setComponentId('');
    setGradeId('');
    setAmount('');
    setEffectiveFrom('');
    setReason('');
    setError(null);
  };

  const save = async () => {
    const value = Number(amount);
    if (!componentId) {
      setError('Pick the component this amount belongs to.');
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      setError('Amount must be a number of shillings, zero or more.');
      return;
    }
    if (!effectiveFrom) {
      setError(periodStart ? 'An effective-from date is required.' : NO_OPEN_PERIOD);
      return;
    }
    if (reason.trim().length < 10) {
      setError('The reason must be at least 10 characters.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(componentId, gradeId || null, value, effectiveFrom, reason.trim());
      setOpen(false);
      reset();
    } catch (err) {
      setError(rawError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add record
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add compensation record</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Component</Label>
            <Select value={componentId} onValueChange={setComponentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a component" />
              </SelectTrigger>
              <SelectContent>
                {earnings.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Earnings</SelectLabel>
                    {earnings.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {deductions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Deductions</SelectLabel>
                    {deductions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Grade (optional)</Label>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger>
                <SelectValue placeholder="No grade" />
              </SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.code} — {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-amount">Amount</Label>
            <Input
              id="comp-amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-from">Effective from</Label>
            <Input
              id="comp-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => {
                setEffectiveFrom(e.target.value);
                setError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{EFFECTIVE_FROM_HELP}</p>
            {!periodStart ? (
              <p className="text-xs font-medium text-destructive">{NO_OPEN_PERIOD}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-reason">Reason</Label>
            <Input
              id="comp-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Why this amount changed. This is the audit record.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={save} disabled={saving || !periodStart}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Compensation() {
  const [staff, setStaff] = useState<PayrollStaffOption[]>([]);
  const [components, setComponents] = useState<PayComponentRow[]>([]);
  const [grades, setGrades] = useState<PayGradeRow[]>([]);
  const [staffId, setStaffId] = useState('');
  const [rows, setRows] = useState<CompensationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [s, c, g] = await Promise.all([
          listStaffForPayroll(),
          listComponents(),
          listGrades(),
        ]);
        setStaff(s);
        setComponents(c);
        setGrades(g);
      } catch (err) {
        toast.error((err as Error).message);
      }
    })();
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setRows(await listCompensation(id));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectStaff = (id: string) => {
    setStaffId(id);
    setRevealed(false);
    setRows([]);
    void load(id);
  };

  const selectableComponents = useMemo(
    () =>
      components.filter(
        (c) =>
          c.active &&
          (c.kind === 'earning' || (c.kind === 'deduction' && !c.is_statutory)),
      ),
    [components],
  );

  const openRows = useMemo(() => rows.filter((r) => r.effective_to === null), [rows]);
  const currentGross = useMemo(
    () =>
      openRows
        .filter((r) => r.component_kind === 'earning')
        .reduce((sum, r) => sum + r.amount, 0),
    [openRows],
  );

  const selected = staff.find((s) => s.staffId === staffId) ?? null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compensation</h1>
        <p className="text-sm text-muted-foreground">
          Effective-dated and append-only. A change is a new record, never an edit.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={staffId} onValueChange={selectStaff}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select a staff member" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.staffId} value={s.staffId}>
                  {s.name}
                  {s.department || s.position
                    ? ` — ${[s.department, s.position].filter(Boolean).join(' / ')}`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {staffId && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 pt-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current gross
                </p>
                {revealed ? (
                  <p className="text-2xl font-semibold">UGX {formatAmount(currentGross)}</p>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Reveal
                  </Button>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Open components
                </p>
                <p className="text-2xl font-semibold">{openRows.length}</p>
              </div>
              <p className="text-xs text-muted-foreground">Viewing a salary is recorded.</p>
              <div className="ml-auto">
                <AddRecordDialog
                  components={selectableComponents}
                  grades={grades}
                  onSave={async (componentId, gradeId, amount, effectiveFrom, reason) => {
                    await addCompensation(
                      staffId,
                      componentId,
                      gradeId,
                      amount,
                      effectiveFrom,
                      reason,
                    );
                    toast.success('Compensation record added');
                    await load(staffId);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Compensation records{selected ? ` — ${selected.name}` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Effective from</TableHead>
                    <TableHead>Effective to</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        Loading records…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        No compensation records for this staff member yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => {
                    const superseded = r.effective_to !== null;
                    return (
                      <TableRow key={r.id} className={superseded ? 'text-muted-foreground' : ''}>
                        <TableCell>
                          {r.component_name} ({r.component_code})
                        </TableCell>
                        <TableCell>{r.grade_code ?? '—'}</TableCell>
                        <TableCell className="text-right font-medium">
                          {revealed ? formatAmount(r.amount) : '••••••'}
                        </TableCell>
                        <TableCell>{r.effective_from}</TableCell>
                        <TableCell>{r.effective_to ?? '—'}</TableCell>
                        <TableCell className="max-w-[18rem] truncate">{r.reason}</TableCell>
                        <TableCell>{superseded ? 'Superseded' : 'Current'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Records cannot be edited or deleted. To change an amount, add a new record and the
                current one is closed automatically.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}