// Agent Advances daily report.
//
// Scheduled at 18:00 EAT (15:00 UTC) via pg_cron. Focuses exclusively on the
// agent credit-advance programme: how many agents exist, how many hold
// advances, today's request/approval/rejection flow vs. system totals,
// rejection-reason breakdown, month-to-date request trend, and the repayment
// health of the outstanding book (paying-back, repayment rate, overdue).
//
// Charts are rendered as images via QuickChart. Emails go through the existing
// Lovable email queue (enqueue_email -> process-email-queue -> sendLovableEmail).
//
// Idempotent per EAT day via an `agent_advances_daily_report` system_event
// (bypass with { force: true }). Supports backfill via { date } or { dates }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fixed recipients for the operational report. Adjust here to change who
// receives the daily advances report.
const REPORT_RECIPIENTS = ["benjamin@welile.com", "paphra.me@gmail.com"];

const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";

function fmtUGX(n: number): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

function pct(n: number): string {
  return `${(Math.round((Number(n) || 0) * 10) / 10).toLocaleString("en-US")}%`;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureUnsubscribeToken(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = generateToken();
  await admin
    .from("email_unsubscribe_tokens")
    .upsert({ token, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
  const { data: stored } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  return (stored?.token as string) || token;
}

// Calendar date (YYYY-MM-DD) in East Africa Time (UTC+3, no DST).
function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// UTC ISO bounds for a given EAT calendar day.
function eatDayBounds(dateStr: string): { startISO: string; endISO: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const startEAT = Date.UTC(y, m - 1, d, 0, 0, 0) - 3 * 60 * 60 * 1000;
  const endEAT = startEAT + 24 * 60 * 60 * 1000;
  return {
    startISO: new Date(startEAT).toISOString(),
    endISO: new Date(endEAT).toISOString(),
  };
}

// EAT calendar day (YYYY-MM-DD) for a UTC timestamp.
function eatDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chartUrl(config: unknown, w = 700, h = 320): string {
  const c = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=${w}&h=${h}&bkg=white&devicePixelRatio=2&c=${c}`;
}

const PURPLE = "#6c21c4";
const PURPLE_DK = "#4c1696";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const BLUE = "#2563eb";

// A request counts as "approved" once it has cleared agent ops (or any later
// approval stage / CFO disbursement). Rejected and pending are explicit.
function isApproved(status: string, cfoPaidAt: unknown): boolean {
  const s = String(status || "").toLowerCase();
  return (
    !!cfoPaidAt ||
    s.includes("approved") ||
    s === "disbursed" ||
    s === "active" ||
    s === "repaying"
  );
}
function isRejected(status: string): boolean {
  return String(status || "").toLowerCase().includes("reject");
}
function isPending(status: string): boolean {
  return String(status || "").toLowerCase() === "pending";
}

// Normalise a free-text rejection reason into a compact bucket label.
function reasonBucket(raw: string): string {
  const r = String(raw || "").trim().toLowerCase();
  if (!r) return "No reason given";
  if (r.includes("test")) return "Feature under test";
  if (r.includes("agent ops")) return "Rejected at agent ops stage";
  if (r.includes("tenant")) return "Rejected at tenant ops stage";
  if (r.includes("landlord")) return "Rejected at landlord ops stage";
  if (r.includes("duplicate")) return "Duplicate request";
  if (r.includes("eligib") || r.includes("limit")) return "Not eligible / over limit";
  if (r.includes("document") || r.includes("kyc") || r.includes("id")) return "Documents / KYC";
  if (r.includes("outstanding") || r.includes("overdue") || r.includes("debt")) return "Existing debt / overdue";
  // Fall back to the first ~40 chars of the raw reason (title-cased-ish).
  return raw.trim().slice(0, 40);
}

interface Report {
  date: string;
  totalAgents: number;
  agentsWithAdvances: number;
  agentsWithActiveAdvances: number;
  // Requests
  requestsTotal: number;
  requestsToday: number;
  approvedTotal: number;
  approvedToday: number;
  rejectedTotal: number;
  rejectedToday: number;
  pendingTotal: number;
  // Rejection reasons
  reasonsToday: { label: string; count: number }[];
  reasonsAllTime: { label: string; count: number }[];
  // Month trend (new requests per EAT day this month)
  monthDays: string[]; // "DD"
  monthCounts: number[];
  monthFullDates: string[]; // YYYY-MM-DD
  // Portfolio / repayment
  activeCount: number;
  activeOutstanding: number;
  overdueCount: number;
  overdueOutstanding: number;
  completedCount: number;
  totalPrincipalIssued: number;
  totalRepaid: number;
  repaidToday: number;
  repaidThisMonth: number;
  repaymentRate: number; // % of live advances that paid today (dashboard rateToday)
  payingBackCount: number; // dashboard stats.paidCount
  unpaidCount: number; // dashboard stats.unpaidCount
  totalArrears: number; // dashboard stats.totalArrears
  // Interest revenue (dashboard revenue.* — sourced from agent_advance_ledger)
  interestToday: number;
  interestMTD: number;
  dailyAvgInterest: number;
  collectedMTD: number;
  topOverdue: { name: string; phone: string; outstanding: number }[];
}

function nameOf(p: any): string {
  return (p?.full_name || "").trim() || "Unknown agent";
}

async function buildReport(
  admin: ReturnType<typeof createClient>,
  dateStr: string,
): Promise<Report> {
  const { startISO, endISO } = eatDayBounds(dateStr);
  const monthStartISO = new Date(
    Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, 1) -
      3 * 60 * 60 * 1000,
  ).toISOString();
  const monthStartDate = `${dateStr.slice(0, 7)}-01`;

  // The Agent Ops "Advance Repayment Monitor" dashboard reads from exactly
  // these two sources: the `get_agent_advance_repayment_monitor` RPC (row-
  // level agent state, arrears, repaid_today, wallet, etc.) and the last ~35
  // days of `agent_advance_ledger` (for the trend + interest revenue KPIs).
  // To make this report match the dashboard number-for-number we do the same.
  const [reqRes, advRes, ledgerRes, qualifyingRes, monitorRes] = await Promise.all([
    admin
      .from("agent_advance_requests")
      .select("id, agent_id, principal, total_payable, status, rejection_reason, cfo_paid_at, created_at"),
    admin
      .from("agent_advances")
      .select("id, agent_id, principal, outstanding_balance, status, issued_at"),
    admin
      .from("agent_advance_ledger")
      .select("advance_id, amount_deducted, interest_accrued, date"),
    // "Who is an agent" — the canonical behaviour-based set (listed a house,
    // posted a promissory note, made a rent request for a tenant, or has a
    // qualifying sub-agent). This is the same source of truth the Agent Ops
    // dashboard uses, NOT the raw user_roles count (which is ~22k).
    admin.rpc("agent_ops_qualifying_agent_ids"),
    // Same RPC the AgentAdvanceRepaymentMonitor card calls (default _days=7).
    admin.rpc("get_agent_advance_repayment_monitor", { _days: 7 }),
  ]);

  const requests = reqRes.data ?? [];
  const advances = advRes.data ?? [];
  const ledger = ledgerRes.data ?? [];
  const monitor = (monitorRes.data ?? []) as any[];
  const totalAgents = new Set(
    ((qualifyingRes.data ?? []) as Array<{ agent_id: string }>)
      .map((r) => r.agent_id)
      .filter(Boolean),
  ).size;

  // ---- Requests ----
  const requestsTotal = requests.length;
  const inDay = (iso: string) => iso >= startISO && iso < endISO;
  const todays = requests.filter((r: any) => inDay(r.created_at));
  const requestsToday = todays.length;

  const approvedTotal = requests.filter((r: any) => isApproved(r.status, r.cfo_paid_at)).length;
  const approvedToday = todays.filter((r: any) => isApproved(r.status, r.cfo_paid_at)).length;
  const rejectedTotal = requests.filter((r: any) => isRejected(r.status)).length;
  const rejectedToday = todays.filter((r: any) => isRejected(r.status)).length;
  const pendingTotal = requests.filter((r: any) => isPending(r.status)).length;

  // ---- Rejection reasons ----
  const tallyReasons = (rows: any[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      if (!isRejected(r.status)) continue;
      const label = reasonBucket(r.rejection_reason);
      m[label] = (m[label] || 0) + 1;
    }
    return Object.entries(m)
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => ({ label, count }));
  };
  const reasonsToday = tallyReasons(todays);
  const reasonsAllTime = tallyReasons(requests).slice(0, 8);

  // ---- Month trend ----
  const daysInMonth = new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)),
    0,
  ).getDate();
  const monthMap: Record<string, number> = {};
  for (const r of requests as any[]) {
    if (r.created_at < monthStartISO || r.created_at >= endISO) continue;
    const d = eatDateOf(r.created_at);
    monthMap[d] = (monthMap[d] || 0) + 1;
  }
  const monthDays: string[] = [];
  const monthCounts: number[] = [];
  const monthFullDates: string[] = [];
  const todayDayNum = Number(dateStr.slice(8, 10));
  for (let d = 1; d <= Math.min(daysInMonth, todayDayNum); d++) {
    const full = `${dateStr.slice(0, 7)}-${String(d).padStart(2, "0")}`;
    monthDays.push(String(d));
    monthFullDates.push(full);
    monthCounts.push(monthMap[full] || 0);
  }

  // ---- Portfolio / repayment (SAME source as dashboard) ----
  //
  // Row-level KPIs mirror `AgentAdvanceRepaymentMonitor.stats`:
  //   total          = monitor.length
  //   paidCount      = rows where paid_today
  //   unpaidCount    = rows where !paid_today
  //   collectedToday = sum(paid.repaid_today)          → repaidToday
  //   totalOutstanding = sum(outstanding_balance)      → activeOutstanding + overdueOutstanding
  //   totalArrears   = sum(arrears_balance)
  //   rateToday      = paidCount / total * 100          → repaymentRate
  const paidRows = monitor.filter((r: any) => r.paid_today);
  const unpaidRows = monitor.filter((r: any) => !r.paid_today);
  const overdueMonitor = monitor.filter((r: any) => r.is_overdue);
  const nonOverdueMonitor = monitor.filter((r: any) => !r.is_overdue);
  const num = (v: any) => Number(v ?? 0);

  const agentsWithActiveAdvances = new Set(
    monitor.map((r: any) => r.agent_id).filter(Boolean),
  ).size;
  const activeOutstanding = nonOverdueMonitor.reduce((s: number, r: any) => s + num(r.outstanding_balance), 0);
  const overdueOutstanding = overdueMonitor.reduce((s: number, r: any) => s + num(r.outstanding_balance), 0);
  const totalArrears = monitor.reduce((s: number, r: any) => s + num(r.arrears_balance), 0);
  const repaidToday = paidRows.reduce((s: number, r: any) => s + num(r.repaid_today), 0);
  const payingBackCount = paidRows.length;
  const unpaidCount = unpaidRows.length;
  const repaymentRate = monitor.length ? (payingBackCount / monitor.length) * 100 : 0;

  // Lifetime numbers still come from `agent_advances` — the dashboard doesn't
  // display these directly but they give the report its historical context.
  const agentsWithAdvances = new Set(
    advances.map((a: any) => a.agent_id).filter(Boolean),
  ).size;
  const completed = advances.filter((a: any) => String(a.status) === "completed");
  const totalPrincipalIssued = advances.reduce((s: number, a: any) => s + num(a.principal), 0);

  // Ledger-derived KPIs (same query the dashboard runs, last 35 days).
  const totalRepaid = ledger.reduce((s: number, l: any) => s + num(l.amount_deducted), 0);
  const repaidThisMonth = ledger
    .filter((l: any) => l.date >= monthStartDate && l.date <= dateStr)
    .reduce((s: number, l: any) => s + num(l.amount_deducted), 0);
  const interestToday = ledger
    .filter((l: any) => l.date === dateStr)
    .reduce((s: number, l: any) => s + num(l.interest_accrued), 0);
  const interestMTD = ledger
    .filter((l: any) => l.date >= monthStartDate && l.date <= dateStr)
    .reduce((s: number, l: any) => s + num(l.interest_accrued), 0);
  const collectedMTD = repaidThisMonth;
  const dayNumber = Math.max(1, Number(dateStr.slice(8, 10)));
  const dailyAvgInterest = interestMTD / dayNumber;

  // Top overdue — sourced from the same monitor rows so names/phones match
  // exactly what Agent Ops sees in the "Not repaid today" column.
  const overdueSorted = [...overdueMonitor].sort(
    (a: any, b: any) => num(b.outstanding_balance) - num(a.outstanding_balance),
  ).slice(0, 8);
  const topOverdue = overdueSorted.map((r: any) => ({
    name: (r.full_name || "").trim() || "Unknown agent",
    phone: r.phone || "—",
    outstanding: Math.round(num(r.outstanding_balance)),
  }));

  return {
    date: dateStr,
    totalAgents,
    agentsWithAdvances,
    agentsWithActiveAdvances,
    requestsTotal,
    requestsToday,
    approvedTotal,
    approvedToday,
    rejectedTotal,
    rejectedToday,
    pendingTotal,
    reasonsToday,
    reasonsAllTime,
    monthDays,
    monthCounts,
    monthFullDates,
    activeCount: nonOverdueMonitor.length,
    activeOutstanding,
    overdueCount: overdueMonitor.length,
    overdueOutstanding,
    completedCount: completed.length,
    totalPrincipalIssued,
    totalRepaid,
    repaidToday,
    repaidThisMonth,
    repaymentRate,
    payingBackCount,
    unpaidCount,
    totalArrears,
    interestToday,
    interestMTD,
    dailyAvgInterest,
    collectedMTD,
    topOverdue,
  };
}

function kpiCell(label: string, value: string, color = "#1a1a2e", sub?: string): string {
  return `<td style="padding:12px 8px;background:#f7f3ff;border-radius:8px;text-align:center;vertical-align:top;">
    <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;">${esc(label)}</div>
    <div style="font-size:19px;font-weight:700;color:${color};margin-top:4px;">${esc(value)}</div>
    ${sub ? `<div style="font-size:10px;color:#888;margin-top:2px;">${esc(sub)}</div>` : ""}
  </td>`;
}

function buildHtml(r: Report, prettyDate: string): string {
  // Chart 1 — month-to-date new requests (bar, today highlighted).
  const trendChart = chartUrl({
    type: "bar",
    data: {
      labels: r.monthDays,
      datasets: [{
        label: "New advance requests",
        data: r.monthCounts,
        backgroundColor: r.monthFullDates.map((d) => (d === r.date ? GREEN : PURPLE)),
      }],
    },
    options: {
      plugins: { title: { display: true, text: "New advance requests this month (EAT)" }, legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "Requests" } } },
    },
  }, 700, 320);

  // Chart 2 — request outcome mix (all-time).
  const outcomeChart = chartUrl({
    type: "doughnut",
    data: {
      labels: ["Approved", "Rejected", "Pending"],
      datasets: [{ data: [r.approvedTotal, r.rejectedTotal, r.pendingTotal], backgroundColor: [GREEN, RED, AMBER] }],
    },
    options: { plugins: { title: { display: true, text: "All requests by outcome" }, legend: { position: "bottom" } } },
  }, 340, 300);

  // Chart 3 — advance portfolio health.
  const portfolioChart = chartUrl({
    type: "doughnut",
    data: {
      labels: ["Active (paying)", "Overdue", "Completed"],
      datasets: [{ data: [r.activeCount, r.overdueCount, r.completedCount], backgroundColor: [BLUE, RED, GREEN] }],
    },
    options: { plugins: { title: { display: true, text: "Advance book status" }, legend: { position: "bottom" } } },
  }, 340, 300);

  // Chart 4 — rejection reasons (all-time top buckets).
  const reasonChart = r.reasonsAllTime.length
    ? chartUrl({
        type: "horizontalBar",
        data: {
          labels: r.reasonsAllTime.map((x) => x.label.slice(0, 26)),
          datasets: [{ label: "Rejections", data: r.reasonsAllTime.map((x) => x.count), backgroundColor: RED }],
        },
        options: { plugins: { title: { display: true, text: "Rejection reasons (all-time)" }, legend: { display: false } }, scales: { x: { beginAtZero: true } } },
      }, 700, 300)
    : "";

  const adoption = r.totalAgents ? (r.agentsWithActiveAdvances / r.totalAgents) * 100 : 0;

  const reasonTodayRows = r.reasonsToday.length
    ? r.reasonsToday
        .map(
          (x, i) => `<tr style="background:${i % 2 ? "#faf7ff" : "#ffffff"}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${esc(x.label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${x.count}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#888;">No rejections today.</td></tr>`;

  const overdueRows = r.topOverdue.length
    ? r.topOverdue
        .map(
          (a, i) => `<tr style="background:${i % 2 ? "#faf7ff" : "#ffffff"}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${esc(a.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#555;">${esc(a.phone)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:${RED};">${fmtUGX(a.outstanding)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#888;">No overdue advances. 🎉</td></tr>`;

  return `<!doctype html><html><body style="margin:0;background:#f4f1fa;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <div style="max-width:780px;margin:0 auto;padding:20px;">
    <div style="background:${PURPLE};color:#fff;border-radius:12px 12px 0 0;padding:22px 26px;">
      <h1 style="margin:0;font-size:21px;">Agent Advances Daily Report</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.9;">${esc(prettyDate)} (East Africa Time)</p>
    </div>
    <div style="background:#fff;padding:22px 26px;border:1px solid #e7e0f5;border-top:0;border-radius:0 0 12px 12px;">

      <h2 style="font-size:15px;margin:2px 0 8px;">Agent base &amp; adoption</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Qualifying agents", r.totalAgents.toLocaleString("en-US"), "#1a1a2e", "Meet the agent criteria")}
          ${kpiCell("Agents with advances", String(r.agentsWithActiveAdvances), PURPLE, `${r.agentsWithAdvances} ever · dashboard total`)}
          ${kpiCell("Repaid today", `${r.payingBackCount} · ${fmtUGX(r.repaidToday)}`, GREEN, `${pct(r.repaymentRate)} repayment rate`)}
          ${kpiCell("Not repaid today", String(r.unpaidCount), r.unpaidCount ? RED : GREEN, "Owes a deduction today")}
        </tr>
      </table>

      <h2 style="font-size:15px;margin:20px 0 8px;">Requests — today vs. system</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("New requests", String(r.requestsToday), PURPLE, `${r.requestsTotal} all-time`)}
          ${kpiCell("Approved", String(r.approvedToday), GREEN, `${r.approvedTotal} all-time`)}
          ${kpiCell("Rejected", String(r.rejectedToday), RED, `${r.rejectedTotal} all-time`)}
          ${kpiCell("Pending", String(r.pendingTotal), AMBER, "awaiting review")}
        </tr>
      </table>

      <div style="margin:22px 0;">
        <img src="${trendChart}" alt="New advance requests this month" width="700" style="width:100%;max-width:700px;border:1px solid #eee;border-radius:8px;" />
      </div>

      <table style="width:100%;border-collapse:collapse;margin:0 0 6px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:8px;">
            <img src="${outcomeChart}" alt="Requests by outcome" width="340" style="width:100%;max-width:340px;border:1px solid #eee;border-radius:8px;" />
          </td>
          <td style="width:50%;vertical-align:top;padding-left:8px;">
            <img src="${portfolioChart}" alt="Advance book status" width="340" style="width:100%;max-width:340px;border:1px solid #eee;border-radius:8px;" />
          </td>
        </tr>
      </table>

      <h2 style="font-size:15px;margin:26px 0 8px;">Repayment health</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Repayment rate", pct(r.repaymentRate), r.repaymentRate >= 70 ? GREEN : AMBER, "Paid today ÷ live advances")}
          ${kpiCell("Total arrears", fmtUGX(r.totalArrears), r.totalArrears > 0 ? AMBER : GREEN, `Outstanding ${fmtUGX(r.activeOutstanding + r.overdueOutstanding)}`)}
          ${kpiCell("Repaid this month", fmtUGX(r.repaidThisMonth), GREEN)}
          ${kpiCell("Repaid (last 35d)", fmtUGX(r.totalRepaid), "#1a1a2e", "Ledger window")}
        </tr>
        <tr>
          ${kpiCell("Active (on-time)", String(r.activeCount), BLUE, fmtUGX(r.activeOutstanding))}
          ${kpiCell("Overdue advances", String(r.overdueCount), RED, fmtUGX(r.overdueOutstanding))}
          ${kpiCell("Completed", String(r.completedCount), GREEN, "fully repaid")}
          ${kpiCell("Principal issued", fmtUGX(r.totalPrincipalIssued))}
        </tr>
      </table>

      <h2 style="font-size:15px;margin:26px 0 8px;">Interest revenue</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Interest today", fmtUGX(r.interestToday), "#4f46e5", "Recognised today")}
          ${kpiCell("Interest this month", fmtUGX(r.interestMTD), "#4f46e5", `Avg ${fmtUGX(r.dailyAvgInterest)}/day`)}
          ${kpiCell("Collected this month", fmtUGX(r.collectedMTD), GREEN)}
          ${kpiCell("Principal this month", fmtUGX(Math.max(0, r.collectedMTD - r.interestMTD)), "#1a1a2e", "Collected − interest")}
        </tr>
      </table>

      ${reasonChart ? `<div style="margin:22px 0;"><img src="${reasonChart}" alt="Rejection reasons" width="700" style="width:100%;max-width:700px;border:1px solid #eee;border-radius:8px;" /></div>` : ""}

      <h2 style="font-size:15px;margin:26px 0 8px;">Today's rejection reasons</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:${RED};color:#fff;text-align:left;">
            <th style="padding:8px 10px;">Reason</th>
            <th style="padding:8px 10px;text-align:right;">Count</th>
          </tr>
        </thead>
        <tbody>${reasonTodayRows}</tbody>
      </table>

      <h2 style="font-size:15px;margin:26px 0 8px;">Overdue advances — recovery focus</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:${PURPLE};color:#fff;text-align:left;">
            <th style="padding:8px 10px;">Agent</th>
            <th style="padding:8px 10px;">Phone</th>
            <th style="padding:8px 10px;text-align:right;">Outstanding</th>
          </tr>
        </thead>
        <tbody>${overdueRows}</tbody>
      </table>

      <p style="margin:24px 0 0;font-size:11px;color:#999;">
        Generated automatically from Welile agent credit-advance data (requests, approvals,
        rejections and repayment ledger) for the reporting day (Africa/Kampala). Internal operations report.
      </p>
    </div>
  </div>
  </body></html>`;
}

function buildText(r: Report, prettyDate: string): string {
  const lines: string[] = [];
  lines.push(`Agent Advances Daily Report — ${prettyDate} (EAT)`);
  lines.push("");
  lines.push(`Qualifying agents: ${r.totalAgents} | Agents with advances: ${r.agentsWithActiveAdvances} (${r.agentsWithAdvances} ever) | Repaid today: ${r.payingBackCount} · ${fmtUGX(r.repaidToday)} | Not repaid today: ${r.unpaidCount}`);
  lines.push(`Requests today: ${r.requestsToday} (system total ${r.requestsTotal})`);
  lines.push(`Approved today: ${r.approvedToday} (total ${r.approvedTotal}) | Rejected today: ${r.rejectedToday} (total ${r.rejectedTotal}) | Pending: ${r.pendingTotal}`);
  lines.push("");
  lines.push(`Repayment rate: ${pct(r.repaymentRate)} (paid today ÷ live advances) | Total arrears: ${fmtUGX(r.totalArrears)} | Repaid this month: ${fmtUGX(r.repaidThisMonth)} | Repaid (35d): ${fmtUGX(r.totalRepaid)}`);
  lines.push(`Active on-time: ${r.activeCount} (${fmtUGX(r.activeOutstanding)}) | Overdue: ${r.overdueCount} (${fmtUGX(r.overdueOutstanding)}) | Completed: ${r.completedCount}`);
  lines.push(`Interest today: ${fmtUGX(r.interestToday)} | Interest MTD: ${fmtUGX(r.interestMTD)} (avg ${fmtUGX(r.dailyAvgInterest)}/day) | Collected MTD: ${fmtUGX(r.collectedMTD)}`);
  lines.push("");
  lines.push("Today's rejection reasons:");
  if (r.reasonsToday.length) {
    for (const x of r.reasonsToday) lines.push(`- ${x.label}: ${x.count}`);
  } else lines.push("- None");
  return lines.join("\n");
}

async function sendForDate(
  admin: ReturnType<typeof createClient>,
  dateStr: string,
  force: boolean,
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const html = buildHtml(report, prettyDate);
  const text = buildText(report, prettyDate);
  const subject = `Agent Advances — ${prettyDate}: ${report.requestsToday} new, ${report.approvedToday} approved, ${report.rejectedToday} rejected · ${pct(report.repaymentRate)} repaid`;

  const results: Record<string, string> = {};
  for (const to of REPORT_RECIPIENTS) {
    const messageId = crypto.randomUUID();
    const unsubscribeToken = await ensureUnsubscribeToken(admin, to);
    const payload = {
      message_id: messageId,
      to,
      from: FROM,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
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

    const { error: enqErr } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });
    results[to] = enqErr ? `error: ${enqErr.message}` : "queued";
    if (enqErr) console.error("[agent-advances-daily-report] enqueue error:", to, enqErr);
  }

  await admin.from("system_events").insert({
    event_type: "agent_advances_daily_report",
    metadata: {
      date: dateStr,
      recipients: REPORT_RECIPIENTS,
      requests_today: report.requestsToday,
      approved_today: report.approvedToday,
      rejected_today: report.rejectedToday,
      repayment_rate: report.repaymentRate,
      results,
    },
  });

  return { date: dateStr, sent: true, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let body: any = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch {
    body = {};
  }

  const force = body?.force === true;
  const preview = body?.preview === true;
  const dates: string[] = Array.isArray(body?.dates)
    ? body.dates
    : body?.date
    ? [body.date]
    : [eatToday()];

  try {
    if (preview) {
      const d = dates[0];
      const report = await buildReport(admin, d);
      const prettyDate = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      });
      const html = buildHtml(report, prettyDate);
      return new Response(html, {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const out: Record<string, unknown>[] = [];
    for (const d of dates) {
      out.push(await sendForDate(admin, d, force));
    }
    return new Response(JSON.stringify({ ok: true, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[agent-advances-daily-report] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});