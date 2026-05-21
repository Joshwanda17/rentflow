import jsPDF from 'jspdf';
import { format } from 'date-fns';

export interface AgentDailyTenantRow {
  tenantName: string;
  tenantPhone: string;
  rentPrincipal: number;
  totalRepayment: number;
  amountRepaid: number;
  dailyExpected: number;
  collectedToday: number;
  paidToday: boolean;
}

export interface AgentDailyCollectionRow {
  time: string;
  tenantName: string;
  amount: number;
  method: string;
  reference: string;
}

export interface AgentDailyPerformanceInput {
  agentName: string;
  agentPhone: string;
  reportDate: Date;
  generatedAt: Date;
  rows: AgentDailyTenantRow[];
  collections: AgentDailyCollectionRow[];
}

const num = (n: number) => Math.round(n || 0).toLocaleString();
const COL = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [225, 227, 232] as [number, number, number],
  zebra: [248, 249, 252] as [number, number, number],
  head: [20, 33, 72] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
};

export function generateAgentDailyPerformancePdf(input: AgentDailyPerformanceInput): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  let y = 10;

  // Totals
  const totals = input.rows.reduce(
    (a, r) => {
      a.expected += r.dailyExpected;
      a.collected += r.collectedToday;
      a.principal += r.rentPrincipal;
      a.repaid += r.amountRepaid;
      a.outstanding += Math.max(0, (r.totalRepayment || 0) - (r.amountRepaid || 0));
      if (r.paidToday) a.paid += 1;
      return a;
    },
    { expected: 0, collected: 0, principal: 0, repaid: 0, outstanding: 0, paid: 0 },
  );
  const rate = totals.expected > 0 ? Math.round((totals.collected / totals.expected) * 100) : 0;

  // ===== Header bar =====
  doc.setFillColor(...COL.ink);
  doc.rect(margin, y, contentW, 20, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('WELILE — AGENT DAILY PERFORMANCE', margin + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 208, 225);
  doc.text(
    `${input.agentName}  ·  ${input.agentPhone || '—'}`,
    margin + 4,
    y + 14,
  );
  // Right date chip
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(format(input.reportDate, 'EEE, dd MMM yyyy'), pageW - margin - 4, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(200, 208, 225);
  doc.text(`Generated ${format(input.generatedAt, 'dd MMM yyyy HH:mm')}`, pageW - margin - 4, y + 15, { align: 'right' });
  y += 24;

  // ===== Summary chips =====
  const chips: { label: string; value: string; color: [number, number, number] }[] = [
    { label: 'Active tenants', value: String(input.rows.length), color: COL.ink },
    { label: 'Paid today', value: `${totals.paid} / ${input.rows.length}`, color: COL.green },
    { label: 'Expected today (UGX)', value: num(totals.expected), color: COL.ink },
    { label: 'Collected today (UGX)', value: num(totals.collected), color: COL.blue },
    { label: 'Collection rate', value: `${rate}%`, color: rate >= 75 ? COL.green : rate >= 50 ? COL.blue : COL.red },
    { label: 'Principal paid (UGX)', value: num(totals.principal), color: COL.ink },
    { label: 'Outstanding (UGX)', value: num(totals.outstanding), color: COL.red },
  ];
  const gap = 3;
  const chipW = (contentW - gap * (chips.length - 1)) / chips.length;
  const chipH = 18;
  chips.forEach((c, i) => {
    const x = margin + i * (chipW + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COL.border);
    doc.setLineWidth(0.25);
    (doc as any).roundedRect(x, y, chipW, chipH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...COL.muted);
    doc.text(c.label.toUpperCase(), x + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...c.color);
    doc.text(c.value, x + 3, y + 13);
  });
  y += chipH + 5;

  // ===== Per-tenant table =====
  doc.setFillColor(...COL.head);
  doc.rect(margin, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('PER-TENANT BREAKDOWN', margin + 3, y + 4.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('All amounts in UGX', pageW - margin - 3, y + 4.8, { align: 'right' });
  y += 7;

  const cols = [
    { label: '#', w: 8, align: 'left' as const },
    { label: 'Tenant', w: 50, align: 'left' as const },
    { label: 'Phone', w: 30, align: 'left' as const },
    { label: 'Rent (Principal)', w: 30, align: 'right' as const },
    { label: 'Daily Expected', w: 28, align: 'right' as const },
    { label: 'Collected Today', w: 30, align: 'right' as const },
    { label: 'Status', w: 22, align: 'center' as const },
    { label: 'Total Repaid', w: 28, align: 'right' as const },
    { label: 'Outstanding', w: contentW - (8 + 50 + 30 + 30 + 28 + 30 + 22 + 28), align: 'right' as const },
  ];
  const colX = (i: number) => margin + cols.slice(0, i).reduce((s, c) => s + c.w, 0);

  const drawHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentW, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...COL.ink);
    cols.forEach((c, i) => {
      const tx = c.align === 'right' ? colX(i) + c.w - 1.5 : c.align === 'center' ? colX(i) + c.w / 2 : colX(i) + 1.5;
      doc.text(c.label, tx, y + 4.3, { align: c.align });
    });
    y += 6.5;
  };
  drawHeader();

  const rowH = 5.6;
  const bottomLimit = pageH - 14;
  const trunc = (s: string, n: number) => (!s ? '—' : s.length > n ? s.slice(0, n - 1) + '…' : s);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  input.rows.forEach((r, i) => {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = 10;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
    }
    if (i % 2 === 1) {
      doc.setFillColor(...COL.zebra);
      doc.rect(margin, y, contentW, rowH, 'F');
    }
    doc.setDrawColor(...COL.border);
    doc.setLineWidth(0.1);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);
    const b = y + rowH - 1.8;
    const outstanding = Math.max(0, (r.totalRepayment || 0) - (r.amountRepaid || 0));
    doc.setTextColor(...COL.ink);
    doc.text(String(i + 1), colX(0) + 1.5, b);
    doc.setFont('helvetica', 'bold');
    doc.text(trunc(r.tenantName, 32), colX(1) + 1.5, b);
    doc.setFont('helvetica', 'normal');
    doc.text(trunc(r.tenantPhone, 18), colX(2) + 1.5, b);
    doc.text(num(r.rentPrincipal), colX(3) + cols[3].w - 1.5, b, { align: 'right' });
    doc.text(num(r.dailyExpected), colX(4) + cols[4].w - 1.5, b, { align: 'right' });
    if (r.collectedToday > 0) doc.setTextColor(...COL.green);
    doc.text(num(r.collectedToday), colX(5) + cols[5].w - 1.5, b, { align: 'right' });
    doc.setTextColor(...COL.ink);
    // status pill
    const sColor = r.paidToday ? COL.green : COL.red;
    doc.setFillColor(...sColor);
    (doc as any).roundedRect(colX(6) + 2, y + 1.3, cols[6].w - 4, rowH - 2.6, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(r.paidToday ? 'Paid' : 'Pending', colX(6) + cols[6].w / 2, b - 0.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COL.ink);
    doc.text(num(r.amountRepaid), colX(7) + cols[7].w - 1.5, b, { align: 'right' });
    if (outstanding > 0) doc.setTextColor(...COL.red);
    doc.text(num(outstanding), colX(8) + cols[8].w - 1.5, b, { align: 'right' });
    doc.setTextColor(...COL.ink);
    y += rowH;
  });

  if (input.rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...COL.muted);
    doc.text('No active tenants assigned to this agent.', margin + 3, y + 6);
    y += 8;
  }

  // Totals row
  if (y + rowH + 1 > bottomLimit) {
    doc.addPage();
    y = 10;
    drawHeader();
  }
  doc.setFillColor(232, 240, 254);
  doc.rect(margin, y, contentW, rowH + 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const tb = y + rowH - 1.4;
  doc.setTextColor(...COL.blue);
  doc.text('TOTAL', colX(1) + 1.5, tb);
  doc.setTextColor(...COL.ink);
  doc.text(num(totals.principal), colX(3) + cols[3].w - 1.5, tb, { align: 'right' });
  doc.text(num(totals.expected), colX(4) + cols[4].w - 1.5, tb, { align: 'right' });
  doc.setTextColor(...COL.green);
  doc.text(num(totals.collected), colX(5) + cols[5].w - 1.5, tb, { align: 'right' });
  doc.setTextColor(...COL.ink);
  doc.text(`${totals.paid}/${input.rows.length}`, colX(6) + cols[6].w / 2, tb, { align: 'center' });
  doc.text(num(totals.repaid), colX(7) + cols[7].w - 1.5, tb, { align: 'right' });
  doc.setTextColor(...COL.red);
  doc.text(num(totals.outstanding), colX(8) + cols[8].w - 1.5, tb, { align: 'right' });
  y += rowH + 6;

  // ===== Collections sub-table =====
  if (input.collections.length > 0) {
    if (y + 30 > bottomLimit) {
      doc.addPage();
      y = 10;
    }
    doc.setFillColor(...COL.head);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`COLLECTIONS LOGGED TODAY (${input.collections.length})`, margin + 3, y + 4.8);
    y += 7;

    const c2 = [
      { label: 'Time', w: 28, align: 'left' as const },
      { label: 'Tenant', w: 70, align: 'left' as const },
      { label: 'Amount (UGX)', w: 35, align: 'right' as const },
      { label: 'Method', w: 35, align: 'left' as const },
      { label: 'Reference / TID', w: contentW - (28 + 70 + 35 + 35), align: 'left' as const },
    ];
    const c2X = (i: number) => margin + c2.slice(0, i).reduce((s, c) => s + c.w, 0);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...COL.ink);
    c2.forEach((c, i) => {
      const tx = c.align === 'right' ? c2X(i) + c.w - 1.5 : c2X(i) + 1.5;
      doc.text(c.label, tx, y + 4, { align: c.align });
    });
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    input.collections.forEach((r, i) => {
      if (y + rowH > bottomLimit) {
        doc.addPage();
        y = 10;
      }
      if (i % 2 === 1) {
        doc.setFillColor(...COL.zebra);
        doc.rect(margin, y, contentW, rowH, 'F');
      }
      const b = y + rowH - 1.8;
      doc.setTextColor(...COL.ink);
      doc.text(r.time, c2X(0) + 1.5, b);
      doc.text(trunc(r.tenantName, 45), c2X(1) + 1.5, b);
      doc.setFont('helvetica', 'bold');
      doc.text(num(r.amount), c2X(2) + c2[2].w - 1.5, b, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(trunc(r.method, 20), c2X(3) + 1.5, b);
      doc.setTextColor(...COL.muted);
      doc.text(trunc(r.reference, 30), c2X(4) + 1.5, b);
      y += rowH;
    });
  }

  // Footer page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COL.muted);
    doc.text(`Page ${p} of ${pageCount}  ·  Welile Receipts  ·  Confidential`, pageW / 2, pageH - 5, { align: 'center' });
  }

  return doc.output('blob');
}