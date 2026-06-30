import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Rasterise the SAME filled contract HTML the admin previews into a multi-page
// A4 PDF. Each `.page-section` becomes its own page, so the stored/emailed PDF
// is pixel-identical to the on-screen preview (single HTML -> PDF pipeline).
async function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images || []);
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
}

/** Returns the rendered contract as a base64 (no data: prefix) PDF string. */
export async function renderAgreementPdfBase64(html: string): Promise<string> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '900px';
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Allow layout + webfonts/images to settle.
    await new Promise((r) => setTimeout(r, 120));
    await waitForImages(doc);
    if ((doc as any).fonts?.ready) {
      try { await (doc as any).fonts.ready; } catch { /* ignore */ }
    }

    const sections = Array.from(doc.querySelectorAll<HTMLElement>('.page-section'));
    const targets = sections.length ? sections : [doc.querySelector<HTMLElement>('.document-wrapper') || doc.body];

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;

    for (let i = 0; i < targets.length; i++) {
      const canvas = await html2canvas(targets[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: 900,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      let w = maxW;
      let h = (canvas.height / canvas.width) * w;
      if (h > maxH) {
        h = maxH;
        w = (canvas.width / canvas.height) * h;
      }
      const x = (pageW - w) / 2;
      const y = margin;
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', x, y, w, h, undefined, 'FAST');
    }

    const dataUri = pdf.output('datauristring');
    const comma = dataUri.indexOf(',');
    return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
  } finally {
    document.body.removeChild(iframe);
  }
}
