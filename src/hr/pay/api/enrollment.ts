/**
 * HR Payroll enrollment view — one row per active worker with their basic pay
 * and statutory deduction profile.
 *
 * Writes are append-only and delegated:
 *  - statutory profiles go through the `hr_pay_set_statutory_profile` RPC,
 *  - basic pay reuses `addCompensation` from ./compensation.
 * Neither table is ever written directly from this file.
 */
import { supabase, unwrap } from '../../api/client';
import { addCompensation } from './compensation';

export interface EnrollmentRow {
  staffId: string;
  staffRef: string;
  name: string;
  department: string;
  position: string;
  employmentType: string | null;
  payeApplicable: boolean;
  nssfApplicable: boolean;
  lstApplicable: boolean;
  exemptionBasis: string | null;
  hasStatutoryProfile: boolean;
  basicAmount: number | null;
  basicEffectiveFrom: string | null;
  allowancesTotal: number;
  deductionsTotal: number;
  grossTotal: number;
}

type StaffRow = {
  id: string;
  staff_ref: string | null;
  user_id: string;
  assignments:
    | {
        ended_on: string | null;
        is_primary: boolean | null;
        department: { name: string | null } | null;
        position: { title: string | null } | null;
      }[]
    | null;
};

type StatutoryRow = {
  staff_id: string;
  employment_type: string | null;
  paye_applicable: boolean | null;
  nssf_applicable: boolean | null;
  lst_applicable: boolean | null;
  exemption_basis: string | null;
};

type CompRow = { staff_id: string; amount: number | string; effective_from: string };

type OpenCompRow = {
  staff_id: string;
  amount: number | string;
  component: { code: string; kind: string; is_statutory: boolean } | null;
};

const STAFF_SELECT =
  'id, staff_ref, user_id, assignments:hr_assignments(ended_on, is_primary, department:hr_departments(name), position:hr_positions!position_id(title))';

/** The id of the BASIC pay component. Basic pay is always this component. */
async function basicComponentId(): Promise<string> {
  const res = await supabase
    .from('hr_pay_components')
    .select('id')
    .eq('code', 'BASIC')
    .maybeSingle();
  const row = unwrap(res) as { id: string } | null;
  if (!row) throw new Error('The BASIC pay component is not configured');
  return row.id;
}

export async function listEnrollment(): Promise<EnrollmentRow[]> {
  const staff = (unwrap(
    await supabase.from('hr_staff').select(STAFF_SELECT).eq('active', true),
  ) ?? []) as unknown as StaffRow[];

  if (staff.length === 0) return [];

  const staffIds = staff.map((s) => s.id);
  const userIds = staff.map((s) => s.user_id).filter(Boolean);

  const [profiles, statutory, comp, openComp] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', userIds),
    supabase
      .from('hr_pay_statutory_profiles')
      .select(
        'staff_id, employment_type, paye_applicable, nssf_applicable, lst_applicable, exemption_basis',
      )
      .in('staff_id', staffIds)
      .is('effective_to', null),
    basicComponentId().then((componentId) =>
      supabase
        .from('hr_pay_compensation')
        .select('staff_id, amount, effective_from')
        .eq('component_id', componentId)
        .in('staff_id', staffIds)
        .is('effective_to', null),
    ),
    supabase
      .from('hr_pay_compensation')
      .select(
        'staff_id, amount, component:hr_pay_components!hr_pay_compensation_component_id_fkey(code, kind, is_statutory)',
      )
      .in('staff_id', staffIds)
      .is('effective_to', null),
  ]);

  const nameById = new Map<string, string>(
    ((unwrap(profiles) ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name ?? '',
    ]),
  );
  const statutoryByStaff = new Map<string, StatutoryRow>(
    ((unwrap(statutory) ?? []) as StatutoryRow[]).map((r) => [r.staff_id, r]),
  );
  const compByStaff = new Map<string, CompRow>(
    ((unwrap(comp) ?? []) as CompRow[]).map((r) => [r.staff_id, r]),
  );

  const allowancesByStaff = new Map<string, number>();
  const deductionsByStaff = new Map<string, number>();
  for (const r of (unwrap(openComp) ?? []) as unknown as OpenCompRow[]) {
    const kind = r.component?.kind;
    const code = r.component?.code;
    const amount = Number(r.amount) || 0;
    if (kind === 'earning' && code !== 'BASIC') {
      allowancesByStaff.set(r.staff_id, (allowancesByStaff.get(r.staff_id) ?? 0) + amount);
    } else if (kind === 'deduction' && r.component?.is_statutory === false) {
      deductionsByStaff.set(r.staff_id, (deductionsByStaff.get(r.staff_id) ?? 0) + amount);
    }
  }

  return staff
    .map((s) => {
      const assignment =
        (s.assignments ?? []).find((a) => !a.ended_on && a.is_primary) ??
        (s.assignments ?? []).find((a) => !a.ended_on) ??
        null;
      const sp = statutoryByStaff.get(s.id) ?? null;
      const cp = compByStaff.get(s.id) ?? null;
      const basicAmount = cp ? Number(cp.amount) : null;
      const allowancesTotal = allowancesByStaff.get(s.id) ?? 0;
      const deductionsTotal = deductionsByStaff.get(s.id) ?? 0;
      return {
        staffId: s.id,
        staffRef: s.staff_ref ?? '',
        name: nameById.get(s.user_id) || s.staff_ref || s.id,
        department: assignment?.department?.name ?? '',
        position: assignment?.position?.title ?? '',
        employmentType: sp?.employment_type ?? null,
        payeApplicable: sp ? sp.paye_applicable !== false : true,
        nssfApplicable: sp ? sp.nssf_applicable !== false : true,
        lstApplicable: sp ? sp.lst_applicable !== false : true,
        exemptionBasis: sp?.exemption_basis ?? null,
        hasStatutoryProfile: Boolean(sp),
        basicAmount,
        basicEffectiveFrom: cp?.effective_from ?? null,
        allowancesTotal,
        deductionsTotal,
        grossTotal: (basicAmount ?? 0) + allowancesTotal,
      } satisfies EnrollmentRow;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Records the statutory profile through the database function. The
 * `hr_pay_statutory_profiles` table is append-only and is never written here.
 */
export async function setStatutoryProfile(
  staffId: string,
  employmentType: string,
  paye: boolean,
  nssf: boolean,
  lst: boolean,
  basis: string,
): Promise<void> {
  const res = await supabase.rpc('hr_pay_set_statutory_profile', {
    _staff_id: staffId,
    _employment_type: employmentType,
    _paye: paye,
    _nssf: nssf,
    _lst: lst,
    _basis: basis,
  });
  if (res.error) throw new Error(res.error.message);
}

/** Basic pay change — reuses the append-only close-then-insert in ./compensation. */
export async function setBasicPay(
  staffId: string,
  amount: number,
  effectiveFrom: string,
  reason: string,
): Promise<void> {
  const componentId = await basicComponentId();
  await addCompensation(staffId, componentId, null, amount, effectiveFrom, reason);
}