// Agent Advances daily report — Agent Ops Manager brief (v2).
//
// Runs 18:00 EAT (15:00 UTC) via pg_cron. Fixed recipients:
//   benjamin@welile.com, paphra.me@gmail.com
//
// Sections, in the order the Agent Ops Manager asked for:
//   1. Receivables projection — next 1/7/30/60/90 days, split principal vs
//      interest, from every active/overdue `agent_advances` row projected
//      forward using its daily_installment and monthly_rate.
//   2. Programme summary — adoption, agent-base breakdown by the "who is an
//      agent" criteria, sub-agent tier distribution (drives advance limit),
//      request flow today vs MTD, top rejection reasons.
//   3. Repayment trend — today vs same weekday last month, MTD vs previous
//      month same window, daily-series chart.
//   4. Arrears roster + top reasons agents request advances.
//
// Emails go through the existing Lovable email queue. Idempotent per EAT day
// via a `agent_advances_daily_report` system_event (bypass: { force: true }).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_RECIPIENTS = ["benjamin@welile.com", "paphra.me@gmail.com"];
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";

// ---------- utilities ----------

function fmtUGX(n: number): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}
function pct(n: number): string {
  return `${(Math.round((Number(n) || 0) * 10) / 10).toLocaleString("en-US")}%`;
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function chartUrl(config: unknown, w = 700, h = 320): string {
  return `https://quickchart.io/chart?w=${w}&h=${h}&bkg=white&devicePixelRatio=2&c=${encodeURIComponent(JSON.stringify(config))}`;
}
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function ensureUnsubscribeToken(admin: ReturnType<typeof createClient>, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await admin.from("email_unsubscribe_tokens").select("token").eq("email", normalized).maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = generateToken();
  await admin.from("email_unsubscribe_tokens").upsert({ token, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
  const { data: stored } = await admin.from("email_unsubscribe_tokens").select("token").eq("email", normalized).maybeSingle();
  return (stored?.token as string) || token;
}

function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function eatDayBounds(dateStr: string): { startISO: string; endISO: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const startEAT = Date.UTC(y, m - 1, d, 0, 0, 0) - 3 * 60 * 60 * 1000;
  const endEAT = startEAT + 24 * 60 * 60 * 1000;
  return { startISO: new Date(startEAT).toISOString(), endISO: new Date(endEAT).toISOString() };
}
function eatDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Brand palette
const PURPLE = "#6c21c4";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const BLUE = "#2563eb";

// ---------- classification helpers ----------

function isApproved(status: string, cfoPaidAt: unknown): boolean {
  const s = String(status || "").toLowerCase();
  return !!cfoPaidAt || s.includes("approved") || s === "disbursed" || s === "active" || s === "repaying" || s === "cfo_paid";
}
function isRejected(status: string): boolean {
  return String(status || "").toLowerCase().includes("reject");
}
function isPending(status: string): boolean {
  return String(status || "").toLowerCase() === "pending";
}

function reasonBucket(raw: string): string {
  const r = String(raw || "").trim().toLowerCase();
  if (!r) return "No reason given";
  if (r.includes("test")) return "Feature under test";
  if (r.includes("duplicate")) return "Duplicate request";
  if (r.includes("eligib") || r.includes("limit") || r.includes("over")) return "Not eligible / over limit";
  if (r.includes("document") || r.includes("kyc") || r.includes("id")) return "Documents / KYC";
  if (r.includes("outstanding") || r.includes("overdue") || r.includes("debt")) return "Existing debt / overdue";
  if (r.includes("agent ops")) return "Rejected at agent ops stage";
  if (r.includes("tenant")) return "Rejected at tenant ops stage";
  if (r.includes("landlord")) return "Rejected at landlord ops stage";
  return raw.trim().slice(0, 40);
}

function purposeBucket(raw: string): string {
  const r = String(raw || "").trim().toLowerCase();
  if (!r) return "Not specified";
  if (/rent|tenant|landlord|deposit|house/.test(r)) return "Fund tenant rent / deposit";
  if (/stock|goods|business|shop|merchand|inventory/.test(r)) return "Business stock / merchandise";
  if (/school|fees|tuition|educat/.test(r)) return "School fees";
  if (/medic|hospital|health|treatment/.test(r)) return "Medical";
  if (/food|feed|family|home|domestic/.test(r)) return "Household / food";
  if (/transport|fuel|boda|vehicle|car/.test(r)) return "Transport / fuel";
  if (/emerg/.test(r)) return "Emergency";
  if (/personal/.test(r)) return "Personal";
  return raw.trim().slice(0, 40);
}

// ---------- receivables projection ----------

interface AdvanceRow {
  id: string;
  agent_id: string;
  outstanding_balance: number;
  daily_installment: number;
  monthly_rate: number;
  cycle_days: number;
  status: string;
}
interface WindowBucket {
  label: string;
  days: number;
  principal: number;
  interest: number;
  total: number;
  contributing: number;
}

// Project a single advance forward day-by-day and return daily principal/interest
// components until either fully repaid or `maxDays` reached.
function projectAdvance(a: AdvanceRow, maxDays: number): Array<{ day: number; principal: number; interest: number }> {
  const out: Array<{ day: number; principal: number; interest: number }> = [];
  let balance = Math.max(0, Number(a.outstanding_balance) || 0);
  const install = Math.max(0, Number(a.daily_installment) || 0);
  const monthly = Math.max(0, Number(a.monthly_rate) || 0.33);
  if (balance <= 0 || install <= 0) return out;
  // Effective daily rate implied by the monthly compounding advance model.
  const dailyRate = Math.pow(1 + monthly, 1 / 30) - 1;
  for (let d = 1; d <= maxDays; d++) {
    if (balance <= 0.5) break;
    const accrued = balance * dailyRate;
    const gross = balance + accrued;
    const payment = Math.min(install, gross);
    const interestPaid = Math.min(payment, accrued);
    const principalPaid = Math.max(0, payment - interestPaid);
    out.push({ day: d, principal: principalPaid, interest: interestPaid });
    balance = Math.max(0, gross - payment);
  }
  return out;
}

function bucketReceivables(advances: AdvanceRow[]): WindowBucket[] {
  const windows = [1, 7, 30, 60, 90];
  const buckets: WindowBucket[] = windows.map((d) => ({
    label: d === 1 ? "Next 1 day" : `Next ${d} days`,
    days: d, principal: 0, interest: 0, total: 0, contributing: 0,
  }));
  for (const a of advances) {
    const proj = projectAdvance(a, 90);
    if (!proj.length) continue;
    let touched = new Set<number>();
    for (const step of proj) {
      for (const b of buckets) {
        if (step.day <= b.days) {
          b.principal += step.principal;
          b.interest += step.interest;
          b.total += step.principal + step.interest;
          touched.add(b.days);
        }
      }
    }
    for (const b of buckets) if (touched.has(b.days)) b.contributing += 1;
  }
  return buckets;
}

// ---------- report shape ----------

interface ArrearsRow {
  agent_id: string;
  name: string;
  phone: string;
  arrears: number;
  outstanding: number;
  daysInArrears: number;
}
interface TrendPoint { day: string; total: number; }
interface Report {
  date: string;
  // Base
  totalUsers: number;
  qualifyingAgents: number;
  criteriaCounts: Record<string, number>;
  // Advance adoption
  agentsWithAdvancesEver: number;
  agentsWithActiveAdvances: number;
  adoptionPct: number;
  // Sub-agent tier distribution (advance-limit driver)
  tierDistribution: Array<{ label: string; count: number; limit: number }>;
  // Requests
  requestsToday: number;
  requestsMonth: number;
  requestsTotal: number;
  approvedToday: number;
  approvedMonth: number;
  rejectedToday: number;
  rejectedMonth: number;
  pendingTotal: number;
  reasonsToday: Array<{ label: string; count: number }>;
  reasonsMonth: Array<{ label: string; count: number }>;
  // Receivables
  buckets: WindowBucket[];
  // Repayment trend
  repaidToday: number;
  agentsRepaidToday: number;
  repaidSameDayLastMonth: number;
  repaidThisMonth: number;
  repaidLastMonthSameWindow: number;
  monthDaysLabels: string[];
  monthDaysSeries: number[];
  lastMonthSeries: number[];
  // Arrears + purposes
  arrears: ArrearsRow[];
  totalArrears: number;
  purposesMonth: Array<{ label: string; count: number }>;
}

// ---------- data fetch + compute ----------

async function buildReport(admin: ReturnType<typeof createClient>, dateStr: string): Promise<Report> {
  const { startISO, endISO } = eatDayBounds(dateStr);
  const monthStartISO = eatDayBounds(`${dateStr.slice(0, 7)}-01`).startISO;
  const monthStartDate = `${dateStr.slice(0, 7)}-01`;

  // Same date last month (clamped) and prior-month same-window bounds.
  const dayNum = Number(dateStr.slice(8, 10));
  const prevMonthDate = (() => {
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(5, 7)) - 1; // 1..12
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const lastDayPrev = new Date(py, pm, 0).getDate();
    const clamped = Math.min(dayNum, lastDayPrev);
    return `${py}-${String(pm).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
  })();
  const prevMonthStart = `${prevMonthDate.slice(0, 7)}-01`;

  const [
    reqRes,
    advRes,
    ledgerRes,
    qualifyingRes,
    monitorRes,
    listingsRes,
    promissoryRes,
    behalfReqRes,
    collectionsRes,
    subagentsRes,
    usersRes,
  ] = await Promise.all([
    admin.from("agent_advance_requests")
      .select("id, agent_id, principal, status, rejection_reason, reason, cfo_paid_at, created_at"),
    admin.from("agent_advances")
      .select("id, agent_id, outstanding_balance, daily_installment, monthly_rate, cycle_days, status")
      .in("status", ["active", "overdue"]),
    admin.from("agent_advance_ledger")
      .select("date, amount_deducted, advance_id")
      .gte("date", prevMonthStart),
    admin.rpc("agent_ops_qualifying_agent_ids"),
    admin.rpc("get_agent_advance_repayment_monitor", { _days: 7 }),
    admin.from("house_listings").select("agent_id").not("agent_id", "is", null),
    admin.from("promissory_notes").select("agent_id").not("agent_id", "is", null),
    admin.from("rent_requests").select("agent_id, tenant_id").not("agent_id", "is", null),
    admin.from("agent_collections").select("agent_id").not("agent_id", "is", null),
    admin.from("agent_subagents").select("parent_agent_id, sub_agent_id, status, accepted_at"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const requests = (reqRes.data ?? []) as any[];
  const advances = ((advRes.data ?? []) as AdvanceRow[]).map((a) => ({
    ...a,
    outstanding_balance: Number(a.outstanding_balance) || 0,
    daily_installment: Number(a.daily_installment) || 0,
    monthly_rate: Number(a.monthly_rate) || 0.33,
    cycle_days: Number(a.cycle_days) || 30,
  }));
  const ledger = (ledgerRes.data ?? []) as any[];
  const monitor = (monitorRes.data ?? []) as any[];
  const qualifyingIds = new Set(
    ((qualifyingRes.data ?? []) as Array<{ agent_id: string }>).map((r) => r.agent_id).filter(Boolean),
  );

  const totalUsers = usersRes.count ?? 0;
  const qualifyingAgents = qualifyingIds.size;

  // ----- Agent-base criteria breakdown (restricted to qualifying set) -----
  const uniq = (rows: any[], key = "agent_id") => {
    const s = new Set<string>();
    for (const r of rows) if (r?.[key] && qualifyingIds.has(r[key])) s.add(r[key]);
    return s;
  };
  const listedHouses = uniq(listingsRes.data ?? []);
  const promissory = uniq(promissoryRes.data ?? []);
  const behalfReqs = (() => {
    const s = new Set<string>();
    for (const r of (behalfReqRes.data ?? [])) {
      if (r?.agent_id && r?.tenant_id && r.agent_id !== r.tenant_id && qualifyingIds.has(r.agent_id)) s.add(r.agent_id);
    }
    return s;
  })();
  const collected = uniq(collectionsRes.data ?? []);

  // Active-subagent count per parent (a subagent is "active" only if they
  // themselves qualify as an agent).
  const activeSubCount = new Map<string, number>();
  const parentsWithActiveSub = new Set<string>();
  for (const s of (subagentsRes.data ?? []) as any[]) {
    const parent = s?.parent_agent_id;
    const sub = s?.sub_agent_id;
    if (!parent || !sub) continue;
    const accepted = s.accepted_at || ["active", "verified"].includes(String(s.status));
    if (!accepted) continue;
    if (!qualifyingIds.has(sub)) continue; // sub must itself qualify
    activeSubCount.set(parent, (activeSubCount.get(parent) || 0) + 1);
    parentsWithActiveSub.add(parent);
  }

  const criteriaCounts: Record<string, number> = {
    "Has active sub-agent": parentsWithActiveSub.size,
    "Posted promissory note": promissory.size,
    "Rent request on behalf": behalfReqs.size,
    "Rent collection from tenant": collected.size,
    "Listed a house": listedHouses.size,
  };

  // ----- Sub-agent tier distribution (advance-limit primary driver) -----
  const tiers: Array<{ label: string; min: number; max: number; limit: number }> = [
    { label: "0 active", min: 0, max: 0, limit: 50000 },
    { label: "1–2 active", min: 1, max: 2, limit: 200000 },
    { label: "3–5 active", min: 3, max: 5, limit: 500000 },
    { label: "6–10 active", min: 6, max: 10, limit: 1500000 },
    { label: "11–20 active", min: 11, max: 20, limit: 5000000 },
    { label: "21+ active", min: 21, max: Infinity, limit: 10000000 },
  ];
  const tierDistribution = tiers.map((t) => ({ label: t.label, count: 0, limit: t.limit }));
  for (const agentId of qualifyingIds) {
    const cnt = activeSubCount.get(agentId) || 0;
    for (let i = 0; i < tiers.length; i++) {
      if (cnt >= tiers[i].min && cnt <= tiers[i].max) { tierDistribution[i].count += 1; break; }
    }
  }

  // ----- Requests (today / MTD / all-time) -----
  const inDay = (iso: string) => iso >= startISO && iso < endISO;
  const inMonth = (iso: string) => iso >= monthStartISO && iso < endISO;
  const todays = requests.filter((r) => inDay(r.created_at));
  const months = requests.filter((r) => inMonth(r.created_at));
  const requestsToday = todays.length;
  const requestsMonth = months.length;
  const requestsTotal = requests.length;
  const approvedToday = todays.filter((r) => isApproved(r.status, r.cfo_paid_at)).length;
  const approvedMonth = months.filter((r) => isApproved(r.status, r.cfo_paid_at)).length;
  const rejectedToday = todays.filter((r) => isRejected(r.status)).length;
  const rejectedMonth = months.filter((r) => isRejected(r.status)).length;
  const pendingTotal = requests.filter((r) => isPending(r.status)).length;

  const tallyReasons = (rows: any[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      if (!isRejected(r.status)) continue;
      const label = reasonBucket(r.rejection_reason);
      m[label] = (m[label] || 0) + 1;
    }
    return Object.entries(m).sort(([, a], [, b]) => b - a).map(([label, count]) => ({ label, count }));
  };
  const reasonsToday = tallyReasons(todays);
  const reasonsMonth = tallyReasons(months).slice(0, 8);

  // ----- Advance-purpose buckets (why agents are requesting) -----
  const purposeMap: Record<string, number> = {};
  for (const r of months) {
    const label = purposeBucket(r.reason);
    purposeMap[label] = (purposeMap[label] || 0) + 1;
  }
  const purposesMonth = Object.entries(purposeMap).sort(([, a], [, b]) => b - a).slice(0, 8).map(([label, count]) => ({ label, count }));

  // ----- Receivables projection -----
  const buckets = bucketReceivables(advances);

  // ----- Repayment trend -----
  const ledgerByDate: Record<string, number> = {};
  for (const l of ledger) {
    const d = String(l.date);
    ledgerByDate[d] = (ledgerByDate[d] || 0) + (Number(l.amount_deducted) || 0);
  }
  const repaidToday = ledgerByDate[dateStr] || 0;
  const agentsRepaidToday = new Set(
    monitor.filter((r: any) => r.paid_today).map((r: any) => r.agent_id).filter(Boolean),
  ).size;
  const repaidSameDayLastMonth = ledgerByDate[prevMonthDate] || 0;

  const sumRange = (from: string, to: string) => {
    let s = 0;
    for (const [d, v] of Object.entries(ledgerByDate)) if (d >= from && d <= to) s += v;
    return s;
  };
  const repaidThisMonth = sumRange(monthStartDate, dateStr);
  const repaidLastMonthSameWindow = sumRange(prevMonthStart, prevMonthDate);

  const daysThisMonth = dayNum;
  const monthDaysLabels: string[] = [];
  const monthDaysSeries: number[] = [];
  const lastMonthSeries: number[] = [];
  for (let d = 1; d <= daysThisMonth; d++) {
    const dStr = `${dateStr.slice(0, 7)}-${String(d).padStart(2, "0")}`;
    const pStr = `${prevMonthStart.slice(0, 7)}-${String(d).padStart(2, "0")}`;
    monthDaysLabels.push(String(d));
    monthDaysSeries.push(Math.round(ledgerByDate[dStr] || 0));
    lastMonthSeries.push(Math.round(ledgerByDate[pStr] || 0));
  }

  // ----- Arrears roster -----
  const arrearsRows: ArrearsRow[] = monitor
    .filter((r: any) => Number(r.arrears_balance) > 0)
    .map((r: any) => {
      const arrears = Number(r.arrears_balance) || 0;
      const install = Number(r.daily_installment) || 0;
      const days = install > 0 ? Math.round(arrears / install) : 0;
      return {
        agent_id: r.agent_id,
        name: (r.full_name || "").trim() || "Unknown agent",
        phone: r.phone || "—",
        arrears: Math.round(arrears),
        outstanding: Math.round(Number(r.outstanding_balance) || 0),
        daysInArrears: days,
      };
    })
    .sort((a, b) => b.arrears - a.arrears);
  const totalArrears = arrearsRows.reduce((s, r) => s + r.arrears, 0);

  // Adoption + lifetime numbers.
  const agentsWithActiveAdvances = new Set(advances.map((a) => a.agent_id).filter(Boolean)).size;
  const { data: everAgents } = await admin.from("agent_advances").select("agent_id");
  const agentsWithAdvancesEver = new Set(((everAgents ?? []) as any[]).map((r) => r.agent_id).filter(Boolean)).size;
  const adoptionPct = qualifyingAgents ? (agentsWithActiveAdvances / qualifyingAgents) * 100 : 0;

  return {
    date: dateStr,
    totalUsers, qualifyingAgents, criteriaCounts,
    agentsWithAdvancesEver, agentsWithActiveAdvances, adoptionPct,
    tierDistribution,
    requestsToday, requestsMonth, requestsTotal,
    approvedToday, approvedMonth,
    rejectedToday, rejectedMonth,
    pendingTotal, reasonsToday, reasonsMonth,
    buckets,
    repaidToday, agentsRepaidToday, repaidSameDayLastMonth,
    repaidThisMonth, repaidLastMonthSameWindow,
    monthDaysLabels, monthDaysSeries, lastMonthSeries,
    arrears: arrearsRows, totalArrears, purposesMonth,
  };
}

// ---------- HTML rendering ----------

function kpiCell(label: string, value: string, color = "#1a1a2e", sub?: string): string {
  return `<td style="padding:12px 8px;background:#f7f3ff;border-radius:8px;text-align:center;vertical-align:top;">
    <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;">${esc(label)}</div>
    <div style="font-size:19px;font-weight:700;color:${color};margin-top:4px;">${esc(value)}</div>
    ${sub ? `<div style="font-size:10px;color:#888;margin-top:2px;">${esc(sub)}</div>` : ""}
  </td>`;
}

function tableRow(cells: string[], zebra: boolean): string {
  return `<tr style="background:${zebra ? "#faf7ff" : "#ffffff"}">${cells.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid #eee;">${c}</td>`).join("")}</tr>`;
}

function buildHtml(r: Report, prettyDate: string): string {
  // --- Section 1 chart: stacked principal vs interest by window ---
  const receivablesChart = chartUrl({
    type: "bar",
    data: {
      labels: r.buckets.map((b) => b.label),
      datasets: [
        { label: "Principal", data: r.buckets.map((b) => Math.round(b.principal)), backgroundColor: BLUE, stack: "s" },
        { label: "Interest", data: r.buckets.map((b) => Math.round(b.interest)), backgroundColor: PURPLE, stack: "s" },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Projected receivables — principal vs interest" }, legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: "UGX" } } },
    },
  }, 720, 340);

  const receivablesRows = r.buckets.map((b, i) => tableRow([
    `<strong>${esc(b.label)}</strong>`,
    `<span style="color:${BLUE};font-weight:600;">${fmtUGX(b.principal)}</span>`,
    `<span style="color:${PURPLE};font-weight:600;">${fmtUGX(b.interest)}</span>`,
    `<span style="font-weight:700;">${fmtUGX(b.total)}</span>`,
    `<span style="color:#666;">${b.contributing}</span>`,
  ], i % 2 === 1)).join("");

  // --- Section 2 charts ---
  const criteriaChart = chartUrl({
    type: "doughnut",
    data: {
      labels: Object.keys(r.criteriaCounts),
      datasets: [{ data: Object.values(r.criteriaCounts), backgroundColor: [PURPLE, BLUE, GREEN, AMBER, "#0891b2"] }],
    },
    options: { plugins: { title: { display: true, text: "Agent base by activity" }, legend: { position: "bottom" } } },
  }, 340, 300);

  const tierChart = chartUrl({
    type: "bar",
    data: {
      labels: r.tierDistribution.map((t) => t.label),
      datasets: [{ label: "Agents", data: r.tierDistribution.map((t) => t.count), backgroundColor: PURPLE }],
    },
    options: { plugins: { title: { display: true, text: "Advance-limit tier by active sub-agents" }, legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  }, 340, 300);

  const reasonChart = r.reasonsMonth.length
    ? chartUrl({
        type: "horizontalBar",
        data: {
          labels: r.reasonsMonth.map((x) => x.label.slice(0, 26)),
          datasets: [{ label: "Rejections (MTD)", data: r.reasonsMonth.map((x) => x.count), backgroundColor: RED }],
        },
        options: { plugins: { title: { display: true, text: "Rejection reasons — month to date" }, legend: { display: false } }, scales: { x: { beginAtZero: true } } },
      }, 720, 300)
    : "";

  // --- Section 3 chart: this month vs last month repayment trend ---
  const trendChart = chartUrl({
    type: "line",
    data: {
      labels: r.monthDaysLabels,
      datasets: [
        { label: "This month", data: r.monthDaysSeries, borderColor: PURPLE, backgroundColor: "rgba(108,33,196,0.15)", fill: true, tension: 0.25 },
        { label: "Last month", data: r.lastMonthSeries, borderColor: AMBER, backgroundColor: "rgba(217,119,6,0.05)", fill: false, borderDash: [4, 3], tension: 0.25 },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Repayments per day — this month vs last month (EAT)" }, legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "UGX repaid" } } },
    },
  }, 720, 320);

  // --- Rows ---
  const criteriaRows = Object.entries(r.criteriaCounts).map(([label, count], i) => tableRow([
    esc(label),
    `<span style="text-align:right;font-weight:600;">${count.toLocaleString("en-US")}</span>`,
    `<span style="color:#666;">${pct(r.qualifyingAgents ? (count / r.qualifyingAgents) * 100 : 0)}</span>`,
  ], i % 2 === 1)).join("");

  const tierRows = r.tierDistribution.map((t, i) => tableRow([
    esc(t.label),
    `<span style="font-weight:600;">${t.count.toLocaleString("en-US")}</span>`,
    `<span style="color:${PURPLE};font-weight:600;">${fmtUGX(t.limit)}</span>`,
  ], i % 2 === 1)).join("");

  const reasonMonthRows = r.reasonsMonth.length
    ? r.reasonsMonth.map((x, i) => tableRow([esc(x.label), `<span style="text-align:right;font-weight:600;">${x.count}</span>`], i % 2 === 1)).join("")
    : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#888;">No rejections this month.</td></tr>`;

  const arrearsTop = r.arrears.slice(0, 25);
  const arrearsRows = arrearsTop.length
    ? arrearsTop.map((a, i) => tableRow([
        esc(a.name),
        `<span style="color:#555;">${esc(a.phone)}</span>`,
        `<span style="color:${RED};font-weight:700;">${fmtUGX(a.arrears)}</span>`,
        `<span style="color:#666;">${a.daysInArrears}d</span>`,
        fmtUGX(a.outstanding),
      ], i % 2 === 1)).join("")
    : `<tr><td colspan="5" style="padding:12px;text-align:center;color:#888;">No advances currently in arrears. 🎉</td></tr>`;
  const arrearsFooter = r.arrears.length > 25
    ? `<tr><td colspan="5" style="padding:8px 10px;color:#888;font-style:italic;">…and ${r.arrears.length - 25} more agents in arrears (total ${fmtUGX(r.totalArrears)}).</td></tr>`
    : "";

  const purposeRows = r.purposesMonth.length
    ? r.purposesMonth.map((x, i) => tableRow([esc(x.label), `<span style="text-align:right;font-weight:600;">${x.count}</span>`], i % 2 === 1)).join("")
    : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#888;">No requests this month.</td></tr>`;

  const trendDelta = (a: number, b: number) => {
    if (!b) return a > 0 ? "▲ new" : "—";
    const diff = ((a - b) / b) * 100;
    const sign = diff >= 0 ? "▲" : "▼";
    const color = diff >= 0 ? GREEN : RED;
    return `<span style="color:${color};">${sign} ${Math.abs(Math.round(diff))}%</span>`;
  };

  return `<!doctype html><html><body style="margin:0;background:#f4f1fa;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <div style="max-width:800px;margin:0 auto;padding:20px;">
    <div style="background:${PURPLE};color:#fff;border-radius:12px 12px 0 0;padding:22px 26px;">
      <h1 style="margin:0;font-size:22px;">Agent Advances — Daily Ops Brief</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.9;">${esc(prettyDate)} (East Africa Time)</p>
    </div>
    <div style="background:#fff;padding:22px 26px;border:1px solid #e7e0f5;border-top:0;border-radius:0 0 12px 12px;">

      <!-- 1. RECEIVABLES PROJECTION -->
      <h2 style="font-size:16px;margin:2px 0 8px;">1 · Receivables — projected principal &amp; interest</h2>
      <p style="margin:0 0 10px;font-size:12px;color:#666;">Projected forward from every active/overdue advance using its scheduled daily instalment and monthly compounding rate.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
        <thead>
          <tr style="background:${PURPLE};color:#fff;text-align:left;">
            <th style="padding:8px 10px;width:22%;">Window</th>
            <th style="padding:8px 10px;width:22%;">Principal</th>
            <th style="padding:8px 10px;width:22%;">Interest</th>
            <th style="padding:8px 10px;width:22%;">Total receivable</th>
            <th style="padding:8px 10px;width:12%;">Advances</th>
          </tr>
        </thead>
        <tbody>${receivablesRows}</tbody>
      </table>
      <div style="margin:18px 0;"><img src="${receivablesChart}" alt="Projected receivables" width="720" style="width:100%;max-width:720px;border:1px solid #eee;border-radius:8px;" /></div>

      <!-- 2. PROGRAMME SUMMARY -->
      <h2 style="font-size:16px;margin:22px 0 8px;">2 · Programme summary</h2>

      <h3 style="font-size:13px;margin:8px 0 6px;color:#444;">a) Advance adoption</h3>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Adoption rate", pct(r.adoptionPct), r.adoptionPct < 5 ? AMBER : GREEN, `${r.agentsWithActiveAdvances}/${r.qualifyingAgents.toLocaleString("en-US")} qualifying agents`)}
          ${kpiCell("Agents with active advance", r.agentsWithActiveAdvances.toLocaleString("en-US"), PURPLE, `${r.agentsWithAdvancesEver} have ever held one`)}
          ${kpiCell("Qualifying agents", r.qualifyingAgents.toLocaleString("en-US"), "#1a1a2e", `of ${r.totalUsers.toLocaleString("en-US")} total users`)}
          ${kpiCell("Pending requests", r.pendingTotal.toLocaleString("en-US"), AMBER, "awaiting review")}
        </tr>
      </table>

      <h3 style="font-size:13px;margin:14px 0 6px;color:#444;">b) Agent base breakdown</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
        <thead>
          <tr style="background:#f7f3ff;text-align:left;">
            <th style="padding:8px 10px;width:52%;">Activity criterion</th>
            <th style="padding:8px 10px;width:24%;">Qualifying agents</th>
            <th style="padding:8px 10px;width:24%;">Share of base</th>
          </tr>
        </thead>
        <tbody>${criteriaRows}</tbody>
      </table>
      <div style="margin:12px 0;"><img src="${criteriaChart}" alt="Agent base" width="340" style="width:100%;max-width:340px;border:1px solid #eee;border-radius:8px;" /></div>

      <h3 style="font-size:13px;margin:14px 0 6px;color:#444;">c) Advance-limit tier — driven by active sub-agents</h3>
      <p style="margin:0 0 8px;font-size:12px;color:#666;">Primary driver is the count of active sub-agents an agent has recruited (a sub-agent counts as active only if they themselves qualify as an agent). Rent collections, listings and promissory notes act as smaller top-ups on the base tier.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
        <thead>
          <tr style="background:#f7f3ff;text-align:left;">
            <th style="padding:8px 10px;width:34%;">Active sub-agents</th>
            <th style="padding:8px 10px;width:33%;">Agents in tier</th>
            <th style="padding:8px 10px;width:33%;">Tier advance ceiling</th>
          </tr>
        </thead>
        <tbody>${tierRows}</tbody>
      </table>
      <div style="margin:12px 0;"><img src="${tierChart}" alt="Tier distribution" width="340" style="width:100%;max-width:340px;border:1px solid #eee;border-radius:8px;" /></div>

      <h3 style="font-size:13px;margin:14px 0 6px;color:#444;">d) Request flow — today vs month to date</h3>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Received today", r.requestsToday.toLocaleString("en-US"), PURPLE, `${r.requestsMonth} MTD · ${r.requestsTotal} all-time`)}
          ${kpiCell("Approved today", r.approvedToday.toLocaleString("en-US"), GREEN, `${r.approvedMonth} MTD`)}
          ${kpiCell("Rejected today", r.rejectedToday.toLocaleString("en-US"), RED, `${r.rejectedMonth} MTD`)}
          ${kpiCell("Pending", r.pendingTotal.toLocaleString("en-US"), AMBER, "awaiting review")}
        </tr>
      </table>
      ${reasonChart ? `<div style="margin:12px 0;"><img src="${reasonChart}" alt="Rejection reasons" width="720" style="width:100%;max-width:720px;border:1px solid #eee;border-radius:8px;" /></div>` : ""}
      <h4 style="font-size:12px;margin:12px 0 4px;color:#555;">Top rejection reasons (MTD)</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:${RED};color:#fff;text-align:left;"><th style="padding:8px 10px;">Reason</th><th style="padding:8px 10px;text-align:right;width:20%;">Count</th></tr></thead>
        <tbody>${reasonMonthRows}</tbody>
      </table>

      <!-- 3. REPAYMENT TREND -->
      <h2 style="font-size:16px;margin:26px 0 8px;">3 · Repayment trend</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Repaid today", fmtUGX(r.repaidToday), GREEN, `${r.agentsRepaidToday} agents paid`)}
          ${kpiCell("Same day last month", fmtUGX(r.repaidSameDayLastMonth), "#1a1a2e", trendDelta(r.repaidToday, r.repaidSameDayLastMonth))}
          ${kpiCell("Month to date", fmtUGX(r.repaidThisMonth), GREEN, trendDelta(r.repaidThisMonth, r.repaidLastMonthSameWindow) + " vs last month")}
          ${kpiCell("Last month (same window)", fmtUGX(r.repaidLastMonthSameWindow), "#1a1a2e")}
        </tr>
      </table>
      <div style="margin:14px 0;"><img src="${trendChart}" alt="Repayment trend" width="720" style="width:100%;max-width:720px;border:1px solid #eee;border-radius:8px;" /></div>

      <!-- 4. ARREARS + DEMAND REASONS -->
      <h2 style="font-size:16px;margin:26px 0 8px;">4 · Arrears &amp; advance demand</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Agents in arrears", r.arrears.length.toLocaleString("en-US"), r.arrears.length ? RED : GREEN)}
          ${kpiCell("Total arrears", fmtUGX(r.totalArrears), r.totalArrears > 0 ? AMBER : GREEN)}
          ${kpiCell("Longest overdue", r.arrears.length ? `${r.arrears[0].daysInArrears} days` : "—", r.arrears.length ? RED : GREEN, r.arrears.length ? esc(r.arrears[0].name) : "")}
          ${kpiCell("Requests MTD", r.requestsMonth.toLocaleString("en-US"), PURPLE, "used to bucket reasons")}
        </tr>
      </table>

      <h4 style="font-size:12px;margin:12px 0 4px;color:#555;">Advances currently in arrears (top 25 by amount)</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
        <thead>
          <tr style="background:${PURPLE};color:#fff;text-align:left;">
            <th style="padding:8px 10px;width:28%;">Agent</th>
            <th style="padding:8px 10px;width:20%;">Phone</th>
            <th style="padding:8px 10px;width:20%;">Arrears</th>
            <th style="padding:8px 10px;width:12%;">Age</th>
            <th style="padding:8px 10px;width:20%;">Outstanding</th>
          </tr>
        </thead>
        <tbody>${arrearsRows}${arrearsFooter}</tbody>
      </table>

      <h4 style="font-size:12px;margin:16px 0 4px;color:#555;">Why agents are requesting advances (MTD)</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f7f3ff;text-align:left;"><th style="padding:8px 10px;">Purpose</th><th style="padding:8px 10px;text-align:right;width:20%;">Requests</th></tr></thead>
        <tbody>${purposeRows}</tbody>
      </table>

      <p style="margin:24px 0 0;font-size:11px;color:#999;">
        Generated automatically for Agent Ops from Welile agent credit-advance data (advances, requests, ledger and the "who is an agent" qualifying set) for the reporting day (Africa/Kampala).
      </p>
    </div>
  </div>
  </body></html>`;
}

function buildText(r: Report, prettyDate: string): string {
  const lines: string[] = [];
  lines.push(`Agent Advances — Daily Ops Brief · ${prettyDate} (EAT)`);
  lines.push("");
  lines.push("1. Receivables projection");
  for (const b of r.buckets) {
    lines.push(`   ${b.label.padEnd(14)} principal ${fmtUGX(b.principal).padStart(16)}   interest ${fmtUGX(b.interest).padStart(14)}   total ${fmtUGX(b.total).padStart(16)}   (${b.contributing} advances)`);
  }
  lines.push("");
  lines.push(`2. Adoption ${pct(r.adoptionPct)} — ${r.agentsWithActiveAdvances}/${r.qualifyingAgents} qualifying agents (of ${r.totalUsers} users)`);
  for (const [k, v] of Object.entries(r.criteriaCounts)) lines.push(`   - ${k}: ${v}`);
  lines.push(`   Requests today ${r.requestsToday} (MTD ${r.requestsMonth}) · Approved ${r.approvedToday}/${r.approvedMonth} · Rejected ${r.rejectedToday}/${r.rejectedMonth} · Pending ${r.pendingTotal}`);
  lines.push("");
  lines.push(`3. Repaid today ${fmtUGX(r.repaidToday)} (${r.agentsRepaidToday} agents) vs same day last month ${fmtUGX(r.repaidSameDayLastMonth)}`);
  lines.push(`   MTD ${fmtUGX(r.repaidThisMonth)} vs last month same window ${fmtUGX(r.repaidLastMonthSameWindow)}`);
  lines.push("");
  lines.push(`4. Arrears: ${r.arrears.length} agents, total ${fmtUGX(r.totalArrears)}`);
  for (const a of r.arrears.slice(0, 25)) lines.push(`   - ${a.name} (${a.phone}) — ${fmtUGX(a.arrears)} · ${a.daysInArrears}d · outstanding ${fmtUGX(a.outstanding)}`);
  return lines.join("\n");
}

// ---------- send ----------

async function sendForDate(
  admin: ReturnType<typeof createClient>,
  dateStr: string,
  force: boolean,
  recipientsOverride?: string[],
): Promise<Record<string, unknown>> {
  if (!force) {
    const { data: existing } = await admin
      .from("system_events")
      .select("id")
      .eq("event_type", "agent_advances_daily_report")
      .contains("metadata", { date: dateStr })
      .limit(1)
      .maybeSingle();
    if (existing) return { date: dateStr, skipped: true, reason: "Already sent" };
  }

  const report = await buildReport(admin, dateStr);
  const prettyDate = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const html = buildHtml(report, prettyDate);
  const text = buildText(report, prettyDate);
  const subject = `Agent Advances · ${prettyDate}: ${report.requestsToday} new · ${report.approvedToday} approved · ${fmtUGX(report.repaidToday)} repaid · ${report.arrears.length} in arrears`;

  const results: Record<string, string> = {};
  const recipients = recipientsOverride && recipientsOverride.length ? recipientsOverride : REPORT_RECIPIENTS;
  for (const to of recipients) {
    const messageId = crypto.randomUUID();
    const unsubscribeToken = await ensureUnsubscribeToken(admin, to);
    const payload = {
      message_id: messageId,
      to, from: FROM, sender_domain: SENDER_DOMAIN,
      subject, html, text,
      purpose: "transactional",
      label: "agent-advances-daily-report",
      idempotency_key: `agent-advances-daily-report:${dateStr}:${to}`,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    };

    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "agent-advances-daily-report",
      recipient_email: to,
      status: "pending",
      metadata: { subject, date: dateStr },
    });

    const { error: enqErr } = await admin.rpc("enqueue_email", { queue_name: "transactional_emails", payload });
    results[to] = enqErr ? `error: ${enqErr.message}` : "queued";
    if (enqErr) console.error("[agent-advances-daily-report] enqueue error:", to, enqErr);
  }

  await admin.from("system_events").insert({
    event_type: "agent_advances_daily_report",
    metadata: {
      date: dateStr, recipients,
      requests_today: report.requestsToday,
      approved_today: report.approvedToday,
      rejected_today: report.rejectedToday,
      repaid_today: report.repaidToday,
      arrears_agents: report.arrears.length,
      results,
    },
  });

  return { date: dateStr, sent: true, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any = {};
  try { if (req.method === "POST") body = await req.json(); } catch { body = {}; }

  const force = body?.force === true;
  const preview = body?.preview === true;
  const recipientsOverride: string[] | undefined = Array.isArray(body?.recipients)
    ? body.recipients.filter((x: unknown) => typeof x === "string" && x.includes("@"))
    : undefined;
  const dates: string[] = Array.isArray(body?.dates) ? body.dates : body?.date ? [body.date] : [eatToday()];

  try {
    if (preview) {
      const d = dates[0];
      const report = await buildReport(admin, d);
      const prettyDate = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      });
      return new Response(buildHtml(report, prettyDate), {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const out: Record<string, unknown>[] = [];
    for (const d of dates) out.push(await sendForDate(admin, d, force, recipientsOverride));
    return new Response(JSON.stringify({ ok: true, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[agent-advances-daily-report] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});