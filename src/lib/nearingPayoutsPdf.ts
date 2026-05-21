import { formatUGX } from '@/lib/rentCalculations';

export interface NearingPayoutPdfRow {
  name: string;
  portfolioName: string;
  phone: string;
  email: string;
  investmentAmount: number;
  roiPercentage: number;
  roiMode: string;
  daysUntil: number;
  nextPayoutDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface NearingPayoutPdfInput {
  /** Human-readable label for the active filter ("Overdue", "Today", "≤ 7 days"…). */
  filterLabel: string;
  /** Free-text search the user had applied, if any. */
  searchQuery?: string;
  /** Total portfolios in the unfiltered list (for context in the summary line). */
  totalCount: number;
  rows: NearingPayoutPdfRow[];
  generatedAt?: Date;
}

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const dueLabel = (d: number) => {
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Tomorrow';
  return `${d}d away`;
};

/**
 * Build a CFO-style PDF report of portfolios nearing payout, honouring the
 * filter that was active in the Nearing Payouts dialog. The first column is
 * a "Returns Due" computed from principal × ROI%.
 */
export async function generateNearingPayoutsPdf(input: NearingPayoutPdfInput): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod: any = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod;

  const generatedAt = input.generatedAt || new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('WELILE', margin, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Portfolios Nearing Payout — Export', margin, 16);
  doc.setFontSize(8);
  doc.text(`Generated: ${generatedAt.toLocaleString('en-GB')}`, pageWidth - margin, 10, { align: 'right' });
  doc.text('COO / Partner Ops · Confidential', pageWidth - margin, 16, { align: 'right' });

  // Summary line
  doc.setTextColor(15, 23, 42);
  let y = 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Filter: ${input.filterLabel}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 5;
  doc.setTextColor(71, 85, 105);
  const parts = [
    `${input.rows.length} of ${input.totalCount} portfolios`,
    input.searchQuery ? `Search: "${input.searchQuery}"` : null,
  ].filter(Boolean) as string[];
  doc.text(parts.join('   ·   '), margin, y);

  // Aggregate totals
  const totalPrincipal = input.rows.reduce((s, r) => s + (r.investmentAmount || 0), 0);
  const totalReturns = input.rows.reduce(
    (s, r) => s + Math.round((r.investmentAmount || 0) * (r.roiPercentage || 0) / 100),
    0,
  );
  const overdueCount = input.rows.filter((r) => r.daysUntil < 0).length;
  const todayCount = input.rows.filter((r) => r.daysUntil === 0).length;

  y += 6;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    `Principal: ${formatUGX(totalPrincipal)}   ·   Returns Due: ${formatUGX(totalReturns)}   ·   Overdue: ${overdueCount}   ·   Due Today: ${todayCount}`,
    margin,
    y,
  );

  // Empty-state guard
  if (input.rows.length === 0) {
    y += 14;
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('No portfolios match the current filter.', margin, y);
    return doc.output('blob');
  }

  // Body table
  const head = [[
    '#', 'Partner', 'Portfolio', 'Phone', 'Email',
    'Principal', 'ROI %', 'Returns Due', 'Mode', 'Payout Date', 'Status', 'Contribution',
  ]];
  const body = input.rows.map((r, idx) => {
    const returnsDue = Math.round((r.investmentAmount || 0) * (r.roiPercentage || 0) / 100);
    return [
      String(idx + 1),
      r.name || '—',
      r.portfolioName || '—',
      r.phone || '—',
      r.email || '—',
      formatUGX(r.investmentAmount || 0),
      `${r.roiPercentage}%`,
      formatUGX(returnsDue),
      r.roiMode === 'monthly_compounding' ? 'Compound' : 'Payout',
      fmtDate(r.nextPayoutDate),
      dueLabel(r.daysUntil),
      fmtDate(r.createdAt),
    ];
  });

  autoTable(doc, {
    head,
    body,
    startY: y + 6,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [20, 33, 72], textColor: 255, fontSize: 7.5, halign: 'left' },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', cellWidth: 12 },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'center', cellWidth: 16 },
      10: { halign: 'center', cellWidth: 22 },
    },
    didParseCell: (data: any) => {
      // Highlight overdue / due-today rows in the Status column.
      if (data.section === 'body' && data.column.index === 10) {
        const status = String(data.cell.raw || '');
        if (status.includes('overdue')) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'Due today') {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageCount = (doc as any).internal.getNumberOfPages();
      const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Welile · Nearing Payouts · ${generatedAt.toLocaleDateString('en-GB')}`,
        margin,
        pageHeight - 6,
      );
      doc.text(`Page ${current} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    },
  });

  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}