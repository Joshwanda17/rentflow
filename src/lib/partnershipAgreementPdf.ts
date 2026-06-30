import jsPDF from 'jspdf';
import { numberToWords } from '@/lib/numberToWords';
import welileLogo from '@/assets/welile-contract-logo.png';

export interface PartnershipAgreementData {
  partnerName: string;
  partnerId?: string;        // National ID / Passport — blank => {xx}
  partnerAddress?: string;
  partnerPhone?: string;
  partnerEmail?: string;
  partnershipAmount: number;
  payoutMode?: 'bank' | 'momo';
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  momoProvider?: string;
  momoNumber?: string;
  momoName?: string;
  kinName?: string;
  kinContact?: string;
  agreementDate?: Date;
}

const PRIMARY: [number, number, number] = [124, 58, 237];   // violet
const INK: [number, number, number] = [15, 23, 42];          // slate-900
const MUTED: [number, number, number] = [15, 23, 42];        // #0F172A — unified ink
const LIGHT: [number, number, number] = [15, 23, 42];        // #0F172A — unified ink
const BORDER: [number, number, number] = [203, 213, 225];    // slate-300

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

function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return day + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Value that should be shown blank with an underline rule (Welile counter-signature). */
const BLANK = '__BLANK__';
/** Value we genuinely don't have — shown as a placeholder. */
const UNKNOWN = '{xx}';

export async function generatePartnershipAgreementPDF(
  data: PartnershipAgreementData,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  const bottomLimit = pageH - 18;

  const date = data.agreementDate ?? new Date();
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });
  const year = date.getFullYear();

  let logo: string | null = null;
  try { logo = await loadImageAsBase64(welileLogo); } catch { /* ignore */ }

  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      addFooter();
      doc.addPage();
      y = margin;
      pageNo += 1;
    }
  };

  let pageNo = 1;
  const addFooter = () => {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, bottomLimit + 4, pageW - margin, bottomLimit + 4);
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...LIGHT);
    doc.text('Confidential', margin, bottomLimit + 9);
    doc.text(
      `Welile Technologies Limited — Tenant Partnership Agreement`,
      pageW / 2,
      bottomLimit + 9,
      { align: 'center' },
    );
    doc.text(`${pageNo}`, pageW - margin, bottomLimit + 9, { align: 'right' });
  };

  const heading = (text: string) => {
    ensureSpace(12);
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(text, margin, y);
    y += 6;
  };

  const paragraph = (text: string, opts: { bold?: boolean; gap?: number } = {}) => {
    doc.setFont('times', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, contentW);
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 5.4;
    }
    y += opts.gap ?? 3;
  };

  const bullet = (text: string) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, contentW - 6);
    lines.forEach((line: string, idx: number) => {
      ensureSpace(6);
      if (idx === 0) {
        doc.setFont('times', 'bold');
        doc.text('•', margin, y);
        doc.setFont('times', 'normal');
      }
      doc.text(line, margin + 5, y);
      y += 5.4;
    });
    y += 1.5;
  };

  // ─────────────── COVER PAGE ───────────────
  if (logo) {
    const logoW = 52;
    const logoH = logoW * (196 / 640);
    doc.addImage(logo, 'PNG', (pageW - logoW) / 2, 36, logoW, logoH, undefined, 'FAST');
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('THE REPUBLIC OF UGANDA', pageW / 2, 95, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text('THE CONTRACTS ACT', pageW / 2, 103, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...PRIMARY);
  doc.text('TENANT PARTNERSHIP', pageW / 2, 125, { align: 'center' });
  doc.text('AGREEMENT', pageW / 2, 137, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...LIGHT);
  doc.text('Between', pageW / 2, 160, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text('WELILE TECHNOLOGIES LIMITED', pageW / 2, 172, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...LIGHT);
  doc.text('And', pageW / 2, 184, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY);
  doc.text((data.partnerName || UNKNOWN).toUpperCase(), pageW / 2, 196, { align: 'center' });

  addFooter();
  doc.addPage();
  pageNo += 1;
  y = margin;

  // ─────────────── BODY ───────────────
  const partnerName = data.partnerName?.trim() || UNKNOWN;
  const partnerId = data.partnerId?.trim() || UNKNOWN;
  const partnerAddress = data.partnerAddress?.trim() || UNKNOWN;
  const amountNum = Math.max(0, Math.floor(data.partnershipAmount || 0));
  const amountStr = amountNum.toLocaleString('en-US');
  const amountWords = numberToWords(amountNum);

  paragraph(
    `THIS AGREEMENT is made this ${ordinal(day)} day of ${month}, ${year} BETWEEN Welile Technologies Limited, a limited liability company incorporated in Uganda, with its Head Quarters office in Hosanna Estate, Palm Road, Kabale–Entebbe, P.O. Box 167564, Kampala – Uganda Tel: 0793750331, 0748747134 (hereinafter referred to as "the Company", which expression shall, where the context so admits, include its Nominees, Agents, Successors in Title and Assignees) of the one part;`,
  );
  paragraph(
    `AND ${partnerName}, holder of National ID/Passport No. ${partnerId}, residing at ${partnerAddress} (hereinafter referred to as "the Partner", which expression shall, where the context so admits, include his/her Nominees, Agents, Successors in Title and Assignees) of the other part; The Company and the Partner shall individually be referred to as "the Party" and collectively as "the Parties."`,
  );

  heading('Background');
  paragraph(
    'WHEREAS, the Company operates as a technology platform that facilitates rent access for tenants by connecting them with Tenant Partners, who are financial contributors that provide the funds for rent payments in exchange for a return on their contribution;',
  );

  heading('Agreement');
  paragraph('The Parties agree to the following terms and conditions:');

  heading('1. Platform Overview and Nature of Business');
  paragraph('The Company operates a digital platform that connects tenants seeking rent with individuals willing to support them in exchange for returns.');
  paragraph('The Company is not a deposit-taking institution or an insurance company. It is a technology platform that manages and facilitates all transactions between the Parties.');

  heading("2. Partner's Role");
  paragraph(`The Partner agrees to contribute a total partnership amount of UGX ${amountStr} (${amountWords} Shillings Only).`);
  paragraph('The Partner will receive access to periodic reports or a dashboard to monitor the performance of their contribution.');
  paragraph('The Partner agrees to comply with all platform terms, policies, and partner guidelines.');

  heading("3. Company's Responsibilities and Assurances");
  paragraph('The Company commits to:');
  bullet('Conduct full due diligence on all tenants and landlords.');
  bullet('Facilitate and manage all rent payment transactions.');
  bullet('Guarantee the repayment of the full principal amount and expected returns.');
  bullet('Absorb any losses, delays, or defaults from tenants.');
  bullet('Provide a detailed Individual financial report to the Partner upon request.');

  heading('4. Returns and Payouts');
  bullet('The Partner will earn a monthly return of 15% on the principal partnership amount.');
  bullet("The monthly returns will be paid to the Partner's provided bank account or mobile money details at the end of each month.");
  bullet("The Partner's earnings are not available for early withdrawal and can only be accessed on the agreed payout date.");

  heading('5. Withdrawal of Principal');
  bullet('This agreement is in force for a period of one (1) year. A notice for renewal shall be given three (3) months before the expiration of this agreement by either Party.');
  bullet('To withdraw the principal amount, the Partner must notify the Company in writing at least ninety (90) days prior to the intended withdrawal date.');
  bullet('Upon receipt of a withdrawal request, the Company shall have a principal recovery period of ninety (90) days. During this period, no monthly interest shall accrue or be payable to the Partner, as the funds will no longer be in active use.');

  heading('6. Risk and Liability');
  bullet('The Company bears full liability for tenant defaults, delays, or losses.');
  bullet("The Partner's principal and expected returns are fully guaranteed by the Company.");
  bullet('The Company shall promptly communicate any payout delays caused by external factors and ensures all such issues are resolved within two to three business days.');

  heading('7. Default and Termination');
  bullet('Default: If a Party fails to make a payment or comply with the terms of this agreement, the other Party reserves the right to take legal action for breach of contract. Both Parties have a right to settle any default within a period of two weeks (14) days before the other Party takes action.');
  bullet('Termination: This Agreement may be terminated by the Partner with a ninety (90)-day written withdrawal notice, or by the Company in case of any breach, fraud, or misuse.');

  heading('8. Dispute Resolution');
  bullet('The Parties shall resolve the matter through arbitration in accordance with the laws of Uganda. In cases where the Parties have failed to agree under arbitration, the matter can be referred to the courts of Uganda with competent jurisdiction.');

  heading('9. Entire Agreement');
  bullet('This document contains the full agreement between the Parties. There are no agreements collateral hereto, and no oral promises override this agreement.');

  heading('10. Amendments');
  bullet('All amendments to this agreement shall be in writing and all Parties must sign.');

  heading('11. Legal Fees');
  bullet('The legal fees for preparing this agreement shall be borne by the Company.');

  ensureSpace(10);
  paragraph('IN WITNESS WHEREOF, the Parties have executed these presents the day and year first above written.', { bold: true });

  // ─────────────── PAYMENT CHANNELS ───────────────
  heading('12. Approved Company Payment Channels');
  paragraph('All partner contributions to the Company shall be made only through the approved payment channels listed below. The Partner should confirm payment details with the Company before making any transfer.');

  const channels: [string, string][] = [
  // Render the approved channels as a 3-column table (Channel | Instruction | Details).
  const tableRows: [string, string, string][] = [
    ['Airtel Money', 'Dial *185*9#', 'Merchant ID: 4380664'],
    ['MTN MoMo', 'Use MoMo App or dial *165*3#', 'MoMo Code: 090777'],
    [
      'Bank Transfer',
      'Equity Bank',
      'Account Name: Welile Technologies Limited\nAccount Number: 1046203375259\nSWIFT Code: EQBLUGKA',
    ],
  ];

  const colW = [contentW * 0.24, contentW * 0.34, contentW * 0.42];
  const colX = [margin, margin + colW[0], margin + colW[0] + colW[1]];
  const padX = 2.5;
  const lineH = 5;
  const cellPadY = 3;

  const wrapCell = (text: string, w: number) => {
    // Honour explicit line breaks first, then wrap each segment.
    return text.split('\n').flatMap((seg) => doc.splitTextToSize(seg, w - padX * 2) as string[]);
  };

  const drawRow = (cells: string[], isHeader: boolean) => {
    doc.setFont('times', isHeader ? 'bold' : 'normal');
    doc.setFontSize(isHeader ? 10 : 10.5);
    const wrapped = cells.map((c, i) => wrapCell(c, colW[i]));
    const rowH = Math.max(...wrapped.map((w) => w.length)) * lineH + cellPadY * 2;
    ensureSpace(rowH);
    const rowTop = y;
    if (isHeader) {
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(margin, rowTop, contentW, rowH, 'F');
    }
    // Cell text
    doc.setTextColor(...(isHeader ? INK : MUTED));
    wrapped.forEach((lines, i) => {
      let ty = rowTop + cellPadY + lineH - 1.5;
      lines.forEach((ln) => {
        doc.text(ln, colX[i] + padX, ty);
        ty += lineH;
      });
    });
    // Borders
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(margin, rowTop, contentW, rowH);
    doc.line(colX[1], rowTop, colX[1], rowTop + rowH);
    doc.line(colX[2], rowTop, colX[2], rowTop + rowH);
    y = rowTop + rowH;
  };

  ensureSpace(14);
  drawRow(['CHANNEL', 'INSTRUCTION', 'DETAILS'], true);
  tableRows.forEach((r) => drawRow(r, false));
  y += 4;

  // ─────────────── SIGNATURES ───────────────
  ensureSpace(14);
  y += 4;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('EXECUTION', margin, y);
  y += 8;

  // Signature field renderer
  const sigField = (label: string, value: string, opts: { italic?: boolean } = {}) => {
    ensureSpace(12);
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...LIGHT);
    doc.text(label.toUpperCase(), margin, y);
    y += 5;
    if (value !== BLANK) {
      // Prefilled values are emphasised in bold; the partner's own signature is italic.
      const isFilled = value !== UNKNOWN;
      if (opts.italic) {
        doc.setFont('times', 'italic');
      } else {
        doc.setFont('times', isFilled ? 'bold' : 'normal');
      }
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(value, margin, y - 0.5);
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 1, margin + contentW, y + 1);
    y += 7;
  };

  const sigBlockTitle = (title: string) => {
    ensureSpace(14);
    y += 2;
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PRIMARY);
    doc.text(title, margin, y);
    y += 6;
  };

  // Welile block — fields intentionally left blank for manual counter-signature
  sigBlockTitle('Signed for and on behalf of Welile Technologies Limited');
  sigField('Name', BLANK);
  sigField('Position', BLANK);
  sigField('Contact', BLANK);
  sigField('Date', BLANK);
  sigField('Signature', BLANK);

  // Partner block
  const partnerPhone = data.partnerPhone?.trim() || UNKNOWN;
  const partnerEmail = data.partnerEmail?.trim() || UNKNOWN;
  const isBank = data.payoutMode !== 'momo';
  const accName = isBank ? (data.bankAccountName?.trim() || UNKNOWN) : (data.momoName?.trim() || UNKNOWN);
  const accNo = isBank ? (data.bankAccountNumber?.trim() || UNKNOWN) : (data.momoNumber?.trim() || UNKNOWN);
  const bankLabel = isBank ? (data.bankName?.trim() || UNKNOWN) : `${data.momoProvider?.trim() || 'Mobile Money'} (Mobile Money)`;

  sigBlockTitle('Signed by the said Tenant Partner');
  sigField('Name', partnerName);
  sigField('Residence', partnerAddress);
  sigField('Contact (Telephone)', partnerPhone);
  sigField('Email', partnerEmail);
  sigField(isBank ? 'Bank Name' : 'Mobile Money Provider', bankLabel);
  sigField('Account Name', accName);
  sigField('Account No', accNo);
  sigField('Date', `${ordinal(day)} ${month} ${year}`);
  sigField('Signature', partnerName.toLowerCase(), { italic: true });

  // Next of Kin block
  sigBlockTitle('Next of Kin Details');
  sigField('Next of Kin Name', data.kinName?.trim() || UNKNOWN);
  sigField('Contact', data.kinContact?.trim() || UNKNOWN);
  sigField('Date', `${ordinal(day)} ${month} ${year}`);
  sigField('Signature', UNKNOWN);

  addFooter();

  return doc.output('blob');
}