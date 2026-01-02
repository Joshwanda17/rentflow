import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export interface ExportData {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Export data to CSV and trigger download
 */
export function exportToCSV(data: ExportData, filename: string): void {
  const { headers, rows } = data;
  
  // Escape CSV values
  const escapeCSV = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV content
  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export an HTML element to PDF
 */
export async function exportToPDF(
  element: HTMLElement, 
  filename: string,
  title?: string
): Promise<void> {
  try {
    // Capture element as image
    const dataUrl = await toPng(element, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: '#ffffff'
    });

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;

    // Add title if provided
    let yPosition = margin;
    if (title) {
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(title, margin, yPosition + 10);
      yPosition += 20;
    }

    // Add date
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(128, 128, 128);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 10;

    // Calculate image dimensions to fit page
    const img = new Image();
    img.src = dataUrl;
    
    await new Promise<void>((resolve) => {
      img.onload = () => {
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (img.height * imgWidth) / img.width;
        
        // Check if image fits on remaining page, otherwise add new page
        const availableHeight = pageHeight - yPosition - margin;
        const finalHeight = Math.min(imgHeight, availableHeight);
        const finalWidth = (finalHeight / imgHeight) * imgWidth;

        pdf.addImage(dataUrl, 'PNG', margin, yPosition, finalWidth, finalHeight);
        resolve();
      };
    });

    // Save PDF
    pdf.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('PDF export failed:', error);
    throw error;
  }
}

/**
 * Format number for export
 */
export function formatNumberForExport(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Format date for export
 */
export function formatDateForExport(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}
