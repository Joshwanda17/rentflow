import jsPDF from 'jspdf';
import { format } from 'date-fns';

/**
 * Pipeline Status Hub report generator.
 *
 * Read-only presentation layer: every figure passed in is computed by the hub
 * from existing rent_requests / agent_collections / agent_landlord_payouts
 * data, using the SAME filters + date range that are on screen. This file
 * introduces no business logic of its own.
 */

export interface PipelineReportKpi {
  label: string;
  value: string;
  hint?: string;
}

export interface PipelineReportSection {
  title: string;
  note?: string;
  headers: string[];
  rows: (string | number)[][];
  /** column width weights, defaults to equal */
  widths?: number[];
}

export interface PipelineReportPayload {
  title: string;
  subtitle?: string;
  range: { from?: Date | null; to?: Date | null };
  filters: { label: string; value: string }[];
  kpis: PipelineReportKpi[];
  sections: PipelineReportSection[];
}

export function generatePipelineHubReportPdf(payload: PipelineReportPayload): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const fmtDate = (d?: Date | null) => (d ? format(d, 'dd MMM yyyy') : '—');

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 150);
      doc.text('WELILE · Tenant Operations · Pipeline Status Hub', margin, pageHeight - 6);
      doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }
  };

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - 12) {
      doc.addPage();
      y = 14;
    }
  };

  // ---------- Header ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 40, 120);
  doc.text('WELILE', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 120);
  doc.text(format(new Date(), 'dd MMM yyyy, hh:mm a'), pageWidth - margin, y, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.title, margin, y);

  if (payload.subtitle) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 120);
    doc.text(doc.splitTextToSize(payload.subtitle, contentWidth), margin, y);
  }

  y += 5.5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 80);
  doc.text(`Period: ${fmtDate(payload.range.from)} — ${fmtDate(payload.range.to)}`, margin, y);

  if (payload.filters.length) {
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 120);
    const text = payload.filters.map((f) => `${f.label}: ${f.value}`).join('   ·   ');
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += (lines.length - 1) * 3.6;
  }

  y += 4;
  doc.setDrawColor(225, 228, 235);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ---------- KPI tiles ----------
  if (payload.kpis.length) {
    const perRow = 5;
    const gap = 3;
    const boxW = (contentWidth - gap * (perRow - 1)) / perRow;
    const boxH = 17;
    payload.kpis.forEach((k, i) => {
      const col = i % perRow;
      if (col === 0) ensure(boxH + 4);
      const x = margin + col * (boxW + gap);
      const rowY = y;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, rowY, boxW, boxH, 1.6, 1.6, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(110, 116, 128);
      doc.text(doc.splitTextToSize(k.label.toUpperCase(), boxW - 4)[0], x + 2, rowY + 4.6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      doc.text(doc.splitTextToSize(k.value, boxW - 4)[0], x + 2, rowY + 10.6);
      if (k.hint) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(120, 126, 138);
        doc.text(doc.splitTextToSize(k.hint, boxW - 4)[0], x + 2, rowY + 14.6);
      }
      if (col === perRow - 1) y = rowY + boxH + gap;
      else if (i === payload.kpis.length - 1) y = rowY + boxH + gap;
    });
    y += 4;
  }

  // ---------- Sections ----------
  for (const section of payload.sections) {
    ensure(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(section.title, margin, y);
    y += 4.4;
    if (section.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(115, 120, 132);
      const lines = doc.splitTextToSize(section.note, contentWidth);
      doc.text(lines, margin, y);
      y += lines.length * 3.2 + 1.4;
    }

    const weights = section.widths && section.widths.length === section.headers.length
      ? section.widths
      : section.headers.map(() => 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const colW = weights.map((w) => (contentWidth * w) / totalWeight);
    const colX = colW.map((_, i) => margin + colW.slice(0, i).reduce((a, b) => a + b, 0));

    const drawHead = () => {
      doc.setFillColor(238, 242, 247);
      doc.rect(margin, y, contentWidth, 6.4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(55, 62, 76);
      section.headers.forEach((h, i) => {
        doc.text(doc.splitTextToSize(h, colW[i] - 2)[0], colX[i] + 1.4, y + 4.3);
      });
      y += 6.4;
    };

    drawHead();

    if (!section.rows.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 146, 158);
      doc.text('No records for the selected period and filters.', margin + 1.4, y + 4.4);
      y += 10;
      continue;
    }

    section.rows.forEach((row, ri) => {
      if (y + 6 > pageHeight - 12) {
        doc.addPage();
        y = 14;
        drawHead();
      }
      if (ri % 2 === 1) {
        doc.setFillColor(250, 251, 253);
        doc.rect(margin, y, contentWidth, 5.6, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(35, 41, 54);
      row.forEach((cell, i) => {
        const s = cell === null || cell === undefined ? '' : String(cell);
        doc.text(doc.splitTextToSize(s, colW[i] - 2)[0] ?? '', colX[i] + 1.4, y + 3.9);
      });
      y += 5.6;
    });
    y += 7;
  }

  footer();
  return doc.output('blob');
}

export function downloadPipelineReportBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}