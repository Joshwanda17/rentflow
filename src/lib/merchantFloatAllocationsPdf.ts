import welileLogoUrl from '@/assets/welile-logo.png';
import { format } from 'date-fns';

const THEME_PRIMARY: [number, number, number] = [2, 132, 199]; // sky-600
const THEME_PRIMARY_DARK: [number, number, number] = [3, 105, 161]; // sky-700
const THEME_STRIPE: [number, number, number] = [235, 245, 252];

export interface MerchantFloatAllocationRow {
  date: string | Date;
  agent: string;
  phone?: string;
  amount: number;
  reason?: string;
  approvedBy?: string;
}

export interface MerchantFloatAgentBreakdown {
  agent: string;
  phone?: string;
  count: number;
  total: number;
}

export interface MerchantFloatDateRange {
  startDate: Date;
  endDate: Date;
}

const fmtUGX = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch(welileLogoUrl);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Branded PDF summarising float the CFO has allocated to merchant agents,
 * with a per-agent breakdown for audit purposes.
 */
export async function generateMerchantFloatAllocationsPdf(
  rows: MerchantFloatAllocationRow[],
  breakdown: MerchantFloatAgentBreakdown[],
  generatedAt: Date = new Date(),
  dateRange?: MerchantFloatDateRange,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod: any = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  const logo = await loadLogoBase64();

  // ── Header band ──
  doc.setFillColor(...THEME_PRIMARY);
  doc.rect(0, 0, pageWidth, 30, 'F');
  if (logo) {
    try { doc.addImage(logo, 'PNG', margin, 7, 16, 16); } catch { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Merchant Float Allocations', logo ? margin + 20 : margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${format(generatedAt, 'dd MMM yyyy, HH:mm')}`, logo ? margin + 20 : margin, 21);

  let y = 40;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);

  if (dateRange) {
    doc.text(
      `Period: ${format(dateRange.startDate, 'dd MMM yyyy')} – ${format(dateRange.endDate, 'dd MMM yyyy')}`,
      margin,
      y,
    );
    y += 5;
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  doc.text(`${rows.length} allocation${rows.length === 1 ? '' : 's'} · ${breakdown.length} agent${breakdown.length === 1 ? '' : 's'}`, margin, y);
  doc.text(`Total allocated: ${fmtUGX(total)}`, pageWidth - margin, y, { align: 'right' });
  y += 4;

  // ── Per-agent breakdown (primary audit view) ──
  doc.setTextColor(...THEME_PRIMARY_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Allocated per Merchant Agent', margin, y + 8);
  y += 10;
  doc.setDrawColor(...THEME_PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  autoTable(doc, {
    head: [['#', 'Merchant Agent', 'Phone', 'Allocations', 'Total Allocated']],
    body: breakdown.map((b, i) => [
      String(i + 1),
      b.agent,
      b.phone || '—',
      String(b.count),
      fmtUGX(b.total),
    ]),
    startY: y + 4,
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { fontSize: 8.5, cellPadding: 2.2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: THEME_PRIMARY_DARK, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: THEME_STRIPE },
    columnStyles: {
      0: { cellWidth: 8, halign: 'right' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30 },
      3: { cellWidth: 24, halign: 'center' },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 38 },
    },
  });

  // ── Detailed allocation records ──
  const finalY = (doc as any).lastAutoTable?.finalY || y + 20;
  let dy = finalY + 12;
  doc.setTextColor(...THEME_PRIMARY_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Allocation Records', margin, dy);
  dy += 2;
  doc.setDrawColor(...THEME_PRIMARY);
  doc.line(margin, dy, pageWidth - margin, dy);
  dy += 5;

  autoTable(doc, {
    head: [['#', 'Date', 'Merchant Agent', 'Reason', 'Approved by', 'Amount']],
    body: rows.map((r, i) => [
      String(i + 1),
      typeof r.date === 'string' ? r.date : format(r.date, 'dd MMM yyyy, HH:mm'),
      r.agent || '—',
      r.reason || '—',
      r.approvedBy || '—',
      fmtUGX(Number(r.amount) || 0),
    ]),
    startY: dy,
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: THEME_PRIMARY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: THEME_STRIPE },
    columnStyles: {
      0: { cellWidth: 8, halign: 'right' },
      1: { cellWidth: 30 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 40 },
      4: { cellWidth: 28 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
    },
  });

  // ── Footer ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Powered by Welile — confidential treasury report', margin, ph - 6);
    doc.text(`Page ${p} / ${pageCount}`, pageWidth - margin, ph - 6, { align: 'right' });
  }

  return doc.output('blob');
}
