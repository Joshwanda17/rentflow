// Daily Wallet Financial Summary Report.
// Aggregates from general_ledger via public.compute_wallet_report,
// stores PDF + XLSX to the finops-reports bucket, records a row in
// public.daily_wallet_reports, and emails PDF+XLSX via Mailgun.
//
// Cron: 21:00 UTC = 00:00 EAT (covers the just-ended EAT day).
// Manual POST body: { "date": "YYYY-MM-DD", "recipients": [ ... ], "regenerate": true }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM = 'Welile Reports <reports@welile.com>';
const DEFAULT_RECIPIENTS = [
  'joshwanda17@gmail.com',
  'benjaminmuhanguzi29@gmail.com',
  'weliletenants@gmail.com',
];

const fmt = (n: number) =>
  `UGX ${Math.round(Number(n) || 0).toLocaleString('en-UG')}`;

function eatDayToUtcRange(dateStr: string) {
  const startUtc = new Date(`${dateStr}T00:00:00.000+03:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

function yesterdayEat(): string {
  const nowEatMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(nowEatMs - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function eatNowLabel(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' EAT';
}

interface Metrics {
  period_start: string;
  period_end: string;
  total_deposited: number;
  total_paid_out: number;
  closing_balance: number;
  deposits_by_source: Record<string, { count: number; amount: number }>;
  payouts_by_channel: Record<string, { count: number; amount: number }>;
}

const DEPOSIT_LABEL: Record<string, string> = {
  cash: 'Cash Deposits',
  mtn: 'MTN Mobile Money Deposits',
  airtel: 'Airtel Money Deposits',
  bank: 'Bank Deposits',
  cfo_direct_credit: 'CFO Direct Credit',
  gmail_auto_credit: 'Gmail Auto-Credit',
  manual_recovery: 'Manual Recovery',
  ledger_adjustment: 'Ledger Adjustment',
  other: 'Other',
};
const PAYOUT_LABEL: Record<string, string> = {
  merchant_mtn: 'Merchant Agent MTN',
  merchant_airtel: 'Merchant Agent Airtel',
  merchant_equity_bank: 'Merchant Agent Equity Bank Account',
  other: 'Other',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    const mailgunBaseUrl = Deno.env.get('MAILGUN_API_BASE') || 'https://api.mailgun.net';
    if (!supabaseUrl || !serviceKey || !mailgunApiKey || !mailgunDomain) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dateStr: string =
      typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : yesterdayEat();
    const recipients: string[] =
      Array.isArray(body?.recipients) && body.recipients.length > 0
        ? body.recipients.filter((r: unknown) => typeof r === 'string' && (r as string).includes('@'))
        : DEFAULT_RECIPIENTS;
    const skipEmail = body?.skipEmail === true;

    const { startIso, endIso } = eatDayToUtcRange(dateStr);
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: rpcData, error: rpcErr } = await supabase.rpc('compute_wallet_report', {
      _start: startIso,
      _end: endIso,
    });
    if (rpcErr) throw rpcErr;
    // Normalize RPC output keys (deposits/payouts/closing_wallet_balance)
    // into the storage/report shape used downstream.
    const raw = rpcData as any;
    const m: Metrics = {
      period_start: raw.period_start,
      period_end: raw.period_end,
      total_deposited: Number(raw.total_deposited ?? 0),
      total_paid_out: Number(raw.total_paid_out ?? 0),
      closing_balance: Number(raw.closing_wallet_balance ?? raw.closing_balance ?? 0),
      deposits_by_source: raw.deposits ?? raw.deposits_by_source ?? {},
      payouts_by_channel: raw.payouts ?? raw.payouts_by_channel ?? {},
    };

    const generatedAtLabel = eatNowLabel();
    const pdfBytes = await buildPdf({ dateStr, generatedAtLabel, m });
    const xlsxBytes = buildXlsx({ dateStr, generatedAtLabel, m });

    const baseName = `welile-wallet-summary-${dateStr}`;
    const pdfPath = `${dateStr}/${baseName}.pdf`;
    const xlsxPath = `${dateStr}/${baseName}.xlsx`;

    const up1 = await supabase.storage.from('finops-reports').upload(pdfPath, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });
    if (up1.error) throw up1.error;
    const up2 = await supabase.storage.from('finops-reports').upload(xlsxPath, xlsxBytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });
    if (up2.error) throw up2.error;

    const row = {
      report_date: dateStr,
      period_start: m.period_start,
      period_end: m.period_end,
      deposits_by_source: m.deposits_by_source,
      payouts_by_channel: m.payouts_by_channel,
      total_deposited: m.total_deposited,
      total_paid_out: m.total_paid_out,
      closing_balance: m.closing_balance,
      pdf_path: pdfPath,
      xlsx_path: xlsxPath,
      generated_by: 'system',
      generated_at: new Date().toISOString(),
      email_recipients: skipEmail ? [] : recipients,
      email_sent_at: null as string | null,
    };
    const { data: saved, error: saveErr } = await supabase
      .from('daily_wallet_reports')
      .upsert(row, { onConflict: 'report_date' })
      .select()
      .single();
    if (saveErr) throw saveErr;

    if (!skipEmail) {
      const htmlBody = renderEmailHtml(dateStr, m);
      const textBody = renderEmailText(dateStr, m);

      const form = new FormData();
      form.set('from', FROM);
      recipients.forEach((r) => form.append('to', r));
      form.set('subject', `Daily Wallet Financial Summary Report – ${dateStr}`);
      form.set('text', textBody);
      form.set('html', htmlBody);
      form.set('o:tag', 'daily-wallet-summary');
      form.append(
        'attachment',
        new Blob([pdfBytes], { type: 'application/pdf' }),
        `${baseName}.pdf`,
      );
      form.append(
        'attachment',
        new Blob([xlsxBytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${baseName}.xlsx`,
      );

      const mgRes = await fetch(`${mailgunBaseUrl}/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`api:${mailgunApiKey}`) },
        body: form,
      });
      const mgText = await mgRes.text();
      if (!mgRes.ok) {
        console.error('Mailgun send failed', mgRes.status, mgText);
        return new Response(
          JSON.stringify({
            ok: true,
            date: dateStr,
            saved: saved?.id,
            emailError: mgText,
            emailStatus: mgRes.status,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      await supabase
        .from('daily_wallet_reports')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', saved.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        date: dateStr,
        id: saved.id,
        total_deposited: m.total_deposited,
        total_paid_out: m.total_paid_out,
        closing_balance: m.closing_balance,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-daily-wallet-report failed', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function renderEmailHtml(dateStr: string, m: Metrics) {
  const depRows = Object.entries(m.deposits_by_source)
    .map(([k, v]) => `<tr><td style="padding:4px 12px">${DEPOSIT_LABEL[k] ?? k}</td><td style="padding:4px 12px;text-align:right">${v.count.toLocaleString()}</td><td style="padding:4px 12px;text-align:right">${fmt(v.amount)}</td></tr>`)
    .join('');
  const payRows = Object.entries(m.payouts_by_channel)
    .map(([k, v]) => `<tr><td style="padding:4px 12px">${PAYOUT_LABEL[k] ?? k}</td><td style="padding:4px 12px;text-align:right">${v.count.toLocaleString()}</td><td style="padding:4px 12px;text-align:right">${fmt(v.amount)}</td></tr>`)
    .join('');
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111">
    <h2 style="margin:0 0 4px">Daily Wallet Financial Summary Report</h2>
    <p style="color:#666;margin:0 0 16px">Reporting Period: ${dateStr} (EAT) • Currency: UGX</p>

    <h3 style="margin:16px 0 4px">Deposits</h3>
    <table style="border-collapse:collapse;min-width:420px">${depRows}
      <tr><td style="padding:6px 12px;border-top:1px solid #ccc"><b>Total Amount Deposited</b></td><td></td><td style="padding:6px 12px;border-top:1px solid #ccc;text-align:right"><b>${fmt(m.total_deposited)}</b></td></tr>
    </table>

    <h3 style="margin:16px 0 4px">Payouts</h3>
    <table style="border-collapse:collapse;min-width:420px">${payRows}
      <tr><td style="padding:6px 12px;border-top:1px solid #ccc"><b>Total Amount Paid Out</b></td><td></td><td style="padding:6px 12px;border-top:1px solid #ccc;text-align:right"><b>${fmt(m.total_paid_out)}</b></td></tr>
    </table>

    <h3 style="margin:16px 0 4px">Closing Wallet Balance</h3>
    <p style="font-size:20px;margin:0"><b>${fmt(m.closing_balance)}</b></p>
    <p style="color:#666;margin:16px 0 0">Detailed report attached as PDF and Excel (.xlsx). Generated from the immutable financial ledger.</p>
  </div>`;
}

function renderEmailText(dateStr: string, m: Metrics) {
  return [
    `Daily Wallet Financial Summary Report`,
    `Reporting Period: ${dateStr} (EAT)`,
    `Total Amount Deposited: ${fmt(m.total_deposited)}`,
    `Total Amount Paid Out: ${fmt(m.total_paid_out)}`,
    `Closing Wallet Balance: ${fmt(m.closing_balance)}`,
    ``,
    `Detailed report attached as PDF and Excel (.xlsx).`,
  ].join('\n');
}

function buildXlsx(a: { dateStr: string; generatedAtLabel: string; m: Metrics }): Uint8Array {
  const { dateStr, generatedAtLabel, m } = a;
  const rows: (string | number)[][] = [];
  rows.push(['Daily Wallet Financial Summary Report']);
  rows.push([`Reporting Period`, `${dateStr} (EAT)`]);
  rows.push([`Generated At`, generatedAtLabel]);
  rows.push([`Generated By`, 'System']);
  rows.push([`Currency`, 'UGX']);
  rows.push([]);
  rows.push(['Deposits by Source', 'Transactions', 'Amount (UGX)']);
  for (const [k, v] of Object.entries(m.deposits_by_source)) {
    rows.push([DEPOSIT_LABEL[k] ?? k, v.count, Math.round(v.amount)]);
  }
  rows.push(['Total Amount Deposited', '', Math.round(m.total_deposited)]);
  rows.push([]);
  rows.push(['Payouts by Channel', 'Transactions', 'Amount (UGX)']);
  for (const [k, v] of Object.entries(m.payouts_by_channel)) {
    rows.push([PAYOUT_LABEL[k] ?? k, v.count, Math.round(v.amount)]);
  }
  rows.push(['Total Amount Paid Out', '', Math.round(m.total_paid_out)]);
  rows.push([]);
  rows.push(['Closing Wallet Balance', '', Math.round(m.closing_balance)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 42 }, { wch: 16 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Uint8Array(out);
}

async function buildPdf(a: { dateStr: string; generatedAtLabel: string; m: Metrics }): Promise<Uint8Array> {
  const { dateStr, generatedAtLabel, m } = a;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const margin = 40;
  const col = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);
  const ink = col(17, 17, 17);
  const muted = col(110, 110, 120);
  const brand: [number, number, number] = [88, 28, 135];

  const page = doc.addPage([PAGE_W, PAGE_H]);

  // Header band
  page.drawRectangle({ x: 0, y: PAGE_H - 100, width: PAGE_W, height: 100, color: col(...brand) });
  page.drawText('WELILE — Financial Operations', {
    x: margin, y: PAGE_H - 34, size: 10, font: bold, color: col(255, 255, 255),
  });
  page.drawText('Daily Wallet Financial Summary Report', {
    x: margin, y: PAGE_H - 58, size: 17, font: bold, color: col(255, 255, 255),
  });
  page.drawText(`Reporting Period: ${dateStr} (EAT)`, {
    x: margin, y: PAGE_H - 78, size: 10, font, color: col(230, 220, 245),
  });
  const gen = `Generated: ${generatedAtLabel}  •  Currency: UGX  •  Generated By: System`;
  page.drawText(gen, { x: margin, y: PAGE_H - 92, size: 8.5, font, color: col(230, 220, 245) });

  let y = PAGE_H - 130;

  const drawSectionTitle = (label: string) => {
    page.drawText(label, { x: margin, y, size: 12, font: bold, color: ink });
    y -= 16;
  };
  const drawHeaderRow = (h1: string, h2: string, h3: string) => {
    page.drawRectangle({ x: margin, y: y - 4, width: PAGE_W - margin * 2, height: 18, color: col(245, 243, 250) });
    page.drawText(h1, { x: margin + 6, y: y, size: 9, font: bold, color: ink });
    page.drawText(h2, { x: margin + 300, y: y, size: 9, font: bold, color: ink });
    page.drawText(h3, { x: margin + 400, y: y, size: 9, font: bold, color: ink });
    y -= 20;
  };
  const drawRow = (label: string, count: number, amount: number, isTotal = false) => {
    const f = isTotal ? bold : font;
    page.drawText(label, { x: margin + 6, y, size: 9, font: f, color: ink });
    page.drawText(count.toLocaleString(), { x: margin + 300, y, size: 9, font: f, color: ink });
    const amtStr = fmt(amount);
    page.drawText(amtStr, {
      x: PAGE_W - margin - font.widthOfTextAtSize(amtStr, 9) - 4,
      y, size: 9, font: f, color: ink,
    });
    y -= 16;
  };
  const totalRow = (label: string, amount: number) => {
    page.drawLine({
      start: { x: margin, y: y + 10 }, end: { x: PAGE_W - margin, y: y + 10 },
      thickness: 0.5, color: col(180, 180, 190),
    });
    page.drawText(label, { x: margin + 6, y, size: 10, font: bold, color: ink });
    const s = fmt(amount);
    page.drawText(s, {
      x: PAGE_W - margin - bold.widthOfTextAtSize(s, 10) - 4,
      y, size: 10, font: bold, color: ink,
    });
    y -= 22;
  };

  drawSectionTitle('Section 1 — Deposits');
  drawHeaderRow('Deposit Source', 'Transactions', 'Amount');
  for (const [k, v] of Object.entries(m.deposits_by_source)) {
    drawRow(DEPOSIT_LABEL[k] ?? k, v.count, v.amount);
  }
  totalRow('Total Amount Deposited', m.total_deposited);

  y -= 8;
  drawSectionTitle('Section 2 — Payouts');
  drawHeaderRow('Payout Channel', 'Transactions', 'Amount');
  for (const [k, v] of Object.entries(m.payouts_by_channel)) {
    drawRow(PAYOUT_LABEL[k] ?? k, v.count, v.amount);
  }
  totalRow('Total Amount Paid Out', m.total_paid_out);

  y -= 16;
  drawSectionTitle('Section 3 — Closing Wallet Balance');
  y -= 8;
  const balanceBoxHeight = 48;
  const balanceBoxTop = y;
  page.drawRectangle({
    x: margin,
    y: balanceBoxTop - balanceBoxHeight,
    width: PAGE_W - margin * 2,
    height: balanceBoxHeight,
    color: col(245, 243, 250),
  });
  page.drawText('Closing Wallet Balance', { x: margin + 12, y: balanceBoxTop - 20, size: 10, font, color: muted });
  const s = fmt(m.closing_balance);
  page.drawText(s, {
    x: PAGE_W - margin - bold.widthOfTextAtSize(s, 18) - 12,
    y: balanceBoxTop - 34, size: 18, font: bold, color: ink,
  });
  y = balanceBoxTop - balanceBoxHeight;

  y -= 20;
  page.drawText(
    'Deterministic, auditable, reproducible from the immutable financial ledger.',
    { x: margin, y, size: 8, font, color: muted },
  );

  return await doc.save();
}