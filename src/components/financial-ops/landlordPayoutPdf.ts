import type { LandlordPayoutShareData } from './LandlordPayoutShareCard';

// ───────────────────────────────────────────────────────────
// Standalone PDF builder for landlord payout cards.
// Used by bulk export so we don't have to mount the React
// dialog component for each row. Mirrors the visual card
// rendered in LandlordPayoutShareCard.tsx.
// ───────────────────────────────────────────────────────────

const A4_PAGE_MM = { width: 210, height: 297 };
const PDF_MARGIN_MM = 14;
const PDF_HEADER_MM = 18;
const PDF_FOOTER_MM = 14;
const CARD_CAPTURE_WIDTH_PX = 480;
const CARD_CAPTURE_PIXEL_RATIO = 2.5;

function formatUGX(n: number) {
  return `UGX ${Number(n).toLocaleString()}`;
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the gradient payout card as an offscreen DOM node using
 * inline styles only, so it renders identically without Tailwind.
 */
function buildCardNode(d: LandlordPayoutShareData): HTMLDivElement {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.left = '-10000px';
  root.style.top = '0';
  root.style.width = `${CARD_CAPTURE_WIDTH_PX}px`;
  root.style.pointerEvents = 'none';
  root.style.zIndex = '-1';

  const paidAt = new Date(d.paid_at).toLocaleString('en-UG');
  const tenant = d.tenant_name || 'Unallocated';

  root.innerHTML = `
    <div style="
      width:${CARD_CAPTURE_WIDTH_PX}px;
      box-sizing:border-box;
      border-radius:20px;
      padding:22px;
      color:#ffffff;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
      background:linear-gradient(135deg,#3d0066 0%,#7A00CC 55%,#1a0033 100%);
      box-shadow:0 20px 40px -20px rgba(60,0,100,0.4);
      position:relative;
      overflow:hidden;
    ">
      <div style="position:relative;z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <div>
            <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#e9d5ff;">Welile · Landlord Paid</div>
            <div style="font-size:12px;color:rgba(237,221,255,0.8);margin-top:2px;">${escapeHtml(paidAt)}</div>
          </div>
          <div style="height:36px;width:36px;border-radius:9999px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9 12l2 2 4-4"></path>
            </svg>
          </div>
        </div>
        <div style="margin-bottom:18px;">
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#e9d5ff;">Amount sent</div>
          <div style="font-size:32px;font-weight:700;line-height:1.1;margin-top:4px;">${escapeHtml(formatUGX(d.amount))}</div>
        </div>
        <div style="border-radius:14px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.15);padding:14px;">
          ${row('Landlord', escapeHtml(d.landlord_name))}
          ${row(escapeHtml(d.mobile_money_provider), `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(d.landlord_phone)}</span>`)}
          ${row('Tenant', escapeHtml(tenant))}
          ${row('MoMo TID', `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;">${escapeHtml(d.momo_reference)}</span>`)}
          ${d.agent_name ? row('Agent', escapeHtml(d.agent_name)) : ''}
        </div>
        <div style="margin-top:14px;font-size:10px;text-align:center;color:rgba(237,221,255,0.8);">
          Powered by Welile · welilereceipts.com
        </div>
      </div>
    </div>
  `;
  return root;
}

function row(label: string, value: string) {
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:3px 0;">
      <span style="color:#e9d5ff;">${label}</span>
      <span style="font-weight:600;text-align:right;">${value}</span>
    </div>
  `;
}

export async function renderPayoutCardPng(d: LandlordPayoutShareData): Promise<string> {
  const { toPng } = await import('html-to-image');
  const node = buildCardNode(d);
  document.body.appendChild(node);
  try {
    // wait one frame for layout
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const dataUrl = await toPng(node.firstElementChild as HTMLElement, {
      pixelRatio: CARD_CAPTURE_PIXEL_RATIO,
      cacheBust: true,
      skipFonts: true,
      width: CARD_CAPTURE_WIDTH_PX,
      style: {
        width: `${CARD_CAPTURE_WIDTH_PX}px`,
        maxWidth: `${CARD_CAPTURE_WIDTH_PX}px`,
        transform: 'none',
      },
    });
    return dataUrl;
  } finally {
    node.remove();
  }
}

function drawHeaderFooter(pdf: any, d: LandlordPayoutShareData) {
  const pageW = A4_PAGE_MM.width;
  const pageH = A4_PAGE_MM.height;
  const margin = PDF_MARGIN_MM;

  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Welile — Landlord Payout Confirmation', margin, margin + 6);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(
    `Generated: ${new Date().toLocaleString('en-UG')}  ·  MoMo TID: ${d.momo_reference}`,
    margin,
    margin + 12,
  );
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.2);
  pdf.line(margin, margin + PDF_HEADER_MM - 2, pageW - margin, margin + PDF_HEADER_MM - 2);

  const footerY = pageH - margin - PDF_FOOTER_MM + 6;
  pdf.line(margin, footerY - 4, pageW - margin, footerY - 4);
  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    'This is an internal Welile payout confirmation. Please retain for reconciliation.',
    margin,
    footerY,
  );
  pdf.text('welilereceipts.com', margin, footerY + 5);
  pdf.setTextColor(0, 0, 0);
}

async function placeCardOnPage(pdf: any, dataUrl: string) {
  const pageW = A4_PAGE_MM.width;
  const pageH = A4_PAGE_MM.height;
  const margin = PDF_MARGIN_MM;
  const contentTop = margin + PDF_HEADER_MM;
  const contentBottom = pageH - margin - PDF_FOOTER_MM;
  const contentW = pageW - margin * 2;
  const contentH = contentBottom - contentTop;

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to render card image'));
  });
  const scale = Math.min(contentW / img.width, contentH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = margin + (contentW - drawW) / 2;
  const drawY = contentTop + (contentH - drawH) / 2;
  pdf.addImage(dataUrl, 'PNG', drawX, drawY, drawW, drawH, undefined, 'FAST');
}

/**
 * Build a multi-page PDF — one A4 page per landlord payout.
 * Caller can pass an `onProgress(done, total)` callback for UX.
 */
export async function buildBulkPayoutsPdfBlob(
  rows: LandlordPayoutShareData[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (!rows.length) throw new Error('No payouts to export');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  for (let i = 0; i < rows.length; i++) {
    if (i > 0) pdf.addPage();
    const d = rows[i];
    drawHeaderFooter(pdf, d);
    const dataUrl = await renderPayoutCardPng(d);
    await placeCardOnPage(pdf, dataUrl);
    onProgress?.(i + 1, rows.length);
  }

  return pdf.output('blob');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}