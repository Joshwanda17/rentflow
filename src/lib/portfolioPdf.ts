// jsPDF loaded dynamically to reduce initial bundle size
import { formatUGX } from '@/lib/rentCalculations';

export interface PortfolioPdfData {
  portfolioCode: string;
  accountName: string | null;
  investmentAmount: number;
  roiPercentage: number;
  roiMode: string;
  totalRoiEarned: number;
  status: string;
  createdAt: string;
  durationMonths: number;
  payoutDay?: number | null;
  nextRoiDate?: string | null;
  maturityDate?: string | null;
  ownerName?: string;
  autoReinvest?: boolean;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-UG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export async function generatePortfolioPdf(data: PortfolioPdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pw = pdf.internal.pageSize.getWidth();
  const margin = 16;
  const cw = pw - margin * 2;
  let y = 20;

  const monthlyROI = Math.round(data.investmentAmount * (data.roiPercentage / 100));
  const displayName = data.accountName || data.portfolioCode;

  // Header bar
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pw, 38, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Investment Portfolio Statement', margin, 18);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-UG', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 28);
  
  if (data.ownerName) {
    pdf.text(`Partner: ${data.ownerName}`, pw - margin, 28, { align: 'right' });
  }

  y = 48;
  pdf.setTextColor(30, 41, 59);

  // Portfolio name / code
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(displayName, margin, y);
  y += 5;
  if (data.accountName) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(`ID: ${data.portfolioCode}`, margin, y);
    y += 4;
  }

  // Status badge
  pdf.setFontSize(9);
  const statusLabel = data.status === 'active' ? 'ACTIVE' : data.status === 'pending_approval' ? 'PENDING APPROVAL' : data.status.toUpperCase();
  const statusColor = data.status === 'active' ? [22, 163, 74] : data.status === 'pending_approval' ? [217, 119, 6] : [100, 116, 139];
  pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Status: ${statusLabel}`, margin, y);
  y += 10;

  pdf.setTextColor(30, 41, 59);

  // Key metrics section
  const drawMetricBox = (x: number, yPos: number, w: number, label: string, value: string, highlight = false) => {
    pdf.setFillColor(highlight ? 236 : 248, highlight ? 253 : 250, highlight ? 245 : 252);
    pdf.roundedRect(x, yPos, w, 22, 3, 3, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, x + 4, yPos + 7);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(highlight ? 22 : 30, highlight ? 163 : 41, highlight ? 74 : 59);
    pdf.text(value, x + 4, yPos + 16);
  };

  const halfW = (cw - 4) / 2;
  drawMetricBox(margin, y, halfW, 'Investment Capital', formatUGX(data.investmentAmount));
  drawMetricBox(margin + halfW + 4, y, halfW, 'Monthly ROI', formatUGX(monthlyROI), true);
  y += 28;

  drawMetricBox(margin, y, halfW, 'ROI Rate', `${data.roiPercentage}% per month`);
  drawMetricBox(margin + halfW + 4, y, halfW, 'Total ROI Earned', formatUGX(data.totalRoiEarned), true);
  y += 28;

  drawMetricBox(margin, y, halfW, 'ROI Mode', data.roiMode === 'monthly_compounding' ? 'Compounding' : 'Monthly Payout');
  drawMetricBox(margin + halfW + 4, y, halfW, 'Duration', `${data.durationMonths} months`);
  y += 28;

  drawMetricBox(margin, y, halfW, 'Investment Date', formatDate(data.createdAt));
  drawMetricBox(margin + halfW + 4, y, halfW, 'Payout Day', data.payoutDay ? `${data.payoutDay}${getOrdinalSuffix(data.payoutDay)} of month` : '—');
  y += 28;

  if (data.nextRoiDate || data.maturityDate) {
    drawMetricBox(margin, y, halfW, 'Next ROI Date', formatDate(data.nextRoiDate));
    drawMetricBox(margin + halfW + 4, y, halfW, 'Maturity Date', formatDate(data.maturityDate));
    y += 28;
  }

  // Projection table (simple)
  y += 4;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 41, 59);
  pdf.text('ROI Projection (Next 6 Months)', margin, y);
  y += 6;

  // Table header
  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, y, cw, 8, 'F');
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(71, 85, 105);
  const cols = [margin + 4, margin + 30, margin + cw * 0.4, margin + cw * 0.7];
  pdf.text('Month', cols[0], y + 5.5);
  pdf.text('Opening', cols[1], y + 5.5);
  pdf.text('ROI Earned', cols[2], y + 5.5);
  pdf.text('Closing', cols[3], y + 5.5);
  y += 10;

  const isCompounding = data.roiMode === 'monthly_compounding';
  let balance = data.investmentAmount;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(51, 65, 85);

  for (let m = 1; m <= 6; m++) {
    const earned = Math.round(balance * (data.roiPercentage / 100));
    const closing = isCompounding ? balance + earned : balance;

    if (m % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y - 4, cw, 7, 'F');
    }

    pdf.setFontSize(8);
    pdf.text(`Month ${m}`, cols[0], y);
    pdf.text(formatUGX(balance), cols[1], y);
    pdf.setTextColor(22, 163, 74);
    pdf.text(`+${formatUGX(earned)}`, cols[2], y);
    pdf.setTextColor(51, 65, 85);
    pdf.text(formatUGX(closing), cols[3], y);

    if (isCompounding) balance = closing;
    y += 7;
  }

  // Footer
  y += 10;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pw - margin, y);
  y += 6;
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('This is a system-generated document. Returns are subject to market conditions.', margin, y);
  pdf.text('Welile Receipts · Investment Portfolio', pw - margin, y, { align: 'right' });

  return pdf.output('blob');
}

/** Download the PDF to the user's device */
export async function downloadPortfolioPdf(data: PortfolioPdfData) {
  const blob = await generatePortfolioPdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio-${data.accountName || data.portfolioCode}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open WhatsApp share with a message about the portfolio */
export function sharePortfolioViaWhatsApp(data: PortfolioPdfData) {
  const displayName = data.accountName || data.portfolioCode;
  const monthlyROI = Math.round(data.investmentAmount * (data.roiPercentage / 100));
  const message = [
    `📊 *Investment Portfolio: ${displayName}*`,
    ``,
    `💰 Capital: ${formatUGX(data.investmentAmount)}`,
    `📈 ROI Rate: ${data.roiPercentage}% per month`,
    `💵 Monthly Return: ${formatUGX(monthlyROI)}`,
    `📅 Duration: ${data.durationMonths} months`,
    `🔄 Mode: ${data.roiMode === 'monthly_compounding' ? 'Compounding' : 'Monthly Payout'}`,
    `✅ Status: ${data.status === 'active' ? 'Active' : data.status === 'pending_approval' ? 'Pending Approval' : data.status}`,
    ``,
    `Total Earned So Far: ${formatUGX(data.totalRoiEarned)}`,
    ``,
    `_Welile Receipts - Investment Portfolio_`,
  ].join('\n');

  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
}
