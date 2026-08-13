// Tenant Products & Services — Daily Report (branded PDF + HTML email).
//
// Reads the same server-side RPCs the Tenant Ops dashboard hub uses, so the
// emailed numbers always reconcile with the on-screen tool.
//
// Options: { date, start, end, force, preview, pdf, to }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_RECIPIENTS = ["natashakisakye33@gmail.com"];
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";
const EVENT_TYPE = "tenant_products_services_daily_report";
const LABEL = "tenant-products-daily-report";
const LOGO_URL = "https://welileapp.com/welile-logo.png";
const COMPANY_LOCATION = "Welile Technologies Ltd - Kabaale Palm Lane, Uganda";

type Admin = ReturnType<typeof createClient>;
type RGB = [number, number, number];

const BRAND: RGB = [105, 0, 204];
const BRAND_DARK: RGB = [66, 0, 128];
const INK: RGB = [30, 27, 46];
const MUTED: RGB = [120, 116, 132];
const GOOD: RGB = [22, 130, 80];
const BAD: RGB = [180, 60, 50];

function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const num = (n: unknown) => Math.round(Number(n || 0)).toLocaleString();
const fmtUGX = (n: unknown) => `UGX ${num(n)}`;
function shortDate(d: string) {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch (_e) { return d; }
}
function pctLabel(current: number, previous: number): string {
  const c = Number(current || 0), p = Number(previous || 0);
  if (!p) return c > 0 ? "new" : "0%";
  const v = ((c - p) / p) * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function chunk76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trim();
}
function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (_e) { return null; }
}

// ── Data ──
interface Report {
  period: { from: string; to: string; days: number; previous_from: string; previous_to: string };
  current: Record<string, number>;
  previous: Record<string, number>;
  outstanding_payables: number;
  outstanding_payables_count: number;
  tenant_register_total: number;
  series: Record<string, number | string>[];
  application_status: { status: string; n: number }[];
  districts: { district: string; paying_tenants: number; collected: number }[];
}

async function loadReport(admin: Admin, start: string, end: string): Promise<Report> {
  const { data, error } = await admin.rpc("ops_tenant_products_services_report", { p_from: start, p_to: end });
  if (error) throw new Error(`report rpc: ${error.message}`);
  return data as unknown as Report;
}

async function loadRows(admin: Admin, start: string, end: string) {
  const all: any[] = [];
  let offset = 0;
  const PAGE = 2000;
  while (true) {
    const { data, error } = await admin.rpc("ops_tenant_products_services_rows", {
      p_from: start, p_to: end, p_search: null, p_district: null, p_agent: null,
      p_status: "all", p_payment: "all", p_limit: PAGE, p_offset: offset,
    });
    if (error) throw new Error(`rows rpc: ${error.message}`);
    const rows = (data ?? []) as any[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
    if (offset > 40000) break;
  }
  return all;
}

// ── PDF ──
function buildPdf(r: Report, rows: any[], logo: Uint8Array | null): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const c = r.current, p = r.previous;

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 26, "F");
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 5, 16, 16); } catch (_e) { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Tenant Products & Services — Daily Report", margin + (logo ? 20 : 0), 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${shortDate(r.period.from)}${r.period.from === r.period.to ? "" : ` → ${shortDate(r.period.to)}`} · East Africa Time`,
    margin + (logo ? 20 : 0),
    20,
  );
  doc.text(COMPANY_LOCATION, pageWidth - margin, 20, { align: "right" });

  let y = 34;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(
    `Compared with ${shortDate(r.period.previous_from)} → ${shortDate(r.period.previous_to)} · tenant register ${num(r.tenant_register_total)} accounts`,
    margin, y,
  );
  y += 6;

  // KPI grid
  const kpis: { label: string; value: string; sub?: string; color?: RGB }[] = [
    { label: "New Tenants", value: num(c.new_tenants), sub: pctLabel(c.new_tenants, p.new_tenants) },
    { label: "Active Tenants (paid)", value: num(c.active_tenants), sub: pctLabel(c.active_tenants, p.active_tenants), color: GOOD },
    { label: "Applications", value: num(c.applications), sub: pctLabel(c.applications, p.applications) },
    { label: "Accepted", value: num(c.accepted), sub: pctLabel(c.accepted, p.accepted), color: GOOD },
    { label: "Rejected", value: num(c.rejected), sub: pctLabel(c.rejected, p.rejected), color: BAD },
    { label: "Rent Collected", value: fmtUGX(c.collected), sub: pctLabel(c.collected, p.collected), color: GOOD },
    { label: "Receivables (money in)", value: fmtUGX(c.collected), sub: `${num(c.payments)} payments` },
    { label: "Payables raised", value: fmtUGX(c.payables), sub: pctLabel(c.payables, p.payables), color: BAD },
    { label: "Payables still unpaid", value: fmtUGX(r.outstanding_payables), sub: `${num(r.outstanding_payables_count)} payouts`, color: BAD },
    { label: "Acceptance rate", value: `${Number(c.applications) ? Math.round((Number(c.accepted) / Number(c.applications)) * 100) : 0}%` },
  ];
  const cols = 5;
  const cardW = (pageWidth - margin * 2 - (cols - 1) * 3) / cols;
  const cardH = 19;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cardW + 3);
    const cy = y + row * (cardH + 3);
    doc.setFillColor(247, 245, 252);
    doc.roundedRect(x, cy, cardW, cardH, 2, 2, "F");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(k.label.toUpperCase(), x + 3, cy + 5.5, { maxWidth: cardW - 6 });
    doc.setTextColor(...(k.color ?? INK));
    doc.setFontSize(10);
    doc.text(k.value, x + 3, cy + 12);
    if (k.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(k.sub, x + 3, cy + 16.5);
    }
  });
  y += Math.ceil(kpis.length / cols) * (cardH + 3) + 4;

  // Daily trend table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Daily movement", margin, y);
  y += 2;
  autoTable(doc, {
    startY: y + 1,
    head: [["Day", "New tenants", "Applications", "Accepted", "Rejected", "Paying tenants", "Collected", "Landlord payouts"]],
    body: (r.series ?? []).map((s: any) => [
      shortDate(String(s.day)),
      num(s.new_tenants), num(s.applications), num(s.accepted), num(s.rejected),
      num(s.paid_tenants), fmtUGX(s.collected), fmtUGX(s.payables),
    ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontSize: 7 },
    alternateRowStyles: { fillColor: [250, 248, 253] },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Districts
  if ((r.districts ?? []).length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Top districts by rent collected", margin, y);
    autoTable(doc, {
      startY: y + 2,
      head: [["District", "Paying tenants", "Collected"]],
      body: r.districts.map((d) => [d.district, num(d.paying_tenants), fmtUGX(d.collected)]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
      headStyles: { fillColor: BRAND_DARK, textColor: [255, 255, 255], fontSize: 7 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Tenant detail
  doc.addPage("a4", "landscape");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_DARK);
  doc.text(`Tenants in this window (${num(rows.length)})`, margin, 16);
  autoTable(doc, {
    startY: 20,
    head: [["#", "Tenant", "Phone", "District", "Agent", "Type", "Application", "Paid", "Payments", "Outstanding", "Landlord payout"]],
    body: rows.map((t, i) => [
      i + 1,
      t.tenant_name ?? "—",
      t.tenant_phone ?? "—",
      t.district ?? "—",
      t.agent_name ?? "Unassigned",
      t.is_new_in_period ? "New" : "Existing",
      t.accepted_in_period ? `${t.application_status ?? "—"} (accepted)` : t.rejected_in_period ? `${t.application_status ?? "—"} (rejected)` : (t.application_status ?? "—"),
      fmtUGX(t.paid_in_period),
      num(t.payments_in_period),
      fmtUGX(t.outstanding),
      fmtUGX(t.payables_in_period),
    ]),
    theme: "striped",
    styles: { fontSize: 6.5, cellPadding: 1.2, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontSize: 6.5 },
    margin: { left: margin, right: margin },
  });

  // Footer note on last page
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "Definitions — New Tenants: tenant accounts created in the window. Active Tenants: distinct tenants with at least one recorded rent collection. Applications: rent requests created. Accepted: requests that reached final operations approval. Rejected: requests rejected. Rent Collected / Receivables: recorded tenant rent collections. Payables: landlord payout obligations raised in the window; \"still unpaid\" is the all-time balance of payouts not yet completed. Whole-system figures, no row caps, East Africa Time. Confidential — Welile internal report.",
    margin, Math.min(finalY, 195), { maxWidth: pageWidth - margin * 2 },
  );

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Email bodies ──
function buildHtml(r: Report): string {
  const c = r.current, p = r.previous;
  const row = (label: string, value: string, delta?: string) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#4b4658;font-size:13px">${label}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:700;color:#1e1b2e;font-size:13px;text-align:right">${value}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#787484;font-size:12px;text-align:right">${delta ?? ""}</td>
    </tr>`;
  return `<!doctype html><html><body style="margin:0;background:#f6f4fb;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:20px">
    <div style="background:#6900cc;color:#fff;border-radius:12px 12px 0 0;padding:18px 20px">
      <div style="font-size:18px;font-weight:700">Tenant Products &amp; Services — Daily Report</div>
      <div style="font-size:12px;opacity:.9;margin-top:4px">${shortDate(r.period.from)}${r.period.from === r.period.to ? "" : ` → ${shortDate(r.period.to)}`} · East Africa Time</div>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:6px 10px 14px">
      <table style="width:100%;border-collapse:collapse">
        ${row("New tenants", num(c.new_tenants), pctLabel(c.new_tenants, p.new_tenants))}
        ${row("Active tenants (paid)", num(c.active_tenants), pctLabel(c.active_tenants, p.active_tenants))}
        ${row("Applications", num(c.applications), pctLabel(c.applications, p.applications))}
        ${row("Accepted", num(c.accepted), pctLabel(c.accepted, p.accepted))}
        ${row("Rejected", num(c.rejected), pctLabel(c.rejected, p.rejected))}
        ${row("Rent collected", fmtUGX(c.collected), pctLabel(c.collected, p.collected))}
        ${row("Receivables (money in)", fmtUGX(c.collected), `${num(c.payments)} payments`)}
        ${row("Payables raised (landlord payouts)", fmtUGX(c.payables), pctLabel(c.payables, p.payables))}
        ${row("Payables still unpaid (all-time)", fmtUGX(r.outstanding_payables), `${num(r.outstanding_payables_count)} payouts`)}
        ${row("Tenant register (all-time)", num(r.tenant_register_total), "")}
      </table>
      <p style="color:#787484;font-size:12px;margin:14px 10px 0">Percentages compare with ${shortDate(r.period.previous_from)} → ${shortDate(r.period.previous_to)}. The full tenant-level report is attached as a PDF.</p>
    </div>
    <p style="color:#9b96a8;font-size:11px;text-align:center;margin-top:14px">${COMPANY_LOCATION}</p>
  </div></body></html>`;
}

function buildText(r: Report): string {
  const c = r.current, p = r.previous;
  return [
    `Tenant Products & Services — ${shortDate(r.period.from)}${r.period.from === r.period.to ? "" : ` to ${shortDate(r.period.to)}`} (EAT)`,
    `New tenants: ${num(c.new_tenants)} (${pctLabel(c.new_tenants, p.new_tenants)})`,
    `Active tenants: ${num(c.active_tenants)} (${pctLabel(c.active_tenants, p.active_tenants)})`,
    `Applications: ${num(c.applications)} - accepted ${num(c.accepted)} - rejected ${num(c.rejected)}`,
    `Rent collected: ${fmtUGX(c.collected)} across ${num(c.payments)} payments`,
    `Payables raised: ${fmtUGX(c.payables)} - still unpaid ${fmtUGX(r.outstanding_payables)}`,
    `Tenant register: ${num(r.tenant_register_total)} accounts`,
    `Full tenant-level report attached as PDF.`,
  ].join("\n");
}

// ── Delivery ──
async function sendWithAttachment(
  to: string, subject: string, html: string, text: string, pdf: Uint8Array, filename: string,
): Promise<{ ok: boolean; status: number; raw?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !gmailKey) return { ok: false, status: 0, raw: "Gmail connector creds missing" };

  const boundary = `welile_${crypto.randomUUID().replace(/-/g, "")}`;
  const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    chunk76(bytesToBase64(new TextEncoder().encode(text))),
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    chunk76(bytesToBase64(new TextEncoder().encode(html))),
    "",
    `--${altBoundary}--`,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    chunk76(bytesToBase64(pdf)),
    "",
    `--${boundary}--`,
  ].join("\r\n");
  const encoded = bytesToBase64(new TextEncoder().encode(raw))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch(
    "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
      body: JSON.stringify({ raw: encoded }),
    },
  );
  return { ok: res.ok, status: res.status, raw: await res.text() };
}

async function ensureUnsubscribeToken(admin: Admin, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens").select("token").eq("email", normalized).maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = generateToken();
  await admin.from("email_unsubscribe_tokens")
    .upsert({ token, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
  const { data: stored } = await admin
    .from("email_unsubscribe_tokens").select("token").eq("email", normalized).maybeSingle();
  return (stored?.token as string) || token;
}

async function queueFallback(
  admin: Admin, to: string, subject: string, html: string, text: string, key: string, force: boolean,
) {
  const messageId = crypto.randomUUID();
  const unsubscribeToken = await ensureUnsubscribeToken(admin, to);
  await admin.from("email_send_log").insert({
    message_id: messageId, template_name: LABEL, recipient_email: to,
    status: "pending", metadata: { subject, key },
  });
  const { error } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId, to, from: FROM, sender_domain: SENDER_DOMAIN,
      subject, html, text, purpose: "transactional", label: LABEL,
      idempotency_key: `${LABEL}:${key}:${to}${force ? `:${messageId}` : ""}`,
      unsubscribe_token: unsubscribeToken, queued_at: new Date().toISOString(),
    },
  });
  return error ? `queue error: ${error.message}` : "queued (no attachment)";
}

async function sendReport(
  admin: Admin, start: string, end: string, force: boolean, overrideTo?: string[], tag = "midnight",
) {
  const recipients = overrideTo && overrideTo.length ? overrideTo : REPORT_RECIPIENTS;
  const key = `${start}:${end}:${tag}`;
  if (!force) {
    const { data: existing } = await admin
      .from("system_events").select("id").eq("event_type", EVENT_TYPE)
      .contains("metadata", { key }).limit(1).maybeSingle();
    if (existing) return { key, skipped: true, reason: "Already sent" };
  }

  const report = await loadReport(admin, start, end);
  const rows = await loadRows(admin, start, end);
  const pdf = buildPdf(report, rows, await fetchLogo());
  const html = buildHtml(report);
  const text = buildText(report);
  const filename = `Welile_Tenant_Products_Services_${start}${start === end ? "" : `_${end}`}.pdf`;
  const c = report.current;
  const subject = `Tenant Products & Services ${shortDate(start)}: ${num(c.new_tenants)} new tenants, ${fmtUGX(c.collected)} collected`;

  const results: Record<string, string> = {};
  let usedQueue = false;
  for (const to of recipients) {
    const sent = await sendWithAttachment(to, subject, html, text, pdf, filename);
    if (sent.ok) {
      results[to] = "sent with PDF";
    } else {
      console.error(`[${LABEL}] gmail send failed`, to, sent.status, sent.raw);
      usedQueue = true;
      results[to] = await queueFallback(admin, to, subject, html, text, key, force);
    }
  }

  await admin.from("system_events").insert({
    event_type: EVENT_TYPE,
    metadata: {
      key, tag, window: { start, end }, recipients, results,
      tenant_rows: rows.length, pdf_bytes: pdf.length, metrics: report.current,
    },
  });

  return { key, tag, window: { start, end }, recipients, results, tenant_rows: rows.length, pdf_bytes: pdf.length, usedQueue, metrics: report.current };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch (_e) { body = {}; }

    const dateStr = typeof body?.date === "string" && body.date ? body.date.slice(0, 10) : eatToday();
    const start = typeof body?.start === "string" && body.start ? body.start.slice(0, 10) : dateStr;
    const end = typeof body?.end === "string" && body.end ? body.end.slice(0, 10) : dateStr;

    if (body?.pdf === true) {
      const report = await loadReport(admin, start, end);
      const rows = await loadRows(admin, start, end);
      const pdf = buildPdf(report, rows, await fetchLogo());
      return new Response(pdf, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Welile_Tenant_Products_Services_${start}.pdf"`,
        },
      });
    }

    if (body?.preview === true) {
      const report = await loadReport(admin, start, end);
      return new Response(buildHtml(report), {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const overrideTo = Array.isArray(body?.to)
      ? body.to.filter((x: unknown) => typeof x === "string" && (x as string).includes("@"))
      : typeof body?.to === "string" && body.to.includes("@")
        ? [body.to]
        : undefined;

    const result = await sendReport(
      admin, start, end, body?.force === true, overrideTo,
      typeof body?.tag === "string" && body.tag ? body.tag : "midnight",
    );

    if ((result as any).usedQueue) {
      fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: "{}",
      }).catch((e) => console.error(`[${LABEL}] dispatch trigger failed:`, e));
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[${LABEL}] Fatal:`, err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
