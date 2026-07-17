import { readFileSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Inline a trimmed version of downloadAuditPdf that writes to disk.
async function build() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const marginX = 24;

  const meta = {
    title: 'Daily Rent Repayments — 2026-07-16',
    subtitle: 'Ledger-confirmed tenant repayments',
    filters: ['Date: 2026-07-16', 'Method: cash', 'Status: successful'],
    footerLabel: 'Welile · Tenant Ops',
    kpis: [
      { label: 'Total Repaid', value: 'UGX 2,766,635', hint: '88 transactions', accent: [16, 122, 87] },
      { label: 'Average Payment', value: 'UGX 31,439', hint: 'per transaction', accent: [88, 28, 135] },
      { label: 'Successful', value: '88', hint: '100% success rate', accent: [16, 122, 87] },
      { label: 'Pending', value: '0', hint: 'awaiting confirmation', accent: [202, 138, 4] },
      { label: 'Failed', value: '0', hint: 'requires review', accent: [190, 44, 44] },
      { label: 'Unique Tenants', value: '62', hint: 'active today', accent: [30, 64, 175] },
    ],
  };
  const headers = ['Tx ID','Time','Tenant','Phone','Property','Landlord','Agent','Amount (UGX)','Balance Before','Balance After','Method','Status','Receipt'];
  const rows = Array.from({length: 30}, (_, i) => [
    `a0e33a${i}`.slice(0,8), '23:30:51', 'Kayongo Jackson', '+256741785784', '—', '—', 'sir ian martin',
    350000, 350000, 0, 'cash', 'successful', 'AGT-cd3d60ba',
  ]);

  const bandH = 66;
  doc.setFillColor(88, 28, 135);
  doc.rect(0, 0, pageWidth, bandH, 'F');
  doc.setFillColor(146, 52, 234);
  doc.rect(0, bandH, pageWidth, 3, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(230,220,245);
  doc.text('WELILE', marginX, 22);
  doc.setFontSize(16); doc.setTextColor(255,255,255);
  doc.text(meta.title, marginX, 42);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(220,208,240);
  doc.text(meta.subtitle, marginX, 56);
  doc.setFontSize(8.5); doc.setTextColor(230,220,245);
  doc.text(`Generated ${generatedAt}`, pageWidth - marginX, 42, { align:'right' });
  doc.text(`${rows.length} rows`, pageWidth - marginX, 56, { align:'right' });

  let cursorY = bandH + 20;

  // KPIs
  const gutter = 10;
  const usable = pageWidth - marginX*2;
  const perRow = Math.min(meta.kpis.length, 4);
  const cardW = (usable - gutter*(perRow-1)) / perRow;
  const cardH = 62;
  meta.kpis.forEach((k,i) => {
    const row = Math.floor(i/perRow); const col = i%perRow;
    const x = marginX + col*(cardW+gutter);
    const y = cursorY + row*(cardH+gutter);
    doc.setDrawColor(232,232,238); doc.setFillColor(255,255,255);
    doc.roundedRect(x,y,cardW,cardH,6,6,'FD');
    doc.setFillColor(k.accent[0],k.accent[1],k.accent[2]);
    doc.roundedRect(x,y,3,cardH,1.5,1.5,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(120,120,130);
    doc.text(k.label.toUpperCase(), x+12, y+16);
    doc.setFontSize(15); doc.setTextColor(k.accent[0],k.accent[1],k.accent[2]);
    let val = k.value; const maxW = cardW-24;
    while (val.length>3 && doc.getTextWidth(val)>maxW) val = val.slice(0,-1);
    if (val !== k.value) val = val.slice(0,-1)+'…';
    doc.text(val, x+12, y+38);
    if (k.hint) { doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,140,150); doc.text(k.hint, x+12, y+52); }
  });
  const kpiRows = Math.ceil(meta.kpis.length/perRow);
  cursorY += kpiRows*(cardH+gutter) + 4;

  // Chips
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(120,120,130);
  doc.text('FILTERS', marginX, cursorY+4);
  let chipX = marginX + 46;
  const chipH = 16;
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  for (const f of meta.filters) {
    const w = doc.getTextWidth(f)+16;
    if (chipX+w > pageWidth-marginX) { cursorY += chipH+4; chipX = marginX+46; }
    doc.setFillColor(243,240,250); doc.setDrawColor(224,214,240);
    doc.roundedRect(chipX, cursorY-6, w, chipH, 8, 8, 'FD');
    doc.setTextColor(88,28,135); doc.text(f, chipX+8, cursorY+4);
    chipX += w+6;
  }
  cursorY += chipH+8;

  autoTable(doc, {
    startY: cursorY, head: [headers],
    body: rows.map(r=>r.map(c=>String(c ?? ''))),
    styles: { fontSize:7.5, cellPadding:4, overflow:'linebreak', valign:'top', textColor:[40,40,50], lineColor:[235,232,242] },
    headStyles: { fillColor:[88,28,135], textColor:255, fontStyle:'bold', fontSize:7.5, cellPadding:5 },
    alternateRowStyles: { fillColor:[250,248,253] },
    margin: { left:24, right:24, bottom:36 },
    didDrawPage: () => {
      const pageNum = doc.internal.getNumberOfPages();
      doc.setDrawColor(230,226,240); doc.setLineWidth(0.5);
      doc.line(24, pageHeight-26, pageWidth-24, pageHeight-26);
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(140);
      doc.text(`${meta.footerLabel}  ·  welile.com`, 24, pageHeight-14);
      doc.text(`Page ${pageNum}`, pageWidth-24, pageHeight-14, { align:'right' });
    },
  });

  writeFileSync('/tmp/pdfqa/new.pdf', Buffer.from(doc.output('arraybuffer')));
}
build();
