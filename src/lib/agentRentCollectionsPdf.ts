import { supabase } from '@/integrations/supabase/client';
import welileWordmark from '@/assets/welile-wordmark.png.asset.json';
import { formatUGX } from '@/lib/rentCalculations';
import { archivePdfBlob } from '@/lib/pdfVault';

export type RangeKey = 'weekly' | 'monthly' | 'yearly';

interface CollectionRow {
  amount: number;
  created_at: string;
  payment_method: string | null;
  location_name: string | null;
  tenant_id: string | null;
  momo_provider: string | null;
}

function rangeFor(range: RangeKey): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date();
  if (range === 'weekly') {
    from.setDate(to.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: 'Weekly (last 7 days)' };
  }
  if (range === 'monthly') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: to.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  }
  from.setMonth(0, 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, label: `Year ${to.getFullYear()}` };
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(welileWordmark.url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('logo read failed'));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateAgentRentCollectionsPdf(params: {
  agentId: string;
  agentName: string;
  range: RangeKey;
}): Promise<Blob> {
  const { agentId, agentName, range } = params;
  const { from, to, label } = rangeFor(range);

  const { data, error } = await supabase
    .from('agent_collections')
    .select('amount, created_at, payment_method, location_name, tenant_id, momo_provider')
    .eq('agent_id', agentId)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows: CollectionRow[] = (data as CollectionRow[]) || [];
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 12;

  // Header band
  pdf.setFillColor(16, 122, 87); // welile green
  pdf.rect(0, 0, pw, 30, 'F');

  const logoUrl = await loadLogoDataUrl();
  if (logoUrl) {
    try { pdf.addImage(logoUrl, 'PNG', margin, 8, 34, 14); } catch { /* ignore */ }
  }

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Rent Collections Report', pw - margin, 14, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(label, pw - margin, 20, { align: 'right' });
  pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pw - margin, 25, { align: 'right' });

  // Meta
  pdf.setTextColor(0, 0, 0);
  let y = 38;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Agent: ${agentName}`, margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Period: ${from.toLocaleDateString('en-GB')} — ${to.toLocaleDateString('en-GB')}`, margin, y);
  y += 8;

  // Summary card
  pdf.setFillColor(240, 253, 244);
  pdf.roundedRect(margin, y, pw - margin * 2, 16, 2, 2, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(`Total Collected: ${formatUGX(total)}`, margin + 4, y + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`${rows.length} payment${rows.length === 1 ? '' : 's'} recorded`, margin + 4, y + 13);
  y += 22;

  // Table header
  const cols = [margin, margin + 34, margin + 70, margin + 108, margin + 145];
  const labels = ['Date', 'Amount', 'Method', 'Provider', 'Location'];
  pdf.setFillColor(243, 244, 246);
  pdf.rect(margin, y, pw - margin * 2, 7, 'F');
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(55, 65, 81);
  labels.forEach((l, i) => pdf.text(l, cols[i] + 2, y + 5));
  y += 9;

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  const rowH = 7;

  rows.forEach((r, idx) => {
    if (y + rowH > ph - 18) {
      pdf.addPage();
      y = margin;
    }
    if (idx % 2 === 1) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(margin, y, pw - margin * 2, rowH, 'F');
    }
    const d = new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    pdf.setFontSize(7.5);
    pdf.text(d, cols[0] + 2, y + 5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatUGX(Number(r.amount || 0)), cols[1] + 2, y + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text((r.payment_method || '—').substring(0, 16), cols[2] + 2, y + 5);
    pdf.text((r.momo_provider || '—').substring(0, 16), cols[3] + 2, y + 5);
    pdf.text((r.location_name || '—').substring(0, 22), cols[4] + 2, y + 5);
    y += rowH;
  });

  // Footer on each page
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, ph - 12, pw - margin, ph - 12);
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Welile — official rent collections report', margin, ph - 7);
    pdf.text(`Page ${p} of ${pageCount}`, pw - margin, ph - 7, { align: 'right' });
  }

  const blob = pdf.output('blob');
  archivePdfBlob(blob, {
    label: `Rent Collections — ${label}`,
    filename: `welile-rent-collections-${range}-${Date.now()}.pdf`,
    category: 'other',
  }).catch(() => {});
  return blob;
}

export async function downloadAgentRentCollectionsPdf(params: {
  agentId: string;
  agentName: string;
  range: RangeKey;
}): Promise<number> {
  const blob = await generateAgentRentCollectionsPdf(params);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `welile-rent-collections-${params.range}-${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 0;
}