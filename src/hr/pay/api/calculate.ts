/**
 * HR Payroll calculation orchestration.
 *
 * Reads compensation + rule versions, runs the pure calculator and writes
 * payslips, payslip lines and a run event. Run status and run totals are
 * maintained by database triggers on hr_pay_run_events / hr_pay_payslips —
 * they are never written from here.
 */
import { supabase, unwrap } from '../../api/client';
import { calculatePayslip } from '../calculator';
import type { Applicability, PayComponentInput, RuleVersion, TaxBand } from '../calculator/types';

export interface RunEventRow {
  id: string;
  event_type: string;
  actor: string | null;
  actor_position_id: string | null;
  note: string | null;
  created_at: string;
  actor_name: string | null;
  actor_position_title: string | null;
}

export interface RunPayslipRow {
  id: string;
  staff_id: string;
  staff_ref: string | null;
  staff_name: string | null;
  gross: number;
  paye: number;
  nssf_employee: number;
  nssf_employer: number;
  lst: number;
  other_deductions: number;
  net: number;
  employer_cost: number;
  calc_seq: number;
  computed_at: string;
}

export interface RunDetail {
  id: string;
  run_type: string;
  status: string;
  rule_status_at_run: string | null;
  rule_version_id: string | null;
  total_gross: number | null;
  total_net: number | null;
  total_employer_cost: number | null;
  created_at: string;
  period_code: string | null;
  period_month: string | null;
  cut_off_date: string | null;
  pay_date: string | null;
  rule_version_code: string | null;
  rule_verified_at: string | null;
  events: RunEventRow[];
  payslips: RunPayslipRow[];
}

const CALCULABLE = ['draft', 'calculated', 'returned'];

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getRunDetail(runId: string): Promise<RunDetail> {
  const run = unwrap(
    await supabase
      .from('hr_pay_runs')
      .select(
        'id, run_type, status, rule_status_at_run, rule_version_id, total_gross, total_net, total_employer_cost, created_at, hr_pay_periods(code, period_month, cut_off_date, pay_date), hr_pay_rule_versions(code, verified_at)',
      )
      .eq('id', runId)
      .single(),
  ) as Record<string, any>;

  const eventRows = (unwrap(
    await supabase
      .from('hr_pay_run_events')
      .select('id, event_type, actor, actor_position_id, note, created_at')
      .eq('run_id', runId)
      .order('created_at', { ascending: true }),
  ) ?? []) as Array<Record<string, any>>;

  const payslipRows = (unwrap(
    await supabase
      .from('hr_pay_payslips')
      .select(
        'id, staff_id, gross, paye, nssf_employee, nssf_employer, lst, other_deductions, net, employer_cost, calc_seq, computed_at, hr_staff(staff_ref, user_id)',
      )
      .eq('run_id', runId)
      .eq('is_current', true),
  ) ?? []) as Array<Record<string, any>>;

  const positionIds = Array.from(
    new Set(eventRows.map((e) => e.actor_position_id).filter(Boolean) as string[]),
  );
  const positionTitle: Record<string, string> = {};
  if (positionIds.length > 0) {
    const rows = (unwrap(
      await supabase.from('hr_positions').select('id, title').in('id', positionIds),
    ) ?? []) as Array<{ id: string; title: string }>;
    for (const r of rows) positionTitle[r.id] = r.title;
  }

  const actorIds = Array.from(new Set(eventRows.map((e) => e.actor).filter(Boolean) as string[]));
  const payslipUserIds = payslipRows
    .map((p) => p.hr_staff?.user_id as string | undefined)
    .filter(Boolean) as string[];
  const userIds = Array.from(new Set([...actorIds, ...payslipUserIds]));
  const nameByUser: Record<string, string> = {};
  if (userIds.length > 0) {
    const rows = (unwrap(
      await supabase.from('profiles').select('id, full_name').in('id', userIds),
    ) ?? []) as Array<{ id: string; full_name: string | null }>;
    for (const r of rows) if (r.full_name) nameByUser[r.id] = r.full_name;
  }

  return {
    id: run.id,
    run_type: run.run_type,
    status: run.status,
    rule_status_at_run: run.rule_status_at_run ?? null,
    rule_version_id: run.rule_version_id ?? null,
    total_gross: run.total_gross === null ? null : num(run.total_gross),
    total_net: run.total_net === null ? null : num(run.total_net),
    total_employer_cost:
      run.total_employer_cost === null ? null : num(run.total_employer_cost),
    created_at: run.created_at,
    period_code: run.hr_pay_periods?.code ?? null,
    period_month: run.hr_pay_periods?.period_month ?? null,
    cut_off_date: run.hr_pay_periods?.cut_off_date ?? null,
    pay_date: run.hr_pay_periods?.pay_date ?? null,
    rule_version_code: run.hr_pay_rule_versions?.code ?? null,
    rule_verified_at: run.hr_pay_rule_versions?.verified_at ?? null,
    events: eventRows.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      actor: e.actor ?? null,
      actor_position_id: e.actor_position_id ?? null,
      note: e.note ?? null,
      created_at: e.created_at,
      actor_name: e.actor ? nameByUser[e.actor] ?? null : null,
      actor_position_title: e.actor_position_id
        ? positionTitle[e.actor_position_id] ?? null
        : null,
    })),
    payslips: payslipRows.map((p) => ({
      id: p.id,
      staff_id: p.staff_id,
      staff_ref: p.hr_staff?.staff_ref ?? null,
      staff_name: p.hr_staff?.user_id ? nameByUser[p.hr_staff.user_id] ?? null : null,
      gross: num(p.gross),
      paye: num(p.paye),
      nssf_employee: num(p.nssf_employee),
      nssf_employer: num(p.nssf_employer),
      lst: num(p.lst),
      other_deductions: num(p.other_deductions),
      net: num(p.net),
      employer_cost: num(p.employer_cost),
      calc_seq: p.calc_seq as number,
      computed_at: p.computed_at as string,
    })),
  };
}

export async function calculateRun(runId: string): Promise<{ payslips: number; message: string }> {
  // 1. Load the run.
  const run = unwrap(
    await supabase
      .from('hr_pay_runs')
      .select('id, status, rule_version_id, rule_status_at_run, period_id, hr_pay_periods(cut_off_date)')
      .eq('id', runId)
      .single(),
  ) as Record<string, any>;

  if (!CALCULABLE.includes(run.status)) {
    throw new Error('This run can no longer be calculated.');
  }
  if (!run.rule_version_id) {
    throw new Error('This run has no rule version attached.');
  }
  const periodEnd: string | null = run.hr_pay_periods?.cut_off_date ?? null;
  if (!periodEnd) {
    throw new Error('The pay period has no cut-off date.');
  }

  // 2. Rule version + bands.
  const version = unwrap(
    await supabase
      .from('hr_pay_rule_versions')
      .select(
        'id, code, effective_from, nssf_employee_rate, nssf_employer_rate, nssf_reduces_paye_base, rounding_rule',
      )
      .eq('id', run.rule_version_id)
      .single(),
  ) as Record<string, any>;

  const bandRows = (unwrap(
    await supabase
      .from('hr_pay_tax_bands')
      .select('band_order, lower_bound, upper_bound, rate, fixed_amount')
      .eq('rule_version_id', run.rule_version_id)
      .order('band_order', { ascending: true }),
  ) ?? []) as Array<Record<string, any>>;

  if (bandRows.length === 0) {
    throw new Error('This rule version has no tax bands. Load bands before calculating.');
  }

  const bands: TaxBand[] = bandRows.map((b) => ({
    bandOrder: Number(b.band_order),
    lowerBound: num(b.lower_bound),
    upperBound: b.upper_bound === null ? null : num(b.upper_bound),
    rate: num(b.rate),
    fixedAmount: num(b.fixed_amount),
  }));

  const rule: RuleVersion = {
    code: version.code as string,
    effectiveFrom: version.effective_from as string,
    nssfEmployeeRate: num(version.nssf_employee_rate),
    nssfEmployerRate: num(version.nssf_employer_rate),
    nssfReducesPayeBase: Boolean(version.nssf_reduces_paye_base),
    roundingRule: version.rounding_rule as string,
    bands,
  };

  // 3. Active compensation as at the period end.
  const compRows = (unwrap(
    await supabase
      .from('hr_pay_compensation')
      .select(
        'id, staff_id, amount, effective_from, effective_to, hr_pay_components(code, name, kind, taxable, nssf_able, lst_able, is_statutory)',
      )
      .is('effective_to', null)
      .lte('effective_from', periodEnd),
  ) ?? []) as Array<Record<string, any>>;

  if (compRows.length === 0) {
    throw new Error('No active compensation records. Enter compensation before calculating.');
  }

  // 3b. Open statutory profiles (effective_to is null). Missing row = all apply.
  const statutoryRows = (unwrap(
    await supabase
      .from('hr_pay_statutory_profiles')
      .select(
        'staff_id, employment_type, paye_applicable, nssf_applicable, lst_applicable, exemption_basis',
      )
      .is('effective_to', null),
  ) ?? []) as Array<Record<string, any>>;

  const statutoryByStaff = new Map<string, Record<string, any>>();
  for (const row of statutoryRows) statutoryByStaff.set(row.staff_id as string, row);

  // 4. Group by staff and calculate.
  const byStaff = new Map<string, Array<Record<string, any>>>();
  for (const row of compRows) {
    const key = row.staff_id as string;
    const list = byStaff.get(key) ?? [];
    list.push(row);
    byStaff.set(key, list);
  }

  const computed: Array<{
    staffId: string;
    earnings: PayComponentInput[];
    otherDeductions: number;
    applicability: Applicability;
    employmentType: string | null;
    exemptionBasis: string | null;
    result: ReturnType<typeof calculatePayslip>;
  }> = [];

  for (const [staffId, rows] of byStaff.entries()) {
    const earnings: PayComponentInput[] = rows
      .filter((r) => r.hr_pay_components?.kind === 'earning')
      .map((r) => ({
        code: r.hr_pay_components.code as string,
        name: r.hr_pay_components.name as string,
        kind: r.hr_pay_components.kind as string,
        amount: num(r.amount),
        taxable: Boolean(r.hr_pay_components.taxable),
        nssfAble: Boolean(r.hr_pay_components.nssf_able),
        lstAble: Boolean(r.hr_pay_components.lst_able),
      }));

    const otherDeductions = rows
      .filter(
        (r) =>
          r.hr_pay_components?.kind === 'deduction' && r.hr_pay_components?.is_statutory === false,
      )
      .reduce((sum, r) => sum + num(r.amount), 0);

    const profile = statutoryByStaff.get(staffId) ?? null;
    const applicability: Applicability = {
      payeApplicable: profile ? profile.paye_applicable !== false : true,
      nssfApplicable: profile ? profile.nssf_applicable !== false : true,
      lstApplicable: profile ? profile.lst_applicable !== false : true,
    };

    const result = calculatePayslip(earnings, rule, 0, otherDeductions, applicability);
    computed.push({
      staffId,
      earnings,
      otherDeductions,
      applicability,
      employmentType: (profile?.employment_type as string | null) ?? null,
      exemptionBasis: (profile?.exemption_basis as string | null) ?? null,
      result,
    });
  }

  // 5. Supersede existing payslips, find the next calc_seq.
  const existing = (unwrap(
    await supabase
      .from('hr_pay_payslips')
      .select('id, calc_seq')
      .eq('run_id', runId),
  ) ?? []) as Array<{ id: string; calc_seq: number }>;

  if (existing.length > 0) {
    unwrap(
      await supabase
        .from('hr_pay_payslips')
        .update({ is_current: false })
        .eq('run_id', runId)
        .select('id'),
    );
  }
  const nextSeq =
    existing.length > 0 ? Math.max(...existing.map((e) => Number(e.calc_seq) || 0)) + 1 : 1;

  // 6. Insert payslips.
  const computedAt = new Date().toISOString();
  const inserted = (unwrap(
    await supabase
      .from('hr_pay_payslips')
      .insert(
        computed.map((c) => ({
          run_id: runId,
          staff_id: c.staffId,
          calc_seq: nextSeq,
          is_current: true,
          gross: c.result.gross,
          chargeable_income: c.result.chargeableIncome,
          paye: c.result.paye,
          nssf_employee: c.result.nssfEmployee,
          nssf_employer: c.result.nssfEmployer,
          lst: c.result.lst,
          other_deductions: c.result.otherDeductions,
          net: c.result.net,
          employer_cost: c.result.employerCost,
          rule_version_id: run.rule_version_id,
          rule_status_at_run: run.rule_status_at_run ?? 'provisional',
          inputs_snapshot: JSON.parse(
            JSON.stringify({
              earnings: c.earnings,
              otherDeductions: c.otherDeductions,
              ruleCode: rule.code,
              employment_type: c.employmentType,
              paye_applicable: c.applicability.payeApplicable,
              nssf_applicable: c.applicability.nssfApplicable,
              lst_applicable: c.applicability.lstApplicable,
              exemption_basis: c.exemptionBasis,
            }),
          ),
          calculation_trace: JSON.parse(JSON.stringify(c.result.trace)),
          computed_at: computedAt,
        })),
      )
      .select('id, staff_id'),
  ) ?? []) as Array<{ id: string; staff_id: string }>;

  // 7. Insert payslip lines.
  const payslipIdByStaff: Record<string, string> = {};
  for (const row of inserted) payslipIdByStaff[row.staff_id] = row.id;

  const lines = computed.flatMap((c) =>
    c.result.lines.map((line, index) => ({
      payslip_id: payslipIdByStaff[c.staffId],
      component_code: line.componentCode,
      name: line.name,
      kind: line.kind,
      amount: line.amount,
      taxable_at_run: line.taxableAtRun,
      display_order: index + 1,
    })),
  );

  if (lines.length > 0) {
    unwrap(await supabase.from('hr_pay_payslip_lines').insert(lines).select('id'));
  }

  // 8. Record the event — the trigger moves status and totals.
  unwrap(
    await supabase
      .from('hr_pay_run_events')
      .insert({
        run_id: runId,
        event_type: 'calculated',
        note: `${inserted.length} payslip${inserted.length === 1 ? '' : 's'} written.`,
      })
      .select('id')
      .single(),
  );

  return {
    payslips: inserted.length,
    message: `${inserted.length} payslip${inserted.length === 1 ? '' : 's'} written.`,
  };
}
