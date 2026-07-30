import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { addTaskEvent, getDepartments, getMetricDefinitions, getMyStaff, getSnapshots, getTasks } from '@/hr/api';
import { supabase } from '@/hr/api/client';
import type { Department, Employee, MetricDefinition, MetricSnapshot, Task } from '@/hr/types';
import TaskFormDialog from './TaskFormDialog';

/** Statuses that take a task out of the open list. */
const CLOSED: string[] = ['completed', 'cancelled'];

const STATUS_PILL: Record<string, string> = {
  open: 'bg-muted text-foreground',
  assigned: 'bg-muted text-foreground',
  in_progress: 'bg-primary/15 text-primary',
  blocked: 'bg-destructive/15 text-destructive',
  submitted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  returned: 'bg-destructive/15 text-destructive',
};

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-muted-foreground',
  normal: 'bg-blue-500',
  high: 'bg-amber-500',
  urgent: 'bg-destructive',
};

/** Thresholds live on hr_metric_definitions but are not part of the shared contract type. */
interface MetricThreshold {
  amber_at: number | null;
  red_at: number | null;
}

/** A flagged comment on one of my tasks that I have not yet acknowledged. */
interface AttentionItem {
  eventId: string;
  taskId: string;
  taskTitle: string;
  note: string;
  authorName: string;
  at: string;
}

/** Raw note event shape, read append-only from hr_task_events. */
interface NoteEventRow {
  id: string;
  task_id: string;
  actor_user_id: string;
  occurred_at: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
}

function flagOf(metadata: Record<string, unknown> | null): string {
  const raw = metadata && typeof metadata === 'object' ? (metadata as { flag?: unknown }).flag : null;
  return typeof raw === 'string' ? raw : '';
}

function humanize(value: string) {
  return (value || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatValue(value: number | null, unit: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  switch (unit) {
    case 'percent':
      return `${rounded}%`;
    case 'currency_ugx':
      return `UGX ${rounded.toLocaleString('en-UG')}`;
    case 'hours':
      return `${rounded} h`;
    case 'days':
      return `${rounded} d`;
    default:
      return `${rounded}`;
  }
}

/**
 * Traffic light from the metric's own direction and thresholds.
 * No target -> grey, no judgement.
 */
function dotClass(
  value: number | null,
  def: MetricDefinition,
  threshold: MetricThreshold | undefined,
): string {
  if (value === null || def.target_value === null || def.target_value === undefined) {
    return 'bg-muted-foreground/40';
  }
  const red = threshold?.red_at ?? null;
  const amber = threshold?.amber_at ?? null;
  const higherBetter = String(def.direction).startsWith('higher');

  if (higherBetter) {
    if (red !== null && value < red) return 'bg-destructive';
    if (amber !== null && value < amber) return 'bg-amber-500';
    return 'bg-emerald-500';
  }
  if (red !== null && value > red) return 'bg-destructive';
  if (amber !== null && value > amber) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function monthBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

/** Monday-anchored start of the week containing `d`. */
function weekStart(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy;
}

export default function MyWork() {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Employee | null>(null);
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [snapshots, setSnapshots] = useState<MetricSnapshot[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, MetricThreshold>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await getMyStaff();
      setStaff(me);
      if (!me) return;

      const { start, end } = monthBounds(new Date());
      const [defs, snaps, myTasks, thresholdRows, depts] = await Promise.all([
        getMetricDefinitions(me.current_assignment?.department_id),
        getSnapshots({ staffId: me.id, periodStart: start, periodEnd: end }),
        getTasks({ assigneeEmployeeId: me.id }),
        supabase.from('hr_metric_definitions').select('id, amber_at, red_at'),
        getDepartments(),
      ]);

      setDepartments(depts);
      setDefinitions(defs);
      setSnapshots(snaps);
      setTasks(myTasks);

      // Flagged comments awaiting my acknowledgement. Read-only pass over the
      // append-only event log: a later `acknowledged` note cancels an earlier
      // `attention` note on the same task.
      const taskIds = myTasks.map((t) => t.id);
      if (taskIds.length > 0) {
        const { data: noteRows } = await supabase
          .from('hr_task_events')
          .select('id, task_id, actor_user_id, occurred_at, note, metadata')
          .in('task_id', taskIds)
          .eq('event_type', 'note')
          .order('occurred_at', { ascending: true });

        const notes = (noteRows ?? []) as unknown as NoteEventRow[];
        const lastAck: Record<string, number> = {};
        for (const row of notes) {
          if (flagOf(row.metadata) !== 'acknowledged') continue;
          const ts = new Date(row.occurred_at).getTime();
          if (!lastAck[row.task_id] || ts > lastAck[row.task_id]) lastAck[row.task_id] = ts;
        }

        const pending = notes.filter(
          (row) =>
            flagOf(row.metadata) === 'attention' &&
            new Date(row.occurred_at).getTime() > (lastAck[row.task_id] ?? -Infinity),
        );

        let nameByUser: Record<string, string> = {};
        const authorIds = Array.from(new Set(pending.map((p) => p.actor_user_id).filter(Boolean)));
        if (authorIds.length > 0) {
          const { data: authorRows } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', authorIds);
          nameByUser = Object.fromEntries(
            ((authorRows ?? []) as { id: string; full_name: string | null }[]).map((p) => [
              p.id,
              p.full_name || 'Unknown',
            ]),
          );
        }

        const titleById = Object.fromEntries(myTasks.map((t) => [t.id, t.title]));
        setAttention(
          pending
            .map((row) => ({
              eventId: row.id,
              taskId: row.task_id,
              taskTitle: titleById[row.task_id] ?? 'Task',
              note: row.note ?? '',
              authorName: nameByUser[row.actor_user_id] ?? 'Unknown',
              at: row.occurred_at,
            }))
            .reverse(),
        );
      } else {
        setAttention([]);
      }

      const map: Record<string, MetricThreshold> = {};
      for (const row of (thresholdRows.data ?? []) as { id: string; amber_at: number | null; red_at: number | null }[]) {
        map[row.id] = { amber_at: row.amber_at, red_at: row.red_at };
      }
      setThresholds(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load your work');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tiles = useMemo(() => {
    const active = definitions.filter((d) => d.active);
    return active.map((def) => {
      const snap = snapshots.find((s) => s.metric_definition_id === def.id);
      return {
        def,
        value: snap ? snap.value : null,
        threshold: thresholds[def.id],
      };
    });
  }, [definitions, snapshots, thresholds]);

  const openTasks = useMemo(() => {
    const now = Date.now();
    return tasks
      .filter((t) => !CLOSED.includes(t.status))
      .sort((a, b) => {
        const av = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
        return av - bv;
      })
      .map((t) => ({
        task: t,
        overdue: !!t.due_at && new Date(t.due_at).getTime() < now,
      }));
  }, [tasks]);

  /** Eight calendar weeks of completed ÷ created, straight off this person's hr_tasks rows. */
  const trend = useMemo(() => {
    const buckets: { key: number; label: string; created: number; completed: number }[] = [];
    const thisWeek = weekStart(new Date());
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - i * 7);
      buckets.push({
        key: start.getTime(),
        label: start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        created: 0,
        completed: 0,
      });
    }
    const indexFor = (iso: string | null) => {
      if (!iso) return -1;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return -1;
      return buckets.findIndex((b) => b.key === weekStart(d).getTime());
    };
    for (const t of tasks) {
      const ci = indexFor(t.created_at);
      if (ci >= 0) buckets[ci].created += 1;
      const xi = t.status === 'completed' ? indexFor(t.completed_at) : -1;
      if (xi >= 0) buckets[xi].completed += 1;
    }
    return buckets.map((b) => ({
      label: b.label,
      rate: b.created > 0 ? Math.round((b.completed / b.created) * 100) : 0,
      created: b.created,
      completed: b.completed,
    }));
  }, [tasks]);

  const act = async (taskId: string, eventType: 'started' | 'submitted' | 'completed') => {
    setBusyTaskId(taskId);
    try {
      await addTaskEvent({ taskId, eventType });
      toast.success(`Task ${eventType}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the task');
    } finally {
      setBusyTaskId(null);
    }
  };

  /**
   * Acknowledging INSERTS one new note event. The original comment row is
   * never updated and never deleted.
   */
  const acknowledge = async (item: AttentionItem) => {
    setBusyEventId(item.eventId);
    try {
      await addTaskEvent({
        taskId: item.taskId,
        eventType: 'note',
        note: 'Acknowledged',
        metadata: { flag: 'acknowledged', acknowledges_event_id: item.eventId },
      });
      toast.success('Acknowledged');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not acknowledge');
    } finally {
      setBusyEventId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!staff) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not yet enrolled in performance tracking.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={`/hr/dashboard/scorecard/${staff.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          View my full scorecard
        </Link>
        <Button size="sm" onClick={() => setLogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Log a task
        </Button>
      </div>

      {attention.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Needs your attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {attention.map((item) => (
              <div
                key={item.eventId}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    to={`/hr/dashboard/tasks/${item.taskId}`}
                    className="text-sm font-semibold text-foreground hover:underline"
                  >
                    {item.taskTitle}
                  </Link>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{item.note}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.authorName} · {formatDateTime(item.at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={busyEventId === item.eventId}
                  onClick={() => acknowledge(item)}
                >
                  Acknowledge
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">
            No metrics are configured for your department yet.
          </p>
        ) : (
          tiles.map(({ def, value, threshold }) => (
            <Card key={def.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium leading-tight text-muted-foreground">
                    {def.name}
                  </p>
                  <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(value, def, threshold)}`} />
                </div>
                <p className="mt-1.5 text-lg font-bold text-foreground">
                  {formatValue(value, def.unit)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {def.target_value === null || def.target_value === undefined
                    ? 'No target'
                    : `Target ${formatValue(def.target_value, def.unit)}`}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">My open tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {openTasks.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nothing open right now</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTasks.map(({ task, overdue }) => (
                  <TableRow key={task.id}>
                    <TableCell className="max-w-[280px]">
                      <Link
                        to={`/hr/dashboard/tasks/${task.id}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-muted-foreground'}`} />
                        {humanize(task.priority)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_PILL[task.status] ?? 'bg-muted text-foreground'}`}>
                        {humanize(task.status)}
                      </span>
                    </TableCell>
                    <TableCell className={overdue ? 'text-xs font-semibold text-destructive' : 'text-xs'}>
                      {formatDate(task.due_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {['open', 'assigned', 'returned'].includes(String(task.status)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={busyTaskId === task.id}
                            onClick={() => act(task.id, 'started')}
                          >
                            Start
                          </Button>
                        )}
                        {['in_progress', 'blocked'].includes(String(task.status)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={busyTaskId === task.id}
                            onClick={() => act(task.id, 'submitted')}
                          >
                            Submit
                          </Button>
                        )}
                        {task.status === 'submitted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={busyTaskId === task.id}
                            onClick={() => act(task.id, 'completed')}
                          >
                            Complete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Completion trend</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip
                formatter={(v: number, _n, item: any) =>
                  [`${v}% (${item?.payload?.completed}/${item?.payload?.created})`, 'Completed']
                }
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* The assignee is always the signed-in person; no picker is shown. */}
      <TaskFormDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        title="Log a task"
        departments={departments}
        fixedAssigneeStaffId={staff.id}
        defaultDepartmentId={staff.current_assignment?.department_id ?? null}
        onCreated={() => void load()}
      />
    </div>
  );
}
