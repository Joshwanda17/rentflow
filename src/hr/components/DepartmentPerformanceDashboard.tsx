import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  getDepartments,
  getEmployees,
  getMetricDefinitions,
  getMetricSnapshots,
  getPerformanceFlags,
} from '@/hr/api';
import type {
  Department,
  Employee,
  MetricDefinition,
  MetricPeriodType,
  MetricSnapshot,
  MetricUnit,
  PerformanceFlag,
} from '@/hr/types';

const DEFAULT_DEPARTMENT_NAME = 'Collections';

type UiPeriodType = Extract<MetricPeriodType, 'weekly' | 'monthly'>;

interface Period {
  start: string;
  end: string;
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function monthLabel(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function weekLabel(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(s)} – ${fmt(e)} ${e.getUTCFullYear()}`;
}

function monthPeriod(year: number, monthIdx: number): Period {
  const start = new Date(Date.UTC(year, monthIdx, 1));
  const end = new Date(Date.UTC(year, monthIdx + 1, 0));
  return { start: toISO(start), end: toISO(end), label: monthLabel(toISO(start)) };
}

function weekPeriod(anchor: Date): Period {
  const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: toISO(d), end: toISO(end), label: weekLabel(toISO(d), toISO(end)) };
}

/** Periods offered = periods present in the data, plus a recent rolling window. */
function buildPeriods(periodType: UiPeriodType, fromSnapshots: MetricSnapshot[]): Period[] {
  const map = new Map<string, Period>();
  const now = new Date();

  if (periodType === 'monthly') {
    for (let i = 0; i < 12; i += 1) {
      const p = monthPeriod(now.getUTCFullYear(), now.getUTCMonth() - i);
      map.set(p.start, p);
    }
  } else {
    for (let i = 0; i < 12; i += 1) {
      const anchor = new Date(now);
      anchor.setUTCDate(anchor.getUTCDate() - i * 7);
      const p = weekPeriod(anchor);
      map.set(p.start, p);
    }
  }

  fromSnapshots
    .filter((s) => s.period_type === periodType)
    .forEach((s) => {
      if (!map.has(s.period_start)) {
        map.set(s.period_start, {
          start: s.period_start,
          end: s.period_end,
          label:
            periodType === 'monthly'
              ? monthLabel(s.period_start)
              : weekLabel(s.period_start, s.period_end),
        });
      }
    });

  return Array.from(map.values()).sort((a, b) => (a.start < b.start ? 1 : -1));
}

function formatValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'percent':
      return `${Math.round(value * 10) / 10}%`;
    case 'hours':
      return `${Math.round(value * 10) / 10} hrs`;
    case 'days':
      return `${Math.round(value * 10) / 10} days`;
    case 'currency_ugx':
      return `UGX ${Math.round(value).toLocaleString('en-US')}`;
    case 'ratio':
      return `${Math.round(value * 100) / 100}x`;
    default:
      return `${Math.round(value * 10) / 10}`;
  }
}

/**
 * Colour is decided by DIRECTION, never by the raw size of the number.
 * higher_is_better: value >= target is good.
 * lower_is_better:  value <= target is good.
 */
function isOnTarget(
  value: number,
  target: number | null,
  direction: MetricDefinition['direction'],
): boolean | null {
  if (target === null || target === undefined) return null;
  return direction === 'higher_is_better' ? value >= target : value <= target;
}

function attainmentPercent(
  snapshot: MetricSnapshot,
  definition: MetricDefinition,
): number | null {
  if (snapshot.attainment_pct !== null && snapshot.attainment_pct !== undefined) {
    return snapshot.attainment_pct;
  }
  const target = snapshot.target_value ?? definition.target_value;
  if (target === null || target === undefined || target === 0) return null;
  return definition.direction === 'higher_is_better'
    ? (snapshot.value / target) * 100
    : (target / Math.max(snapshot.value, 0.0001)) * 100;
}

function previousPeriodStart(period: Period, periodType: UiPeriodType): string {
  const d = new Date(`${period.start}T00:00:00Z`);
  if (periodType === 'monthly') {
    return monthPeriod(d.getUTCFullYear(), d.getUTCMonth() - 1).start;
  }
  d.setUTCDate(d.getUTCDate() - 7);
  return toISO(d);
}

/** Department figure = the department snapshot if one exists, else the mean of its people. */
function pickSnapshot(
  snapshots: MetricSnapshot[],
  definitionId: string,
  periodStart: string,
  periodType: UiPeriodType,
  employeeIds: string[],
  departmentId: string,
): MetricSnapshot | null {
  const inScope = snapshots.filter(
    (s) =>
      s.metric_definition_id === definitionId &&
      s.period_type === periodType &&
      s.period_start === periodStart,
  );
  const superseded = new Set(
    inScope.map((s) => s.supersedes_snapshot_id).filter((id): id is string => Boolean(id)),
  );
  const live = inScope.filter((s) => !superseded.has(s.id));

  const dept = live.find((s) => s.subject_type === 'department' && s.subject_id === departmentId);
  if (dept) return dept;

  const people = live.filter(
    (s) => s.subject_type === 'employee' && employeeIds.includes(s.subject_id),
  );
  if (people.length === 0) return null;
  if (people.length === 1) return people[0];

  const mean = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;
  const attainments = people
    .map((s) => s.attainment_pct)
    .filter((n): n is number => n !== null && n !== undefined);

  return {
    ...people[0],
    id: `${people[0].id}__dept_mean`,
    subject_type: 'department',
    subject_id: departmentId,
    assignment_id: null,
    value: mean(people.map((s) => s.value)),
    attainment_pct: attainments.length ? mean(attainments) : null,
    status: people.some((s) => s.status === 'open') ? 'open' : 'locked',
    supersedes_snapshot_id: null,
    correction_reason: null,
  };
}

export default function DepartmentPerformanceDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [snapshots, setSnapshots] = useState<MetricSnapshot[]>([]);
  const [flags, setFlags] = useState<PerformanceFlag[]>([]);

  const [departmentId, setDepartmentId] = useState<string>('');
  const [periodType, setPeriodType] = useState<UiPeriodType>('monthly');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [acknowledged, setAcknowledged] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [deps, emps, defs] = await Promise.all([
          getDepartments(),
          getEmployees(),
          getMetricDefinitions(),
        ]);
        if (cancelled) return;
        setDepartments(deps);
        setEmployees(emps);
        setDefinitions(defs);
        const preferred =
          deps.find((d) => d.name === DEFAULT_DEPARTMENT_NAME) ?? deps.find((d) => d.active) ?? deps[0];
        setDepartmentId(preferred ? preferred.id : '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load performance data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const departmentEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.current_assignment && e.current_assignment.department_id === departmentId,
      ),
    [employees, departmentId],
  );

  const employeeIds = useMemo(
    () => departmentEmployees.map((e) => e.id),
    [departmentEmployees],
  );

  // Snapshots for the department subject plus every person currently posted to it.
  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all([
          getMetricSnapshots({ subjectType: 'department', subjectId: departmentId }),
          ...employeeIds.map((id) => getMetricSnapshots({ subjectType: 'employee', subjectId: id })),
        ]);
        if (!cancelled) setSnapshots(results.flat());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load metric snapshots.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [departmentId, employeeIds]);

  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getPerformanceFlags({ subjectType: 'employee' });
        if (!cancelled) setFlags(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load flags.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  const periods = useMemo(() => buildPeriods(periodType, snapshots), [periodType, snapshots]);

  useEffect(() => {
    if (periods.length === 0) return;
    if (!periods.some((p) => p.start === periodStart)) {
      const withData = periods.find((p) =>
        snapshots.some((s) => s.period_type === periodType && s.period_start === p.start),
      );
      setPeriodStart((withData ?? periods[0]).start);
    }
  }, [periods, periodStart, snapshots, periodType]);

  const period = useMemo(
    () => periods.find((p) => p.start === periodStart) ?? null,
    [periods, periodStart],
  );

  /** Whatever definitions exist for this department. No name or id is ever hard-coded here. */
  const applicableDefinitions = useMemo(
    () =>
      definitions.filter(
        (d) => d.active && (d.department_id === null || d.department_id === departmentId),
      ),
    [definitions, departmentId],
  );

  const universalDefinition = useMemo(
    () => applicableDefinitions.find((d) => d.department_id === null) ?? null,
    [applicableDefinitions],
  );

  const departmentFlags = useMemo(
    () => flags.filter((f) => employeeIds.includes(f.subject_id)),
    [flags, employeeIds],
  );

  const selectedDepartment = departments.find((d) => d.id === departmentId) ?? null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Could not load this dashboard</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (departments.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No departments have been set up yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="inline-flex rounded-md border border-border p-0.5">
            {(['weekly', 'monthly'] as UiPeriodType[]).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={periodType === t ? 'default' : 'ghost'}
                className="h-8 px-3 text-xs capitalize"
                onClick={() => setPeriodType(t)}
              >
                {t === 'weekly' ? 'Weekly' : 'Monthly'}
              </Button>
            ))}
          </div>

          <Select value={periodStart} onValueChange={setPeriodStart}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {periods.map((p) => (
                <SelectItem key={p.start} value={p.start}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Scorecards */}
        {applicableDefinitions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No metrics have been defined for {selectedDepartment?.name ?? 'this department'} yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {applicableDefinitions.map((definition) => {
              const current = period
                ? pickSnapshot(
                    snapshots,
                    definition.id,
                    period.start,
                    periodType,
                    employeeIds,
                    departmentId,
                  )
                : null;
              const prevStart = period ? previousPeriodStart(period, periodType) : null;
              const previous = prevStart
                ? pickSnapshot(
                    snapshots,
                    definition.id,
                    prevStart,
                    periodType,
                    employeeIds,
                    departmentId,
                  )
                : null;

              const target = current?.target_value ?? definition.target_value;
              const onTarget = current ? isOnTarget(current.value, target, definition.direction) : null;
              const attainment = current ? attainmentPercent(current, definition) : null;

              const barColour =
                onTarget === null
                  ? 'bg-primary'
                  : onTarget
                    ? 'bg-emerald-500'
                    : 'bg-amber-500';
              const valueColour =
                onTarget === null
                  ? 'text-foreground'
                  : onTarget
                    ? 'text-emerald-600'
                    : 'text-amber-600';

              let delta: number | null = null;
              if (current && previous) delta = current.value - previous.value;
              const improved =
                delta === null
                  ? null
                  : delta === 0
                    ? null
                    : definition.direction === 'higher_is_better'
                      ? delta > 0
                      : delta < 0;

              return (
                <Card key={definition.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {definition.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {target === null || target === undefined
                            ? 'No fixed target — measured against own trend'
                            : `Target: ${formatValue(target, definition.unit)}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {current?.status === 'open' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px]"
                              >
                                Period in progress
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              This period has not closed. Figures may still change.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {current?.supersedes_snapshot_id && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="border-blue-500/40 bg-blue-500/10 text-blue-600 text-[10px]"
                              >
                                Corrected
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {current.correction_reason ?? 'Corrected figure.'}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {current ? (
                      <>
                        <p className={`text-2xl font-bold ${valueColour}`}>
                          {formatValue(current.value, definition.unit)}
                        </p>

                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColour}`}
                            style={{
                              width: `${Math.max(0, Math.min(100, attainment ?? 0))}%`,
                            }}
                          />
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px]">
                          {previous === null ? (
                            <span className="text-muted-foreground">No previous period</span>
                          ) : improved === null ? (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <Minus className="h-3 w-3" /> No change vs previous period
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                improved ? 'text-emerald-600' : 'text-amber-600'
                              }`}
                            >
                              {(delta ?? 0) > 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {formatValue(Math.abs(delta ?? 0), definition.unit)} vs previous period
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4">Not yet measured</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Team */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Team</h3>
          {departmentEmployees.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nobody is currently posted to this department.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {departmentEmployees.map((emp) => {
                  const snap =
                    universalDefinition && period
                      ? snapshots.find(
                          (s) =>
                            s.subject_type === 'employee' &&
                            s.subject_id === emp.id &&
                            s.metric_definition_id === universalDefinition.id &&
                            s.period_type === periodType &&
                            s.period_start === period.start,
                        ) ?? null
                      : null;
                  const target = snap?.target_value ?? universalDefinition?.target_value ?? null;
                  const onTarget =
                    snap && universalDefinition
                      ? isOnTarget(snap.value, target, universalDefinition.direction)
                      : null;

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => navigate(`/hr/dashboard/productivity/employee/${emp.id}`)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {emp.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {emp.current_assignment?.role_title ?? '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">
                            {universalDefinition?.name ?? 'No universal metric'}
                          </p>
                          <p
                            className={`text-sm font-semibold ${
                              onTarget === null
                                ? 'text-muted-foreground'
                                : onTarget
                                  ? 'text-emerald-600'
                                  : 'text-amber-600'
                            }`}
                          >
                            {snap && universalDefinition
                              ? formatValue(snap.value, universalDefinition.unit)
                              : 'Not yet measured'}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Flags */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Flags</h3>
          {departmentFlags.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No flags raised for this department.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {departmentFlags.map((flag) => {
                const definition = definitions.find((d) => d.id === flag.metric_definition_id);
                const severityClass =
                  flag.severity === 'action'
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : flag.severity === 'watch'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                      : 'border-blue-500/40 bg-blue-500/10 text-blue-600';
                const localAck = acknowledged[flag.id];
                const ackBy = flag.acknowledged_by_employee_id;
                const ackName = ackBy
                  ? employees.find((e) => e.id === ackBy)?.full_name ?? ackBy
                  : null;
                const ackAt = flag.acknowledged_at;

                return (
                  <Card key={flag.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`${severityClass} text-[10px] capitalize`}>
                            {flag.severity}
                          </Badge>
                          <span className="text-sm font-medium text-foreground">
                            {definition?.name ?? 'Unknown metric'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {employees.find((e) => e.id === flag.subject_id)?.full_name ?? flag.subject_id}
                          </span>
                        </div>
                        {ackName || localAck ? (
                          <span className="text-[11px] text-muted-foreground">
                            Acknowledged by {localAck ? 'you' : ackName} on{' '}
                            {new Date(localAck ?? ackAt ?? '').toLocaleString('en-GB')}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAcknowledged((prev) => ({
                                ...prev,
                                [flag.id]: new Date().toISOString(),
                              }));
                              toast.success('Flag acknowledged');
                            }}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-foreground">
                        {flag.narrative_text ?? 'No narrative was drafted for this flag.'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Drafted from the figures above. Review before acting.
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
