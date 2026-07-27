import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getDepartments, getEmployees, getTasks } from '@/hr/api';
import type { Department, Employee, Task, TaskPriority, TaskStatus } from '@/hr/types';

const ALL = '__all__';

const STATUS_OPTIONS: TaskStatus[] = [
  'draft',
  'assigned',
  'acknowledged',
  'in_progress',
  'submitted',
  'returned',
  'completed',
  'cancelled',
];

const ORIGIN_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  self_initiated: 'Self-initiated',
  recurring: 'Recurring',
};

const STATUS_PILL: Record<TaskStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  assigned: 'bg-muted text-foreground',
  acknowledged: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  in_progress: 'bg-primary/15 text-primary',
  submitted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  returned: 'bg-destructive/15 text-destructive',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-muted/60 text-muted-foreground',
};

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-muted-foreground',
  normal: 'bg-blue-500',
  high: 'bg-amber-500',
  urgent: 'bg-destructive',
};

const OPEN_EXCLUDED: TaskStatus[] = ['completed', 'cancelled'];

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function formatDue(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isOverdue(task: Task, now: Date) {
  if (!task.due_at) return false;
  if (OPEN_EXCLUDED.includes(task.status)) return false;
  const due = new Date(task.due_at);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

export default function TasksList() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [departmentId, setDepartmentId] = useState(ALL);
  const [assigneeId, setAssigneeId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d, e] = await Promise.all([getTasks(), getDepartments(), getEmployees()]);
      setTasks(t);
      setDepartments(d);
      setEmployees(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentName = useMemo(() => {
    const map = new Map(departments.map((d) => [d.id, d.name]));
    return (id: string) => map.get(id) ?? '—';
  }, [departments]);

  const employeeName = useMemo(() => {
    const map = new Map(employees.map((e) => [e.id, e.full_name]));
    return (id: string) => map.get(id) ?? '—';
  }, [employees]);

  const now = new Date();

  const stats = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return {
      open: tasks.filter((t) => !OPEN_EXCLUDED.includes(t.status)).length,
      overdue: tasks.filter((t) => isOverdue(t, now)).length,
      awaiting: tasks.filter((t) => t.status === 'submitted').length,
      completedThisMonth: tasks.filter((t) => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        const at = new Date(t.completed_at).getTime();
        return at >= monthStart && at < monthEnd;
      }).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (departmentId !== ALL && t.department_id !== departmentId) return false;
        if (assigneeId !== ALL && t.assignee_employee_id !== assigneeId) return false;
        if (status !== ALL && t.status !== status) return false;
        if (origin !== ALL && t.origin !== origin) return false;
        return true;
      }),
    [tasks, departmentId, assigneeId, status, origin],
  );

  const tiles = [
    { label: 'Open tasks', value: stats.open, icon: ClipboardList, color: 'bg-primary/10 text-primary' },
    { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, color: 'bg-destructive/10 text-destructive' },
    { label: 'Awaiting review', value: stats.awaiting, icon: Clock, color: 'bg-warning/10 text-warning' },
    {
      label: 'Completed this month',
      value: stats.completedThisMonth,
      icon: CheckCircle2,
      color: 'bg-success/10 text-success',
    },
  ];

  if (error) {
    return (
      <Card className="border-border/40">
        <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-muted-foreground">Could not load tasks.</p>
          <Button size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="border-border/40 overflow-hidden">
            <CardContent className="p-3.5">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tile.color}`}>
                  <tile.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {tile.label}
                  </p>
                  {loading ? (
                    <Skeleton className="h-6 w-10 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground leading-tight">{tile.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeId} onValueChange={setAssigneeId}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All assignees</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {humanize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Origin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All origins</SelectItem>
            {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border/40">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wider">Ref</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Title</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Assignee</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Department</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Origin</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Priority</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No tasks match these filters.
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  filtered.map((task) => {
                    const overdue = isOverdue(task, now);
                    return (
                      <TableRow
                        key={task.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/hr/dashboard/tasks/${task.id}`)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{task.ref}</TableCell>
                        <TableCell className="text-sm font-medium text-foreground max-w-[260px] truncate">
                          {task.title}
                        </TableCell>
                        <TableCell className="text-sm">{employeeName(task.assignee_employee_id)}</TableCell>
                        <TableCell className="text-sm">{departmentName(task.department_id)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[10px] font-medium">
                              {ORIGIN_LABELS[task.origin] ?? humanize(task.origin)}
                            </Badge>
                            {task.origin === 'self_initiated' && !task.origin_acknowledged_by && (
                              <Badge className="text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 border-transparent">
                                Needs manager sign-off
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                            {humanize(task.priority)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[task.status]}`}
                          >
                            {humanize(task.status)}
                          </span>
                        </TableCell>
                        <TableCell
                          className={`text-xs ${overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                        >
                          {formatDue(task.due_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
