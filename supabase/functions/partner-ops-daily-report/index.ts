// Partner Ops — partnership operations report (branded PDF + HTML email).
//
// Metrics and charts only — no partner-level name tables. Supports daily,
// weekly, monthly and weekend windows.
//
// Options: { date, period: 'daily'|'weekly'|'monthly'|'weekend', start, end,
//            force, preview, pdf, to }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_RECIPIENTS = [
  "Atuhairecarol78@gmail.com",
  "jlukodda@gmail.com",
  "lkabahyma2015@gmail.com",
  "benjamin@welile.com",
];
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";
const EVENT_TYPE = "partner_ops_daily_report";
const LABEL = "partner-ops-daily-report";
const LOGO_URL = "https://welileapp.com/welile-logo.png";
const COMPANY_LOCATION = "Welile Technologies Ltd - Kabaale Palm Lane, Uganda";

type Admin = ReturnType<typeof createClient>;
type RGB = [number, number, number];
type Period = "daily" | "weekly" | "monthly" | "weekend";

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
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isoDow(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}
function prettify(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
function shortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** Resolve the reporting window for a period, anchored on `date` (EAT day). */
function resolveWindow(period: Period, date: string): { start: string; end: string; title: string; pretty: string } {
  if (period === "weekly") {
    const start = addDays(date, -6);
    return { start, end: date, title: "Weekly Report", pretty: `${shortDate(start)} - ${shortDate(date)}` };
  }
  if (period === "monthly") {
    const start = `${date.slice(0, 7)}-01`;
    return { start, end: date, title: "Monthly Report", pretty: `${shortDate(start)} - ${shortDate(date)}` };
  }
  if (period === "weekend") {
    // Most recent completed/ongoing Sat-Sun pair on or before `date`.
    const dow = isoDow(date);
    const sat = dow === 6 ? date : dow === 7 ? addDays(date, -1) : addDays(date, -(dow + 1));
    const sun = addDays(sat, 1);
    const end = sun > date ? date : sun;
    return { start: sat, end, title: "Weekend Report", pretty: `${shortDate(sat)} - ${shortDate(end)}` };
  }
  return { start: date, end: date, title: "Daily Report", pretty: prettify(date) };
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

// ── Report shape (metrics only) ──
interface Report {
  start_date: string;
  end_date: string;
  days: number;
  kpis: Record<string, number>;
  topups: Record<string, any>;
  backlog: Record<string, number>;
  series: any[];
  forecast: {
    days: any[];
    weekdays_total: number; weekdays_count: number;
    weekend_total: number; weekend_count: number;
  };
  mix: { by_mode: any[]; by_band: any[] };
}

async function loadReport(admin: Admin, start: string, end: string): Promise<Report> {
  const { data, error } = await admin.rpc("get_partner_ops_range_report", { p_start: start, p_end: end });
  if (error) throw new Error(`get_partner_ops_range_report failed: ${error.message}`);
  const r = (data || {}) as Report;
  r.kpis = r.kpis || {};
  r.topups = r.topups || {};
  r.backlog = r.backlog || ({} as any);
  r.series = r.series || [];
  r.forecast = r.forecast || { days: [], weekdays_total: 0, weekdays_count: 0, weekend_total: 0, weekend_count: 0 };
  r.forecast.days = r.forecast.days || [];
  r.mix = r.mix || { by_mode: [], by_band: [] };
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

// ── PDF (metrics + charts only) ──
function buildPdf(r: Report, win: { title: string; pretty: string }, logo: Uint8Array | null): Uint8Array {
  const k = r.kpis || ({} as Record<string, number>);
  const t = r.topups || {};
  const b = r.backlog || ({} as Record<string, number>);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const gap = 4;
  const generatedAt = new Date();
  const days = Math.max(1, Number(r.days) || 1);
  const perDay = (v: unknown) => Math.round((Number(v) || 0) / days);

  // Header band
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
  doc.text(`Partner Operations - ${win.title}`, titleX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(233, 222, 250);
  doc.text(COMPANY_LOCATION, titleX, 17.6);
  doc.text("Aggregate metrics only - no partner-level records", titleX, 22.6);
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Period: ${win.pretty}`, pageWidth - margin, 12, { align: "right" });
  doc.setTextColor(225, 210, 248);
  doc.text(
    `Generated ${generatedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT`,
    pageWidth - margin, 18, { align: "right" },
  );

  // KPI strip
  const cards: { label: string; value: string; sub: string; accent: RGB }[] = [
    { label: "Capital live", value: compactUGX(k.total_capital), sub: `${num(k.active_portfolios)} active portfolios`, accent: BRAND },
    { label: "Active partners", value: num(k.active_partners), sub: `${num(k.total_partners)} on file`, accent: VIOLET },
    { label: "Avg ticket", value: compactUGX(k.avg_ticket), sub: `avg return ${num(k.avg_return_rate)}% / month`, accent: BLUE },
    { label: "New capital (period)", value: compactUGX(k.new_capital), sub: `${num(k.new_portfolios)} new portfolios`, accent: EMERALD },
    { label: "Returns paid (period)", value: compactUGX(k.paid_out_amount), sub: `${num(k.paid_out_count)} payouts`, accent: ROSE },
    { label: "Compounded (period)", value: compactUGX(k.compounded_amount), sub: `${num(k.compounded_count)} portfolios`, accent: TEAL },
    { label: "Top-ups applied", value: compactUGX(t.applied_amount), sub: `${num(t.applied_count)} in period`, accent: AMBER },
    {
      label: "Net capital movement",
      value: compactUGX(
        (Number(k.new_capital) || 0) + (Number(t.applied_amount) || 0) + (Number(k.compounded_amount) || 0) -
          (Number(k.paid_out_amount) || 0),
      ),
      sub: "capital in minus returns paid",
      accent: SLATE,
    },
  ];
  const cols = 4;
  const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 21, startY = 35;
  cards.forEach((c, i) => {
    const x = margin + (i % cols) * (cardW + gap);
    const y0 = startY + Math.floor(i / cols) * (cardH + gap);
    doc.setFillColor(...tint(c.accent, 0.93));
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y0, cardW, cardH, 2, 2, "FD");
    doc.setFillColor(...c.accent);
    doc.roundedRect(x, y0, cardW, 2.4, 2, 2, "F");
    doc.rect(x, y0 + 1.4, cardW, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(c.label.toUpperCase(), x + 3.5, y0 + 8);
    doc.setFontSize(11.5);
    doc.setTextColor(...c.accent);
    doc.text(c.value, x + 3.5, y0 + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.9);
    doc.setTextColor(...MUTED);
    doc.text(c.sub, x + 3.5, y0 + 19);
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
      doc.setFontSize(9.4);
      doc.setTextColor(...it.accent);
      doc.text(it.value, x + 3, y + 11.5);
    });
    y += 19;
  };

  const barChart = (rows: { label: string; value: number; note?: string; color: RGB }[]) => {
    if (!rows.length) return;
    if (y > pageHeight - (rows.length * 7.4 + 14)) { doc.addPage(); y = 18; }
    const max = Math.max(1, ...rows.map((x) => Number(x.value) || 0));
    rows.forEach((bar) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(...INK);
      doc.text(ascii(bar.label), margin, y + 3.6);
      const trackX = margin + 34;
      const trackW = pageWidth - margin - 50 - trackX;
      doc.setFillColor(...tint(bar.color, 0.9));
      doc.roundedRect(trackX, y, trackW, 5, 1, 1, "F");
      const w = ((Number(bar.value) || 0) / max) * trackW;
      if (w > 0.4) {
        doc.setFillColor(...bar.color);
        doc.roundedRect(trackX, y, w, 5, 1, 1, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...bar.color);
      doc.text(`${compactUGX(bar.value)}${bar.note ? ` - ${bar.note}` : ""}`, pageWidth - margin, y + 3.6, { align: "right" });
      y += 7.4;
    });
    y += 5;
  };

  /** Grouped column chart for a daily series (two measures per day). */
  const columnChart = (
    points: { label: string; a: number; b: number; weekend?: boolean }[],
    legend: { a: string; b: string },
    colorA: RGB,
    colorB: RGB,
  ) => {
    if (!points.length) return;
    const chartH = 34;
    if (y > pageHeight - (chartH + 24)) { doc.addPage(); y = 18; }
    const plotX = margin + 2;
    const plotW = pageWidth - margin * 2 - 4;
    const baseY = y + chartH;
    const max = Math.max(1, ...points.map((p) => Math.max(Number(p.a) || 0, Number(p.b) || 0)));
    // axis
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(plotX, baseY, plotX + plotW, baseY);
    const slot = plotW / points.length;
    const barW = Math.min(6, Math.max(1.6, (slot - 2) / 2));
    points.forEach((p, i) => {
      const cx = plotX + i * slot + slot / 2;
      if (p.weekend) {
        doc.setFillColor(...tint(AMBER, 0.93));
        doc.rect(plotX + i * slot, y, slot, chartH, "F");
      }
      const ha = ((Number(p.a) || 0) / max) * (chartH - 2);
      const hb = ((Number(p.b) || 0) / max) * (chartH - 2);
      doc.setFillColor(...colorA);
      if (ha > 0.2) doc.rect(cx - barW - 0.4, baseY - ha, barW, ha, "F");
      doc.setFillColor(...colorB);
      if (hb > 0.2) doc.rect(cx + 0.4, baseY - hb, barW, hb, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(points.length > 16 ? 4.4 : 5.4);
      doc.setTextColor(...MUTED);
      const lbl = points.length > 16 ? ascii(p.label).slice(4, 6) : ascii(p.label).slice(0, 6);
      doc.text(lbl, cx, baseY + 3.4, { align: "center" });
    });
    y = baseY + 6;
    // legend + scale
    doc.setFontSize(6.2);
    doc.setFillColor(...colorA);
    doc.rect(margin, y - 2, 3, 3, "F");
    doc.setTextColor(...MUTED);
    doc.text(legend.a, margin + 4.5, y + 0.6);
    const off = margin + 4.5 + doc.getTextWidth(legend.a) + 6;
    doc.setFillColor(...colorB);
    doc.rect(off, y - 2, 3, 3, "F");
    doc.text(legend.b, off + 4.5, y + 0.6);
    doc.text(`Peak ${compactUGX(max)} - shaded columns are weekend days`, pageWidth - margin, y + 0.6, { align: "right" });
    y += 8;
  };

  /** Two-series line chart for a daily trend. */
  const lineChart = (
    points: { label: string; a: number; b: number; weekend?: boolean }[],
    legend: { a: string; b: string },
    colorA: RGB,
    colorB: RGB,
  ) => {
    if (!points.length) return;
    const chartH = 38;
    if (y > pageHeight - (chartH + 24)) { doc.addPage(); y = 18; }
    const plotX = margin + 2;
    const plotW = pageWidth - margin * 2 - 4;
    const baseY = y + chartH;
    const max = Math.max(1, ...points.map((p) => Math.max(Number(p.a) || 0, Number(p.b) || 0)));
    // weekend shading + gridlines
    const slot = plotW / Math.max(1, points.length);
    points.forEach((p, i) => {
      if (p.weekend) {
        doc.setFillColor(...tint(AMBER, 0.95));
        doc.rect(plotX + i * slot, y, slot, chartH, "F");
      }
    });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    [0.25, 0.5, 0.75].forEach((f) => doc.line(plotX, baseY - chartH * f, plotX + plotW, baseY - chartH * f));
    doc.setLineWidth(0.2);
    doc.line(plotX, baseY, plotX + plotW, baseY);
    const xAt = (i: number) => (points.length === 1 ? plotX + plotW / 2 : plotX + (i * plotW) / (points.length - 1));
    const yAt = (v: number) => baseY - ((Number(v) || 0) / max) * (chartH - 3);
    const drawSeries = (key: "a" | "b", color: RGB) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(0.7);
      points.forEach((p, i) => {
        if (i === 0) return;
        doc.line(xAt(i - 1), yAt(points[i - 1][key]), xAt(i), yAt(p[key]));
      });
      doc.setFillColor(...color);
      points.forEach((p, i) => doc.circle(xAt(i), yAt(p[key]), points.length > 20 ? 0.5 : 0.9, "F"));
    };
    drawSeries("a", colorA);
    drawSeries("b", colorB);
    // x labels
    doc.setFont("helvetica", "normal");
    doc.setFontSize(points.length > 16 ? 4.4 : 5.4);
    doc.setTextColor(...MUTED);
    const every = points.length > 20 ? Math.ceil(points.length / 12) : 1;
    points.forEach((p, i) => {
      if (i % every !== 0 && i !== points.length - 1) return;
      const lbl = points.length > 16 ? ascii(p.label).slice(4, 6) : ascii(p.label).slice(0, 6);
      doc.text(lbl, xAt(i), baseY + 3.4, { align: "center" });
    });
    y = baseY + 6;
    doc.setFontSize(6.2);
    doc.setFillColor(...colorA);
    doc.rect(margin, y - 2, 3, 3, "F");
    doc.setTextColor(...MUTED);
    doc.text(legend.a, margin + 4.5, y + 0.6);
    const off = margin + 4.5 + doc.getTextWidth(legend.a) + 6;
    doc.setFillColor(...colorB);
    doc.rect(off, y - 2, 3, 3, "F");
    doc.text(legend.b, off + 4.5, y + 0.6);
    doc.text(`Peak ${compactUGX(max)} - shaded bands are weekend days`, pageWidth - margin, y + 0.6, { align: "right" });
    y += 8;
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
      body: body.length ? body : [Array(head.length).fill("").map((_, i) => (i === 0 ? "No activity" : ""))],
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }])) as any,
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 9;
  };

  // ── Capital movement in the period ──
  heading("Capital movement in the period", `Every figure below is measured strictly inside ${win.pretty} (EAT).`);
  miniKpis([
    { label: "New capital", value: compactUGX(k.new_capital), accent: EMERALD },
    { label: "Top-ups applied", value: compactUGX(t.applied_amount), accent: AMBER },
    { label: "Compounded in", value: compactUGX(k.compounded_amount), accent: TEAL },
    { label: "Returns paid out", value: compactUGX(k.paid_out_amount), accent: ROSE },
    { label: "Cash-out of paid returns", value: compactUGX(k.withdrawals_completed_amount), accent: SLATE },
  ]);
  const inflow = (Number(k.new_capital) || 0) + (Number(t.applied_amount) || 0) + (Number(k.compounded_amount) || 0);
  const outflow = Number(k.paid_out_amount) || 0;
  barChart([
    { label: "Capital in", value: inflow, note: "new + top-ups + compounded", color: EMERALD },
    { label: "Capital out", value: outflow, note: "returns paid to partner wallets", color: ROSE },
    { label: "Net movement", value: Math.abs(inflow - outflow), note: inflow - outflow >= 0 ? "net inflow" : "net outflow", color: inflow - outflow >= 0 ? BLUE : AMBER },
  ]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Partner cash-out in the window: ${compactUGX(k.withdrawals_completed_amount)} (${num(k.withdrawals_completed_count)} withdrawals). This is returns already counted above being moved out of the wallet - it is not a second reduction of capital, so it is excluded from Capital out.`,
    margin, y, { maxWidth: pageWidth - margin * 2 },
  );
  y += 8;

  // ── Daily trend ──
  heading("Daily trend", "Per-day capital in versus returns settled - each point is one calendar day in the window.");
  lineChart(
    r.series.map((s: any) => ({
      label: ascii(s.label),
      a: (Number(s.new_capital) || 0) + (Number(s.topups_applied) || 0),
      b: (Number(s.paid_out) || 0) + (Number(s.compounded) || 0),
      weekend: !!s.is_weekend,
    })),
    { a: "Capital in (new + top-ups)", b: "Returns settled (paid + compounded)" },
    EMERALD,
    ROSE,
  );
  const wkEnd = r.series.filter((s: any) => s.is_weekend);
  const wkDay = r.series.filter((s: any) => !s.is_weekend);
  const sum = (rows: any[], key: string) => rows.reduce((a, x) => a + (Number(x[key]) || 0), 0);
  miniKpis([
    { label: "Avg capital in / day", value: compactUGX(perDay(inflow)), accent: EMERALD },
    { label: "Avg paid out / day", value: compactUGX(perDay(k.paid_out_amount)), accent: ROSE },
    { label: `Weekdays (${wkDay.length}d)`, value: compactUGX(sum(wkDay, "paid_out")), accent: BLUE },
    { label: `Weekend (${wkEnd.length}d)`, value: compactUGX(sum(wkEnd, "paid_out")), accent: AMBER },
  ]);

  // ── Top-ups (period accurate) ──
  heading(
    "Top-ups",
    "Top-ups only (portfolio creations are excluded). Requested = submitted inside the window; applied = merged into capital inside the window.",
  );
  miniKpis([
    { label: "Requested in period", value: `${num(t.requested_count)} - ${compactUGX(t.requested_amount)}`, accent: BLUE },
    { label: "Applied in period", value: `${num(t.applied_count)} - ${compactUGX(t.applied_amount)}`, accent: EMERALD },
    { label: "Rejected / cancelled", value: `${num((Number(t.rejected_count) || 0) + (Number(t.cancelled_count) || 0))} - ${compactUGX((Number(t.rejected_amount) || 0) + (Number(t.cancelled_amount) || 0))}`, accent: ROSE },
    { label: "At renewal", value: `${num(t.renewal_topup_count)} - ${compactUGX(t.renewal_topup_amount)}`, accent: TEAL },
  ]);
  lineChart(
    r.series.map((s: any) => ({
      label: ascii(s.label),
      a: Number(s.topups_requested) || 0,
      b: Number(s.topups_applied) || 0,
      weekend: !!s.is_weekend,
    })),
    { a: "Top-ups requested", b: "Top-ups applied" },
    BLUE,
    EMERALD,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Still waiting to be applied as at generation time: ${num(t.backlog_count)} top-ups worth ${compactUGX(t.backlog_amount)}, oldest ${num(t.backlog_oldest_days)} day(s). Detailed in the open-queues table below.`,
    margin, y, { maxWidth: pageWidth - margin * 2 },
  );
  y += 8;

  // ── Portfolio mix ──
  heading("Portfolio mix", "How live capital is distributed across return modes and ticket sizes.");
  barChart(
    (r.mix.by_mode || []).map((m: any, i: number) => ({
      label: ascii(m.label), value: Number(m.amount) || 0, note: `${num(m.count)} portfolios`,
      color: i === 0 ? TEAL : VIOLET,
    })),
  );
  barChart(
    (r.mix.by_band || []).map((m: any, i: number) => ({
      label: ascii(m.label), value: Number(m.amount) || 0, note: `${num(m.count)} portfolios`,
      color: [SLATE, BLUE, VIOLET, BRAND][i % 4],
    })),
  );

  // ── Forecast ──
  const f = r.forecast;
  heading("Payout forecast - next 7 days", "What falls due per day from the end of the reporting window.");
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

  // ── Backlog scoreboard ──
  heading("Operational backlog (as at now)", "Queues that partner operations must clear - counts and value, no names.");
  table(
    ["Queue", "Count", "Value"],
    [
      ["Portfolios awaiting ops approval", num(b.pending_portfolios_count), fmtUGX(b.pending_portfolios_amount)],
      ["Funder deployment queue", num(b.funder_queue_count), fmtUGX(b.funder_queue_amount)],
      ["Top-ups waiting to be applied", num(t.backlog_count), fmtUGX(t.backlog_amount)],
      ["Renewal requests pending", num(b.pending_renewal_requests), "-"],
      ["Redemption requests pending", num(b.pending_redemption_requests), "-"],
      ["Promissory notes pending", num(b.promissory_pending_count), fmtUGX(b.promissory_pending_amount)],
      ["Partner withdrawals in flight", num(b.withdrawals_pending_count), fmtUGX(b.withdrawals_pending_amount)],
    ],
  );

  // ── Period summary table ──
  heading("Period summary", `Window ${win.pretty} - ${days} day${days === 1 ? "" : "s"}.`);
  table(
    ["Metric", "Period total", "Daily average"],
    [
      ["New portfolios", num(k.new_portfolios), num(perDay(k.new_portfolios))],
      ["New capital", fmtUGX(k.new_capital), fmtUGX(perDay(k.new_capital))],
      ["Returns paid out", fmtUGX(k.paid_out_amount), fmtUGX(perDay(k.paid_out_amount))],
      ["Returns compounded", fmtUGX(k.compounded_amount), fmtUGX(perDay(k.compounded_amount))],
      ["Top-ups applied", fmtUGX(t.applied_amount), fmtUGX(perDay(t.applied_amount))],
      ["Renewals", num(k.renewals_count), num(perDay(k.renewals_count))],
      ["Promissory notes created", num(k.promissory_created_count), num(perDay(k.promissory_created_count))],
      ["Partner withdrawals completed", fmtUGX(k.withdrawals_completed_amount), fmtUGX(perDay(k.withdrawals_completed_amount))],
    ],
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

// ── Email HTML (metrics only) ──
function buildHtml(r: Report, win: { title: string; pretty: string }): string {
  const k = r.kpis || ({} as Record<string, number>);
  const t = r.topups || {};
  const b = r.backlog || ({} as Record<string, number>);
  const f = r.forecast;
  const days = Math.max(1, Number(r.days) || 1);
  const inflow = (Number(k.new_capital) || 0) + (Number(t.applied_amount) || 0) + (Number(k.compounded_amount) || 0);
  const outflow = (Number(k.paid_out_amount) || 0) + (Number(k.withdrawals_completed_amount) || 0);
  const tile = (label: string, value: string, sub: string, color: string) =>
    `<table class="tile" role="presentation" cellpadding="0" cellspacing="0" border="0" width="25%" align="left" style="width:25%;max-width:25%;border-collapse:collapse;">
       <tr><td style="padding:0 4px 8px 4px;vertical-align:top">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8ff;border:1px solid #ece5fb;border-radius:10px;">
           <tr><td style="padding:12px">
             <div style="font-size:10px;color:#787484;text-transform:uppercase;font-weight:700;letter-spacing:.4px">${esc(label)}</div>
             <div class="tile-val" style="font-size:18px;font-weight:800;color:${color};margin-top:3px;line-height:1.2">${esc(value)}</div>
             <div style="font-size:11px;color:#787484;margin-top:2px;line-height:1.4">${esc(sub)}</div>
           </td></tr>
         </table>
       </td></tr>
     </table>`;
  const row = (label: string, count: string, amount: string) =>
    `<tr>
      <td style="padding:9px 8px;border-bottom:1px solid #eee;font-size:13px;color:#333;">${esc(label)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #eee;font-size:13px;color:#111;text-align:right;font-weight:600;white-space:nowrap;">${esc(count)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #eee;font-size:13px;color:#111;text-align:right;font-weight:600;white-space:nowrap;">${esc(amount)}</td>
    </tr>`;
  const maxSeries = Math.max(1, ...r.series.map((s: any) => (Number(s.new_capital) || 0) + (Number(s.topups_applied) || 0) + (Number(s.paid_out) || 0) + (Number(s.compounded) || 0)));
  const bars = r.series.map((s: any) => {
    const cin = (Number(s.new_capital) || 0) + (Number(s.topups_applied) || 0);
    const cout = (Number(s.paid_out) || 0) + (Number(s.compounded) || 0);
    const h = (v: number) => Math.max(v > 0 ? 3 : 0, Math.round((v / maxSeries) * 90));
    return `<td style="vertical-align:bottom;text-align:center;padding:0 2px;">
      <div style="height:96px;position:relative;">
        <div style="display:inline-block;width:8px;height:${h(cin)}px;background:#109664;vertical-align:bottom;border-radius:2px 2px 0 0"></div>
        <div style="display:inline-block;width:8px;height:${h(cout)}px;background:#db2777;vertical-align:bottom;border-radius:2px 2px 0 0"></div>
      </div>
      <div style="font-size:9px;color:${s.is_weekend ? "#ca8a04" : "#787484"};margin-top:4px;">${esc(String(s.label).slice(4, 6))}</div>
    </td>`;
  }).join("");
  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style type="text/css">
    @media only screen and (max-width:600px) {
      .wrap { padding: 12px !important; }
      .pad { padding: 16px 14px !important; }
      .tile { width: 50% !important; max-width: 50% !important; }
      .tile-val { font-size: 16px !important; }
      table.data td { padding: 8px 6px !important; font-size: 12px !important; }
    }
    @media only screen and (max-width:400px) { .tile { width: 100% !important; max-width: 100% !important; } }
  </style>
</head><body style="margin:0;padding:0;background:#f6f6f8;font-family:Arial,Helvetica,sans-serif;">
  <div class="wrap" style="padding:24px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e6ec;">
    <div class="pad" style="background:${PURPLE};padding:20px 24px;">
      <img src="${LOGO_URL}" alt="Welile" width="110" style="display:block;max-width:110px;height:auto;margin-bottom:10px" />
      <div style="color:#fff;font-size:18px;font-weight:700;">Partner Operations - ${esc(win.title)}</div>
      <div style="color:#e8dcfa;font-size:13px;margin-top:4px;">${esc(win.pretty)} · ${esc(COMPANY_LOCATION)}</div>
    </div>
    <div class="pad" style="padding:20px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="padding:0">
        ${tile("Capital live", compactUGX(k.total_capital), `${num(k.active_portfolios)} active portfolios`, "#6c21c4")}
        ${tile("New capital", compactUGX(k.new_capital), `${num(k.new_portfolios)} new in period`, "#109664")}
        ${tile("Returns paid", compactUGX(k.paid_out_amount), `${num(k.paid_out_count)} payouts`, "#db2777")}
        ${tile("Top-ups applied", compactUGX(t.applied_amount), `${num(t.applied_count)} in period`, "#ca8a04")}
      </td></tr></table>
      <div style="margin-top:20px;font-size:12px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:.4px">Daily trend</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:8px;"><tr>${bars}</tr></table>
      <div style="font-size:11px;color:#787484;margin-top:6px;">
        <span style="color:#109664;font-weight:700;">■</span> capital in &nbsp;
        <span style="color:#db2777;font-weight:700;">■</span> returns settled &nbsp; · peak ${esc(compactUGX(maxSeries))}
      </div>
      <table class="data" role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;">
        <thead><tr>
          <th style="text-align:left;padding:8px;font-size:11px;color:#666;text-transform:uppercase;">Metric (${esc(String(days))} day window)</th>
          <th style="text-align:right;padding:8px;font-size:11px;color:#666;text-transform:uppercase;">Count</th>
          <th style="text-align:right;padding:8px;font-size:11px;color:#666;text-transform:uppercase;">Value</th>
        </tr></thead>
        <tbody>
          ${row("Capital in (new + top-ups + compounded)", "-", fmtUGX(inflow))}
          ${row("Capital out (returns + withdrawals)", "-", fmtUGX(outflow))}
          ${row("Net capital movement", "-", fmtUGX(inflow - outflow))}
          ${row("Returns compounded", num(k.compounded_count), fmtUGX(k.compounded_amount))}
          ${row("Top-ups requested", num(t.requested_count), fmtUGX(t.requested_amount))}
          ${row("Top-ups applied", num(t.applied_count), fmtUGX(t.applied_amount))}
          ${row("Top-up backlog (as at now)", num(t.backlog_count), fmtUGX(t.backlog_amount))}
          ${row("Renewals", num(k.renewals_count), fmtUGX(k.renewals_topup_amount))}
          ${row("Partner withdrawals completed", num(k.withdrawals_completed_count), fmtUGX(k.withdrawals_completed_amount))}
          ${row("Forecast - working days (Mon-Fri)", num(f.weekdays_count), fmtUGX(f.weekdays_total))}
          ${row("Forecast - weekend (Sat-Sun)", num(f.weekend_count), fmtUGX(f.weekend_total))}
          ${row("Portfolios awaiting ops approval", num(b.pending_portfolios_count), fmtUGX(b.pending_portfolios_amount))}
        </tbody>
      </table>
      <p style="font-size:13px;color:#555;line-height:1.6;margin-top:18px;">
        📎 <strong>Attached PDF</strong> — aggregate metrics and charts only: capital movement, daily trend,
        top-up flow, portfolio mix, 7-day payout forecast and the operational backlog. No partner-level records.
      </p>
    </div>
    <div style="padding:14px 24px;background:#faf8fe;color:#777;font-size:11px;">
      ${esc(COMPANY_LOCATION)} · automated Partner Ops brief
    </div>
  </div></div></body></html>`;
}

function buildText(r: Report, win: { title: string; pretty: string }): string {
  const k = r.kpis || ({} as Record<string, number>);
  const t = r.topups || {};
  return [
    `Partner Operations - ${win.title} (${win.pretty})`,
    `Capital live: ${fmtUGX(k.total_capital)} across ${num(k.active_portfolios)} active portfolios`,
    `New capital: ${fmtUGX(k.new_capital)} (${num(k.new_portfolios)} portfolios)`,
    `Returns paid: ${fmtUGX(k.paid_out_amount)} - compounded: ${fmtUGX(k.compounded_amount)}`,
    `Top-ups requested ${fmtUGX(t.requested_amount)} / applied ${fmtUGX(t.applied_amount)} / backlog ${fmtUGX(t.backlog_amount)}`,
    `Forecast Mon-Fri: ${fmtUGX(r.forecast.weekdays_total)} - weekend: ${fmtUGX(r.forecast.weekend_total)}`,
    `Full metrics report attached as PDF.`,
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

async function sendForPeriod(
  admin: Admin, period: Period, dateStr: string, force: boolean, overrideTo?: string[],
) {
  const recipients = overrideTo && overrideTo.length ? overrideTo : REPORT_RECIPIENTS;
  const win = resolveWindow(period, dateStr);
  if (!force) {
    const { data: existing } = await admin
      .from("system_events").select("id").eq("event_type", EVENT_TYPE)
      .contains("metadata", { date: dateStr, period }).limit(1).maybeSingle();
    if (existing) return { date: dateStr, period, skipped: true, reason: "Already sent" };
  }

  const report = await loadReport(admin, win.start, win.end);
  const logo = await fetchLogo();
  const html = buildHtml(report, win);
  const text = buildText(report, win);
  const pdf = buildPdf(report, win, logo);
  const filename = `Welile_Partner_Ops_${period}_${win.start}_${win.end}.pdf`;
  const k = report.kpis || ({} as Record<string, number>);
  const subject = `Partner Ops ${win.title} - ${win.pretty}: ${compactUGX(k.total_capital)} live, ${fmtUGX(k.paid_out_amount)} returns paid`;

  const results: Record<string, string> = {};
  let usedQueue = false;
  for (const to of recipients) {
    const sent = await sendWithAttachment(to, subject, html, text, pdf, filename);
    if (sent.ok) {
      results[to] = "sent with PDF";
    } else {
      console.error(`[${LABEL}] gmail send failed`, to, sent.status, sent.raw);
      usedQueue = true;
      results[to] = await queueFallback(admin, to, subject, html, text, `${period}:${dateStr}`, force);
    }
  }

  await admin.from("system_events").insert({
    event_type: EVENT_TYPE,
    metadata: { date: dateStr, period, window: { start: win.start, end: win.end }, recipients, kpis: report.kpis, results, pdf_bytes: pdf.length },
  });

  return { date: dateStr, period, window: win, recipients, results, pdf_bytes: pdf.length, usedQueue, kpis: report.kpis };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    const dateStr = typeof body?.date === "string" && body.date ? body.date.slice(0, 10) : eatToday();
    const period: Period = ["daily", "weekly", "monthly", "weekend"].includes(body?.period)
      ? body.period as Period
      : "daily";
    const win = resolveWindow(period, dateStr);
    const start = typeof body?.start === "string" && body.start ? body.start.slice(0, 10) : win.start;
    const end = typeof body?.end === "string" && body.end ? body.end.slice(0, 10) : win.end;
    const customWin = { ...win, pretty: start === end ? prettify(start) : `${shortDate(start)} - ${shortDate(end)}` };

    if (body?.pdf === true) {
      const report = await loadReport(admin, start, end);
      const pdf = buildPdf(report, customWin, await fetchLogo());
      return new Response(pdf, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Welile_Partner_Ops_${period}_${start}_${end}.pdf"`,
        },
      });
    }

    if (body?.preview === true) {
      const report = await loadReport(admin, start, end);
      return new Response(buildHtml(report, customWin), {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const overrideTo = Array.isArray(body?.to)
      ? body.to.filter((x: unknown) => typeof x === "string" && x.includes("@"))
      : typeof body?.to === "string" && body.to.includes("@")
        ? [body.to]
        : undefined;

    const report = await sendForPeriod(admin, period, dateStr, body?.force === true, overrideTo);

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
