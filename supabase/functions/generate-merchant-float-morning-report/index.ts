// Merchant Float Morning Report — cash-flow planning only.
//
// Deliberately narrow: exactly three sections.
//   1. Phone Money — Right Now (MTN + Airtel + cash at hand)
//   2. Merchant Float — Right Now (every ACTIVE merchant desk, ascending)
//   3. Yesterday's Agent Activity (float received, payouts made, commission)
//
// Read-only. No deposits, no general withdrawals, no anomalies.
// Cron: 04:00 UTC = 07:00 EAT.
// Manual POST body: { "date": "YYYY-MM-DD", "recipients": [...], "skipEmail": true }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM = 'Welile Reports <reports@welile.com>';
// Same recipient list as generate-daily-wallet-report.
const DEFAULT_RECIPIENTS = [
  'joshwanda17@gmail.com',
  'benjaminmuhanguzi29@gmail.com',
  'benjamin@welile.com',
];

// Operational-float funding categories. Confirmed from BOTH credit paths:
//  - record_merchant_float_delivery (outbound-SMS auto-credit) → agent_float_deposit
//  - cfo-direct-credit FLOAT_ROUTE_CATEGORIES → agent_float_deposit,
//    agent_float_assignment, agent_float_topup, agent_float_funding
const FLOAT_CREDIT_CATEGORIES = [
  'agent_float_deposit',
  'agent_float_assignment',
  'agent_float_topup',
  'agent_float_funding',
];

const fmt = (n: number) => `UGX ${Math.round(Number(n) || 0).toLocaleString('en-UG')}`;

function eatDayToUtcRange(dateStr: string) {
  const startUtc = new Date(`${dateStr}T00:00:00.000+03:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}
function yesterdayEat(): string {
  const nowEatMs = Date.now() + 3 * 60 * 60 * 1000;
  return new Date(nowEatMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function eatNowLabel(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' EAT';
}

interface PhoneMoney {
  mtn: number;
  airtel: number;
  cashAtHand: number;
  total: number;
  mtnLastSmsAt: string | null;
  airtelLastSmsAt: string | null;
}
interface FloatRow {
  deskId: string;
  agentId: string;
  name: string;
  phone: string;
  label: string;
  floatHeld: number;
  floatRaw: number;
}
interface ActivityRow {
  agentId: string;
  name: string;
  floatReceived: number;
  payoutCount: number;
  payoutAmount: number;
  commission: number;
  floatHeld: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let dateStr = yesterdayEat();
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
    if (typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) dateStr = body.date;
    const recipients: string[] =
      Array.isArray(body?.recipients) && body.recipients.length > 0
        ? body.recipients.filter((r: unknown) => typeof r === 'string' && (r as string).includes('@'))
        : DEFAULT_RECIPIENTS;
    const skipEmail = body?.skipEmail === true;

    const { startIso, endIso } = eatDayToUtcRange(dateStr);
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Section 1: Phone Money — Right Now ───────────────────────────────
    const [{ data: phoneRecon, error: phoneErr }, { data: cashRow, error: cashErr }] =
      await Promise.all([
        supabase.rpc('get_phone_platform_reconciliation'),
        supabase.rpc('get_cash_at_hand_total_system'),
      ]);
    if (phoneErr) throw phoneErr;
    if (cashErr) throw cashErr;
    const mtn = Number((phoneRecon as any)?.mtn_balance ?? 0);
    const airtel = Number((phoneRecon as any)?.airtel_balance ?? 0);
    const cashAtHand = Number((cashRow as any)?.cash_at_hand_total ?? 0);
    const phone: PhoneMoney = {
      mtn, airtel, cashAtHand,
      total: mtn + airtel + cashAtHand,
      mtnLastSmsAt: (phoneRecon as any)?.mtn_last_sms_at ?? null,
      airtelLastSmsAt: (phoneRecon as any)?.airtel_last_sms_at ?? null,
    };

    // ── Section 2: Merchant Float — Right Now (all ACTIVE desks) ─────────
    // Sourced strictly from cashout_agents (never proxy_agent_assignments).
    const { data: posData, error: posErr } = await supabase.rpc('get_all_merchant_float_positions');
    if (posErr) throw posErr;
    const floats: FloatRow[] = (posData ?? []).map((r: any) => ({
      deskId: String(r.desk_id),
      agentId: String(r.agent_id),
      name: String(r.agent_name || 'Unnamed agent'),
      phone: String(r.agent_phone || ''),
      label: String(r.label || ''),
      floatHeld: Number(r.ledger_float_held || 0),
      floatRaw: Number(r.float_balance_raw || 0),
    })).sort((a: FloatRow, b: FloatRow) => a.floatHeld - b.floatHeld);
    const floatTotal = floats.reduce((s, r) => s + r.floatHeld, 0);
    const agentIds = [...new Set(floats.map((f) => f.agentId))];
    const deskIds = [...new Set(floats.map((f) => f.deskId))];
    const byAgent = new Map(floats.map((f) => [f.agentId, f]));
    const deskToAgent = new Map(floats.map((f) => [f.deskId, f.agentId]));

    // ── Section 3: Yesterday's Agent Activity ────────────────────────────
    const floatReceived = new Map<string, number>();
    const payouts = new Map<string, { count: number; amount: number }>();
    const commissions = new Map<string, number>();

    if (agentIds.length > 0) {
      // Float received (both the CFO-funding path and the outbound-SMS auto-credit path).
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('general_ledger')
          .select('user_id, amount')
          .eq('direction', 'cash_in')
          .eq('ledger_scope', 'wallet')
          .in('category', FLOAT_CREDIT_CATEGORIES)
          .neq('classification', 'admin_correction')
          .in('user_id', agentIds)
          .gte('transaction_date', startIso)
          .lt('transaction_date', endIso)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const k = String((r as any).user_id);
          floatReceived.set(k, (floatReceived.get(k) ?? 0) + Number((r as any).amount || 0));
        }
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }

      // Payouts settled yesterday. Settlement = status 'completed' + processed_at
      // in window. The settling agent is identified by assigned_cashout_agent_id
      // (desk) or processed_by (agent user). There is no finops_disbursed_by column.
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('withdrawal_requests')
          .select('id, amount, processed_by, assigned_cashout_agent_id')
          .eq('status', 'completed')
          .gte('processed_at', startIso)
          .lt('processed_at', endIso)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const desk = (r as any).assigned_cashout_agent_id
            ? deskToAgent.get(String((r as any).assigned_cashout_agent_id))
            : undefined;
          const pb = (r as any).processed_by ? String((r as any).processed_by) : undefined;
          const key = desk ?? (pb && byAgent.has(pb) ? pb : undefined);
          if (!key) continue;
          const cur = payouts.get(key) ?? { count: 0, amount: 0 };
          cur.count += 1;
          cur.amount += Number((r as any).amount || 0);
          payouts.set(key, cur);
        }
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }

      // Commission earned yesterday.
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('merchant_commission_awards')
          .select('agent_id, commission_amount')
          .in('agent_id', agentIds)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const k = String((r as any).agent_id);
          commissions.set(k, (commissions.get(k) ?? 0) + Number((r as any).commission_amount || 0));
        }
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }

    const activity: ActivityRow[] = floats.map((f) => ({
      agentId: f.agentId,
      name: f.name,
      floatReceived: floatReceived.get(f.agentId) ?? 0,
      payoutCount: payouts.get(f.agentId)?.count ?? 0,
      payoutAmount: payouts.get(f.agentId)?.amount ?? 0,
      commission: commissions.get(f.agentId) ?? 0,
      floatHeld: f.floatHeld,
    })).sort((a, b) => b.payoutAmount - a.payoutAmount || b.floatReceived - a.floatReceived);

    const totals = {
      floatReceived: activity.reduce((s, r) => s + r.floatReceived, 0),
      payoutCount: activity.reduce((s, r) => s + r.payoutCount, 0),
      payoutAmount: activity.reduce((s, r) => s + r.payoutAmount, 0),
      commission: activity.reduce((s, r) => s + r.commission, 0),
    };

    const generatedAtLabel = eatNowLabel();
    const pdfBytes = await buildPdf({ dateStr, generatedAtLabel, phone, floats, floatTotal, activity, totals });

    const baseName = `welile-merchant-float-morning-${dateStr}`;
    const pdfPath = `${dateStr}/${baseName}.pdf`;
    const up = await supabase.storage.from('finops-reports').upload(pdfPath, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });
    if (up.error) throw up.error;

    const { data: saved, error: saveErr } = await supabase
      .from('merchant_float_morning_reports')
      .upsert(
        { report_date: dateStr, generated_at: new Date().toISOString(), pdf_path: pdfPath },
        { onConflict: 'report_date' },
      )
      .select()
      .single();
    if (saveErr) throw saveErr;

    if (!skipEmail) {
      const form = new FormData();
      form.set('from', FROM);
      recipients.forEach((r) => form.append('to', r));
      form.set('subject', `Merchant Float Morning Report – ${dateStr} (EAT)`);
      form.set('text', renderText({ dateStr, generatedAtLabel, phone, floats, floatTotal, activity, totals }));
      form.set('html', renderHtml({ dateStr, generatedAtLabel, phone, floats, floatTotal, activity, totals }));
      form.set('o:tag', 'merchant-float-morning');
      form.append('attachment', new Blob([pdfBytes], { type: 'application/pdf' }), `${baseName}.pdf`);

      const mgRes = await fetch(`${mailgunBaseUrl}/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`api:${mailgunApiKey}`) },
        body: form,
      });
      const mgText = await mgRes.text();
      if (!mgRes.ok) {
        console.error('Mailgun send failed', mgRes.status, mgText);
        return new Response(JSON.stringify({ ok: true, date: dateStr, id: saved?.id, emailError: mgText, emailStatus: mgRes.status }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase
        .from('merchant_float_morning_reports')
        .update({ emailed_at: new Date().toISOString() })
        .eq('id', saved.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        date: dateStr,
        id: saved.id,
        pdf_path: pdfPath,
        phone_money_total: phone.total,
        active_desks: floats.length,
        merchant_float_total: floatTotal,
        yesterday: totals,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-merchant-float-morning-report failed', err);
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey);
        await admin.from('system_events').insert({
          event_type: 'report_generation_failed',
          metadata: {
            report: 'merchant_float_morning',
            date: dateStr,
            error: String((err as any)?.message ?? err),
          },
        });
      }
    } catch (logErr) {
      console.error('failed to record report_generation_failed event', logErr);
    }
    return new Response(JSON.stringify({ error: String((err as any)?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

interface Payload {
  dateStr: string;
  generatedAtLabel: string;
  phone: PhoneMoney;
  floats: FloatRow[];
  floatTotal: number;
  activity: ActivityRow[];
  totals: { floatReceived: number; payoutCount: number; payoutAmount: number; commission: number };
}

function renderHtml(p: Payload) {
  const td = 'padding:4px 10px;border-bottom:1px solid #eee';
  const tdr = `${td};text-align:right;font-variant-numeric:tabular-nums`;
  const floatRows = p.floats
    .map((f) => `<tr><td style="${td}">${esc(f.name)}${f.label ? ` <span style="color:#888">(${esc(f.label)})</span>` : ''}</td><td style="${td}">${esc(f.phone)}</td><td style="${tdr}">${fmt(f.floatHeld)}</td></tr>`)
    .join('');
  const actRows = p.activity
    .map((a) => `<tr><td style="${td}">${esc(a.name)}</td><td style="${tdr}">${fmt(a.floatReceived)}</td><td style="${tdr}">${a.payoutCount}</td><td style="${tdr}">${fmt(a.payoutAmount)}</td><td style="${tdr}">${fmt(a.commission)}</td><td style="${tdr}">${fmt(a.floatHeld)}</td></tr>`)
    .join('');
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111">
    <h2 style="margin:0 0 4px">Merchant Float Morning Report</h2>
    <p style="color:#666;margin:0 0 16px">Activity day: ${p.dateStr} (EAT) • Balances as at ${p.generatedAtLabel} • Currency: UGX</p>

    <h3 style="margin:18px 0 6px">1. Phone Money — Right Now</h3>
    <table style="border-collapse:collapse;min-width:420px">
      <tr><td style="${td}">MTN MoMo balance</td><td style="${tdr}">${fmt(p.phone.mtn)}</td></tr>
      <tr><td style="${td}">Airtel Money balance</td><td style="${tdr}">${fmt(p.phone.airtel)}</td></tr>
      <tr><td style="${td}">Cash at hand (verified)</td><td style="${tdr}">${fmt(p.phone.cashAtHand)}</td></tr>
      <tr><td style="padding:6px 10px"><b>Total available now</b></td><td style="${tdr}"><b>${fmt(p.phone.total)}</b></td></tr>
    </table>

    <h3 style="margin:18px 0 6px">2. Merchant Float — Right Now (${p.floats.length} active agents, lowest first)</h3>
    <table style="border-collapse:collapse;min-width:520px">
      <tr><th style="${td};text-align:left">Agent</th><th style="${td};text-align:left">Float phone</th><th style="${td};text-align:right">Float balance</th></tr>
      ${floatRows}
      <tr><td style="padding:6px 10px"><b>Total merchant float</b></td><td></td><td style="${tdr}"><b>${fmt(p.floatTotal)}</b></td></tr>
    </table>

    <h3 style="margin:18px 0 6px">3. Yesterday's Agent Activity (${p.dateStr} EAT)</h3>
    <table style="border-collapse:collapse;min-width:640px">
      <tr>
        <th style="${td};text-align:left">Agent</th>
        <th style="${td};text-align:right">Float received</th>
        <th style="${td};text-align:right">Payouts</th>
        <th style="${td};text-align:right">Paid out</th>
        <th style="${td};text-align:right">Commission</th>
        <th style="${td};text-align:right">Float now</th>
      </tr>
      ${actRows}
      <tr>
        <td style="padding:6px 10px"><b>Total</b></td>
        <td style="${tdr}"><b>${fmt(p.totals.floatReceived)}</b></td>
        <td style="${tdr}"><b>${p.totals.payoutCount}</b></td>
        <td style="${tdr}"><b>${fmt(p.totals.payoutAmount)}</b></td>
        <td style="${tdr}"><b>${fmt(p.totals.commission)}</b></td>
        <td style="${tdr}"><b>${fmt(p.floatTotal)}</b></td>
      </tr>
    </table>
    <p style="color:#666;margin:16px 0 0">Full report attached as PDF. Scope: active merchant desks only.</p>
  </div>`;
}

function esc(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function renderText(p: Payload) {
  const lines = [
    'Merchant Float Morning Report',
    `Activity day: ${p.dateStr} (EAT) — balances as at ${p.generatedAtLabel}`,
    '',
    '1. PHONE MONEY — RIGHT NOW',
    `  MTN: ${fmt(p.phone.mtn)}`,
    `  Airtel: ${fmt(p.phone.airtel)}`,
    `  Cash at hand: ${fmt(p.phone.cashAtHand)}`,
    `  TOTAL: ${fmt(p.phone.total)}`,
    '',
    `2. MERCHANT FLOAT — RIGHT NOW (${p.floats.length} active agents, lowest first)`,
    ...p.floats.map((f) => `  ${f.name}: ${fmt(f.floatHeld)}`),
    `  TOTAL: ${fmt(p.floatTotal)}`,
    '',
    `3. YESTERDAY'S AGENT ACTIVITY (${p.dateStr} EAT)`,
    ...p.activity.map(
      (a) =>
        `  ${a.name}: received ${fmt(a.floatReceived)} | payouts ${a.payoutCount} (${fmt(a.payoutAmount)}) | commission ${fmt(a.commission)} | float now ${fmt(a.floatHeld)}`,
    ),
    `  TOTAL: received ${fmt(p.totals.floatReceived)} | payouts ${p.totals.payoutCount} (${fmt(p.totals.payoutAmount)}) | commission ${fmt(p.totals.commission)}`,
  ];
  return lines.join('\n');
}

async function buildPdf(p: Payload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 595.28, PAGE_H = 841.89, margin = 40;
  const col = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);
  const ink = col(17, 17, 17);
  const muted = col(110, 110, 120);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = 0;

  const header = () => {
    page.drawRectangle({ x: 0, y: PAGE_H - 96, width: PAGE_W, height: 96, color: col(88, 28, 135) });
    page.drawText('WELILE — Financial Operations', { x: margin, y: PAGE_H - 32, size: 10, font: bold, color: col(255, 255, 255) });
    page.drawText('Merchant Float Morning Report', { x: margin, y: PAGE_H - 56, size: 17, font: bold, color: col(255, 255, 255) });
    page.drawText(`Activity day: ${p.dateStr} (EAT)  •  Balances as at ${p.generatedAtLabel}`, { x: margin, y: PAGE_H - 76, size: 9, font, color: col(230, 220, 245) });
    page.drawText('Currency: UGX  •  Scope: active merchant desks (cashout_agents) only', { x: margin, y: PAGE_H - 89, size: 8.5, font, color: col(230, 220, 245) });
    y = PAGE_H - 124;
  };
  header();

  const ensure = (need: number) => {
    if (y - need < margin + 20) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      header();
    }
  };
  const title = (t: string) => {
    ensure(30);
    page.drawText(t, { x: margin, y, size: 12, font: bold, color: ink });
    y -= 18;
  };
  const row = (cells: { text: string; x: number; right?: number; b?: boolean; size?: number }[], shade = false) => {
    ensure(16);
    if (shade) page.drawRectangle({ x: margin, y: y - 4, width: PAGE_W - margin * 2, height: 16, color: col(245, 243, 250) });
    for (const c of cells) {
      const f = c.b ? bold : font;
      const size = c.size ?? 9;
      const x = c.right != null ? c.right - f.widthOfTextAtSize(c.text, size) : c.x;
      page.drawText(c.text, { x, y, size, font: f, color: ink });
    }
    y -= 15;
  };
  const R = PAGE_W - margin - 6;

  // Section 1
  title('1. Phone Money — Right Now');
  row([{ text: 'Line', x: margin + 6, b: true }, { text: 'Balance', right: R, b: true }], true);
  row([{ text: 'MTN MoMo', x: margin + 6 }, { text: fmt(p.phone.mtn), right: R }]);
  row([{ text: 'Airtel Money', x: margin + 6 }, { text: fmt(p.phone.airtel), right: R }]);
  row([{ text: 'Cash at hand (verified)', x: margin + 6 }, { text: fmt(p.phone.cashAtHand), right: R }]);
  row([{ text: 'Total available now', x: margin + 6, b: true }, { text: fmt(p.phone.total), right: R, b: true }], true);
  y -= 10;

  // Section 2
  title(`2. Merchant Float — Right Now (${p.floats.length} active agents, lowest first)`);
  row([
    { text: 'Agent', x: margin + 6, b: true },
    { text: 'Float phone', x: margin + 250, b: true },
    { text: 'Float balance', right: R, b: true },
  ], true);
  for (const f of p.floats) {
    row([
      { text: clip(f.name, 40), x: margin + 6 },
      { text: clip(f.phone, 16), x: margin + 250 },
      { text: fmt(f.floatHeld), right: R },
    ]);
  }
  row([{ text: 'Total merchant float', x: margin + 6, b: true }, { text: fmt(p.floatTotal), right: R, b: true }], true);
  y -= 10;

  // Section 3
  title(`3. Yesterday's Agent Activity — ${p.dateStr} (EAT)`);
  const c1 = margin + 6, c2 = margin + 235, c3 = margin + 300, c4 = margin + 385, c5 = margin + 455;
  row([
    { text: 'Agent', x: c1, b: true, size: 8.5 },
    { text: 'Float recd', right: c2 + 55, b: true, size: 8.5 },
    { text: '#', right: c3 + 22, b: true, size: 8.5 },
    { text: 'Paid out', right: c4 + 60, b: true, size: 8.5 },
    { text: 'Commission', right: c5 + 55, b: true, size: 8.5 },
    { text: 'Float now', right: R, b: true, size: 8.5 },
  ], true);
  for (const a of p.activity) {
    row([
      { text: clip(a.name, 28), x: c1, size: 8.5 },
      { text: fmt(a.floatReceived), right: c2 + 55, size: 8.5 },
      { text: String(a.payoutCount), right: c3 + 22, size: 8.5 },
      { text: fmt(a.payoutAmount), right: c4 + 60, size: 8.5 },
      { text: fmt(a.commission), right: c5 + 55, size: 8.5 },
      { text: fmt(a.floatHeld), right: R, size: 8.5 },
    ]);
  }
  row([
    { text: 'Total', x: c1, b: true, size: 8.5 },
    { text: fmt(p.totals.floatReceived), right: c2 + 55, b: true, size: 8.5 },
    { text: String(p.totals.payoutCount), right: c3 + 22, b: true, size: 8.5 },
    { text: fmt(p.totals.payoutAmount), right: c4 + 60, b: true, size: 8.5 },
    { text: fmt(p.totals.commission), right: c5 + 55, b: true, size: 8.5 },
    { text: fmt(p.floatTotal), right: R, b: true, size: 8.5 },
  ], true);

  y -= 16;
  ensure(20);
  page.drawText('Cash-flow planning report. Read-only: no deposits, general withdrawals or anomalies included.', {
    x: margin, y, size: 8, font, color: muted,
  });

  return await doc.save();
}

function clip(s: string, n: number) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
