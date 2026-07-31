/**
 * HR Payroll compensation data access (hr_pay_compensation).
 * Append-only by design: a change is a new effective-dated row, never an edit.
 */
import { supabase, unwrap } from '../../api/client';
import { getStaffDirectory } from '../../api/people';

export interface PayrollStaffOption {
  staffId: string;
  name: string;
  department: string;
  position: string;
}

export interface CompensationRow {
  id: string;
  staff_id: string;
  component_id: string;
  grade_id: string | null;
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  reason: string;
  component_code: string;
  component_name: string;
  component_kind: string;
  grade_code: string | null;
}

const COMP_SELECT =
  'id, staff_id, component_id, grade_id, amount, currency, effective_from, effective_to, reason, component:hr_pay_components!hr_pay_compensation_component_id_fkey(code, name, kind), grade:hr_pay_grades!hr_pay_compensation_grade_id_fkey(code)';

type RawCompRow = Omit<
  CompensationRow,
  'component_code' | 'component_name' | 'component_kind' | 'grade_code'
> & {
  component: { code: string; name: string; kind: string } | null;
  grade: { code: string } | null;
};

function mapRow(row: RawCompRow): CompensationRow {
  return {
    id: row.id,
    staff_id: row.staff_id,
    component_id: row.component_id,
    grade_id: row.grade_id,
    amount: Number(row.amount),
    currency: row.currency,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    reason: row.reason,
    component_code: row.component?.code ?? '',
    component_name: row.component?.name ?? '',
    component_kind: row.component?.kind ?? '',
    grade_code: row.grade?.code ?? null,
  };
}

/** Enrolled staff, sourced from the HR staff directory helper (never `profiles`). */
export async function listStaffForPayroll(): Promise<PayrollStaffOption[]> {
  const staff = await getStaffDirectory();
  return staff
    .map((s) => ({
      staffId: s.id,
      name: s.full_name || s.staff_number || s.id,
      department: s.current_assignment?.department_name ?? '',
      position: s.current_assignment?.role_title ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCompensation(staffId: string): Promise<CompensationRow[]> {
  const res = await supabase
    .from('hr_pay_compensation')
    .select(COMP_SELECT)
    .eq('staff_id', staffId)
    .order('effective_from', { ascending: false });
  const rows = (unwrap(res) ?? []) as unknown as RawCompRow[];
  return rows.map(mapRow);
}

/** The day before an ISO date, used to close the previously open record. */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function addCompensation(
  staffId: string,
  componentId: string,
  gradeId: string | null,
  amount: number,
  effectiveFrom: string,
  reason: string,
): Promise<CompensationRow> {
  // 1. Close the currently open row for this staff member + component.
  const close = await supabase
    .from('hr_pay_compensation')
    .update({ effective_to: dayBefore(effectiveFrom) })
    .eq('staff_id', staffId)
    .eq('component_id', componentId)
    .is('effective_to', null)
    .select('id');
  unwrap(close);

  // 2. Insert the new effective-dated record.
  const res = await supabase
    .from('hr_pay_compensation')
    .insert({
      staff_id: staffId,
      component_id: componentId,
      grade_id: gradeId,
      amount,
      effective_from: effectiveFrom,
      reason,
    })
    .select(COMP_SELECT)
    .single();
  return mapRow(unwrap(res) as unknown as RawCompRow);
}