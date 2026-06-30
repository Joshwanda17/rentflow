import { jsPDF } from 'jspdf';
import {
  MERCHANT_AGREEMENT_TEXT,
  MERCHANT_AGREEMENT_VERSION,
} from './MerchantAgreementContent';

/**
 * Generates a clean, paginated PDF of the Welile Merchant Agent Agreement
 * and triggers a download in the browser.
 */
export function downloadMerchantAgreementPdf(opts?: { name?: string; phone?: string }) {
  const namePhone = opts?.name || opts?.phone || 'Merchant Agent';
  const text = MERCHANT_AGREEMENT_TEXT
    .replace('[Merchant Name / Phone]', namePhone)
    .replace('[Auto-filled Date]', new Date().toLocaleDateString());

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 15;
  let y = margin;

  const ink = '#0F172A';
  doc.setTextColor(ink);

  const addPageIfNeeded = (needed = lineHeight) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ');
    if (line.trim() === '') {
      y += lineHeight * 0.6;
      continue;
    }

    // Headings: lines that start with a section number like "1)" or the title in caps
    const isSectionHeading = /^\d+\)\s/.test(line.trim());
    const isTitle = line === 'WELILE MERCHANT AGENT AGREEMENT';

    if (isTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
    } else if (isSectionHeading) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      y += 4;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    const wrapped = doc.splitTextToSize(line, maxWidth) as string[];
    for (const w of wrapped) {
      addPageIfNeeded();
      doc.text(w, margin, y);
      y += lineHeight;
    }
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#64748B');
    doc.text(
      `Welile Technologies Limited · ${MERCHANT_AGREEMENT_VERSION} · Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 24,
      { align: 'center' }
    );
  }

  doc.save(`Welile_Merchant_Agent_Agreement_${MERCHANT_AGREEMENT_VERSION}.pdf`);
}