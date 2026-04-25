/**
 * Export helpers for Field Collection daily totals.
 * Generates CSV or PDF summaries of captured / synced / pending amounts
 * for a given date, working entirely from the local IndexedDB queue.
 */
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { FieldEntry } from '@/lib/fieldCollectStore';
import { formatUGX } from '@/lib/rentCalculations';

export interface DayTotalsExportInput {
  date: Date;
  agentName?: string | null;
  entries: FieldEntry[]; // already filtered to that date
}

function summarize(entries: FieldEntry[]) {
  const sum = (arr: FieldEntry[]) => arr.reduce((s, e) => s + Number(e.amount || 0), 0);
  const synced = entries.filter(e => e.syncState === 'synced');
  const pending = entries.filter(e => e.syncState === 'queued');
  const failed = entries.filter(e => e.syncState === 'error');
  const dup = entries.filter(e => e.syncState === 'duplicate');
  return {
    total: sum(entries),
    captured: entries.length,
    synced: { count: synced.length, total: sum(synced) },
    pending: { count: pending.length, total: sum(pending) },
    failed: { count: failed.length, total: sum(failed) },
    duplicate: { count: dup.length, total: sum(dup) },
  };
}

function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDailyTotalsCsv({ date, agentName, entries }: DayTotalsExportInput) {
  const summary = summarize(entries);
  const dateLabel = format(date, 'yyyy-MM-dd');
  const lines: string[] = [];

  // Header / summary block
  lines.push(`Welile Field Collection — Daily Totals`);
  lines.push(`Date,${escapeCsv(dateLabel)}`);
  if (agentName) lines.push(`Agent,${escapeCsv(agentName)}`);
  lines.push(`Generated,${escapeCsv(new Date().toISOString())}`);
  lines.push('');
  lines.push('Bucket,Count,Amount (UGX)');
  lines.push(`Captured,${summary.captured},${summary.total}`);
  lines.push(`Synced,${summary.synced.count},${summary.synced.total}`);
  lines.push(`Pending,${summary.pending.count},${summary.pending.total}`);
  lines.push(`Failed,${summary.failed.count},${summary.failed.total}`);
  lines.push(`Duplicate,${summary.duplicate.count},${summary.duplicate.total}`);
  lines.push('');

  // Itemised entries
  lines.push('Captured At,Tenant,Phone,Amount (UGX),Status,Notes,Client ID');
  const sorted = [...entries].sort((a, b) => a.capturedAt - b.capturedAt);
  for (const e of sorted) {
    lines.push([
      escapeCsv(format(new Date(e.capturedAt), 'yyyy-MM-dd HH:mm:ss')),
      escapeCsv(e.tenantName || ''),
      escapeCsv(e.tenantPhone || ''),
      e.amount,
      escapeCsv(e.syncState),
      escapeCsv(e.notes || ''),
      escapeCsv(e.id),
    ].join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `field-collections-${dateLabel}.csv`);
}

export function exportDailyTotalsPdf({ date, agentName, entries }: DayTotalsExportInput) {
  const summary = summarize(entries);
  const dateLabel = format(date, 'PPP');
  const dateFile = format(date, 'yyyy-MM-dd');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Welile — Field Collection Daily Totals', margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${dateLabel}`, margin, y);
  y += 14;
  if (agentName) {
    doc.text(`Agent: ${agentName}`, margin, y);
    y += 14;
  }
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, margin, y);
  y += 20;

  // Summary box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Summary', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const rows: Array<[string, string, string]> = [
    ['Captured', String(summary.captured), formatUGX(summary.total)],
    ['Synced', String(summary.synced.count), formatUGX(summary.synced.total)],
    ['Pending', String(summary.pending.count), formatUGX(summary.pending.total)],
    ['Failed', String(summary.failed.count), formatUGX(summary.failed.total)],
    ['Duplicate', String(summary.duplicate.count), formatUGX(summary.duplicate.total)],
  ];
  const col1 = margin;
  const col2 = margin + 200;
  const col3 = margin + 280;
  doc.setFont('helvetica', 'bold');
  doc.text('Bucket', col1, y);
  doc.text('Count', col2, y);
  doc.text('Amount (UGX)', col3, y);
  y += 4;
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  for (const r of rows) {
    doc.text(r[0], col1, y);
    doc.text(r[1], col2, y);
    doc.text(r[2], col3, y);
    y += 14;
  }

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Entries', margin, y);
  y += 14;

  // Entry table header
  doc.setFontSize(9);
  const cTime = margin;
  const cTenant = margin + 80;
  const cAmount = margin + 260;
  const cStatus = margin + 350;
  const cNotes = margin + 420;
  doc.text('Time', cTime, y);
  doc.text('Tenant', cTenant, y);
  doc.text('Amount', cAmount, y);
  doc.text('Status', cStatus, y);
  doc.text('Notes', cNotes, y);
  y += 4;
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;
  doc.setFont('helvetica', 'normal');

  const sorted = [...entries].sort((a, b) => a.capturedAt - b.capturedAt);
  if (sorted.length === 0) {
    doc.setTextColor(120);
    doc.text('No entries captured for this date.', margin, y);
    doc.setTextColor(0);
  } else {
    for (const e of sorted) {
      if (y > pageHeight - margin - 20) {
        doc.addPage();
        y = margin;
      }
      const time = format(new Date(e.capturedAt), 'HH:mm');
      const tenant = (e.tenantName || '—').slice(0, 32);
      const amount = formatUGX(e.amount);
      const status = e.syncState;
      const notes = (e.notes || '').slice(0, 36);
      doc.text(time, cTime, y);
      doc.text(tenant, cTenant, y);
      doc.text(amount, cAmount, y);
      doc.text(status, cStatus, y);
      doc.text(notes, cNotes, y);
      y += 12;
    }
  }

  doc.save(`field-collections-${dateFile}.pdf`);
}
