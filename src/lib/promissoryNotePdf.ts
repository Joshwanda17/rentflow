import jsPDF from 'jspdf';
import { formatUGX } from '@/lib/rentCalculations';
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

// Company constants
const COMPANY_NAME = 'WELILE TECHNOLOGIES LIMITED';
const COMPANY_ADDRESS = 'Plot 12, Kampala Road, Kampala, Uganda';
const COMPANY_EMAIL = 'info@welile.com';
const COMPANY_PHONE = '+256 700 000 000';
const COMPANY_WEBSITE = 'www.welile.com';

export async function generatePromissoryNotePDF(data: PromissoryNoteData): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Load logo
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(welileLogo);
  } catch (e) {
    console.warn('Could not load logo for PDF', e);
  }

  // ═══ HEADER: Letterhead style ═══
  let y = 15;
  const logoSize = 18;
  const textX = margin + logoSize + 5;

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margin, y - 3, logoSize, logoSize, undefined, 'FAST');
  }

  // Company name
  doc.setTextColor(107, 33, 168);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_NAME, textX, y + 2);

  // Address
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY_ADDRESS, textX, y + 8);

  // Email | Phone
  doc.text(`${COMPANY_EMAIL} | ${COMPANY_PHONE}`, textX, y + 13);

  // Website
  doc.setTextColor(107, 33, 168);
  doc.text(COMPANY_WEBSITE, textX, y + 18);

  y += 25;

  // HR line
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

  // Date (right-aligned)
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(data.createdAt).toLocaleDateString('en-UG', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, y, { align: 'right' });
  y += 12;

  // ═══ PARTNER DETAILS SECTION ═══
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

  // ═══ INVESTMENT DETAILS BOX ═══
  const investRows: [string, string][] = [
    ['Investment Amount:', formatUGX(data.amount)],
    ['Contribution Type:', data.contributionType === 'monthly' ? 'Monthly Recurring' : 'Once-off'],
    ...(data.contributionType === 'monthly' && data.deductionDay
      ? [['Deduction Day:', `Day ${data.deductionDay} of each month`] as [string, string]]
      : []),
    ['Monthly ROI Rate:', '15% of invested amount'],
    ['Expected Monthly Return:', formatUGX(data.amount * 0.15)],
  ];

  const boxH = 10 + investRows.length * 6 + 4;
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, contentWidth, boxH, 3, 3, 'F');
  doc.setDrawColor(34, 197, 94);
  doc.roundedRect(margin, y, contentWidth, boxH, 3, 3, 'S');

  doc.setTextColor(22, 101, 52);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT DETAILS', margin + 5, y + 8);

  doc.setFontSize(10);
  investRows.forEach(([label, value], i) => {
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin + 8, y + 16 + i * 6);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + 65, y + 16 + i * 6);
  });
  y += boxH + 10;

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
    '1. Activate your account using the link below',
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

  // ═══ ACTIVATION LINK BOX ═══
  doc.setFillColor(107, 33, 168);
  doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ACTIVATE YOUR ACCOUNT', pageWidth / 2, y + 8, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const linkText = data.activationLink.length > 70 ? data.activationLink.substring(0, 70) + '...' : data.activationLink;
  doc.text(linkText, pageWidth / 2, y + 15, { align: 'center' });
  y += 30;

  // ═══ DISCLAIMER ═══
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  const disclaimer = 'This promissory note is a non-binding commitment of intent to invest. Actual investment is processed upon wallet deposit. Returns are subject to platform terms and conditions. Welile Technologies Limited is registered in Uganda.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);
  y += disclaimerLines.length * 3.5 + 10;

  // ═══ SIGNATURE AREA ═══
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, y + 5, margin + 70, y + 5);
  doc.line(margin + 90, y + 5, pageWidth - margin, y + 5);
  doc.setLineDashPattern([], 0);

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Partner Signature', margin + 15, y + 10);
  doc.text('Date', margin + 115, y + 10);

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
