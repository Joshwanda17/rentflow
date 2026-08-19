import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Loader2, Plus,
  RefreshCw, RotateCcw, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatDynamic as formatUGX } from '@/lib/currencyFormat';
import {
  fetchConsolidation, useBudgetCycles,
  type BudgetConsolidation,
} from '@/hooks/useDepartmentBudgets';
import BudgetReviewQueue from '@/components/budget/BudgetReviewQueue';

type View = 'queue' | 'consolidation' | 'cycles';

const VIEWS: { id: View; label: string }[] = [
  { id: 'queue', label: 'Department budgets' },
  { id: 'consolidation', label: 'Consolidated budget' },
  { id: 'cycles', label: 'Budget cycles' },
];

/** CFO-side department budget collection, line-level approval and consolidation. */
export default function BudgetApprovalPanel() {
  const { cycles, loading: cyclesLoading, reload: reloadCycles } = useBudgetCycles();
  const [view, setView] = useState<View>('queue');
  const [cycleId, setCycleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [consolidation, setConsolidation] = useState<BudgetConsolidation | null>(null);

  useEffect(() => { if (!cycleId && cycles.length) setCycleId(cycles[0].id); }, [cycles, cycleId]);

  useEffect(() => {
    if (view !== 'consolidation' || !cycleId) return;
    setConsolidation(null);
    fetchConsolidation(cycleId)
      .then(setConsolidation)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Could not build consolidation'));
  }, [view, cycleId]);

  const toggle = async (s: BudgetSubmission) => {
    if (expanded === s.id) { setExpanded(null); return; }
    setExpanded(s.id);
    try {
      const rows = await fetchLines(s.id);
      setLines(rows);
      setLineEdits(Object.fromEntries(rows.map(r => [
        r.id, String(r.approved_amount ?? r.line_total ?? 0),
      ])));
      if (s.status === 'submitted') {
        await supabase.rpc('budget_start_review', { p_submission_id: s.id });
        await loadQueue();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load lines');
    }
  };

  const decideLine = async (line: BudgetLine, decision: 'approved' | 'rejected') => {
    setBusy(line.id);
    try {
      const { error } = await supabase.rpc('budget_decide_line', {
        p_line_id: line.id,
        p_decision: decision,
        p_approved_amount: decision === 'approved' ? Number(lineEdits[line.id] ?? 0) : 0,
        p_note: null,
      });
      if (error) throw error;
      const refreshed = await fetchLines(line.submission_id);
      setLines(refreshed);
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setBusy(null);
    }
  };

  const finalize = async (s: BudgetSubmission, decision: 'approved' | 'rejected') => {
    setBusy(s.id);
    try {
      const { error } = await supabase.rpc('budget_finalize_submission', {
        p_submission_id: s.id, p_decision: decision, p_comment: comment || null,
      });
      if (error) throw error;
      toast.success(decision === 'approved' ? 'Budget approved' : 'Budget rejected');
      setComment('');
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not finalise');
    } finally {
      setBusy(null);
    }
  };

  const requestRevision = async (s: BudgetSubmission) => {
    if (comment.trim().length < 10) { toast.error('Give the department at least 10 characters of guidance'); return; }
    setBusy(s.id);
    try {
      const { error } = await supabase.rpc('budget_request_revision', {
        p_submission_id: s.id, p_comment: comment.trim(),
      });
      if (error) throw error;
      toast.success('Revision requested — a new draft version was created for the department');
      setComment('');
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not request revision');
    } finally {
      setBusy(null);
    }
  };

  const pending = useMemo(
    () => submissions.filter(s => ['submitted', 'under_review'].includes(s.status)),
    [submissions],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${view === v.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {v.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Budget cycle" /></SelectTrigger>
            <SelectContent className="z-[100]">
              {cycles.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}{c.financial_year ? ` · ${c.financial_year}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={loadQueue}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {(cyclesLoading || loading) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {view === 'queue' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Awaiting review" value={String(pending.length)} />
            <Kpi label="Requested" value={formatUGX(submissions.reduce((s, r) => s + Number(r.total_amount), 0))} />
            <Kpi label="Approved" value={formatUGX(submissions.reduce((s, r) => s + Number(r.approved_total), 0))} />
          </div>

          {submissions.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">No department budgets in this cycle yet.</p>
          )}

          {submissions.map(s => (
            <Card key={s.id}>
              <button onClick={() => toggle(s)} className="flex w-full items-center gap-2 p-3 text-left">
                {expanded === s.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-medium">{s.reference}</span>
                    <Badge variant="outline" className="text-[10px]">v{s.version}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{s.status.replace(/_/g, ' ')}</Badge>
                    {s.is_late && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> late</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {s.title ?? 'Untitled'} · requested {formatUGX(Number(s.total_amount))}
                    {Number(s.approved_total) > 0 && ` · approved ${formatUGX(Number(s.approved_total))}`}
                    {s.submitted_at && ` · ${format(new Date(s.submitted_at), 'dd MMM yyyy')}`}
                  </p>
                </div>
              </button>

              {expanded === s.id && (
                <CardContent className="space-y-3 border-t border-border pt-3">
                  {s.purpose && <p className="text-xs text-muted-foreground">{s.purpose}</p>}
                  {lines.map(l => (
                    <div key={l.id} className="space-y-2 rounded-lg border border-border p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{l.description}</span>
                        <Badge variant="outline" className="text-[10px]">{l.account_code ?? 'uncategorised'}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {Number(l.quantity)} × {formatUGX(Number(l.unit_amount))} = {formatUGX(Number(l.line_total ?? 0))}
                        {l.period_month && ` · ${format(new Date(l.period_month), 'MMM yyyy')}`}
                      </p>
                      {l.justification && <p className="text-muted-foreground">Justification: {l.justification}</p>}
                      {l.document_path && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                          onClick={async () => {
                            try { window.open(await getBudgetDocumentUrl(l.document_path!), '_blank'); }
                            catch { toast.error('Could not open supporting document'); }
                          }}>
                          <FileText className="h-3.5 w-3.5" /> View supporting document
                        </Button>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <Label className="text-[11px]">Approved amount (UGX)</Label>
                          <Input className="h-8 w-40 text-xs" type="number" min="0"
                            value={lineEdits[l.id] ?? ''}
                            onChange={e => setLineEdits(p => ({ ...p, [l.id]: e.target.value }))} />
                        </div>
                        <Button size="sm" className="h-8 gap-1 text-xs" disabled={busy === l.id}
                          onClick={() => decideLine(l, 'approved')}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve line
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-destructive"
                          disabled={busy === l.id} onClick={() => decideLine(l, 'rejected')}>
                          <XCircle className="h-3.5 w-3.5" /> Reject line
                        </Button>
                        <Badge variant="secondary" className="text-[10px]">{l.status.replace(/_/g, ' ')}</Badge>
                      </div>
                    </div>
                  ))}

                  <div>
                    <Label className="text-xs">CFO comment</Label>
                    <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)}
                      placeholder="Guidance for the department (required to request a revision)" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5 text-xs" disabled={busy === s.id}
                      onClick={() => finalize(s, 'approved')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve budget
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={busy === s.id}
                      onClick={() => requestRevision(s)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Request revision
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive"
                      disabled={busy === s.id} onClick={() => finalize(s, 'rejected')}>
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {view === 'consolidation' && (
        <div className="space-y-3">
          {!consolidation && <p className="text-xs text-muted-foreground">Building consolidation…</p>}
          {consolidation && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Kpi label="Requested company-wide" value={formatUGX(consolidation.totals.requested)} />
                <Kpi label="Approved company-wide" value={formatUGX(consolidation.totals.approved)} />
              </div>
              <Section title="By activity">
                {consolidation.by_activity.map(r => (
                  <Row key={r.activity} label={r.activity} a={r.requested} b={r.approved} />
                ))}
              </Section>
              <Section title="By department">
                {consolidation.by_department.map(r => (
                  <Row key={r.department_id ?? r.department_name} label={r.department_name} a={r.requested} b={r.approved} />
                ))}
              </Section>
              <Section title="By account — approved vs actual (General Ledger)">
                {consolidation.by_account.map(r => (
                  <div key={r.account_code} className="flex items-center justify-between border-b border-border/40 py-1.5 text-xs last:border-0">
                    <span className="min-w-0 flex-1 truncate">{r.account_code} — {r.account_label ?? ''}</span>
                    <span className="w-28 text-right font-mono">{formatUGX(r.approved)}</span>
                    <span className="w-28 text-right font-mono text-muted-foreground">{formatUGX(r.actual)}</span>
                    <span className={`w-16 text-right font-mono ${r.variance < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      {r.utilization_pct == null ? '—' : `${Math.round(r.utilization_pct)}%`}
                    </span>
                  </div>
                ))}
              </Section>
            </>
          )}
        </div>
      )}

      {view === 'cycles' && <CycleManager onCreated={reloadCycles} cycles={cycles} />}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1.5 text-xs last:border-0">
      <span className="min-w-0 flex-1 truncate capitalize">{label.replace(/_/g, ' ')}</span>
      <span className="w-28 text-right font-mono text-muted-foreground">{formatUGX(a)}</span>
      <span className="w-28 text-right font-mono">{formatUGX(b)}</span>
    </div>
  );
}

function CycleManager({ cycles, onCreated }: { cycles: ReturnType<typeof useBudgetCycles>['cycles']; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [fy, setFy] = useState('');
  const [periodType, setPeriodType] = useState('yearly');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [deadline, setDeadline] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!title || !start || !end) { toast.error('Title, start and end dates are required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('budget_create_cycle', {
        p_title: title,
        p_financial_year: fy || null,
        p_period_type: periodType,
        p_period_start: start,
        p_period_end: end,
        p_deadline: deadline ? new Date(deadline).toISOString() : null,
        p_instructions: instructions || null,
      });
      if (error) throw error;
      toast.success('Budget cycle opened — departments can now submit');
      setTitle(''); setFy(''); setStart(''); setEnd(''); setDeadline(''); setInstructions('');
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open cycle');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc('budget_set_cycle_status', { p_call_id: id, p_status: status });
    if (error) { toast.error(error.message); return; }
    toast.success(`Cycle ${status}`);
    await onCreated();
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Open a new budget cycle</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="FY2027 Annual Budget" /></div>
            <div><Label className="text-xs">Financial year</Label><Input value={fy} onChange={e => setFy(e.target.value)} placeholder="FY2027" /></div>
            <div>
              <Label className="text-xs">Period type</Label>
              <Select value={periodType} onValueChange={setPeriodType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {['monthly', 'quarterly', 'yearly'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Submission deadline</Label><Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
            <div><Label className="text-xs">Period start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><Label className="text-xs">Period end</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Instructions to departments</Label><Textarea rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} /></div>
          <Button onClick={create} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Open cycle
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Existing cycles</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {cycles.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-xs">
              <span className="font-medium">{c.title}</span>
              {c.financial_year && <Badge variant="outline" className="text-[10px]">{c.financial_year}</Badge>}
              <Badge variant="secondary" className="text-[10px]">{c.status}</Badge>
              <span className="text-muted-foreground">
                {format(new Date(c.period_start), 'dd MMM yyyy')} – {format(new Date(c.period_end), 'dd MMM yyyy')}
                {c.deadline && ` · due ${format(new Date(c.deadline), 'dd MMM yyyy')}`}
              </span>
              <div className="ml-auto flex gap-2">
                {c.status !== 'open' && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setStatus(c.id, 'open')}>Open</Button>}
                {c.status === 'open' && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setStatus(c.id, 'closed')}>Close</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}