/**
 * HR data access — Tasks (hr_tasks, hr_task_events)
 *
 * Status is NEVER written directly. A status change is an inserted row in
 * hr_task_events; a database trigger moves the task.
 */
import type { Task, TaskEvent } from '../types';
import { requireUserId, supabase, unwrap } from './client';

const TASK_COLUMNS =
  'id, ref, title, description, department_id, assignee_staff_id, created_by_staff_id, priority, status, origin, due_at, created_at, started_at, submitted_at, completed_at, reopen_count';

type TaskRow = {
  id: string;
  ref: string;
  title: string;
  description: string | null;
  department_id: string;
  assignee_staff_id: string | null;
  created_by_staff_id: string | null;
  priority: string;
  status: string;
  origin: string;
  due_at: string | null;
  created_at: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  reopen_count: number;
};

type TaskEventRow = {
  id: string;
  task_id: string;
  event_type: string;
  actor_user_id: string;
  occurred_at: string;
  note: string | null;
};

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    ref: row.ref,
    title: row.title,
    description: row.description ?? '',
    definition_of_done: '',
    department_id: row.department_id,
    assignee_employee_id: row.assignee_staff_id ?? '',
    assigner_employee_id: row.created_by_staff_id,
    origin: row.origin as Task['origin'],
    origin_acknowledged_by: null,
    origin_acknowledged_at: null,
    recurrence_template_id: null,
    priority: row.priority as Task['priority'],
    status: row.status as Task['status'],
    assigned_at: row.created_at,
    acknowledged_at: row.started_at,
    due_at: row.due_at,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    returned_count: row.reopen_count,
    completion_note: null,
    evidence_urls: [],
    created_at: row.created_at,
    updated_at: row.completed_at ?? row.submitted_at ?? row.started_at ?? row.created_at,
  };
}

function mapEvent(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    task_id: row.task_id,
    event_type: row.event_type as TaskEvent['event_type'],
    actor_employee_id: row.actor_user_id,
    at: row.occurred_at,
    from_status: null,
    to_status: null,
    note: row.note,
  };
}

export interface TaskFilters {
  departmentId?: string;
  assigneeEmployeeId?: string;
  status?: string;
  origin?: string;
}

export async function getTasks(filters: TaskFilters = {}): Promise<Task[]> {
  let query = supabase
    .from('hr_tasks')
    .select(TASK_COLUMNS)
    .order('created_at', { ascending: false });
  if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
  if (filters.assigneeEmployeeId) query = query.eq('assignee_staff_id', filters.assigneeEmployeeId);
  if (filters.status) query = query.eq('status', filters.status as never);
  if (filters.origin) query = query.eq('origin', filters.origin);
  const rows = unwrap(await query) as unknown as TaskRow[];
  return rows.map(mapTask);
}

export async function getTask(taskId: string): Promise<Task | null> {
  const rows = unwrap(
    await supabase.from('hr_tasks').select(TASK_COLUMNS).eq('id', taskId).limit(1),
  ) as unknown as TaskRow[];
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function getTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const rows = unwrap(
    await supabase
      .from('hr_task_events')
      .select('id, task_id, event_type, actor_user_id, occurred_at, note')
      .eq('task_id', taskId)
      .order('occurred_at', { ascending: true }),
  ) as unknown as TaskEventRow[];
  return rows.map(mapEvent);
}

export async function createTask(input: {
  ref?: string;
  title: string;
  description?: string;
  departmentId: string;
  assigneeStaffId?: string | null;
  createdByStaffId?: string | null;
  priority?: string;
  origin?: string;
  dueAt?: string | null;
}): Promise<Task> {
  const payload: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    department_id: input.departmentId,
    assignee_staff_id: input.assigneeStaffId ?? null,
    created_by_staff_id: input.createdByStaffId ?? null,
    origin: input.origin ?? 'assigned',
    due_at: input.dueAt ?? null,
  };
  if (input.ref) payload.ref = input.ref;
  if (input.priority) payload.priority = input.priority;

  const row = unwrap(
    await supabase.from('hr_tasks').insert(payload as never).select(TASK_COLUMNS).single(),
  ) as unknown as TaskRow;
  // Append the opening event. The task row itself is never status-edited here.
  try {
    await addTaskEvent({ taskId: row.id, eventType: 'created' });
  } catch {
    // The task exists; a failed audit event must not read as a failed save.
  }
  return mapTask(row);
}

/** Append-only. The trigger on hr_task_events moves the task status. */
export async function addTaskEvent(input: {
  taskId: string;
  eventType: TaskEvent['event_type'] | string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<TaskEvent> {
  const actorUserId = await requireUserId();
  const row = unwrap(
    await supabase
      .from('hr_task_events')
      .insert({
        task_id: input.taskId,
        event_type: input.eventType,
        actor_user_id: actorUserId,
        note: input.note ?? null,
        metadata: input.metadata ?? {},
      } as never)
      .select('id, task_id, event_type, actor_user_id, occurred_at, note')
      .single(),
  ) as unknown as TaskEventRow;
  return mapEvent(row);
}

const STATUS_TO_EVENT: Record<string, string> = {
  assigned: 'assigned',
  acknowledged: 'assigned',
  in_progress: 'started',
  blocked: 'blocked',
  submitted: 'submitted',
  returned: 'reopened',
  completed: 'completed',
  cancelled: 'cancelled',
};

/**
 * Requests a status change by logging the event. The task row itself is only
 * ever changed by the database trigger.
 */
export async function updateTaskStatus(
  taskId: string,
  toStatus: Task['status'] | string,
  note?: string,
): Promise<Task> {
  const eventType = STATUS_TO_EVENT[toStatus];
  if (!eventType) throw new Error(`Unsupported status transition: ${toStatus}`);
  await addTaskEvent({ taskId, eventType, note: note ?? null });
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found after status change');
  return task;
}
