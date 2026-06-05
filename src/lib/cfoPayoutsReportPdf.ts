import welileLogoUrl from '@/assets/welile-logo.png';
import { format } from 'date-fns';

const THEME_PRIMARY: [number, number, number] = [108, 33, 196];
const THEME_PRIMARY_DARK: [number, number, number] = [76, 22, 150];
const THEME_STRIPE: [number, number, number] = [243, 238, 252];

export interface CfoPayoutRow {
  date: string | Date;
  recipient: string;
  amount: number;
  type: string;
  reference?: string;
  performedBy?: string;
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
 * Build a branded PDF listing the people the CFO has paid out.
 */
export async function generateCfoPayoutsPdf(
  rows: CfoPayoutRow[],
  generatedAt: Date = new Date(),
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
  doc.text('Wallet Payouts Report', logo ? margin + 20 : margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${format(generatedAt, 'dd MMM yyyy, HH:mm')}`, logo ? margin + 20 : margin, 21);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  let y = 40;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${rows.length} payout${rows.length === 1 ? '' : 's'}`, margin, y);
  doc.text(`Total: ${fmtUGX(total)}`, pageWidth - margin, y, { align: 'right' });
  y += 4;

  const head = [['#', 'Date', 'Recipient', 'Type', 'Reference', 'Amount']];
  const body = rows.map((r, i) => [
    String(i + 1),
    typeof r.date === 'string' ? r.date : format(r.date, 'dd MMM yyyy'),
    r.recipient || '—',
    r.type || '—',
    r.reference || '—',
    fmtUGX(Number(r.amount) || 0),
  ]);

  autoTable(doc, {
    head,
    body,
    startY: y + 4,
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: THEME_PRIMARY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: THEME_STRIPE },
    columnStyles: {
      0: { cellWidth: 8, halign: 'right' },
      1: { cellWidth: 24 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 32 },
      4: { cellWidth: 32 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 30 },
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

/**
 * Native share sheet (best for WhatsApp on mobile). Falls back to downloading
 * the file and opening WhatsApp web with a short caption.
 */
export async function shareCfoPayoutsPdf(blob: Blob, filename: string, caption: string) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: filename, text: caption });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');
}
