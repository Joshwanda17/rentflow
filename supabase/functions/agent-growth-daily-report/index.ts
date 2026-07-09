// Agent Growth Leaderboard — daily morning report.
//
// Regenerates the same branded "Agent & Sub-Agent Growth Analytics" PDF that
// the executive Agent-Ops leaderboard exports, and emails it as a PDF
// ATTACHMENT (with a proper subject + rich body) to the fixed recipients.
//
// Delivery uses the Gmail connector (multipart/mixed MIME) because the Lovable
// email queue cannot carry file attachments.
//
// Scheduled every morning at 07:00 EAT (04:00 UTC) via pg_cron.
// Idempotent per EAT day via an `agent_growth_daily_report` system_event
// (bypass with { force: true }). Period configurable via { period } — defaults
// to "monthly" (matches the leaderboard's default view).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fixed recipients for the morning growth report.
const REPORT_RECIPIENTS = ["benjamin@welile.com", "pexpert46@gmail.com"];

type Period = "daily" | "weekly" | "monthly" | "yearly";
type RGB = [number, number, number];

const BRAND: RGB = [105, 0, 204];
const BRAND_DARK: RGB = [66, 0, 128];
const INK: RGB = [30, 27, 46];
const MUTED: RGB = [120, 116, 132];
const STRIPE: RGB = [244, 240, 252];
const BORDER: RGB = [226, 222, 236];
const EMERALD: RGB = [16, 150, 100];
const BLUE: RGB = [37, 99, 235];
const VIOLET: RGB = [124, 58, 237];
const TEAL: RGB = [13, 148, 136];
const AMBER: RGB = [202, 138, 4];
const RED: RGB = [201, 42, 42];
const SLATE: RGB = [100, 116, 139];

const fmtInt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
const fmtAvg = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(n) || 0);
const tint = (c: RGB, amt: number): RGB =>
  [Math.round(c[0] + (255 - c[0]) * amt), Math.round(c[1] + (255 - c[1]) * amt), Math.round(c[2] + (255 - c[2]) * amt)];
const trendPct = (curr: number, prev: number) => (!prev ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);

interface LeaderboardStats {
  period: Period;
  window_start: string;
  totals: {
    total_agents: number;
    total_subagents: number;
    verified_subagents: number;
    pending_subagents: number;
    new_agents: number;
    new_subagents: number;
    prev_agents: number;
    prev_subagents: number;
  };
  series: { bucket: string; agents: number; subagents: number }[];
  top_recruiters: { agent_id: string; name: string; phone: string | null; invited: number; verified: number }[];
  invitees: { status: string }[];
}

function bucketLabel(iso: string, period: Period): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const mon = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const yr2 = String(d.getUTCFullYear()).slice(2);
  switch (period) {
    case "daily": return `${day} ${mon}`;
    case "weekly": return `${mon} ${day}`;
    case "monthly": return `${mon} ${yr2}`;
    case "yearly": return String(d.getUTCFullYear());
  }
}

// Calendar date (YYYY-MM-DD) in East Africa Time (UTC+3, no DST).
function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Build the branded PDF (mirror of src/lib/agentGrowthReportPdf.ts) ──
function buildPdf(stats: LeaderboardStats, period: Period): Uint8Array {
  const periodNoun =
    period === "daily" ? "today" :
    period === "weekly" ? "this week" :
    period === "yearly" ? "this year" : "this month";
  const trendNoun =
    period === "daily" ? "30d" :
    period === "weekly" ? "12w" :
    period === "yearly" ? "5y" : "12mo";
  const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
  const scopeLabel = `${periodLabel} · trailing ${trendNoun}`;

  const t = stats.totals;
  const series = (stats.series || []).map((s) => ({
    label: bucketLabel(s.bucket, period), agents: s.agents || 0, subagents: s.subagents || 0,
  }));
  const recruiters = (stats.top_recruiters || []).map((r) => ({
    name: r.name, phone: r.phone, invited: r.invited || 0, verified: r.verified || 0,
  }));
  const inv = stats.invitees || [];
  const inviteeStatus = {
    verified: inv.filter((i) => i.status === "verified").length,
    pending: inv.filter((i) => i.status === "pending_acceptance").length,
    expired: inv.filter((i) => i.status === "expired").length,
    rejected: inv.filter((i) => i.status === "rejected").length,
    total: inv.length,
  };

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const generatedAt = new Date();

  const agentTrend = trendPct(t.new_agents, t.prev_agents);
  const subTrend = trendPct(t.new_subagents, t.prev_subagents);
  const buckets = series.length || 1;
  const avgAgents = series.reduce((s, r) => s + r.agents, 0) / buckets;
  const avgSubs = series.reduce((s, r) => s + r.subagents, 0) / buckets;
  const verifiedRate = t.total_subagents > 0 ? (t.verified_subagents / t.total_subagents) * 100 : 0;
  const subPerAgent = t.total_agents > 0 ? t.total_subagents / t.total_agents : 0;
  const netNew = t.new_agents + t.new_subagents;
  const netTrend = trendPct(netNew, t.prev_agents + t.prev_subagents);

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 26, pageWidth, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Agent & Sub-Agent Growth Analytics", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(235, 225, 250);
  doc.text("Recruitment & network growth report", margin, 18.5);
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(scopeLabel, pageWidth - margin, 11, { align: "right" });
  doc.setTextColor(225, 210, 248);
  doc.text(
    `Generated ${generatedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT`,
    pageWidth - margin, 17, { align: "right" },
  );

  // KPI strip
  const cards: { label: string; value: string; sub?: string; accent: RGB }[] = [
    { label: "Total Agents", value: fmtInt(t.total_agents), sub: `${fmtInt(t.new_agents)} new ${periodNoun}`, accent: BRAND },
    { label: "Total Sub-Agents", value: fmtInt(t.total_subagents), sub: `${fmtInt(t.verified_subagents)} verified · ${fmtInt(t.pending_subagents)} pending`, accent: VIOLET },
    { label: `New Agents (${periodNoun})`, value: fmtInt(t.new_agents), sub: `${fmtPct(agentTrend)} vs prev`, accent: EMERALD },
    { label: `New Sub-Agents (${periodNoun})`, value: fmtInt(t.new_subagents), sub: `${fmtPct(subTrend)} vs prev`, accent: AMBER },
    { label: "Avg Agents / period", value: fmtAvg(avgAgents), sub: `over ${buckets} periods`, accent: BLUE },
    { label: "Avg Sub-Agents / period", value: fmtAvg(avgSubs), sub: `over ${buckets} periods`, accent: TEAL },
    { label: "Verified Rate", value: `${Math.round(verifiedRate)}%`, sub: "of all sub-agents", accent: EMERALD },
    { label: "Sub-Agents / Agent", value: fmtAvg(subPerAgent), sub: "network depth", accent: SLATE },
  ];
  const cols = 4, gap = 4;
  const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 21, startY = 33;
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
    doc.setFontSize(6.6);
    doc.setTextColor(...MUTED);
    doc.text(c.label.toUpperCase(), x + 3.5, y + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...c.accent);
    doc.text(c.value, x + 3.5, y + 15);
    if (c.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.4);
      doc.setTextColor(...MUTED);
      doc.text(c.sub, x + 3.5, y + 19);
    }
  });

  // Executive summary
  const summaryTop = startY + 2 * (cardH + gap) + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Executive Summary", margin, summaryTop);
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.line(margin, summaryTop + 1.8, pageWidth - margin, summaryTop + 1.8);
  const topRecruiter = recruiters[0];
  const insights: string[] = [
    `Network now spans ${fmtInt(t.total_agents)} agents and ${fmtInt(t.total_subagents)} sub-agents — a depth of ${fmtAvg(subPerAgent)} sub-agents per agent.`,
    `${fmtInt(netNew)} new members joined ${periodNoun} (${fmtInt(t.new_agents)} agents, ${fmtInt(t.new_subagents)} sub-agents), ${netTrend >= 0 ? "up" : "down"} ${fmtPct(Math.abs(netTrend)).replace("+", "")} versus the previous period.`,
    `${Math.round(verifiedRate)}% of sub-agents are verified (${fmtInt(t.verified_subagents)} verified, ${fmtInt(t.pending_subagents)} pending) — ${verifiedRate >= 70 ? "a healthy activation rate" : "an opportunity to tighten onboarding follow-up"}.`,
  ];
  if (topRecruiter && topRecruiter.invited > 0) {
    insights.push(
      `Top recruiter ${topRecruiter.name} brought in ${fmtInt(topRecruiter.invited)} invitees (${Math.round((topRecruiter.verified / topRecruiter.invited) * 100)}% verified) this period.`,
    );
  }
  const boxTop = summaryTop + 5;
  const lineH = 5.6;
  const boxH = insights.length * lineH + 6;
  doc.setFillColor(...tint(BRAND, 0.95));
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, boxTop, pageWidth - margin * 2, boxH, 2, 2, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  doc.setTextColor(...INK);
  let iy = boxTop + 6.5;
  insights.forEach((line) => {
    doc.setFillColor(...BRAND);
    doc.circle(margin + 4, iy - 1.4, 0.9, "F");
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2 - 12) as string[];
    doc.text(wrapped, margin + 7, iy);
    iy += lineH * wrapped.length;
  });

  // Growth table
  let sectionTop = boxTop + boxH + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Growth by Period", margin, sectionTop);
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.line(margin, sectionTop + 1.8, pageWidth - margin, sectionTop + 1.8);
  const totalAgentsSeries = series.reduce((s, r) => s + r.agents, 0);
  const totalSubsSeries = series.reduce((s, r) => s + r.subagents, 0);
  const growthBody = series.map((r, i) => {
    const prev = i > 0 ? series[i - 1] : null;
    const total = r.agents + r.subagents;
    const prevTotal = prev ? prev.agents + prev.subagents : 0;
    const g = prev ? trendPct(total, prevTotal) : 0;
    return [r.label, fmtInt(r.agents), fmtInt(r.subagents), fmtInt(total), i === 0 ? "—" : fmtPct(g)];
  });
  autoTable(doc, {
    startY: sectionTop + 4,
    head: [["Period", "New Agents", "New Sub-Agents", "Total", "Growth %"]],
    body: growthBody,
    foot: [["Totals", fmtInt(totalAgentsSeries), fmtInt(totalSubsSeries), fmtInt(totalAgentsSeries + totalSubsSeries), ""]],
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { fontSize: 8, cellPadding: 2, valign: "middle", textColor: INK, lineColor: BORDER, lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8, fontStyle: "bold", halign: "left" },
    footStyles: { fillColor: tint(BRAND, 0.85), textColor: BRAND_DARK, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: STRIPE },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 34, halign: "right" },
      2: { cellWidth: 40, halign: "right" },
      3: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      4: { cellWidth: 28, halign: "right" },
    },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 4) {
        const raw = String(data.cell.raw || "");
        if (raw.startsWith("+")) { data.cell.styles.textColor = EMERALD; data.cell.styles.fontStyle = "bold"; }
        else if (raw.startsWith("-")) { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = "bold"; }
      }
    },
  });

  // Top recruiters
  let afterTop = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_DARK);
  doc.text(`Top Recruiters (${periodNoun})`, margin, afterTop);
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.line(margin, afterTop + 1.8, pageWidth - margin, afterTop + 1.8);
  const recBody = recruiters.map((r, i) => {
    const rate = r.invited > 0 ? (r.verified / r.invited) * 100 : 0;
    return [`#${i + 1}`, r.name || "Unknown", r.phone || "—", fmtInt(r.invited), fmtInt(r.verified), `${Math.round(rate)}%`];
  });
  autoTable(doc, {
    startY: afterTop + 4,
    head: [["Rank", "Recruiter", "Phone", "Invited", "Verified", "Verify %"]],
    body: recBody.length ? recBody : [["—", "No recruitment activity in this period", "", "", "", ""]],
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { fontSize: 8, cellPadding: 2, valign: "middle", textColor: INK, lineColor: BORDER, lineWidth: 0.1 },
    headStyles: { fillColor: VIOLET, textColor: 255, fontSize: 8, fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: STRIPE },
    columnStyles: {
      0: { cellWidth: 16, fontStyle: "bold", textColor: BRAND },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 34, textColor: MUTED },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 24, halign: "right", textColor: EMERALD },
      5: { cellWidth: 24, halign: "right" },
    },
  });

  // Invitee pipeline
  if (inviteeStatus.total > 0) {
    const s = inviteeStatus;
    let pipeTop = (doc as any).lastAutoTable.finalY + 8;
    if (pipeTop > pageHeight - 40) { doc.addPage(); pipeTop = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Invitee Pipeline", margin, pipeTop);
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.4);
    doc.line(margin, pipeTop + 1.8, pageWidth - margin, pipeTop + 1.8);
    const pct = (n: number) => (s.total > 0 ? `${Math.round((n / s.total) * 100)}%` : "0%");
    autoTable(doc, {
      startY: pipeTop + 4,
      head: [["Stage", "Invitees", "Share"]],
      body: [
        ["Verified", fmtInt(s.verified), pct(s.verified)],
        ["Pending acceptance", fmtInt(s.pending), pct(s.pending)],
        ["Expired", fmtInt(s.expired), pct(s.expired)],
        ["Rejected", fmtInt(s.rejected), pct(s.rejected)],
      ],
      foot: [["Total invitees", fmtInt(s.total), "100%"]],
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      styles: { fontSize: 8, cellPadding: 2, valign: "middle", textColor: INK, lineColor: BORDER, lineWidth: 0.1 },
      headStyles: { fillColor: TEAL, textColor: 255, fontSize: 8, fontStyle: "bold", halign: "left" },
      footStyles: { fillColor: tint(TEAL, 0.85), textColor: [8, 74, 67], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: STRIPE },
      columnStyles: { 0: { cellWidth: "auto", fontStyle: "bold" }, 1: { cellWidth: 40, halign: "right" }, 2: { cellWidth: 40, halign: "right" } },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 0) {
          const raw = String(data.cell.raw || "");
          if (raw === "Verified") data.cell.styles.textColor = EMERALD;
          else if (raw === "Rejected") data.cell.styles.textColor = RED;
          else if (raw === "Pending acceptance") data.cell.styles.textColor = AMBER;
        }
      },
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("Powered by Welile — confidential agent growth analytics", margin, pageHeight - 5);
    doc.text(`Page ${p} / ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

// Base64-encode bytes in chunks (avoids call-stack limits on large buffers).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Split base64 into 76-char lines per MIME spec.
function chunk76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trim();
}

// Send an HTML email with a PDF attachment through the Gmail connector.
async function sendWithAttachment(
  to: string, subject: string, html: string, pdf: Uint8Array, filename: string,
): Promise<{ ok: boolean; status: number; raw?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !gmailKey) {
    return { ok: false, status: 0, raw: "Gmail connector creds missing" };
  }
  const boundary = `welile_${crypto.randomUUID().replace(/-/g, "")}`;
  const pdfB64 = chunk76(bytesToBase64(pdf));
  // RFC 2047 encode the subject so non-ASCII chars render correctly in all clients.
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
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
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
  const text = await res.text();
  return { ok: res.ok, status: res.status, raw: text };
}

function buildHtml(stats: LeaderboardStats, period: Period, prettyDate: string): string {
  const t = stats.totals;
  const periodNoun = period === "daily" ? "today" : period === "weekly" ? "this week" : period === "yearly" ? "this year" : "this month";
  const netNew = t.new_agents + t.new_subagents;
  const verifiedRate = t.total_subagents > 0 ? Math.round((t.verified_subagents / t.total_subagents) * 100) : 0;
  const top = stats.top_recruiters?.[0];
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f5f3fa;margin:0;padding:24px;color:#1e1b2e">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2deec;border-radius:14px;overflow:hidden">
    <div style="background:#6900cc;color:#fff;padding:22px 26px">
      <div style="font-size:13px;letter-spacing:.4px;opacity:.85;text-transform:uppercase">Welile · Agent Ops</div>
      <h1 style="margin:6px 0 0;font-size:21px">Agent Growth Leaderboard</h1>
      <div style="margin-top:4px;font-size:13px;opacity:.9">${esc(prettyDate)} · ${esc(periodNoun)}</div>
    </div>
    <div style="padding:24px 26px">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">
        Good morning. Here is your daily snapshot of agent &amp; sub-agent network growth.
        The full branded report is attached as a PDF.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px">
        <tr>
          <td style="width:50%;background:#f4f0fc;border-radius:10px;padding:14px">
            <div style="font-size:11px;color:#787484;text-transform:uppercase;font-weight:700">Total Agents</div>
            <div style="font-size:22px;font-weight:800;color:#6900cc;margin-top:2px">${fmtInt(t.total_agents)}</div>
            <div style="font-size:12px;color:#787484">${fmtInt(t.new_agents)} new ${esc(periodNoun)}</div>
          </td>
          <td style="width:50%;background:#f4f0fc;border-radius:10px;padding:14px">
            <div style="font-size:11px;color:#787484;text-transform:uppercase;font-weight:700">Total Sub-Agents</div>
            <div style="font-size:22px;font-weight:800;color:#7c3aed;margin-top:2px">${fmtInt(t.total_subagents)}</div>
            <div style="font-size:12px;color:#787484">${fmtInt(t.verified_subagents)} verified · ${fmtInt(t.pending_subagents)} pending</div>
          </td>
        </tr>
        <tr>
          <td style="width:50%;background:#eefaf4;border-radius:10px;padding:14px">
            <div style="font-size:11px;color:#787484;text-transform:uppercase;font-weight:700">New ${esc(periodNoun)}</div>
            <div style="font-size:22px;font-weight:800;color:#109664;margin-top:2px">${fmtInt(netNew)}</div>
            <div style="font-size:12px;color:#787484">${fmtInt(t.new_agents)} agents · ${fmtInt(t.new_subagents)} sub-agents</div>
          </td>
          <td style="width:50%;background:#fef7e7;border-radius:10px;padding:14px">
            <div style="font-size:11px;color:#787484;text-transform:uppercase;font-weight:700">Verified Rate</div>
            <div style="font-size:22px;font-weight:800;color:#ca8a04;margin-top:2px">${verifiedRate}%</div>
            <div style="font-size:12px;color:#787484">of all sub-agents</div>
          </td>
        </tr>
      </table>
      ${top && top.invited > 0 ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#334155">
        🏆 <strong>Top recruiter ${esc(top.name)}</strong> brought in ${fmtInt(top.invited)} invitees
        (${top.invited > 0 ? Math.round((top.verified / top.invited) * 100) : 0}% verified) ${esc(periodNoun)}.
      </p>` : ""}
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6">
        📎 <strong>Attached:</strong> full growth analytics PDF with executive summary, period-by-period
        growth, top recruiters and the invitee pipeline.
      </p>
    </div>
    <div style="border-top:1px solid #e2deec;padding:16px 26px;font-size:11px;color:#94a3b8">
      Automated report from Welile Agent Ops · Generated ${esc(prettyDate)}.
    </div>
  </div></body></html>`;
}

async function run(admin: ReturnType<typeof createClient>, period: Period, force: boolean) {
  const dateStr = eatToday();

  if (!force) {
    const { data: existing } = await admin
      .from("system_events")
      .select("id")
      .eq("event_type", "agent_growth_daily_report")
      .filter("metadata->>date", "eq", dateStr)
      .maybeSingle();
    if (existing) {
      return { date: dateStr, skipped: true, reason: "already sent today" };
    }
  }

  const { data, error } = await admin.rpc("get_agent_leaderboard_stats", { p_period: period });
  if (error) throw error;
  const stats = data as unknown as LeaderboardStats;

  const pdf = buildPdf(stats, period);
  const prettyDate = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const t = stats.totals;
  const netNew = t.new_agents + t.new_subagents;
  const subject = `Agent Growth — ${prettyDate}: ${fmtInt(t.total_agents)} agents, ${fmtInt(t.total_subagents)} sub-agents (+${fmtInt(netNew)} new)`;
  const html = buildHtml(stats, period, prettyDate);
  const filename = `Welile_Agent_Growth_${period}_${dateStr}.pdf`;

  const results: Record<string, string> = {};
  for (const to of REPORT_RECIPIENTS) {
    try {
      const r = await sendWithAttachment(to, subject, html, pdf, filename);
      results[to] = r.ok ? "sent" : `error(${r.status}): ${r.raw?.slice(0, 200)}`;
      if (!r.ok) console.error("[agent-growth-daily-report] send failed", to, r.status, r.raw);
    } catch (e) {
      results[to] = `error: ${String(e)}`;
      console.error("[agent-growth-daily-report] send threw", to, e);
    }
  }

  await admin.from("system_events").insert({
    event_type: "agent_growth_daily_report",
    metadata: {
      date: dateStr, period, recipients: REPORT_RECIPIENTS,
      total_agents: t.total_agents, total_subagents: t.total_subagents, new_net: netNew, results,
    },
  });

  return { date: dateStr, period, recipients: REPORT_RECIPIENTS, pdf_bytes: pdf.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    const force = body?.force === true;
    const period: Period = ["daily", "weekly", "monthly", "yearly"].includes(body?.period) ? body.period : "monthly";
    const out = await run(admin, period, force);
    return new Response(JSON.stringify({ success: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[agent-growth-daily-report] Fatal:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});