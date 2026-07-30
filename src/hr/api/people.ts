/**
 * HR data access — People (hr_departments, hr_staff, hr_assignments)
 */
import type { Assignment, Department, Employee } from '../types';
import { requireUserId, supabase, unwrap } from './client';

type DeptRow = { id: string; key: string; name: string; active: boolean };
type AssignmentRow = {
  id: string;
  staff_id: string;
  department_id: string;
  job_title: string;
  reports_to_staff_id: string | null;
  started_on: string;
  ended_on: string | null;
};

function mapDepartment(row: DeptRow): Department {
  return {
    id: row.id,
    name: row.name,
    code: row.key,
    head_employee_id: null,
    active: row.active,
  };
}

function mapAssignment(row: AssignmentRow, departmentName: string): Assignment {
  return {
    id: row.id,
    employee_id: row.staff_id,
    department_id: row.department_id,
    department_name: departmentName,
    role_title: row.job_title,
    manager_employee_id: row.reports_to_staff_id,
    employment_type: 'permanent',
    valid_from: row.started_on,
    valid_to: row.ended_on,
  };
}

export async function getDepartments(): Promise<Department[]> {
  const rows = unwrap(
    await supabase
      .from('hr_departments')
      .select('id, key, name, active')
      .order('name', { ascending: true }),
  ) as DeptRow[];
  return rows.map(mapDepartment);
}

async function departmentNameMap(): Promise<Record<string, string>> {
  const rows = unwrap(
    await supabase.from('hr_departments').select('id, name'),
  ) as { id: string; name: string }[];
  return Object.fromEntries(rows.map((d) => [d.id, d.name]));
}

type StaffRow = {
  id: string;
  user_id: string;
  staff_ref: string;
  active: boolean;
  created_at: string;
};

async function hydrateStaff(staff: StaffRow[]): Promise<Employee[]> {
  if (staff.length === 0) return [];
  const userIds = staff.map((s) => s.user_id);
  const staffIds = staff.map((s) => s.id);

  const profiles = unwrap(
    await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url')
      .in('id', userIds),
  ) as { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null }[];
  const profileById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const assignments = unwrap(
    await supabase
      .from('hr_assignments')
      .select('id, staff_id, department_id, job_title, reports_to_staff_id, started_on, ended_on')
      .in('staff_id', staffIds)
      .is('ended_on', null),
  ) as AssignmentRow[];
  const names = await departmentNameMap();
  const currentByStaff: Record<string, Assignment> = {};
  for (const a of assignments) {
    currentByStaff[a.staff_id] = mapAssignment(a, names[a.department_id] ?? '');
  }

  return staff.map((s) => {
    const p = profileById[s.user_id];
    return {
      id: s.id,
      staff_number: s.staff_ref,
      full_name: p?.full_name ?? '',
      email: p?.email ?? '',
      phone: p?.phone ?? '',
      photo_url: p?.avatar_url ?? null,
      status: s.active ? 'active' : 'exited',
      joined_at: s.created_at,
      current_assignment: currentByStaff[s.id] ?? null,
    } satisfies Employee;
  });
}

export async function getEmployees(): Promise<Employee[]> {
  const staff = unwrap(
    await supabase
      .from('hr_staff')
      .select('id, user_id, staff_ref, active, created_at')
      .order('created_at', { ascending: true }),
  ) as StaffRow[];
  return hydrateStaff(staff);
}

/** Alias kept explicit for callers that want the whole directory. */
export async function getStaffDirectory(): Promise<Employee[]> {
  return getEmployees();
}

export async function getEmployee(employeeId: string): Promise<Employee | null> {
  const rows = unwrap(
    await supabase
      .from('hr_staff')
      .select('id, user_id, staff_ref, active, created_at')
      .eq('id', employeeId)
      .limit(1),
  ) as StaffRow[];
  const hydrated = await hydrateStaff(rows);
  return hydrated[0] ?? null;
}

/** The hr_staff record belonging to the signed-in user, if enrolled. */
export async function getMyStaff(): Promise<Employee | null> {
  const userId = await requireUserId();
  const rows = unwrap(
    await supabase
      .from('hr_staff')
      .select('id, user_id, staff_ref, active, created_at')
      .eq('user_id', userId)
      .limit(1),
  ) as StaffRow[];
  const hydrated = await hydrateStaff(rows);
  return hydrated[0] ?? null;
}

/** Enrols a user into HR. Optionally creates their opening assignment. */
export async function enrollStaff(input: {
  userId: string;
  staffRef: string;
  departmentId?: string;
  jobTitle?: string;
  reportsToStaffId?: string | null;
  startedOn?: string;
}): Promise<Employee> {
  const enrolledBy = await requireUserId();
  const staff = unwrap(
    await supabase
      .from('hr_staff')
      .insert({
        user_id: input.userId,
        staff_ref: input.staffRef,
        enrolled_by: enrolledBy,
      })
      .select('id, user_id, staff_ref, active, created_at')
      .single(),
  ) as StaffRow;

  if (input.departmentId && input.jobTitle) {
    unwrap(
      await supabase
        .from('hr_assignments')
        .insert({
          staff_id: staff.id,
          department_id: input.departmentId,
          job_title: input.jobTitle,
          reports_to_staff_id: input.reportsToStaffId ?? null,
          started_on: input.startedOn ?? new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single(),
    );
  }

  const hydrated = await hydrateStaff([staff]);
  return hydrated[0];
}

/**
 * Department is a property of the assignment, never of the employee.
 * Use this when reporting on a past period so historical numbers stay stable.
 */
export async function getAssignmentsForPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<Assignment[]> {
  const rows = unwrap(
    await supabase
      .from('hr_assignments')
      .select('id, staff_id, department_id, job_title, reports_to_staff_id, started_on, ended_on')
      .lte('started_on', periodEnd)
      .or(`ended_on.is.null,ended_on.gte.${periodStart}`),
  ) as AssignmentRow[];
  const names = await departmentNameMap();
  return rows.map((r) => mapAssignment(r, names[r.department_id] ?? ''));
}
