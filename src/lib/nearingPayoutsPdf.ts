import { formatUGX } from '@/lib/rentCalculations';
import { supabase } from '@/integrations/supabase/client';
import welileLogoUrl from '@/assets/welile-logo.png';

export interface NearingPayoutPdfRow {
  investorId?: string;
  portfolioId?: string;
  portfolioCode?: string;
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
  durationMonths?: number;
  maturityDate?: string | null;
  nextRoiDate?: string | null;
  status?: string;
  payoutDay?: number;
  autoReinvest?: boolean;
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
  if (d < 0) return `${Math.abs(d)} days`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Tomorrow';
  return `${d} days`;
};

// Welile theme primary (HSL 271 100% 40% → RGB ≈ 102, 0, 204)
const THEME_PRIMARY: [number, number, number] = [146, 52, 234];
const THEME_PRIMARY_DARK: [number, number, number] = [108, 33, 196];
const THEME_STRIPE: [number, number, number] = [245, 240, 252];

const COMPANY_NAME = 'Welile Technologies Limited';
const COMPANY_ADDRESS = 'Plot 24, Kampala Road, Kampala, Uganda';
const COMPANY_CONTACT = 'info@welile.com  |  +256 700 000 000  |  www.welile.com';

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

interface PayoutDetail {
  mode: 'mobile_money' | 'bank_transfer' | 'cash';
  line1: string;
  line2: string;
}

async function fetchPayoutMethodsMap(userIds: string[]): Promise<Map<string, PayoutDetail>> {
  const map = new Map<string, PayoutDetail>();
  if (userIds.length === 0) return map;
  const unique = Array.from(new Set(userIds));
  const { data, error } = await supabase
    .from('saved_payout_methods' as never)
    .select('user_id, payout_mode, momo_provider, momo_number, momo_name, bank_name, bank_account_name, bank_account_number, is_default, last_used_at')
    .in('user_id', unique);
  if (error || !data) return map;
  // Pick default first, then most recently used per user.
  const grouped = new Map<string, any[]>();
  for (const row of data as any[]) {
    const arr = grouped.get(row.user_id) || [];
    arr.push(row);
    grouped.set(row.user_id, arr);
  }
  for (const [uid, rows] of grouped) {
    rows.sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      const at = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const bt = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return bt - at;
    });
    const r = rows[0];
    if (r.payout_mode === 'bank_transfer') {
      map.set(uid, {
        mode: 'bank_transfer',
        line1: `BANK: ${r.bank_name || '—'}`,
        line2: `${r.bank_account_name || '—'}\nA/C ${r.bank_account_number || '—'}`,
      });
    } else if (r.payout_mode === 'mobile_money') {
      map.set(uid, {
        mode: 'mobile_money',
        line1: `${(r.momo_provider || 'MoMo').toUpperCase()} MOBILE MONEY`,
        line2: `${r.momo_name || '—'}\n${r.momo_number || '—'}`,
      });
    } else {
      map.set(uid, { mode: 'cash', line1: 'CASH PICKUP', line2: '—' });
    }
  }
  return map;
}

// Fetch full DB record for a portfolio (catches any field not in the row payload)
async function fetchPortfolioDetailsMap(portfolioIds: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (portfolioIds.length === 0) return map;
  const unique = Array.from(new Set(portfolioIds));
  const { data } = await supabase
    .from('investor_portfolios')
    .select('id, portfolio_code, account_name, investment_amount, roi_percentage, roi_mode, status, duration_months, maturity_date, next_roi_date, payout_day, auto_reinvest, payment_method, mobile_network, mobile_money_number, bank_name, bank_account_name, account_number, display_currency, created_at, total_roi_earned, investor_id, agent_id')
    .in('id', unique);
  (data || []).forEach((p: any) => map.set(p.id, p));
  return map;
}

// Fetch edit-history rows from audit_logs for these portfolios
async function fetchEditHistoryMap(portfolioIds: string[]): Promise<{
  history: Map<string, any[]>;
  editorNames: Map<string, string>;
}> {
  const history = new Map<string, any[]>();
  const editorNames = new Map<string, string>();
  if (portfolioIds.length === 0) return { history, editorNames };
  const unique = Array.from(new Set(portfolioIds));
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, action_type, record_id, metadata, created_at')
    .eq('table_name', 'investor_portfolios')
    .in('record_id', unique)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !data) return { history, editorNames };
  const editorIds = new Set<string>();
  (data as any[]).forEach(r => {
    const arr = history.get(r.record_id) || [];
    arr.push(r);
    history.set(r.record_id, arr);
    if (r.user_id) editorIds.add(r.user_id);
  });
  if (editorIds.size > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(editorIds));
    (profs || []).forEach((p: any) => editorNames.set(p.id, p.full_name || ''));
  }
  return { history, editorNames };
}

const fmtVal = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
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
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Fetch payment methods, portfolio details, and edit history in parallel with logo
  const investorIds = input.rows.map((r) => r.investorId).filter((v): v is string => !!v);
  const portfolioIds = input.rows.map((r) => r.portfolioId).filter((v): v is string => !!v);
  const [logoBase64, payoutMap, detailsMap, { history, editorNames }] = await Promise.all([
    loadLogoBase64(),
    fetchPayoutMethodsMap(investorIds),
    fetchPortfolioDetailsMap(portfolioIds),
    fetchEditHistoryMap(portfolioIds),
  ]);

  // ── Themed Header Band ──
  doc.setFillColor(...THEME_PRIMARY);
  doc.rect(0, 0, pageWidth, 26, 'F');
  // Subtle darker accent stripe
  doc.setFillColor(...THEME_PRIMARY_DARK);
  doc.rect(0, 26, pageWidth, 1.2, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', margin, 5, 16, 16); } catch { /* ignore */ }
  }

  const textX = margin + 20;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(COMPANY_NAME, textX, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY_ADDRESS, textX, 16);
  doc.text(COMPANY_CONTACT, textX, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Portfolios Nearing Payout & Compounding', pageWidth - margin, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated: ${generatedAt.toLocaleString('en-GB')}`, pageWidth - margin, 16, { align: 'right' });
  doc.text('COO / Partner Ops · Confidential', pageWidth - margin, 20, { align: 'right' });

  // Summary line
  doc.setTextColor(15, 23, 42);
  let y = 34;
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

  // Sort: Due today first → upcoming ascending → overdue (newest first, oldest last)
  const sortedRows = [...input.rows].sort((a, b) => {
    const bucket = (d: number) => (d === 0 ? 0 : d > 0 ? 1 : 2);
    const ba = bucket(a.daysUntil), bb = bucket(b.daysUntil);
    if (ba !== bb) return ba - bb;
    if (ba === 1) return a.daysUntil - b.daysUntil;   // 1d, 2d, 3d…
    if (ba === 2) return b.daysUntil - a.daysUntil;   // -1, -2, -3…
    return 0;
  });

  // Body table
  const head = [[
    '#', 'Partner', 'Portfolio', 'Contact',
    'Principal', 'ROI %', 'Returns Due', 'Mode', 'Payout Date', 'Status', 'Payment Details',
  ]];
  const body = sortedRows.map((r, idx) => {
    // Prefer FRESH database values over the row payload supplied by the
    // caller — the caller's `rows` can be stale if the operator edited a
    // portfolio between opening the dialog and exporting the PDF.
    const det = r.portfolioId ? detailsMap.get(r.portfolioId) : null;
    const principal = det?.investment_amount ?? r.investmentAmount ?? 0;
    const roiPct = det?.roi_percentage ?? r.roiPercentage ?? 0;
    const roiMode = det?.roi_mode ?? r.roiMode;
    const portfolioName = det?.account_name || r.portfolioName || '—';
    const payoutDate = det?.next_roi_date || r.nextPayoutDate;
    const returnsDue = Math.round(principal * roiPct / 100);
    const pm = r.investorId ? payoutMap.get(r.investorId) : undefined;
    // Prefer per-portfolio payout details on the portfolio record itself —
    // an edit on the portfolio's account/MoMo fields must show up here.
    let paymentCell: string;
    if (det?.payment_method === 'bank_transfer') {
      paymentCell = `BANK: ${det.bank_name || '—'}\n${det.bank_account_name || '—'}\nA/C ${det.account_number || '—'}`;
    } else if (det?.payment_method === 'mobile_money') {
      paymentCell = `${(det.mobile_network || 'MoMo').toUpperCase()} MOBILE MONEY\n${det.mobile_money_number || '—'}`;
    } else if (det?.payment_method === 'cash') {
      paymentCell = 'CASH PICKUP\n—';
    } else if (pm) {
      paymentCell = `${pm.line1}\n${pm.line2}`;
    } else {
      paymentCell = 'Not set\nAdd payout method';
    }
    return [
      String(idx + 1),
      r.name || '—',
      portfolioName,
      [r.phone || '', r.email || ''].filter(Boolean).join('\n') || '—',
      formatUGX(principal),
      `${roiPct}%`,
      formatUGX(returnsDue),
      roiMode === 'monthly_compounding' ? 'Compound' : 'Payout',
      fmtDate(payoutDate),
      dueLabel(r.daysUntil),
      paymentCell,
    ];
  });

  autoTable(doc, {
    head,
    body,
    startY: y + 6,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: THEME_PRIMARY, textColor: 255, fontSize: 7.5, halign: 'left', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: THEME_STRIPE },
    columnStyles: {
      0: { cellWidth: 8, halign: 'right' },
      3: { cellWidth: 42 },
      4: { halign: 'right' },
      5: { halign: 'right', cellWidth: 12 },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 16 },
      9: { halign: 'center', cellWidth: 22 },
      10: { cellWidth: 55 },
    },
    didParseCell: (data: any) => {
      // Highlight overdue / due-today rows in the Status column.
      if (data.section === 'body' && data.column.index === 9) {
        const status = String(data.cell.raw || '');
        if (status === 'Due today') {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = 'bold';
        } else if (/^\d+\s+days$/.test(status)) {
          // Overdue rows render as "{n} days"
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Subtle warning for missing payment methods
      if (data.section === 'body' && data.column.index === 10) {
        const v = String(data.cell.raw || '');
        if (v.startsWith('Not set')) {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      const pageCount = (doc as any).internal.getNumberOfPages();
      const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Welile · Nearing Payouts · ${generatedAt.toLocaleDateString('en-GB')}`,
        margin,
        ph - 6,
      );
      doc.text(`Page ${current} of ${pageCount}`, pageWidth - margin, ph - 6, { align: 'right' });
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