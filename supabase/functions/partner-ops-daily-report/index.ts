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
      const trackW = pageWidth - margin - 62 - trackX;
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
    `Capital in excludes nothing except partner wallet withdrawals, which only move returns already counted above - they are not a second reduction of capital.`,
    margin, y, { maxWidth: pageWidth - margin * 2 },
  );
  y += 8;

  // ── Daily trend ──
  heading("Daily trend", "Per-day capital in versus returns settled - one column pair per calendar day in the window.");
  columnChart(
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
    { label: `Requested in period (${num(t.requested_count)})`, value: compactUGX(t.requested_amount), accent: BLUE },
    { label: `Applied in period (${num(t.applied_count)})`, value: compactUGX(t.applied_amount), accent: EMERALD },
    { label: `Pending now (${num(t.backlog_count)})`, value: compactUGX(t.backlog_amount), accent: AMBER },
    { label: `Applied all time (${num(t.applied_all_count)})`, value: compactUGX(t.applied_all_amount), accent: TEAL },
  ]);
  table(
    ["Top-up state", "Count", "Amount (UGX)"],
    [
      ["Requested in the window", num(t.requested_count), fmtUGX(t.requested_amount)],
      ["Applied in the window", num(t.applied_count), fmtUGX(t.applied_amount)],
      ["Rejected in the window", num(t.rejected_count), fmtUGX(t.rejected_amount)],
      ["Cancelled in the window", num(t.cancelled_count), fmtUGX(t.cancelled_amount)],
      ["Pending right now (all dates)", num(t.backlog_count), fmtUGX(t.backlog_amount)],
      ["Applied all time (all dates)", num(t.applied_all_count), fmtUGX(t.applied_all_amount)],
      [
        "Carried at renewal (window / last 90d)",
        `${num(t.renewal_topup_count)} / ${num(t.renewal_topup_count_90d)}`,
        `${fmtUGX(t.renewal_topup_amount)} / ${fmtUGX(t.renewal_topup_amount_90d)}`,
      ],
    ],
  );
  columnChart(
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
  heading(
    "Open queues - snapshot at generation time",
    "Work still sitting unfinished right now, regardless of when it arrived. Unlike every figure above, this is not limited to the reporting window.",
  );
  table(
    ["Queue - waiting for action", "Count", "Value"],
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
// ── HTML email — same layout language as the printed Partner Ops brief ──
function buildHtml(r: Report, win: { title: string; pretty: string }): string {
  const k = r.kpis || ({} as Record<string, number>);
  const t = r.topups || {};
  const b = r.backlog || ({} as Record<string, number>);
  const f = r.forecast;
  const days = Math.max(1, Number(r.days) || 1);
  const inflow = (Number(k.new_capital) || 0) + (Number(t.applied_amount) || 0);
  const outflow = Number(k.paid_out_amount) || 0;

  const tile = (label: string, value: string, sub: string, kind: "hero" | "good" | "bad" = "hero") => {
    const bg = kind === "good" ? "#f1fbf6" : kind === "bad" ? "#fff5f8" : "#faf8ff";
    const bc = kind === "good" ? "#c9ecdb" : kind === "bad" ? "#f6cfe0" : "#ece5fb";
    return `<td class="tile" width="33%" style="width:33.33%;padding:0 4px 8px 4px;vertical-align:top">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${bg};border:1px solid ${bc};border-radius:12px;">
        <tr><td style="padding:12px 14px">
          <div style="font-size:10px;color:#787484;text-transform:uppercase;font-weight:700;letter-spacing:.4px">${esc(label)}</div>
          <div class="tile-val" style="font-size:19px;font-weight:800;color:#1e1b2e;margin-top:4px;line-height:1.2">${esc(value)}</div>
          <div style="font-size:11px;color:#787484;margin-top:3px;line-height:1.4">${esc(sub)}</div>
        </td></tr>
      </table>
    </td>`;
  };
  const tiles = (cells: string[]) => {
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 3) {
      const grp = cells.slice(i, i + 3);
      while (grp.length < 3) grp.push('<td width="33%" style="width:33.33%"></td>');
      rows.push(`<tr>${grp.join("")}</tr>`);
    }
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;table-layout:fixed;margin-top:10px">${rows.join("")}</table>`;
  };
  let sectionNo = 0;
  const section = (title: string, note: string, inner: string) => {
    sectionNo += 1;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff;border:1px solid #e6e1f0;border-radius:14px;margin-top:16px;border-collapse:separate">
      <tr><td class="pad" style="padding:18px 20px">
        <div style="font-size:13px;font-weight:800;color:${PURPLE};text-transform:uppercase;letter-spacing:.4px">
          <span style="color:#9a94ab">${sectionNo}</span>&nbsp;&nbsp;${esc(title)}
        </div>
        ${note ? `<div style="font-size:12px;color:#787484;margin-top:6px;line-height:1.5">${esc(note)}</div>` : ""}
        ${inner}
      </td></tr>
    </table>`;
  };
  const dataTable = (head: string[], rows: string[][], foot?: string[]) => {
    const th = head.map((h, i) => `<th style="text-align:${i === 0 ? "left" : "right"};padding:7px 8px;font-size:10.5px;color:#787484;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e6e1f0">${esc(h)}</th>`).join("");
    const tb = rows.map(cells => `<tr>${cells.map((c, i) => `<td style="padding:7px 8px;font-size:12.5px;color:#1e1b2e;text-align:${i === 0 ? "left" : "right"};border-bottom:1px solid #f2eff9;white-space:${i === 0 ? "normal" : "nowrap"}">${esc(c)}</td>`).join("")}</tr>`).join("");
    const tf = foot ? `<tr>${foot.map((c, i) => `<td style="padding:8px;font-size:12.5px;font-weight:800;color:#1e1b2e;text-align:${i === 0 ? "left" : "right"};border-top:1px solid #e6e1f0;white-space:nowrap">${esc(c)}</td>`).join("")}</tr>` : "";
    return `<table class="data" role="presentation" width="100%" style="width:100%;border-collapse:collapse;margin-top:12px"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody>${tf ? `<tfoot>${tf}</tfoot>` : ""}</table>`;
  };
  const note = (txt: string) => `<div style="font-size:11.5px;color:#787484;margin-top:10px;line-height:1.55">${esc(txt)}</div>`;

  // Daily chart — capital in vs returns settled
  const maxSeries = Math.max(
    1,
    ...r.series.map((s: any) => Math.max(
      (Number(s.new_capital) || 0) + (Number(s.topups_applied) || 0),
      (Number(s.paid_out) || 0) + (Number(s.compounded) || 0),
    )),
  );
  const bars = r.series.map((s: any) => {
    const cin = (Number(s.new_capital) || 0) + (Number(s.topups_applied) || 0);
    const cout = (Number(s.paid_out) || 0) + (Number(s.compounded) || 0);
    const h = (v: number) => Math.max(v > 0 ? 3 : 0, Math.round((v / maxSeries) * 92));
    return `<td style="vertical-align:bottom;text-align:center;padding:0 2px">
      <div style="height:100px;font-size:0;line-height:0">
        <div style="display:inline-block;width:9px;height:${h(cin)}px;background:#0f9664;vertical-align:bottom;border-radius:3px 3px 0 0"></div>
        <div style="display:inline-block;width:9px;height:${h(cout)}px;background:#db2777;vertical-align:bottom;border-radius:3px 3px 0 0"></div>
      </div>
      <div style="font-size:9.5px;color:#787484;margin-top:5px">${esc(compactUGX(Math.max(cin, cout)))}</div>
      <div style="font-size:9.5px;color:${s.is_weekend ? "#b45309" : "#787484"};margin-top:2px">${esc(ascii(s.label))}</div>
    </td>`;
  }).join("");

  const modeRows = (r.mix?.by_mode || []).map((m: any) => [ascii(m.label ?? m.mode), num(m.portfolios ?? m.count), fmtUGX(m.amount ?? m.volume)]);
  const bandRows = (r.mix?.by_band || []).map((m: any) => [ascii(m.label ?? m.band), num(m.portfolios ?? m.count), fmtUGX(m.amount ?? m.volume)]);
  const forecastRows = (f.days || []).map((d: any) => [
    ascii(d.label ?? d.date),
    num(d.portfolios ?? d.count),
    fmtUGX(Number(d.total_amount ?? d.cash_due ?? d.amount ?? 0)),
  ]);

  const watch: string[] = [];
  if (Number(t.backlog_amount) > 0) watch.push(`Parked top-ups awaiting merge: ${num(t.backlog_count)} - ${fmtUGX(t.backlog_amount)}`);
  if (Number(b.pending_portfolios_count) > 0) watch.push(`Portfolios awaiting ops approval: ${num(b.pending_portfolios_count)} - ${fmtUGX(b.pending_portfolios_amount)}`);
  if (Number(k.renewals_count) > 0) watch.push(`Renewals in the window: ${num(k.renewals_count)} - ${fmtUGX(k.renewals_topup_amount)}`);
  if (Number(f.weekdays_total) + Number(f.weekend_total) > outflow) watch.push(`Next 7 days of returns (${fmtUGX(Number(f.weekdays_total) + Number(f.weekend_total))}) exceed the returns paid this window (${fmtUGX(outflow)}) - cover must come from new capital`);
  if (!watch.length) watch.push("No open exceptions - backlog, approvals and forecast cover are all clean.");

  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(`Partner Operations - ${win.title} - ${win.pretty}`)}</title>
  <style type="text/css">
    @media only screen and (max-width:600px) {
      .wrap { padding: 10px !important; }
      .pad { padding: 14px 12px !important; }
      .tile { display:block !important; width:100% !important; max-width:100% !important; }
      .tile-val { font-size: 17px !important; }
      table.data td, table.data th { padding: 6px 5px !important; font-size: 11.5px !important; }
    }
  </style>
</head><body style="margin:0;padding:0;background:#f6f4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e1b2e">
  <div class="wrap" style="padding:20px">
  <div style="max-width:700px;margin:0 auto">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${PURPLE};border-radius:14px">
      <tr><td class="pad" style="padding:22px 24px">
        <img src="${LOGO_URL}" alt="Welile" width="104" style="display:block;max-width:104px;height:auto;margin-bottom:10px" />
        <div style="color:#fff;font-size:19px;font-weight:800;letter-spacing:-.3px">Partner Operations - ${esc(win.title)}</div>
        <div style="color:#e8dcfa;font-size:12.5px;margin-top:6px;line-height:1.5">
          ${esc(win.pretty)} (EAT) · aggregate only, no partner names · source: Partner Ops book (portfolios, parked top-ups, compounding, returns ledger)
        </div>
      </td></tr>
    </table>

    ${section("Headline - the window", `Window is ${days} day${days === 1 ? "" : "s"} of EAT calendar activity. Capital in excludes compounded returns - compounding is a non-cash movement already inside portfolio principal.`, tiles([
      tile("Capital live (close)", compactUGX(k.total_capital), `${num(k.active_portfolios)} active portfolios`),
      tile("Capital in (cash)", fmtUGX(inflow), `${num(k.new_portfolios)} new · ${num(t.applied_count)} top-ups applied`, "good"),
      tile("Returns paid", fmtUGX(k.paid_out_amount), `${num(k.paid_out_count)} credits`, "good"),
      tile("Compounded", fmtUGX(k.compounded_amount), `${num(k.compounded_count)} portfolios (non-cash)`),
      tile("Net capital movement", fmtUGX(inflow - outflow), inflow - outflow >= 0 ? "net inflow" : "net outflow", inflow - outflow >= 0 ? "good" : "bad"),
      tile("Parked top-ups", fmtUGX(t.backlog_amount), `${num(t.backlog_count)} awaiting merge`, "bad"),
    ]))}

    ${section("Capital in - new money and top-ups", "New portfolio capital plus top-ups merged into existing portfolios. Parked top-ups are real money held but not yet inside capital live.", tiles([
      tile("New portfolio capital", fmtUGX(k.new_capital), `${num(k.new_portfolios)} portfolios`, "good"),
      tile("Top-ups applied", fmtUGX(t.applied_amount), `${num(t.applied_count)} top-ups`, "good"),
      tile("Top-ups requested", fmtUGX(t.requested_amount), `${num(t.requested_count)} requests`),
    ]) + `<div style="font-size:12px;font-weight:700;color:#1e1b2e;margin-top:16px">Daily capital in vs returns settled</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:8px"><tr>${bars}</tr></table>
      <div style="font-size:11px;color:#787484;margin-top:8px">
        <span style="color:#0f9664;font-weight:800">&#9632;</span> capital in &nbsp;
        <span style="color:#db2777;font-weight:800">&#9632;</span> returns settled &nbsp;· peak ${esc(compactUGX(maxSeries))}
      </div>` + dataTable(["Movement", "Count", "Volume"], [
        ["New portfolio capital", num(k.new_portfolios), fmtUGX(k.new_capital)],
        ["Top-ups applied", num(t.applied_count), fmtUGX(t.applied_amount)],
        ["Renewals", num(k.renewals_count), fmtUGX(k.renewals_topup_amount)],
        ["Parked top-ups (now)", num(t.backlog_count), fmtUGX(t.backlog_amount)],
      ], ["Capital in (cash)", "", fmtUGX(inflow)]))}

    ${section("Returns - paid and compounded", "Returns settled in the window split between cash credited to partner wallets and returns reinvested into principal.", tiles([
      tile("Paid in cash to wallets", fmtUGX(k.paid_out_amount), `${num(k.paid_out_count)} credits`, "good"),
      tile("Compounded (non-cash)", fmtUGX(k.compounded_amount), `${num(k.compounded_count)} portfolios`),
      tile("Returns settled", fmtUGX(Number(k.paid_out_amount) + Number(k.compounded_amount)), "cash plus compounded"),
    ]) + note("Compounded returns add to capital live but never to capital in or capital out - they never leave the business."))}

    ${section("Returns forecast - next 7 days", "Active portfolios whose next payout date falls in the coming week, valued at principal times monthly rate.", tiles([
      tile("Working days (Mon-Fri)", fmtUGX(f.weekdays_total), `${num(f.weekdays_count)} portfolios due`),
      tile("Weekend (Sat-Sun)", fmtUGX(f.weekend_total), `${num(f.weekend_count)} portfolios due`),
      tile("Total due", fmtUGX(Number(f.weekdays_total) + Number(f.weekend_total)), `${num(Number(f.weekdays_count) + Number(f.weekend_count))} portfolios`, "bad"),
    ]) + (forecastRows.length ? dataTable(["Day", "Portfolios due", "Cash due"], forecastRows) : ""))}

    ${(modeRows.length || bandRows.length) ? section("Portfolio mix", "Book composition by payout mode and ticket size at window close.",
      (modeRows.length ? dataTable(["Payout mode", "Portfolios", "Volume"], modeRows) : "") +
      (bandRows.length ? dataTable(["Ticket band", "Portfolios", "Volume"], bandRows) : "")) : ""}

    ${section("Watchlist", "Only items needing action are listed. Clean areas are omitted rather than printed as zeros.",
      watch.map(w => `<div style="border-left:3px solid #b45309;background:#fffdf5;border-radius:0 8px 8px 0;padding:9px 12px;margin-top:8px;font-size:12.5px;color:#1e1b2e">${esc(w)}</div>`).join(""))}

    <div style="padding:16px 6px;color:#787484;font-size:11px;text-align:center;line-height:1.6">
      ${esc(COMPANY_LOCATION)} · window ${esc(win.pretty)} (EAT), aggregated from the Partner Ops book at generation time.
      Figures in UGX. Ledger reads exclude admin corrections and system balance corrections. The attached PDF carries the same metrics with print charts.
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
