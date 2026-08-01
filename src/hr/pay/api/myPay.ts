/**
 * Employee self-service payroll reads.
 *
 * These queries deliberately carry no staff filter. Row level security on
 * `hr_pay_payslips` (`hr_pay_is_own_staff`) already restricts an ordinary
 * employee to their own rows, so adding a client-side filter would only
 * duplicate — and risk contradicting — the database rule.
 */
import { supabase, unwrap } from '../../api/client';

export interface MyPayslipRow {
  id: string;
  period_code: string | null;
  pay_date: string | null;
  gross: number;
  paye: number;
  nssf_employee: number;
  other_deductions: number;
  net: number;
  run_status: string;
}

/** Payslips visible to the signed-in employee, newest pay date first. */
export async function listMyPayslips(): Promise<MyPayslipRow[]> {
  const rows = (unwrap(
    await supabase
      .from('hr_pay_payslips')
      .select(
        'id, gross, paye, nssf_employee, other_deductions, net, is_current, hr_pay_runs!inner(status, hr_pay_periods(code, pay_date))',
      )
      .eq('is_current', true)
      .in('hr_pay_runs.status', ['paid', 'locked']),
  ) ?? []) as Array<Record<string, any>>;

  return rows
    .map((r) => ({
      id: r.id as string,
      period_code: (r.hr_pay_runs?.hr_pay_periods?.code as string | null) ?? null,
      pay_date: (r.hr_pay_runs?.hr_pay_periods?.pay_date as string | null) ?? null,
      gross: Number(r.gross ?? 0),
      paye: Number(r.paye ?? 0),
      nssf_employee: Number(r.nssf_employee ?? 0),
      other_deductions: Number(r.other_deductions ?? 0),
      net: Number(r.net ?? 0),
      run_status: (r.hr_pay_runs?.status as string) ?? '',
    }))
    .sort((a, b) => (b.pay_date ?? '').localeCompare(a.pay_date ?? ''));
}