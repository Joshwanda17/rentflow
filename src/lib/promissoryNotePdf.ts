import jsPDF from 'jspdf';
import { formatUGX } from '@/lib/rentCalculations';
import welileLogo from '@/assets/welile-logo.png';

// Helper to load image as base64 for jsPDF
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
}

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

  // ═══ HEADER: Purple gradient banner ═══
  doc.setFillColor(107, 33, 168); // Purple-800
  doc.rect(0, 0, pageWidth, 55, 'F');

  // Lighter purple accent strip
  doc.setFillColor(139, 92, 246); // Purple-500
  doc.rect(0, 55, pageWidth, 3, 'F');

  // Logo + Title
  if (logoBase64) {
    const logoSize = 16;
    doc.addImage(logoBase64, 'PNG', pageWidth / 2 - logoSize / 2, 4, logoSize, logoSize, undefined, 'FAST');
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('WELILE', pageWidth / 2, 28, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('TECHNOLOGIES LIMITED', pageWidth / 2, 35, { align: 'center' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT PROMISSORY NOTE', pageWidth / 2, 48, { align: 'center' });

  // ═══ BODY ═══
  let y = 70;

  // Date
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(data.createdAt).toLocaleDateString('en-UG', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  doc.text(`Date: ${dateStr}`, margin, y);
  y += 12;

  // Partner name box
  doc.setFillColor(245, 243, 255); // Purple-50
  doc.roundedRect(margin, y - 5, contentWidth, 18, 3, 3, 'F');
  doc.setDrawColor(139, 92, 246);
  doc.roundedRect(margin, y - 5, contentWidth, 18, 3, 3, 'S');
  doc.setTextColor(107, 33, 168);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTNER:', margin + 5, y + 3);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13);
  doc.text(data.partnerName.toUpperCase(), margin + 35, y + 3);
  y += 25;

  // Promise section
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const promiseText = data.contributionType === 'monthly'
    ? `I, ${data.partnerName}, hereby commit to invest ${formatUGX(data.amount)} on a monthly basis (due on day ${data.deductionDay} of each month) into my Welile investment account.`
    : `I, ${data.partnerName}, hereby commit to make a once-off investment of ${formatUGX(data.amount)} into my Welile investment account.`;

  const lines = doc.splitTextToSize(promiseText, contentWidth - 10);
  doc.text(lines, margin + 5, y);
  y += lines.length * 6 + 10;

  // Investment details box
  doc.setFillColor(240, 253, 244); // Green-50
  doc.roundedRect(margin, y, contentWidth, 45, 3, 3, 'F');
  doc.setDrawColor(34, 197, 94); // Green-500
  doc.roundedRect(margin, y, contentWidth, 45, 3, 3, 'S');

  doc.setTextColor(22, 101, 52);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT DETAILS', margin + 5, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);

  const details = [
    ['Investment Amount:', formatUGX(data.amount)],
    ['Contribution Type:', data.contributionType === 'monthly' ? 'Monthly Recurring' : 'Once-off'],
    ['Monthly ROI Rate:', '15% of invested amount'],
    ['Expected Monthly Return:', formatUGX(data.amount * 0.15)],
  ];

  details.forEach(([label, value], i) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin + 8, y + 20 + i * 6);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + 65, y + 20 + i * 6);
  });

  y += 55;

  // How it works
  doc.setTextColor(107, 33, 168);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('HOW IT WORKS', margin, y);
  y += 8;

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

  // Activation link box
  doc.setFillColor(107, 33, 168);
  doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ACTIVATE YOUR ACCOUNT', pageWidth / 2, y + 8, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  // Truncate link if too long
  const linkText = data.activationLink.length > 70 ? data.activationLink.substring(0, 70) + '...' : data.activationLink;
  doc.text(linkText, pageWidth / 2, y + 15, { align: 'center' });
  y += 30;

  // Disclaimer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  const disclaimer = 'This promissory note is a non-binding commitment of intent to invest. Actual investment is processed upon wallet deposit. Returns are subject to platform terms and conditions. Welile Technologies Limited is registered in Uganda.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);
  y += disclaimerLines.length * 3.5 + 10;

  // Signature area
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

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFillColor(107, 33, 168);
  doc.rect(0, footerY - 5, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Welile Technologies Limited | www.welile.com | Empowering African Housing', pageWidth / 2, footerY + 2, { align: 'center' });

  return doc.output('blob');
}
