import { format } from 'date-fns';

export interface RentCoverageStatement {
  generated_at: string;
  tenants: { total: number; repaying: number; funded: number; completed: number };
  plans: { total: number; repaying: number; funded: number; completed: number };
  money: {
    rent_approved_total: number;
    landlord_float_disbursed: number;
    landlord_payout_count: number;
    landlords_paid: number;
    total_repayment_booked: number;
    collected_total: number;
    collection_count: number;
    recorded_repaid: number;
    outstanding: number;
    coverage_rate: number;
    first_collection_at: string | null;
    last_collection_at: string | null;
  };
}

const ugx = (n: number) => `UGX ${Math.round(Number(n) || 0).toLocaleString('en-UG')}`;
const num = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-UG');
const dt = (s: string | null) => (s ? format(new Date(s), 'dd MMM yyyy') : '—');

/**
 * Rent Coverage Financial Statement — portrait A4, single round trip data in,
 * ready-to-file PDF out.
 */
export async function generateRentCoverageStatementPdf(s: RentCoverageStatement): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const innerW = pw - margin * 2;

  const t = s.tenants;
  const p = s.plans;
  const m = s.money;

  // Header band
  pdf.setFillColor(146, 52, 234);
  pdf.rect(0, 0, pw, 26, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('Welile — Rent Coverage Financial Statement', margin, 11);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Real tenants, active tenants, rent disbursed since launch and amount covered', margin, 17.5);
  pdf.setFontSize(8);
  pdf.text(`Generated ${format(new Date(s.generated_at || Date.now()), 'dd MMM yyyy HH:mm')}`, pw - margin, 22.5, { align: 'right' });

  let y = 34;

  // KPI strip
  const kpis: { label: string; value: string; tone: [number, number, number] }[] = [
    { label: 'Real tenants', value: num(t.total), tone: [37, 99, 235] },
    { label: 'Active (repaying)', value: num(t.repaying), tone: [22, 163, 74] },
    { label: 'Rent disbursed', value: ugx(m.landlord_float_disbursed), tone: [146, 52, 234] },
    { label: 'Covered (collected)', value: ugx(m.collected_total), tone: [202, 138, 4] },
  ];
  const kw = (innerW - 3 * 4) / 4;
  kpis.forEach((k, i) => {
    const x = margin + i * (kw + 4);
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, y, kw, 20, 2, 2, 'FD');
    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(k.label.toUpperCase(), x + 3, y + 6);
    pdf.setTextColor(...k.tone);
    pdf.setFontSize(k.value.length > 14 ? 10 : 13);
    pdf.text(k.value, x + 3, y + 15);
  });
  y += 28;

  const section = (title: string) => {
    if (y > ph - 40) { pdf.addPage(); y = 18; }
    pdf.setFillColor(37, 99, 235);
    pdf.rect(margin, y, innerW, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(title, margin + 3, y + 4.9);
    y += 7;
  };

  const row = (label: string, value: string, opts?: { bold?: boolean; tone?: [number, number, number]; zebra?: boolean }) => {
    if (y > ph - 20) { pdf.addPage(); y = 18; }
    const h = 7;
    if (opts?.zebra) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, innerW, h, 'F');
    }
    pdf.setDrawColor(233, 238, 245);
    pdf.line(margin, y + h, margin + innerW, y + h);
    pdf.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(51, 65, 85);
    pdf.text(label, margin + 3, y + 4.8);
    pdf.setTextColor(...(opts?.tone ?? [15, 23, 42]));
    pdf.setFont('helvetica', 'bold');
    pdf.text(value, margin + innerW - 3, y + 4.8, { align: 'right' });
    y += h;
  };

  // Tenants
  section('Tenant base — who we really have');
  row('Real tenants (repaying, funded or completed with a repayment record)', num(t.total), { bold: true, zebra: true });
  row('Active — currently repaying', num(t.repaying), { tone: [22, 163, 74] });
  row('Funded — disbursed, awaiting first collection', num(t.funded), { zebra: true });
  row('Completed — rent plan fully repaid', num(t.completed), { tone: [37, 99, 235] });
  row('Excluded: rejected, cancelled and never-repaid requests', 'Not counted', { zebra: true, tone: [100, 116, 139] });
  y += 5;

  // Plans
  section('Rent plans behind those tenants');
  row('Total real rent plans', num(p.total), { bold: true, zebra: true });
  row('Repaying', num(p.repaying));
  row('Funded', num(p.funded), { zebra: true });
  row('Completed', num(p.completed));
  y += 5;

  // Disbursed
  section('Rent disbursed since the system started');
  row('Landlord float disbursed (rent paid out to landlords)', ugx(m.landlord_float_disbursed), { bold: true, zebra: true, tone: [146, 52, 234] });
  row('Landlord payouts processed', num(m.landlord_payout_count));
  row('Distinct landlords paid', num(m.landlords_paid), { zebra: true });
  row('Rent approved (plan face value)', ugx(m.rent_approved_total));
  y += 5;

  // Covered
  section('How much was covered (collected back)');
  row('Collected from tenants (all agent collections)', ugx(m.collected_total), { bold: true, zebra: true, tone: [22, 163, 74] });
  row('Collections recorded', num(m.collection_count));
  row('Recorded repaid on real rent plans', ugx(m.recorded_repaid), { zebra: true });
  row('Total repayment booked on real plans', ugx(m.total_repayment_booked));
  row('Still to collect (outstanding)', ugx(m.outstanding), { zebra: true, tone: [220, 38, 38] });
  row('Coverage of disbursement', `${Number(m.coverage_rate || 0).toFixed(2)}%`, { bold: true, tone: m.coverage_rate >= 100 ? [22, 163, 74] : [202, 138, 4] });
  y += 5;

  section('Collection window');
  row('First collection recorded', dt(m.first_collection_at), { zebra: true });
  row('Latest collection recorded', dt(m.last_collection_at));

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Welile — internal financial statement. Figures sourced from the double-entry ledger and rent plan records.', margin, ph - 8);
    pdf.text(`Page ${i} of ${pages}`, pw - margin, ph - 8, { align: 'right' });
  }

  return pdf.output('blob');
}
