/**
 * HR data access — People
 * No component may import from `src/hr/mocks/` directly. Read through here.
 */
import type { Assignment, Department, Employee } from '../types';
import people from '../mocks/people.json';
import { resolve } from './client';

export async function getDepartments(): Promise<Department[]> {
  return resolve(people.departments as Department[]);
}

export async function getEmployees(): Promise<Employee[]> {
  return resolve(people.employees as Employee[]);
}

export async function getEmployee(employeeId: string): Promise<Employee | null> {
  const found = (people.employees as Employee[]).find((e) => e.id === employeeId);
  return resolve(found ?? null);
}

/**
 * Department is a property of the assignment, never of the employee.
 * Use this when reporting on a past period so historical numbers stay stable.
 */
export async function getAssignmentsForPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<Assignment[]> {
  const all = people.assignments as Assignment[];
  const overlapping = all.filter((a) => {
    const startsBeforeEnd = a.valid_from <= periodEnd;
    const endsAfterStart = a.valid_to === null || a.valid_to >= periodStart;
    return startsBeforeEnd && endsAfterStart;
  });
  return resolve(overlapping);
}
