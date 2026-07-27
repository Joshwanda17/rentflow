/**
 * HR data access — Tasks
 * No component may import from `src/hr/mocks/` directly. Read through here.
 */
import type { Task, TaskEvent } from '../types';
import taskData from '../mocks/tasks.json';
import { resolve } from './client';

export interface TaskFilters {
  departmentId?: string;
  assigneeEmployeeId?: string;
  status?: string;
  origin?: string;
}

export async function getTasks(filters: TaskFilters = {}): Promise<Task[]> {
  let rows = taskData.tasks as Task[];
  if (filters.departmentId) {
    rows = rows.filter((t) => t.department_id === filters.departmentId);
  }
  if (filters.assigneeEmployeeId) {
    rows = rows.filter((t) => t.assignee_employee_id === filters.assigneeEmployeeId);
  }
  if (filters.status) {
    rows = rows.filter((t) => t.status === filters.status);
  }
  if (filters.origin) {
    rows = rows.filter((t) => t.origin === filters.origin);
  }
  return resolve(rows);
}

export async function getTask(taskId: string): Promise<Task | null> {
  const found = (taskData.tasks as Task[]).find((t) => t.id === taskId);
  return resolve(found ?? null);
}

export async function getTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const rows = (taskData.task_events as TaskEvent[]).filter((e) => e.task_id === taskId);
  return resolve(rows);
}

/** Mock write. Returns the task as it would come back from the server. */
export async function updateTaskStatus(
  taskId: string,
  toStatus: Task['status'],
  note?: string,
): Promise<Task> {
  const found = (taskData.tasks as Task[]).find((t) => t.id === taskId);
  if (!found) throw new Error('Task not found');
  return resolve({
    ...found,
    status: toStatus,
    completion_note: note ?? found.completion_note,
  });
}
