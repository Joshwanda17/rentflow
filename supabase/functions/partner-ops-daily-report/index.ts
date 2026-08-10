// Partner Ops — daily partnership report (branded PDF + HTML email).
//
// Sections: headline KPIs, today's payouts & compounding, 7-day payout
// forecast (weekdays vs weekend), top-ups, pending portfolios, renewals,
// promissory notes and completed partner withdrawals.
//
// Options: { date, force, preview, pdf }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_RECIPIENTS = ["pexpert46@gmail.com", "grace.nation78@gmail.com"];
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";
const EVENT_TYPE = "partner_ops_daily_report";
const LABEL = "partner-ops-daily-report";
const LOGO_URL = "https://welileapp.com/welile-logo.png";
const COMPANY_LOCATION = "Welile Technologies Ltd - Kampala, Uganda";

type Admin = ReturnType<typeof createClient>;
type RGB = [number, number, number];

const BRAND: RGB = [105, 0, 204];
const BRAND_DARK: RGB = [66, 0, 128];
const INK: RGB = [30, 27, 46];
const MUTED: RGB = [120, 116, 132];
const BORDER: RGB = [226, 222, 236];
const EMERALD: RGB = [16, 150, 100];
const BLUE: RGB = [37, 99, 235];
const VIOLET: RGB = [124, 58, 237];
const TEAL: RGB = [13, 148, 136];
const AMBER: RGB = [202, 138, 4];
const ROSE: RGB = [219, 39, 119];
const SLATE: RGB = [100, 116, 139];
const PURPLE = "#6c21c4";

const tint = (c: RGB, amt: number): RGB => [
  Math.round(c[0] + (255 - c[0]) * amt),
  Math.round(c[1] + (255 - c[1]) * amt),
  Math.round(c[2] + (255 - c[2]) * amt),
];

const num = (n: unknown) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const fmtUGX = (n: unknown) => `UGX ${num(n)}`;
function compactUGX(n: unknown): string {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 1_000_000_000) return `UGX ${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `UGX ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `UGX ${(v / 1_000).toFixed(0)}k`;
  return `UGX ${num(v)}`;
}
function ascii(s: unknown): string {
  return String(s ?? "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim() || "-";
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function prettify(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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

// ── Report shape ──
interface Report {
  report_date: string;
  kpis: Record<string, number>;
  paid_today: any[];
  compounded_today: any[];
  forecast: {
    days: any[];
    weekdays_total: number; weekdays_count: number;
    weekend_total: number; weekend_count: number;
  };
  renewals: any;
  topups: any;
  pending_portfolios: any;
  promissory_notes: any;
  withdrawals: any;
}

async function loadReport(admin: Admin, dateStr: string): Promise<Report> {
  const { data, error } = await admin.rpc("get_partner_ops_daily_report", { p_date: dateStr });
  if (error) throw new Error(`get_partner_ops_daily_report failed: ${error.message}`);
  const r = (data || {}) as Report;
  r.paid_today = r.paid_today || [];
  r.compounded_today = r.compounded_today || [];
  r.forecast = r.forecast || { days: [], weekdays_total: 0, weekdays_count: 0, weekend_total: 0, weekend_count: 0 };
  r.forecast.days = r.forecast.days || [];
  return r;
}

async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (_e) {
    return null;
  }
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

// ── PDF ──
function buildPdf(r: Report, prettyDate: string, logo: Uint8Array | null): Uint8Array {
  const k = r.kpis || ({} as Record<string, number>);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const generatedAt = new Date();

  // Header band with logo + location
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 28, pageWidth, 1.5, "F");
  let titleX = margin;
  if (logo) {
    try {
      doc.addImage(`data:image/png;base64,${bytesToBase64(logo)}`, "PNG", margin, 5.5, 17, 17);
      titleX = margin + 21;
    } catch (_e) { titleX = margin; }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Partner Operations - Daily Report", titleX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(233, 222, 250);
  doc.text(COMPANY_LOCATION, titleX, 17.6);
  doc.text("Partnership capital, returns, top-ups and payout forecast", titleX, 22.6);
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Report day: ${prettyDate}`, pageWidth - margin, 12, { align: "right" });
  doc.setTextColor(225, 210, 248);
  doc.text(
    `Generated ${generatedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT`,
    pageWidth - margin, 18, { align: "right" },
  );

  // ── Main KPI strip ──
  const cards: { label: string; value: string; sub: string; accent: RGB }[] = [
    { label: "Total partners", value: num(k.total_partners), sub: `${num(k.total_portfolios)} portfolios on file`, accent: BRAND },
    { label: "Onboarded partners", value: num(k.onboarded_partners), sub: `${num(k.active_portfolios)} active portfolios`, accent: VIOLET },
    { label: "Total portfolios", value: num(k.total_portfolios), sub: `${compactUGX(k.total_capital)} capital live`, accent: BLUE },
    { label: "New portfolios today", value: num(k.new_portfolios_today), sub: `${compactUGX(k.new_capital_today)} new capital`, accent: EMERALD },
    { label: "Compounding portfolios", value: num(k.compounding_portfolios), sub: "returns rolled into capital", accent: TEAL },
    { label: "Monthly payouts", value: num(k.monthly_payout_portfolios), sub: "cash returns each cycle", accent: AMBER },
    { label: "Paid out today", value: compactUGX(k.paid_out_today_amount), sub: `${num(k.paid_out_today_count)} payouts`, accent: ROSE },
    { label: "Compounded today", value: compactUGX(k.compounded_today_amount), sub: `${num(k.compounded_today_count)} portfolios`, accent: SLATE },
  ];
  const cols = 4, gap = 4;
  const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 21, startY = 35;
  cards.forEach((c, i) => {
    const x = margin + (i % cols) * (cardW + gap);
    const y = startY + Math.floor(i / cols) * (cardH + gap);
    doc.setFillColor(...tint(c.accent, 0.93));
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
    doc.setFillColor(...c.accent);
    doc.roundedRect(x, y, cardW, 2.4, 2, 2, "F");
    doc.rect(x, y + 1.4, cardW, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(c.label.toUpperCase(), x + 3.5, y + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...c.accent);
    doc.text(c.value, x + 3.5, y + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.9);
    doc.setTextColor(...MUTED);
    doc.text(c.sub, x + 3.5, y + 19);
  });

  let y = startY + 2 * (cardH + gap) + 6;

  const heading = (title: string, subtitle?: string) => {
    if (y > pageHeight - 45) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text(title, margin, y);
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 1.8, pageWidth - margin, y + 1.8);
    y += 6;
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(...MUTED);
      doc.text(subtitle, margin, y);
      y += 4;
    }
  };

  const miniKpis = (items: { label: string; value: string; accent: RGB }[]) => {
    if (y > pageHeight - 30) { doc.addPage(); y = 18; }
    const n = items.length || 1;
    const w = (pageWidth - margin * 2 - gap * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = margin + i * (w + gap);
      doc.setFillColor(...tint(it.accent, 0.94));
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, w, 14, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.1);
      doc.setTextColor(...MUTED);
      doc.text(it.label.toUpperCase(), x + 3, y + 5.5);
      doc.setFontSize(10);
      doc.setTextColor(...it.accent);
      doc.text(it.value, x + 3, y + 11.5);
    });
    y += 19;
  };

  const barChart = (rows: { label: string; value: number; note?: string; color: RGB }[]) => {
    if (!rows.length) return;
    if (y > pageHeight - (rows.length * 7.4 + 14)) { doc.addPage(); y = 18; }
    const max = Math.max(1, ...rows.map((b) => Number(b.value) || 0));
    rows.forEach((b) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(...INK);
      doc.text(ascii(b.label), margin, y + 3.6);
      const trackX = margin + 34;
      const trackW = pageWidth - margin - 48 - trackX;
      doc.setFillColor(...tint(b.color, 0.9));
      doc.roundedRect(trackX, y, trackW, 5, 1, 1, "F");
      const w = ((Number(b.value) || 0) / max) * trackW;
      if (w > 0.4) {
        doc.setFillColor(...b.color);
        doc.roundedRect(trackX, y, w, 5, 1, 1, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...b.color);
      doc.text(`${compactUGX(b.value)}${b.note ? ` - ${b.note}` : ""}`, pageWidth - margin, y + 3.6, { align: "right" });
      y += 7.4;
    });
    y += 5;
  };

  const tableTheme = {
    theme: "grid" as const,
    styles: { fontSize: 7.4, cellPadding: 1.7, textColor: INK, lineColor: BORDER, lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255] as RGB, fontStyle: "bold" as const, fontSize: 7.2 },
    alternateRowStyles: { fillColor: [248, 245, 254] as RGB },
    margin: { left: margin, right: margin },
  };

  const table = (head: string[], body: (string | number)[][]) => {
    if (y > pageHeight - 40) { doc.addPage(); y = 18; }
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [head],
      body: body.length ? body : [Array(head.length).fill("").map((_, i) => (i === 0 ? "No records" : ""))],
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }])) as any,
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 9;
  };

  // ── Section 1: today's returns ──
  heading("Returns settled today", "Every partner paid in cash or compounded back into capital on the report day.");
  miniKpis([
    { label: "Paid out", value: compactUGX(k.paid_out_today_amount), accent: ROSE },
    { label: "Payout count", value: num(k.paid_out_today_count), accent: ROSE },
    { label: "Compounded", value: compactUGX(k.compounded_today_amount), accent: TEAL },
    { label: "Compound count", value: num(k.compounded_today_count), accent: TEAL },
  ]);
  barChart([
    { label: "Cash payouts", value: Number(k.paid_out_today_amount) || 0, note: `${num(k.paid_out_today_count)} payouts to ${num(k.paid_out_today_partners)} partners`, color: ROSE },
    { label: "Compounded", value: Number(k.compounded_today_amount) || 0, note: `${num(k.compounded_today_count)} portfolios`, color: TEAL },
  ]);
  table(
    ["Partner (paid out)", "Portfolio", "Principal", "Returns", "Paid to"],
    r.paid_today.slice(0, 200).map((p: any) => [
      ascii(p.name), ascii(p.portfolio_code), fmtUGX(p.principal), fmtUGX(p.roi),
      p.paid_to ? ascii(p.paid_to) : "Own wallet",
    ]),
  );
  table(
    ["Partner (compounded)", "Portfolio", "Principal", "Returns", "New amount"],
    r.compounded_today.slice(0, 200).map((p: any) => [
      ascii(p.name), ascii(p.portfolio_code), fmtUGX(p.principal), fmtUGX(p.roi), fmtUGX(p.new_amount),
    ]),
  );

  // ── Section 2: forecast ──
  const f = r.forecast;
  heading("Payout forecast - next 7 days", "What falls due per day, split between the 5 working days and the weekend.");
  miniKpis([
    { label: "Working days due", value: compactUGX(f.weekdays_total), accent: BLUE },
    { label: "Portfolios (Mon-Fri)", value: num(f.weekdays_count), accent: BLUE },
    { label: "Weekend due", value: compactUGX(f.weekend_total), accent: AMBER },
    { label: "Portfolios (Sat-Sun)", value: num(f.weekend_count), accent: AMBER },
  ]);
  barChart(
    f.days.map((d: any) => ({
      label: ascii(d.label),
      value: Number(d.total_amount) || 0,
      note: `${num(d.portfolios)} portfolios`,
      color: d.is_weekend ? AMBER : BLUE,
    })),
  );
  table(
    ["Due date", "Portfolios", "Cash payouts", "Compounding", "Total"],
    f.days.map((d: any) => [
      `${ascii(d.label)}${d.is_weekend ? " (weekend)" : ""}`,
      num(d.portfolios), fmtUGX(d.payout_amount), fmtUGX(d.compound_amount), fmtUGX(d.total_amount),
    ]),
  );

  // ── Section 3: top-ups ──
  const t = r.topups || {};
  heading("Top-ups", "Capital added to existing portfolios - parked top-ups await a manual merge.");
  miniKpis([
    { label: "Pending top-ups", value: num(t.pending_count), accent: AMBER },
    { label: "Pending value", value: compactUGX(t.pending_amount), accent: AMBER },
    { label: "Applied today", value: num(t.applied_today_count), accent: EMERALD },
    { label: "Applied value", value: compactUGX(t.applied_today_amount), accent: EMERALD },
  ]);
  table(
    ["Partner", "Amount", "Status"],
    (t.rows || []).slice(0, 30).map((x: any) => [ascii(x.name), fmtUGX(x.amount), ascii(x.status)]),
  );

  // ── Section 4: pending portfolios ──
  const pp = r.pending_portfolios || {};
  heading("Pending portfolios", "Deployments waiting on partner details or operations approval.");
  miniKpis([
    { label: "Pending portfolios", value: num(pp.count), accent: ROSE },
    { label: "Pending value", value: compactUGX(pp.amount), accent: ROSE },
    { label: "Renewal requests", value: num(pp.pending_renewal_requests), accent: VIOLET },
    { label: "Redemption requests", value: num(pp.pending_redemption_requests), accent: SLATE },
  ]);
  table(
    ["Partner", "Portfolio", "Amount", "Status"],
    (pp.rows || []).slice(0, 30).map((x: any) => [ascii(x.name), ascii(x.portfolio_code), fmtUGX(x.amount), ascii(x.status)]),
  );

  // ── Section 5: renewals ──
  const rn = r.renewals || {};
  heading("Renewed portfolios", "Renewals over the last 7 days, including any capital added at renewal.");
  miniKpis([
    { label: "Renewed today", value: num(rn.today_count), accent: EMERALD },
    { label: "Renewed (7 days)", value: num(rn.week_count), accent: EMERALD },
    { label: "Top-up at renewal", value: compactUGX(rn.week_topup_amount), accent: TEAL },
  ]);
  table(
    ["Partner", "Portfolio", "Amount", "Top-up", "Source"],
    (rn.rows || []).slice(0, 30).map((x: any) => [
      ascii(x.name), ascii(x.portfolio_code), fmtUGX(x.amount), fmtUGX(x.top_up), ascii(x.source),
    ]),
  );

  // ── Section 6: promissory notes ──
  const pn = r.promissory_notes || {};
  heading("Promissory notes", "Offline partnership commitments captured by agents.");
  miniKpis([
    { label: "Created today", value: num(pn.created_today), accent: BLUE },
    { label: "Value today", value: compactUGX(pn.created_today_amount), accent: BLUE },
    { label: "Pending", value: `${num(pn.pending_count)} - ${compactUGX(pn.pending_amount)}`, accent: AMBER },
    { label: "Verified", value: `${num(pn.verified_count)} - ${compactUGX(pn.verified_amount)}`, accent: EMERALD },
  ]);
  table(
    ["Partner", "Agent", "Amount", "Status"],
    (pn.rows || []).slice(0, 30).map((x: any) => [ascii(x.partner_name), ascii(x.agent_name), fmtUGX(x.amount), ascii(x.status)]),
  );

  // ── Section 7: withdrawals ──
  const wd = r.withdrawals || {};
  heading("Completed withdrawals", "Partner cash-outs settled on the report day.");
  miniKpis([
    { label: "Completed", value: num(wd.completed_today_count), accent: VIOLET },
    { label: "Value", value: compactUGX(wd.completed_today_amount), accent: VIOLET },
  ]);
  table(
    ["Partner", "Method", "Amount"],
    (wd.rows || []).slice(0, 40).map((x: any) => [ascii(x.name), ascii(x.method), fmtUGX(x.amount)]),
  );

  // Footers
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${COMPANY_LOCATION} - confidential partner operations analytics`, margin, pageHeight - 5);
    doc.text(`Page ${p} / ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

// ── Email HTML ──
function buildHtml(r: Report, prettyDate: string): string {
  const k = r.kpis || ({} as Record<string, number>);
  const f = r.forecast;
  const tile = (label: string, value: string, sub: string, color: string) =>
    `<td style="width:25%;background:#faf8ff;border-radius:10px;padding:12px;vertical-align:top">
       <div style="font-size:10px;color:#787484;text-transform:uppercase;font-weight:700">${esc(label)}</div>
       <div style="font-size:18px;font-weight:800;color:${color};margin-top:2px">${esc(value)}</div>
       <div style="font-size:11px;color:#787484">${esc(sub)}</div>
     </td>`;
  const row = (label: string, count: string, amount: string) =>
    `<tr>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${esc(label)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111;text-align:right;font-weight:600;">${esc(count)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111;text-align:right;font-weight:600;">${esc(amount)}</td>
    </tr>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f6f6f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e6ec;">
    <div style="background:${PURPLE};padding:20px 24px;">
      <img src="${LOGO_URL}" alt="Welile" width="110" style="display:block;max-width:110px;height:auto;margin-bottom:10px" />
      <div style="color:#fff;font-size:18px;font-weight:700;">Partner Operations - Daily Report</div>
      <div style="color:#e8dcfa;font-size:13px;margin-top:4px;">${esc(prettyDate)} · ${esc(COMPANY_LOCATION)}</div>
    </div>
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:separate;border-spacing:6px 0;"><tr>
        ${tile("Partners", num(k.total_partners), `${num(k.onboarded_partners)} onboarded`, "#6c21c4")}
        ${tile("Portfolios", num(k.total_portfolios), `${num(k.new_portfolios_today)} new today`, "#2563eb")}
        ${tile("Paid out today", compactUGX(k.paid_out_today_amount), `${num(k.paid_out_today_count)} payouts · ${num(k.paid_out_today_partners)} partners`, "#db2777")}
        ${tile("Compounded today", compactUGX(k.compounded_today_amount), `${num(k.compounded_today_count)} portfolios`, "#0d9488")}
      </tr></table>
      <table style="width:100%;border-collapse:collapse;margin-top:18px;">
        <thead><tr>
          <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;text-transform:uppercase;">Section</th>
          <th style="text-align:right;padding:8px 12px;font-size:12px;color:#666;text-transform:uppercase;">Count</th>
          <th style="text-align:right;padding:8px 12px;font-size:12px;color:#666;text-transform:uppercase;">Value</th>
        </tr></thead>
        <tbody>
          ${row("Compounding portfolios", num(k.compounding_portfolios), "-")}
          ${row("Monthly payout portfolios", num(k.monthly_payout_portfolios), "-")}
          ${row("Forecast - working days (Mon-Fri)", num(f.weekdays_count), fmtUGX(f.weekdays_total))}
          ${row("Forecast - weekend (Sat-Sun)", num(f.weekend_count), fmtUGX(f.weekend_total))}
          ${row("Pending top-ups", num(r.topups?.pending_count), fmtUGX(r.topups?.pending_amount))}
          ${row("Pending portfolios", num(r.pending_portfolios?.count), fmtUGX(r.pending_portfolios?.amount))}
          ${row("Renewed portfolios (7 days)", num(r.renewals?.week_count), fmtUGX(r.renewals?.week_topup_amount))}
          ${row("Promissory notes pending", num(r.promissory_notes?.pending_count), fmtUGX(r.promissory_notes?.pending_amount))}
          ${row("Promissory notes verified", num(r.promissory_notes?.verified_count), fmtUGX(r.promissory_notes?.verified_amount))}
          ${row("Completed withdrawals today", num(r.withdrawals?.completed_today_count), fmtUGX(r.withdrawals?.completed_today_amount))}
        </tbody>
      </table>
      <p style="font-size:13px;color:#555;line-height:1.6;margin-top:18px;">
        📎 <strong>Attached PDF</strong> — headline KPIs, today's payout and compounding registers,
        the 7-day payout forecast, top-ups, pending portfolios, renewals, promissory notes and completed withdrawals.
      </p>
    </div>
    <div style="padding:14px 24px;background:#faf8fe;color:#777;font-size:11px;">
      ${esc(COMPANY_LOCATION)} · automated Partner Ops brief
    </div>
  </div></body></html>`;
}

function buildText(r: Report, prettyDate: string): string {
  const k = r.kpis || ({} as Record<string, number>);
  return [
    `Partner Operations - Daily Report (${prettyDate})`,
    `Total partners: ${num(k.total_partners)} (onboarded ${num(k.onboarded_partners)})`,
    `Portfolios: ${num(k.total_portfolios)} - new today ${num(k.new_portfolios_today)}`,
    `Compounding: ${num(k.compounding_portfolios)} · Monthly payouts: ${num(k.monthly_payout_portfolios)}`,
    `Paid out today: ${num(k.paid_out_today_count)} payouts to ${num(k.paid_out_today_partners)} partners - ${fmtUGX(k.paid_out_today_amount)}`,
    `Compounded today: ${num(k.compounded_today_count)} - ${fmtUGX(k.compounded_today_amount)}`,
    `Forecast Mon-Fri: ${fmtUGX(r.forecast.weekdays_total)} · weekend: ${fmtUGX(r.forecast.weekend_total)}`,
    `Full report attached as PDF.`,
  ].join("\n");
}

// ── Gmail attachment delivery ──
function chunk76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trim();
}
async function sendWithAttachment(
  to: string, subject: string, html: string, text: string, pdf: Uint8Array, filename: string,
): Promise<{ ok: boolean; status: number; raw?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !gmailKey) return { ok: false, status: 0, raw: "Gmail connector creds missing" };

  const boundary = `welile_${crypto.randomUUID().replace(/-/g, "")}`;
  const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
  const pdfB64 = chunk76(bytesToBase64(pdf));
  const htmlB64 = chunk76(bytesToBase64(new TextEncoder().encode(html)));
  const textB64 = chunk76(bytesToBase64(new TextEncoder().encode(text)));
  const encodedSubject = /[^\x00-\x7F]/.test(subject)
    ? `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(subject))}?=`
    : subject;
  const raw = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
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
    textB64,
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    "",
    `--${altBoundary}--`,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    pdfB64,
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
  const body = await res.text();
  return { ok: res.ok, status: res.status, raw: body };
}

async function queueFallback(
  admin: Admin, to: string, subject: string, html: string, text: string, dateStr: string, force: boolean,
) {
  const messageId = crypto.randomUUID();
  const unsubscribeToken = await ensureUnsubscribeToken(admin, to);
  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: LABEL,
    recipient_email: to,
    status: "pending",
    metadata: { subject, date: dateStr },
  });
  const { error } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId, to, from: FROM, sender_domain: SENDER_DOMAIN,
      subject, html, text, purpose: "transactional", label: LABEL,
      idempotency_key: `${LABEL}:${dateStr}:${to}${force ? `:${messageId}` : ""}`,
      unsubscribe_token: unsubscribeToken, queued_at: new Date().toISOString(),
    },
  });
  return error ? `queue error: ${error.message}` : "queued (no attachment)";
}

async function sendForDate(admin: Admin, dateStr: string, force: boolean, overrideTo?: string[]) {
  const recipients = overrideTo && overrideTo.length ? overrideTo : REPORT_RECIPIENTS;
  if (!force) {
    const { data: existing } = await admin
      .from("system_events").select("id").eq("event_type", EVENT_TYPE)
      .contains("metadata", { date: dateStr }).limit(1).maybeSingle();
    if (existing) return { date: dateStr, skipped: true, reason: "Already sent" };
  }

  const report = await loadReport(admin, dateStr);
  const prettyDate = prettify(dateStr);
  const logo = await fetchLogo();
  const html = buildHtml(report, prettyDate);
  const text = buildText(report, prettyDate);
  const pdf = buildPdf(report, prettyDate, logo);
  const filename = `Welile_Partner_Ops_${dateStr}.pdf`;
  const k = report.kpis || ({} as Record<string, number>);
  const subject = `Partner Ops - ${prettyDate}: ${num(k.total_portfolios)} portfolios, ${fmtUGX(k.paid_out_today_amount)} paid today`;

  const results: Record<string, string> = {};
  let usedQueue = false;
  for (const to of recipients) {
    const sent = await sendWithAttachment(to, subject, html, text, pdf, filename);
    if (sent.ok) {
      results[to] = "sent with PDF";
    } else {
      console.error(`[${LABEL}] gmail send failed`, to, sent.status, sent.raw);
      usedQueue = true;
      results[to] = await queueFallback(admin, to, subject, html, text, dateStr, force);
    }
  }

  await admin.from("system_events").insert({
    event_type: EVENT_TYPE,
    metadata: { date: dateStr, recipients, kpis: report.kpis, results, pdf_bytes: pdf.length },
  });

  return { date: dateStr, recipients, results, pdf_bytes: pdf.length, usedQueue, kpis: report.kpis };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    const dateStr = typeof body?.date === "string" && body.date ? body.date.slice(0, 10) : eatToday();

    if (body?.pdf === true) {
      const report = await loadReport(admin, dateStr);
      const pdf = buildPdf(report, prettify(dateStr), await fetchLogo());
      return new Response(pdf, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Welile_Partner_Ops_${dateStr}.pdf"`,
        },
      });
    }

    if (body?.preview === true) {
      const report = await loadReport(admin, dateStr);
      return new Response(buildHtml(report, prettify(dateStr)), {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const report = await sendForDate(admin, dateStr, body?.force === true);

    if ((report as any).usedQueue) {
      fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: "{}",
      }).catch((e) => console.error(`[${LABEL}] dispatch trigger failed:`, e));
    }

    return new Response(JSON.stringify({ success: true, report }), {
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