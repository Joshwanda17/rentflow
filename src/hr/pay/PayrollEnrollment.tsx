import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import '@/hr/pay/print.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listEnrollment,
  setBasicPay,
  setStatutoryProfile,
  type EnrollmentRow,
} from '@/hr/pay/api/enrollment';
import { listComponents, type PayComponentRow } from '@/hr/pay/api/config';
import {
  addCompensation,
  listCompensation,
  type CompensationRow,
} from '@/hr/pay/api/compensation';

const EMPLOYMENT_TYPES = ['employee', 'consultant', 'casual', 'expatriate', 'director'];

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function firstOfThisMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-01`;
}

function isReady(row: EnrollmentRow): boolean {
  return row.basicAmount !== null && row.hasStatutoryProfile;
}

export default function PayrollEnrollment() {
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Statutory dialog state
  const [statRow, setStatRow] = useState<EnrollmentRow | null>(null);
  const [statType, setStatType] = useState('employee');
  const [statPaye, setStatPaye] = useState(true);
  const [statNssf, setStatNssf] = useState(true);
  const [statLst, setStatLst] = useState(true);
  const [statBasis, setStatBasis] = useState('');
  const [statError, setStatError] = useState('');

  // Basic pay dialog state
  const [payRow, setPayRow] = useState<EnrollmentRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFrom, setPayFrom] = useState(firstOfThisMonth());
  const [payReason, setPayReason] = useState('');
  const [payError, setPayError] = useState('');

  // Deductions dialog state
  const [dedRow, setDedRow] = useState<EnrollmentRow | null>(null);
  const [dedRecords, setDedRecords] = useState<CompensationRow[]>([]);
  const [dedLoading, setDedLoading] = useState(false);
  const [components, setComponents] = useState<PayComponentRow[]>([]);
  const [dedComponentId, setDedComponentId] = useState('');
  const [dedAmount, setDedAmount] = useState('');
  const [dedFrom, setDedFrom] = useState(firstOfThisMonth());
  const [dedReason, setDedReason] = useState('');
  const [dedError, setDedError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listEnrollment());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load enrollment');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listComponents()
      .then(setComponents)
      .catch(() => setComponents([]));
  }, []);

  const deductionComponents = useMemo(
    () => components.filter((c) => c.active && c.kind === 'deduction' && !c.is_statutory),
    [components],
  );

  const counts = useMemo(() => {
    const ready = rows.filter(isReady).length;
    return { total: rows.length, ready, incomplete: rows.length - ready };
  }, [rows]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          basic: acc.basic + (r.basicAmount ?? 0),
          allowances: acc.allowances + r.allowancesTotal,
          deductions: acc.deductions + r.deductionsTotal,
          gross: acc.gross + r.grossTotal,
          people: acc.people + 1,
        }),
        { basic: 0, allowances: 0, deductions: 0, gross: 0, people: 0 },
      ),
    [rows],
  );

  async function openDeductions(row: EnrollmentRow) {
    setDedRow(row);
    setDedRecords([]);
    setDedComponentId('');
    setDedAmount('');
    setDedFrom(firstOfThisMonth());
    setDedReason('');
    setDedError('');
    setDedLoading(true);
    try {
      const records = await listCompensation(row.staffId);
      setDedRecords(
        records.filter((r) => r.effective_to === null && r.component_kind === 'deduction'),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load deductions');
    } finally {
      setDedLoading(false);
    }
  }

  async function saveDeduction() {
    if (!dedRow) return;
    const amount = Number(dedAmount);
    if (!dedComponentId) {
      setDedError('Pick the deduction component.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setDedError('Enter a valid amount.');
      return;
    }
    if (!dedFrom) {
      setDedError('An effective-from date is required.');
      return;
    }
    if (dedReason.trim().length < 10) {
      setDedError('The reason must be at least 10 characters.');
      return;
    }
    setSaving(true);
    try {
      await addCompensation(
        dedRow.staffId,
        dedComponentId,
        null,
        amount,
        dedFrom,
        dedReason.trim(),
      );
      toast.success('Deduction recorded');
      setDedRow(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  function printSheet() {
    setReveal(true);
    setTimeout(() => window.print(), 50);
  }

  function openStatutory(row: EnrollmentRow, next: { paye: boolean; nssf: boolean; lst: boolean }) {
    setStatRow(row);
    setStatType(row.employmentType ?? 'employee');
    setStatPaye(next.paye);
    setStatNssf(next.nssf);
    setStatLst(next.lst);
    setStatBasis(row.exemptionBasis ?? '');
    setStatError('');
  }

  /** A tick change: all three on saves straight away, any off asks for the basis. */
  async function onToggleStatutory(
    row: EnrollmentRow,
    field: 'paye' | 'nssf' | 'lst',
    value: boolean,
  ) {
    const next = {
      paye: field === 'paye' ? value : row.payeApplicable,
      nssf: field === 'nssf' ? value : row.nssfApplicable,
      lst: field === 'lst' ? value : row.lstApplicable,
    };
    if (next.paye && next.nssf && next.lst) {
      setSaving(true);
      try {
        await setStatutoryProfile(row.staffId, row.employmentType ?? 'employee', true, true, true, '');
        toast.success('All statutory deductions apply');
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save');
      } finally {
        setSaving(false);
      }
      return;
    }
    openStatutory(row, next);
  }

  async function saveStatutory() {
    if (!statRow) return;
    const allOn = statPaye && statNssf && statLst;
    const basis = statBasis.trim();
    if (!allOn && basis.length < 10) {
      setStatError('The basis must be at least 10 characters.');
      return;
    }
    setSaving(true);
    try {
      await setStatutoryProfile(statRow.staffId, statType, statPaye, statNssf, statLst, allOn ? '' : basis);
      toast.success('Statutory profile recorded');
      setStatRow(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  function openPay(row: EnrollmentRow) {
    setPayRow(row);
    setPayAmount(row.basicAmount !== null ? String(row.basicAmount) : '');
    setPayFrom(firstOfThisMonth());
    setPayReason('');
    setPayError('');
  }

  async function savePay() {
    if (!payRow) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError('Enter a valid amount.');
      return;
    }
    if (payReason.trim().length < 10) {
      setPayError('The reason must be at least 10 characters.');
      return;
    }
    setSaving(true);
    try {
      await setBasicPay(payRow.staffId, amount, payFrom, payReason.trim());
      toast.success('Basic pay recorded');
      setPayRow(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="hidden print:block print:mb-4">
        <p className="text-sm font-semibold">Welile Technologies (U) Ltd</p>
        <h2 className="text-lg font-bold">Payroll enrollment sheet</h2>
        <p className="text-xs">{new Date().toLocaleDateString('en-GB')}</p>
        <p className="text-xs">Prepared for review. Not a payroll run.</p>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll enrollment</h1>
          <p className="text-sm text-muted-foreground">
            Every active worker, their basic pay, and which statutory deductions apply.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="reveal-amounts" checked={reveal} onCheckedChange={setReveal} />
            <Label htmlFor="reveal-amounts" className="text-sm">
              Reveal amounts
            </Label>
          </div>
          <Button variant="outline" size="sm" className="no-print" onClick={printSheet}>
            <Printer className="mr-2 h-4 w-4" />
            Print enrollment sheet
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Total active workers
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{counts.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Ready</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-600">
            {counts.ready}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Incomplete</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">
            {counts.incomplete}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Total monthly gross
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {reveal ? `UGX ${formatAmount(totals.gross)}` : '••••••'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading enrollment…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ref</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Employment type</TableHead>
                    <TableHead className="text-right">Basic pay</TableHead>
                    <TableHead className="text-right">Allowances</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead>Effective from</TableHead>
                    <TableHead>PAYE</TableHead>
                    <TableHead>NSSF</TableHead>
                    <TableHead>LST</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="p-6 text-sm text-muted-foreground">
                        No active staff members.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.staffId}>
                        <TableCell className="font-mono text-xs">{row.staffRef || '—'}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.department || '—'}</TableCell>
                        <TableCell>{row.position || '—'}</TableCell>
                        <TableCell>
                          <Select
                            value={row.employmentType ?? 'employee'}
                            onValueChange={(value) =>
                              void setStatutoryProfile(
                                row.staffId,
                                value,
                                row.payeApplicable,
                                row.nssfApplicable,
                                row.lstApplicable,
                                row.exemptionBasis ?? '',
                              )
                                .then(() => {
                                  toast.success('Employment type recorded');
                                  return load();
                                })
                                .catch((error: unknown) =>
                                  toast.error(
                                    error instanceof Error ? error.message : 'Could not save',
                                  ),
                                )
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EMPLOYMENT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.basicAmount === null ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openPay(row)}
                                className="text-xs font-medium text-destructive/70 underline-offset-2 hover:underline"
                              >
                                not set
                              </button>
                              <span className="hidden text-xs print:inline">not set</span>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openPay(row)}
                                className="font-mono text-sm tabular-nums underline-offset-2 hover:underline"
                              >
                                {reveal ? `UGX ${formatAmount(row.basicAmount)}` : '••••••'}
                              </button>
                              <span className="hidden font-mono text-sm tabular-nums print:inline">
                                {reveal ? formatAmount(row.basicAmount) : '••••••'}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {reveal ? formatAmount(row.allowancesTotal) : '••••••'}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => void openDeductions(row)}
                            className="font-mono text-sm tabular-nums underline-offset-2 hover:underline"
                          >
                            {reveal ? formatAmount(row.deductionsTotal) : '••••••'}
                          </button>
                          <span className="hidden font-mono text-sm tabular-nums print:inline">
                            {reveal ? formatAmount(row.deductionsTotal) : '••••••'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {reveal ? formatAmount(row.grossTotal) : '••••••'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(row.basicEffectiveFrom)}
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={row.payeApplicable}
                            onCheckedChange={(value) =>
                              void onToggleStatutory(row, 'paye', value === true)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={row.nssfApplicable}
                            onCheckedChange={(value) =>
                              void onToggleStatutory(row, 'nssf', value === true)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={row.lstApplicable}
                            onCheckedChange={(value) =>
                              void onToggleStatutory(row, 'lst', value === true)
                            }
                          />
                        </TableCell>
                        <TableCell
                          className="max-w-[180px] truncate text-xs text-muted-foreground"
                          title={row.exemptionBasis ?? ''}
                        >
                          {row.exemptionBasis || '—'}
                        </TableCell>
                        <TableCell>
                          {isReady(row) ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              Incomplete
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Statutory profiles and compensation are both append-only. Every change keeps the previous
        record with the date it closed.
      </p>

      <Dialog open={statRow !== null} onOpenChange={(open) => !open && setStatRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record the basis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Employment type</Label>
              <Select value={statType} onValueChange={setStatType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={statPaye} onCheckedChange={(v) => setStatPaye(v === true)} /> PAYE
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={statNssf} onCheckedChange={(v) => setStatNssf(v === true)} /> NSSF
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={statLst} onCheckedChange={(v) => setStatLst(v === true)} /> LST
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="statutory-basis">Basis</Label>
              <Textarea
                id="statutory-basis"
                value={statBasis}
                onChange={(e) => {
                  setStatBasis(e.target.value);
                  setStatError('');
                }}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Why this deduction does not apply. Minimum 10 characters. This is the audit record.
              </p>
              {statError ? <p className="text-xs text-destructive">{statError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatRow(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveStatutory()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payRow !== null} onOpenChange={(open) => !open && setPayRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Basic pay{payRow ? ` — ${payRow.name}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="basic-amount">Amount</Label>
              <Input
                id="basic-amount"
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  setPayError('');
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="basic-from">Effective from</Label>
              <Input
                id="basic-from"
                type="date"
                value={payFrom}
                onChange={(e) => setPayFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="basic-reason">Reason</Label>
              <Textarea
                id="basic-reason"
                value={payReason}
                onChange={(e) => {
                  setPayReason(e.target.value);
                  setPayError('');
                }}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Required. Minimum 10 characters. This is the audit record.
              </p>
              {payError ? <p className="text-xs text-destructive">{payError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void savePay()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}