import jsPDF from 'jspdf';
import { formatUGX } from '@/lib/rentCalculations';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import welileLogo from '@/assets/welile-logo.png';

function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}

interface PromissoryNoteData {
  partnerName: string;
  amount: number;
  contributionType: 'monthly' | 'once_off';
  deductionDay?: number;
  activationLink: string;
  createdAt: string;
  email?: string;
  whatsappNumber?: string;
  phoneNumber?: string;
}

const COMPANY_NAME = 'Welile Technologies Limited';
const COMPANY_ADDRESS = 'Plot 24, Kampala Road, Kampala, Uganda';
const COMPANY_EMAIL = 'info@welile.com';
const COMPANY_PHONE = '+256 700 000 000';
const COMPANY_WEBSITE = 'www.welile.com';

export async function generatePromissoryNotePDF(data: PromissoryNoteData): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(welileLogo);
  } catch (e) {
    console.warn('Could not load logo for PDF', e);
  }

  // ═══ HEADER ═══
  let y = 15;
  const logoSize = 18;
  const textX = margin + logoSize + 5;

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margin, y - 3, logoSize, logoSize, undefined, 'FAST');
  }

  doc.setTextColor(107, 33, 168);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_NAME, textX, y + 2);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY_ADDRESS, textX, y + 8);
  doc.text(`Email: ${COMPANY_EMAIL} | Phone: ${COMPANY_PHONE}`, textX, y + 13);

  doc.setTextColor(107, 33, 168);
  doc.text(COMPANY_WEBSITE, textX, y + 18);

  y += 25;

  doc.setDrawColor(107, 33, 168);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Title
  doc.setTextColor(107, 33, 168);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT COMMITMENT NOTE', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Date
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(data.createdAt).toLocaleDateString('en-UG', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, y, { align: 'right' });
  y += 12;

  // ═══ PARTNER DETAILS ═══
  doc.setTextColor(107, 33, 168);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTNER DETAILS', margin, y);
  y += 6;

  const detailRows: [string, string][] = [
    ['Partner Name:', data.partnerName],
    ['Contact Email:', data.email || 'N/A'],
    ['WhatsApp:', data.whatsappNumber || 'N/A'],
    ['Phone:', data.phoneNumber || 'N/A'],
  ];

  doc.setFontSize(10);
  detailRows.forEach(([label, value]) => {
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin + 5, y);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + 45, y);
    y += 6;
  });
  y += 6;

  // ═══ INVESTMENT DETAILS — borderless table ═══
  doc.setTextColor(20, 33, 61); // dark navy
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT DETAILS', margin, y);
  y += 7;

  const investRows: [string, string][] = [
    ['Investment Amount', formatUGX(data.amount)],
    ['Contribution Type', data.contributionType === 'monthly' ? 'Monthly Recurring' : 'Once-off'],
    ...(data.contributionType === 'monthly' && data.deductionDay
      ? [['Deduction Day', `Day ${data.deductionDay} of each month`] as [string, string]]
      : []),
    ['Monthly ROI Rate', '15% of invested amount'],
    ['Expected Monthly Return', formatUGX(data.amount * 0.15)],
  ];

  const colLabelX = margin + 5;
  const colValueX = margin + 75;
  const rowH = 7;

  investRows.forEach(([label, value]) => {
    // light blue separator line
    doc.setDrawColor(200, 220, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 1, pageWidth - margin, y - 1);

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(label, colLabelX, y + 3);

    doc.setTextColor(20, 33, 61);
    doc.setFont('helvetica', 'bold');
    doc.text(value, colValueX, y + 3);

    y += rowH;
  });
  // bottom separator
  doc.setDrawColor(200, 220, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y - 1, pageWidth - margin, y - 1);
  y += 8;

  // ═══ ROI PROJECTION (Next 6 Months) ═══
  doc.setTextColor(20, 33, 61);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ROI PROJECTION (Next 6 Months)', margin, y);
  y += 7;

  // Table headers
  const colMonth = margin + 5;
  const colOpening = margin + 30;
  const colRoi = margin + 80;
  const colClosing = margin + 130;

  doc.setFontSize(8);
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.text('Month', colMonth, y);
  doc.text('Opening Balance', colOpening, y);
  doc.text('ROI Earned', colRoi, y);
  doc.text('Closing Balance', colClosing, y);
  y += 2;

  doc.setDrawColor(20, 33, 61);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  const monthlyRoi = data.amount * 0.15;
  let balance = data.amount;

  for (let m = 1; m <= 6; m++) {
    const opening = balance;
    const closing = opening + monthlyRoi;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Month ${m}`, colMonth, y);
    doc.text(formatUGX(opening), colOpening, y);

    // ROI in green
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.text(`+${formatUGX(monthlyRoi)}`, colRoi, y);

    doc.setTextColor(20, 33, 61);
    doc.setFont('helvetica', 'bold');
    doc.text(formatUGX(closing), colClosing, y);

    y += 5.5;

    // light separator
    doc.setDrawColor(200, 220, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);

    balance = closing;
  }
  y += 6;

  // ═══ COMMITMENT PARAGRAPH ═══
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const promiseText = data.contributionType === 'monthly'
    ? `I, ${data.partnerName}, hereby commit to invest ${formatUGX(data.amount)} on a monthly basis (due on day ${data.deductionDay} of each month) into my Welile investment account.`
    : `I, ${data.partnerName}, hereby commit to make a once-off investment of ${formatUGX(data.amount)} into my Welile investment account.`;
  const lines = doc.splitTextToSize(promiseText, contentWidth - 10);
  doc.text(lines, margin + 5, y);
  y += lines.length * 5.5 + 8;

  // ═══ HOW IT WORKS ═══
  doc.setTextColor(107, 33, 168);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('HOW IT WORKS', margin, y);
  y += 7;

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const steps = [
    '1. Activate your account using the button below',
    '2. Deposit the promised amount into your Welile wallet',
    '3. The system will automatically process your investment',
    '4. Earn 15% returns on every amount you invest, credited monthly',
    '5. Track your investment growth in real-time on your dashboard',
  ];
  steps.forEach((s) => {
    doc.text(s, margin + 5, y);
    y += 5.5;
  });
  y += 8;

  // ═══ ACTIVATE ACCOUNT BUTTON (no visible link) ═══
  const btnW = 60;
  const btnH = 12;
  const btnX = (pageWidth - btnW) / 2;
  doc.setFillColor(107, 33, 168);
  doc.roundedRect(btnX, y, btnW, btnH, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Activate Account', pageWidth / 2, y + 7.5, { align: 'center' });

  // Build activation URL using public domain
  const activationUrl = data.activationLink.replace(/^https?:\/\/[^/]+/, getPublicOrigin());
  doc.link(btnX, y, btnW, btnH, { url: activationUrl });
  y += btnH + 10;

  // ═══ DISCLAIMER ═══
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  const disclaimer = 'This promissory note is a non-binding commitment of intent to invest. Actual investment is processed upon wallet deposit. Returns are subject to platform terms and conditions. Welile Technologies Limited is registered in Uganda.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);
  y += disclaimerLines.length * 3.5 + 8;

  // ═══ GENERATED DATE ═══
  const generatedDate = new Date().toLocaleString('en-UG', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on: ${generatedDate}`, pageWidth / 2, y, { align: 'center' });

  // ═══ FOOTER ═══
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFillColor(107, 33, 168);
  doc.rect(0, footerY - 5, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${COMPANY_NAME} | ${COMPANY_WEBSITE} | Empowering African Housing`, pageWidth / 2, footerY + 2, { align: 'center' });

  return doc.output('blob');
}
