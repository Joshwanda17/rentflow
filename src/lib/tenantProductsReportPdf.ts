import { format } from 'date-fns';
import { generateTenantOpsExtractPdf, downloadPdfBlob } from './generateTenantOpsExtractPdf';
import type { TpsReport, TpsRow } from '@/hooks/useTenantProductsReport';

const ugx = (n: number) => `UGX ${Math.round(Number(n || 0)).toLocaleString()}`;

function pctLabel(current: number, previous: number): string {
  if (!previous) return current > 0 ? 'new' : '0%';
  const p = ((current - previous) / previous) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

/** Branded landscape PDF of the Tenant Products & Services report. */
export function buildTenantProductsReportPdf(report: TpsReport, rows: TpsRow[]): Blob {
  const c = report.current;
  const p = report.previous;
  const receivables = Number(c.collected || 0);
  const payables = Number(c.payables || 0);

  const tableRows = rows.map((r, i) => [
    i + 1,
    r.tenant_name ?? '—',
    r.tenant_phone ?? '—',
    r.district ?? '—',
    r.agent_name ?? 'Unassigned',
    r.is_new_in_period ? 'New' : 'Existing',
    r.application_status ?? '—',
    r.accepted_in_period ? 'Yes' : r.rejected_in_period ? 'Rejected' : '—',
    r.paid_in_period,
    r.payments_in_period,
    r.outstanding,
    r.payables_in_period,
    r.last_payment_at,
  ]);

  const totalPaid = rows.reduce((s, r) => s + Number(r.paid_in_period || 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding || 0), 0);
  const totalPayables = rows.reduce((s, r) => s + Number(r.payables_in_period || 0), 0);

  return generateTenantOpsExtractPdf({
    title: 'Tenant Products & Services — Daily Report',
    subtitle: `Reporting window ${format(new Date(report.period.from), 'dd MMM yyyy')} → ${format(new Date(report.period.to), 'dd MMM yyyy')} (East Africa Time). Percentages compare against the immediately preceding ${report.period.days}-day window (${format(new Date(report.period.previous_from), 'dd MMM')} → ${format(new Date(report.period.previous_to), 'dd MMM yyyy')}).`,
    kpis: [
      { label: 'New Tenants', value: `${c.new_tenants.toLocaleString()} (${pctLabel(c.new_tenants, p.new_tenants)})` },
      { label: 'Active Tenants (paid)', value: `${c.active_tenants.toLocaleString()} (${pctLabel(c.active_tenants, p.active_tenants)})`, color: [22, 130, 80] },
      { label: 'Applications', value: `${c.applications.toLocaleString()} (${pctLabel(c.applications, p.applications)})` },
      { label: 'Accepted', value: `${c.accepted.toLocaleString()} (${pctLabel(c.accepted, p.accepted)})`, color: [22, 130, 80] },
      { label: 'Rejected', value: `${c.rejected.toLocaleString()} (${pctLabel(c.rejected, p.rejected)})`, color: [180, 60, 50] },
      { label: 'Rent Collected', value: `${ugx(c.collected)} (${pctLabel(c.collected, p.collected)})`, color: [22, 130, 80] },
      { label: 'Receivables (money in)', value: ugx(receivables), color: [22, 130, 80] },
      { label: 'Payables (landlord payouts raised)', value: ugx(payables), color: [180, 60, 50] },
      { label: 'Payables still unpaid', value: ugx(report.outstanding_payables), color: [180, 60, 50] },
      { label: 'Tenant register (all-time)', value: report.tenant_register_total.toLocaleString() },
    ],
    columns: [
      { label: '#', width: 8, align: 'right', format: 'number' },
      { label: 'Tenant', width: 34 },
      { label: 'Phone', width: 22 },
      { label: 'District', width: 24 },
      { label: 'Agent', width: 30 },
      { label: 'Type', width: 16 },
      { label: 'Application', width: 24 },
      { label: 'Accepted', width: 18 },
      { label: 'Paid in period', width: 24, format: 'ugx' },
      { label: 'Payments', width: 16, format: 'number' },
      { label: 'Outstanding', width: 24, format: 'ugx' },
      { label: 'Landlord payout', width: 24, format: 'ugx' },
      { label: 'Last payment', width: 24, format: 'datetime' },
    ],
    rows: tableRows,
    totals: ['', 'TOTALS', '', '', '', '', '', '', totalPaid, '', totalOutstanding, totalPayables, ''],
    footerNote: 'Definitions — New Tenants: tenant accounts created in the window. Active Tenants: distinct tenants with at least one recorded rent collection in the window. Applications: rent requests created in the window. Accepted: rent requests that reached final operations approval in the window. Rejected: rent requests rejected in the window. Rent Collected / Receivables: recorded tenant rent collections. Payables: landlord payout obligations raised in the window; "still unpaid" is the all-time balance of payouts not yet completed. All figures are whole-system (no row caps) and computed in East Africa Time. Confidential — Welile internal report.',
  });
}

export function downloadTenantProductsReportPdf(report: TpsReport, rows: TpsRow[]) {
  const blob = buildTenantProductsReportPdf(report, rows);
  downloadPdfBlob(blob, `tenant-products-services-${report.period.from}_to_${report.period.to}.pdf`);
}

export function downloadTenantProductsCsv(report: TpsReport, rows: TpsRow[]) {
  const head = ['Tenant', 'Phone', 'District', 'Region', 'Agent', 'Type', 'Application status', 'Accepted in period', 'Rejected in period', 'Paid in period', 'Payments', 'Outstanding', 'Landlord payout in period', 'Last payment'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((r) => [
    r.tenant_name, r.tenant_phone, r.district, r.region, r.agent_name,
    r.is_new_in_period ? 'New' : 'Existing',
    r.application_status, r.accepted_in_period, r.rejected_in_period,
    Math.round(Number(r.paid_in_period || 0)), r.payments_in_period,
    Math.round(Number(r.outstanding || 0)), Math.round(Number(r.payables_in_period || 0)),
    r.last_payment_at,
  ].map(esc).join(','));
  const csv = [head.map(esc).join(','), ...body].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `tenant-products-services-${report.period.from}_to_${report.period.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
