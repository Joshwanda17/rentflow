// Server-side Tenant Partnership Agreement renderer.
// The contract template lives ONLY here (never in public/). It renders a PDF
// strictly from the `partner_agreements` DB row + stored company countersignature
// defaults — no admin typing, no partner data re-entry.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── numberToWords (inlined; mirrors src/lib/numberToWords.ts) ───────────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
function threeDigits(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h > 0) parts.push(`${ONES[h]} Hundred`);
  if (r > 0) {
    if (r < 20) parts.push(ONES[r]);
    else { const t = Math.floor(r / 10); const o = r % 10; parts.push(o > 0 ? `${TENS[t]}-${ONES[o]}` : TENS[t]); }
  }
  return parts.join(' ');
}
function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(value || 0));
  if (n === 0) return 'Zero';
  const groups: number[] = [];
  let rem = n;
  while (rem > 0) { groups.push(rem % 1000); rem = Math.floor(rem / 1000); }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const chunk = threeDigits(groups[i]);
    const scale = SCALES[i];
    words.push(scale ? `${chunk} ${scale}` : chunk);
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return day + (s[(v - 20) % 10] || s[v] || s[0]);
}

const INK = rgb(0.059, 0.090, 0.165);   // #0F172A
const PRIMARY = rgb(0.486, 0.227, 0.929); // violet #7c3aed
const BORDER = rgb(0.796, 0.835, 0.882);  // slate-300
const STAMP_BLUE = rgb(0.067, 0.204, 0.651); // #1134a6
const STAMP_RED = rgb(0.898, 0.098, 0.129);  // #e51921
const UNKNOWN = '{xx}';
const BLANK = '__BLANK__';

serveHandler();

function serveHandler() {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);

      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData?.user) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const callerId = userData.user.id;

      const body = await req.json().catch(() => ({}));
      const partnerId = String(body?.partnerId || '').trim();
      const countersign = body?.countersign === true;
      if (!partnerId) return json({ error: 'partnerId is required' }, 400);

      // Permission: partner can render own draft; ops/manager can render & countersign.
      const [{ data: isOps }, { data: isManager }] = await Promise.all([
        admin.rpc('is_ops_role', { _user_id: callerId }),
        admin.rpc('has_role', { _user_id: callerId, _role: 'manager' }),
      ]);
      const isStaff = isOps === true || isManager === true;
      if (countersign && !isStaff) {
        return json({ error: 'Only operations/manager staff can countersign.' }, 403);
      }
      if (!isStaff && callerId !== partnerId) {
        return json({ error: 'You can only generate your own agreement.' }, 403);
      }

      // ── Load / lazily backfill the source-of-truth row ──
      let { data: row } = await admin
        .from('partner_agreements')
        .select('*')
        .eq('partner_id', partnerId)
        .maybeSingle();

      if (!row) {
        row = await backfillRow(admin, partnerId);
        if (!row) return json({ error: 'No agreement data found for this partner.' }, 404);
      }

      // ── Company countersignature defaults ──
      const { data: defaults } = await admin
        .from('partner_agreement_company_defaults')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      let repSignatureBytes: Uint8Array | null = null;
      if (countersign && defaults?.signature_path) {
        const { data: sigFile } = await admin.storage
          .from('partner-agreements')
          .download(defaults.signature_path);
        if (sigFile) repSignatureBytes = new Uint8Array(await sigFile.arrayBuffer());
      }

      const pdfBytes = await renderPdf({
        row,
        countersign,
        rep: countersign ? defaults : null,
        repSignatureBytes: countersign ? repSignatureBytes : null,
      });

      // ── Store the PDF privately ──
      const reference = row.reference || `PA-${partnerId.slice(0, 8).toUpperCase()}`;
      const objectPath = `${partnerId}/partnership-agreement${countersign ? '-signed' : ''}-${reference}.pdf`;
      const { error: upErr } = await admin.storage
        .from('partner-agreements')
        .upload(objectPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;

      const { data: signed } = await admin.storage
        .from('partner-agreements')
        .createSignedUrl(objectPath, 60 * 60 * 24 * 365);

      // ── Update the row state ──
      const patch: Record<string, unknown> = { generated_pdf_path: objectPath };
      if (countersign) {
        patch.status = 'countersigned';
        patch.countersigned_by = callerId;
        patch.countersigned_at = new Date().toISOString();
      }
      await admin.from('partner_agreements').update(patch).eq('id', row.id);

      // ── Email the partner a download link ──
      if (row.email) {
        const amountNum = Math.max(0, Math.floor(Number(row.partnership_amount) || 0));
        const isBank = row.payout_mode !== 'momo';
        const payoutSummary = isBank
          ? [row.bank_name, row.bank_account_number].filter(Boolean).join(' ') || 'Bank Transfer'
          : [row.momo_provider, row.momo_number].filter(Boolean).join(' ') || 'Mobile Money';
        try {
          await admin.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'tenant-partnership-agreement',
              recipientEmail: row.email,
              templateData: {
                partner_name: row.full_name || 'Partner',
                partner_email: row.email,
                partner_reference: reference,
                partnership_amount: `UGX ${amountNum.toLocaleString('en-US')}`,
                partnership_amount_words: row.partnership_amount_words || numberToWords(amountNum),
                monthly_return: '15%',
                payout_summary: payoutSummary,
                agreement_download_url: signed?.signedUrl || 'https://welilereceipts.com',
                company_name: 'WELILE TECHNOLOGIES LTD',
              },
            },
          });
        } catch (e) {
          console.warn('agreement email failed (non-blocking):', e);
        }
      }

      return json({ ok: true, signedUrl: signed?.signedUrl || null, status: countersign ? 'countersigned' : 'pending' });
    } catch (e) {
      console.error('generate-partner-agreement error:', e);
      return json({ error: (e as Error)?.message || 'Internal error' }, 500);
    }
  });

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Build a partner_agreements row from existing profile + payout data when none exists.
async function backfillRow(admin: any, partnerId: string) {
  const [{ data: prof }, { data: method }] = await Promise.all([
    admin.from('profiles').select('full_name, phone, email, national_id, landmark').eq('id', partnerId).maybeSingle(),
    admin.from('saved_payout_methods').select('*').eq('user_id', partnerId)
      .order('is_default', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle(),
  ]);
  if (!prof) return null;
  const reference = `PA-${partnerId.slice(0, 8).toUpperCase()}`;
  const insert: Record<string, unknown> = {
    partner_id: partnerId,
    full_name: prof.full_name,
    phone: prof.phone,
    email: prof.email,
    national_id: prof.national_id,
    address: prof.landmark,
    payout_mode: method?.payout_mode || 'bank',
    bank_name: method?.bank_name,
    bank_account_name: method?.bank_account_name,
    bank_account_number: method?.bank_account_number,
    momo_provider: method?.momo_provider,
    momo_number: method?.momo_number,
    momo_name: method?.momo_name,
    reference,
    status: 'pending',
  };
  const { data, error } = await admin.from('partner_agreements').insert(insert).select('*').maybeSingle();
  if (error) { console.warn('backfill insert failed:', error); return null; }
  return data;
}

// ─── PDF rendering ───────────────────────────────────────────────────────────
interface RenderArgs {
  row: any;
  countersign: boolean;
  rep: { rep_name?: string; rep_position?: string; rep_contact?: string } | null;
  repSignatureBytes: Uint8Array | null;
}

async function renderPdf({ row, countersign, rep, repSignatureBytes }: RenderArgs): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontN = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const fontI = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 50;
  const contentW = pageW - margin * 2;
  const bottomLimit = pageH - 54;

  const date = row.agreement_date ? new Date(row.agreement_date) : new Date();
  const day = date.getUTCDate();
  const month = date.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const year = date.getUTCFullYear();

  let page = pdf.addPage([pageW, pageH]);
  let cursorY = margin; // distance from top to next baseline

  const pages: any[] = [page];

  const newPage = () => {
    page = pdf.addPage([pageW, pageH]);
    pages.push(page);
    cursorY = margin;
  };
  const ensure = (needed: number) => {
    if (cursorY + needed > bottomLimit) newPage();
  };
  const yTop = () => pageH - cursorY;

  const drawText = (text: string, x: number, size: number, font: any, color = INK) => {
    page.drawText(text, { x, y: pageH - cursorY, size, font, color });
  };

  const wrap = (text: string, font: any, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const seg of text.split('\n')) {
      const words = seg.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      out.push(line);
    }
    return out;
  };

  const heading = (text: string) => {
    ensure(22);
    cursorY += 6;
    drawText(text, margin, 12.5, fontB, INK);
    cursorY += 14;
  };

  const paragraph = (text: string, opts: { bold?: boolean; gap?: number } = {}) => {
    const font = opts.bold ? fontB : fontN;
    const size = 10.5;
    const lh = 14;
    for (const line of wrap(text, font, size, contentW)) {
      ensure(lh);
      drawText(line, margin, size, font);
      cursorY += lh;
    }
    cursorY += opts.gap ?? 4;
  };

  const bullet = (text: string) => {
    const size = 10.5;
    const lh = 14;
    const lines = wrap(text, fontN, size, contentW - 14);
    lines.forEach((line, idx) => {
      ensure(lh);
      if (idx === 0) drawText('\u2022', margin, size, fontB);
      drawText(line, margin + 12, size, fontN);
      cursorY += lh;
    });
    cursorY += 3;
  };

  // ── COVER ──
  cursorY = 140;
  const centre = (text: string, size: number, font: any, color = INK) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (pageW - w) / 2, y: pageH - cursorY, size, font, color });
  };
  centre('THE REPUBLIC OF UGANDA', 14, fontB, INK); cursorY += 18;
  centre('THE CONTRACTS ACT', 11, fontN, INK); cursorY += 70;
  centre('TENANT PARTNERSHIP', 26, fontB, PRIMARY); cursorY += 30;
  centre('AGREEMENT', 26, fontB, PRIMARY); cursorY += 70;
  centre('Between', 12, fontI, INK); cursorY += 22;
  centre('WELILE TECHNOLOGIES LIMITED', 15, fontB, INK); cursorY += 22;
  centre('And', 12, fontI, INK); cursorY += 22;
  centre((row.full_name || UNKNOWN).toUpperCase(), 15, fontB, PRIMARY);

  // ── BODY ──
  newPage();
  const name = (row.full_name || '').trim() || UNKNOWN;
  const nationalId = (row.national_id || '').trim() || UNKNOWN;
  const address = (row.address || '').trim() || UNKNOWN;
  const amountNum = Math.max(0, Math.floor(Number(row.partnership_amount) || 0));
  const amountStr = amountNum.toLocaleString('en-US');
  const amountWords = row.partnership_amount_words || numberToWords(amountNum);

  paragraph(`THIS AGREEMENT is made this ${ordinal(day)} day of ${month}, ${year} BETWEEN Welile Technologies Limited, a limited liability company incorporated in Uganda, with its Head Quarters office in Hosanna Estate, Palm Road, Kabale\u2013Entebbe, P.O. Box 167564, Kampala \u2013 Uganda Tel: 0793750331, 0748747134 (hereinafter referred to as "the Company", which expression shall, where the context so admits, include its Nominees, Agents, Successors in Title and Assignees) of the one part;`);
  paragraph(`AND ${name}, holder of National ID/Passport No. ${nationalId}, residing at ${address} (hereinafter referred to as "the Partner", which expression shall, where the context so admits, include his/her Nominees, Agents, Successors in Title and Assignees) of the other part; The Company and the Partner shall individually be referred to as "the Party" and collectively as "the Parties."`);

  heading('Background');
  paragraph('WHEREAS, the Company operates as a technology platform that facilitates rent access for tenants by connecting them with Tenant Partners, who are financial contributors that provide the funds for rent payments in exchange for a return on their contribution;');

  heading('Agreement');
  paragraph('The Parties agree to the following terms and conditions:');

  heading('1. Platform Overview and Nature of Business');
  paragraph('The Company operates a digital platform that connects tenants seeking rent with individuals willing to support them in exchange for returns.');
  paragraph('The Company is not a deposit-taking institution or an insurance company. It is a technology platform that manages and facilitates all transactions between the Parties.');

  heading("2. Partner's Role");
  paragraph(`The Partner agrees to contribute a total partnership amount of UGX ${amountStr} (${amountWords} Shillings Only).`, { bold: true });
  paragraph('The Partner will receive access to periodic reports or a dashboard to monitor the performance of their contribution.');
  paragraph('The Partner agrees to comply with all platform terms, policies, and partner guidelines.');

  heading("3. Company's Responsibilities and Assurances");
  paragraph('The Company commits to:');
  ['Conduct full due diligence on all tenants and landlords.',
    'Facilitate and manage all rent payment transactions.',
    'Guarantee the repayment of the full principal amount and expected returns.',
    'Absorb any losses, delays, or defaults from tenants.',
    'Provide a detailed Individual financial report to the Partner upon request.'].forEach(bullet);

  heading('4. Returns and Payouts');
  ['The Partner will earn a monthly return of 15% on the principal partnership amount.',
    "The monthly returns will be paid to the Partner's provided bank account or mobile money details at the end of each month.",
    "The Partner's earnings are not available for early withdrawal and can only be accessed on the agreed payout date."].forEach(bullet);

  heading('5. Withdrawal of Principal');
  ['This agreement is in force for a period of one (1) year. A notice for renewal shall be given three (3) months before the expiration of this agreement by either Party.',
    'To withdraw the principal amount, the Partner must notify the Company in writing at least ninety (90) days prior to the intended withdrawal date.',
    'Upon receipt of a withdrawal request, the Company shall have a principal recovery period of ninety (90) days. During this period, no monthly interest shall accrue or be payable to the Partner, as the funds will no longer be in active use.'].forEach(bullet);

  heading('6. Risk and Liability');
  ['The Company bears full liability for tenant defaults, delays, or losses.',
    "The Partner's principal and expected returns are fully guaranteed by the Company.",
    'The Company shall promptly communicate any payout delays caused by external factors and ensures all such issues are resolved within two to three business days.'].forEach(bullet);

  heading('7. Default and Termination');
  ['Default: If a Party fails to make a payment or comply with the terms of this agreement, the other Party reserves the right to take legal action for breach of contract. Both Parties have a right to settle any default within a period of two weeks (14) days before the other Party takes action.',
    'Termination: This Agreement may be terminated by the Partner with a ninety (90)-day written withdrawal notice, or by the Company in case of any breach, fraud, or misuse.'].forEach(bullet);

  heading('8. Dispute Resolution');
  bullet('The Parties shall resolve the matter through arbitration in accordance with the laws of Uganda. In cases where the Parties have failed to agree under arbitration, the matter can be referred to the courts of Uganda with competent jurisdiction.');

  heading('9. Entire Agreement');
  bullet('This document contains the full agreement between the Parties. There are no agreements collateral hereto, and no oral promises override this agreement.');

  heading('10. Amendments');
  bullet('All amendments to this agreement shall be in writing and all Parties must sign.');

  heading('11. Legal Fees');
  bullet('The legal fees for preparing this agreement shall be borne by the Company.');

  cursorY += 2;
  paragraph('IN WITNESS WHEREOF, the Parties have executed these presents the day and year first above written.', { bold: true });

  // ── PAYMENT CHANNELS TABLE ──
  heading('12. Approved Company Payment Channels');
  paragraph('All partner contributions to the Company shall be made only through the approved payment channels listed below. The Partner should confirm payment details with the Company before making any transfer.');

  const tableRows: [string, string, string][] = [
    ['Airtel Money', 'Dial *185*9#', 'Merchant ID: 4380664'],
    ['MTN MoMo', 'Use MoMo App or dial *165*3#', 'MoMo Code: 090777'],
    ['Bank Transfer', 'Equity Bank', 'Account Name: Welile Technologies Limited\nAccount Number: 1046203375259\nSWIFT Code: EQBLUGKA'],
  ];
  const colW = [contentW * 0.24, contentW * 0.34, contentW * 0.42];
  const colX = [margin, margin + colW[0], margin + colW[0] + colW[1]];
  const padX = 5;
  const cellLh = 12.5;
  const cellPadY = 6;

  const drawTableRow = (cells: string[], isHeader: boolean) => {
    const font = isHeader ? fontB : fontN;
    const size = isHeader ? 9.5 : 10;
    const wrapped = cells.map((c, i) => wrap(c, font, size, colW[i] - padX * 2));
    const rowH = Math.max(...wrapped.map((w) => w.length)) * cellLh + cellPadY * 2;
    ensure(rowH);
    const top = cursorY;
    const rectY = pageH - top - rowH;
    if (isHeader) {
      page.drawRectangle({ x: margin, y: rectY, width: contentW, height: rowH, color: rgb(0.945, 0.961, 0.976) });
    }
    wrapped.forEach((lines, i) => {
      let ty = top + cellPadY + size;
      lines.forEach((ln) => {
        page.drawText(ln, { x: colX[i] + padX, y: pageH - ty, size, font, color: INK });
        ty += cellLh;
      });
    });
    page.drawRectangle({ x: margin, y: rectY, width: contentW, height: rowH, borderColor: BORDER, borderWidth: 0.6 });
    page.drawLine({ start: { x: colX[1], y: rectY }, end: { x: colX[1], y: rectY + rowH }, color: BORDER, thickness: 0.6 });
    page.drawLine({ start: { x: colX[2], y: rectY }, end: { x: colX[2], y: rectY + rowH }, color: BORDER, thickness: 0.6 });
    cursorY = top + rowH;
  };
  ensure(40);
  drawTableRow(['CHANNEL', 'INSTRUCTION', 'DETAILS'], true);
  tableRows.forEach((r) => drawTableRow(r, false));
  cursorY += 8;

  // ── EXECUTION / SIGNATURES ──
  ensure(24);
  cursorY += 6;
  drawText('EXECUTION', margin, 12.5, fontB, INK);
  cursorY += 18;

  const sigField = (label: string, value: string, opts: { italic?: boolean } = {}) => {
    ensure(26);
    drawText(label.toUpperCase(), margin, 9, fontB, INK);
    cursorY += 12;
    if (value !== BLANK) {
      const isFilled = value !== UNKNOWN;
      const font = opts.italic ? fontI : (isFilled ? fontB : fontN);
      drawText(value, margin, 11, font, INK);
    }
    cursorY += 4;
    page.drawLine({ start: { x: margin, y: pageH - cursorY }, end: { x: margin + contentW, y: pageH - cursorY }, color: BORDER, thickness: 0.7 });
    cursorY += 12;
  };

  const sigBlockTitle = (title: string) => {
    ensure(24);
    cursorY += 4;
    drawText(title, margin, 11, fontB, PRIMARY);
    cursorY += 14;
  };

  const sigImage = async (label: string, bytes: Uint8Array) => {
    ensure(46);
    drawText(label.toUpperCase(), margin, 9, fontB, INK);
    cursorY += 8;
    try {
      let img;
      try { img = await pdf.embedPng(bytes); } catch { img = await pdf.embedJpg(bytes); }
      const dims = img.scaleToFit(130, 44);
      page.drawImage(img, { x: margin, y: pageH - cursorY - dims.height + 4, width: dims.width, height: dims.height });
      cursorY += dims.height;
    } catch { cursorY += 30; }
    cursorY += 4;
    page.drawLine({ start: { x: margin, y: pageH - cursorY }, end: { x: margin + contentW, y: pageH - cursorY }, color: BORDER, thickness: 0.7 });
    cursorY += 12;
  };

  // Welile block — auto-filled from company defaults when countersigning.
  const repName = rep?.rep_name?.trim();
  const repPos = rep?.rep_position?.trim();
  const repContact = rep?.rep_contact?.trim();
  const repSigned = countersign && !!(repName || repPos || repContact || repSignatureBytes);
  sigBlockTitle('Signed for and on behalf of Welile Technologies Limited');
  sigField('Name', repName || BLANK);
  sigField('Position', repPos || BLANK);
  sigField('Contact', repContact || BLANK);
  sigField('Date', repSigned ? `${ordinal(day)} ${month} ${year}` : BLANK);
  if (repSignatureBytes) await sigImage('Signature', repSignatureBytes);
  else sigField('Signature', BLANK);

  // Partner block
  const partnerPhone = (row.phone || '').trim() || UNKNOWN;
  const partnerEmail = (row.email || '').trim() || UNKNOWN;
  const isBank = row.payout_mode !== 'momo';
  const accName = isBank ? ((row.bank_account_name || '').trim() || UNKNOWN) : ((row.momo_name || '').trim() || UNKNOWN);
  const accNo = isBank ? ((row.bank_account_number || '').trim() || UNKNOWN) : ((row.momo_number || '').trim() || UNKNOWN);
  const bankLabel = isBank ? ((row.bank_name || '').trim() || UNKNOWN) : `${(row.momo_provider || '').trim() || 'Mobile Money'} (Mobile Money)`;

  sigBlockTitle('Signed by the said Tenant Partner');
  sigField('Name', name);
  sigField('Residence', address);
  sigField('Contact (Telephone)', partnerPhone);
  sigField('Email', partnerEmail);
  sigField(isBank ? 'Bank Name' : 'Mobile Money Provider', bankLabel);
  sigField('Account Name', accName);
  sigField('Account No', accNo);
  sigField('Date', `${ordinal(day)} ${month} ${year}`);
  sigField('Signature', name.toLowerCase(), { italic: true });

  // Next of Kin block
  sigBlockTitle('Next of Kin Details');
  sigField('Next of Kin Name', (row.kin_name || '').trim() || UNKNOWN);
  sigField('Contact', (row.kin_contact || '').trim() || UNKNOWN);
  sigField('Date', `${ordinal(day)} ${month} ${year}`);
  sigField('Signature', UNKNOWN);

  // ── FOOTER + E-STAMP on every page ──
  const stampDate = `${String(day).padStart(2, '0')} ${date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${year}`;
  const total = pages.length;
  pages.forEach((p, idx) => {
    // footer
    p.drawLine({ start: { x: margin, y: 40 }, end: { x: pageW - margin, y: 40 }, color: BORDER, thickness: 0.5 });
    p.drawText('Confidential', { x: margin, y: 30, size: 8, font: fontN, color: INK });
    const mid = 'Welile Technologies Limited \u2014 Tenant Partnership Agreement';
    const midW = fontN.widthOfTextAtSize(mid, 8);
    p.drawText(mid, { x: (pageW - midW) / 2, y: 30, size: 8, font: fontN, color: INK });
    const pn = `${idx + 1}`;
    const pnW = fontN.widthOfTextAtSize(pn, 8);
    p.drawText(pn, { x: pageW - margin - pnW, y: 30, size: 8, font: fontN, color: INK });
    // stamp (skip cover page idx 0 for clarity, place on all content pages)
    drawStamp(p, fontB, pageW - margin - 36, pageH / 2, stampDate);
  });

  return await pdf.save();
}

function drawStamp(page: any, fontB: any, cx: number, cy: number, dateStr: string) {
  const w = 150, h = 80;
  const x = cx - w / 2, y = cy - h / 2;
  const opacity = 0.5;
  page.drawRectangle({ x, y, width: w, height: h, borderColor: STAMP_BLUE, borderWidth: 3, opacity: 0, borderOpacity: opacity });
  const c1 = 'WELILE TECHNOLOGIES';
  const c1w = fontB.widthOfTextAtSize(c1, 11);
  page.drawText(c1, { x: cx - c1w / 2, y: y + h - 22, size: 11, font: fontB, color: STAMP_BLUE, opacity });
  const c2 = 'LIMITED';
  const c2w = fontB.widthOfTextAtSize(c2, 11);
  page.drawText(c2, { x: cx - c2w / 2, y: y + h - 36, size: 11, font: fontB, color: STAMP_BLUE, opacity });
  const dw = fontB.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, { x: cx - dw / 2, y: y + 20, size: 10, font: fontB, color: STAMP_RED, opacity });
  const kla = 'KAMPALA, UGANDA';
  const kw = fontB.widthOfTextAtSize(kla, 7);
  page.drawText(kla, { x: cx - kw / 2, y: y + 8, size: 7, font: fontB, color: STAMP_BLUE, opacity });
}