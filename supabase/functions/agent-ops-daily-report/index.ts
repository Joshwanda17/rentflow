// Agent Ops daily report.
//
// Scheduled at 18:00 EAT (15:00 UTC) via pg_cron. Summarises the day's agent
// field activity — rent collections, wallet deposits and credit advance
// requests — into an HTML email with KPIs, charts (rendered as images via
// QuickChart) and per-agent detail tables. Emails go to the fixed ops
// recipients below through the existing Lovable email queue
// (enqueue_email -> process-email-queue -> sendLovableEmail).
//
// Idempotent per EAT day via an `agent_ops_daily_report` system_event
// (bypass with { force: true }). Supports backfill via { date } or { dates }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fixed recipients for the operational report.
const REPORT_RECIPIENTS = ["paphra.me@gmail.com", "benjamin@welile.com"];

// Email sender identity (matches other Welile report scaffolds).
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";

function fmtUGX(n: number): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
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

// Hour-of-day (0-23) in EAT for a UTC timestamp.
function eatHour(iso: string): number {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).getUTCHours();
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Build a QuickChart image URL from a Chart.js config.
function chartUrl(config: unknown, w = 700, h = 320): string {
  const c = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=${w}&h=${h}&bkg=white&devicePixelRatio=2&c=${c}`;
}

const PURPLE = "#6c21c4";
const PURPLE_DK = "#4c1696";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const SKY = "#0284c7";
const RED = "#dc2626";

const COMMISSION_LEDGER_CATEGORIES = [
  "agent_commission_earned",
  "agent_commission",
  "agent_bonus",
  "agent_investment_commission",
  "proxy_investment_commission",
  "partner_commission",
];
const COMMISSION_CREDIT_DIRECTIONS = ["cash_in", "credit"];

interface Report {
  date: string;
  collectionsCount: number;
  collectionsTotal: number;
  depositsCount: number;
  depositsTotal: number;
  advancesCount: number;
  advancesPending: number;
  advancesApproved: number;
  advancesTotal: number;
  uniqueAgents: number;
  hourly: number[]; // collection count per EAT hour (24)
  hourlyVolume: number[]; // collected volume per EAT hour (24)
  topAgents: { name: string; total: number; count: number }[];
  perAgent: { name: string; phone: string; collections: number; collected: number; deposits: number; deposited: number }[];
  // Advance repayment receivables — projected inflows from currently active
  // agent_advances over the next N days (starting tomorrow EAT).
  receivables: {
    horizons: {
      label: string;
      days: number;
      contributingAdvances: number;
      principalDue: number;
      interestDue: number;
      totalDue: number;
    }[];
    activeAdvances: number;
    totalOutstanding: number;
  };
}

interface ActivityBlock {
  listingsCreated: number;
  listingsVerified: number;
  listingsRejected: number;
  landlordsOnboarded: number;
  landlordsVerified: number;
  subAgentsRecruited: number;
  subAgentsVerified: number;
  campaignRegistrations: number;
  fieldVisits: number;
  visitingAgents: number;
  landlordPayoutsCount: number;
  landlordPayoutsAmount: number;
  advanceRepaymentsCount: number;
  advanceRepaymentsAmount: number;
  advanceInterestAccrued: number;
}

function nameOf(p: any): string {
  return (p?.full_name || "").trim() || "Unknown agent";
}

async function buildReport(
  admin: ReturnType<typeof createClient>,
  dateStr: string,
): Promise<Report & { activity: ActivityBlock }> {
  const { startISO, endISO } = eatDayBounds(dateStr);

  const [collectionsRes, advancesRes, depositsRes] = await Promise.all([
    admin
      .from("agent_collections")
      .select("id, agent_id, tenant_id, amount, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    admin
      .from("agent_advance_requests")
      .select("id, agent_id, principal, total_payable, status, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    admin
      .from("wallet_deposits")
      .select("id, agent_id, amount, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
  ]);

  const collections = collectionsRes.data ?? [];
  const advances = advancesRes.data ?? [];
  const deposits = depositsRes.data ?? [];

  const ids = Array.from(
    new Set(
      [
        ...collections.map((c: any) => c.agent_id),
        ...advances.map((a: any) => a.agent_id),
        ...deposits.map((d: any) => d.agent_id),
      ].filter(Boolean) as string[],
    ),
  );
  const profilesMap: Record<string, any> = {};
  if (ids.length) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, phone_number")
      .in("id", ids);
    (data ?? []).forEach((p: any) => (profilesMap[p.id] = p));
  }

  const collectionsTotal = collections.reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
  const depositsTotal = deposits.reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
  const advancesTotal = advances.reduce((s: number, a: any) => s + Number(a.principal ?? 0), 0);
  const advancesPending = advances.filter((a: any) => (a.status ?? "pending") === "pending").length;
  const advancesApproved = advances.filter((a: any) => String(a.status ?? "").includes("approved")).length;
  const uniqueAgents = new Set(
    [...collections, ...deposits].map((r: any) => r.agent_id).filter(Boolean),
  ).size;

  const hourly = new Array(24).fill(0);
  const hourlyVolume = new Array(24).fill(0);
  for (const c of collections as any[]) {
    const h = eatHour(c.created_at);
    hourly[h] += 1;
    hourlyVolume[h] += Number(c.amount ?? 0);
  }

  const byAgent: Record<string, { collected: number; collections: number; deposited: number; deposits: number }> = {};
  const bump = (id: string) => (byAgent[id] ??= { collected: 0, collections: 0, deposited: 0, deposits: 0 });
  for (const c of collections as any[]) {
    if (!c.agent_id) continue;
    const a = bump(c.agent_id);
    a.collected += Number(c.amount ?? 0);
    a.collections += 1;
  }
  for (const d of deposits as any[]) {
    if (!d.agent_id) continue;
    const a = bump(d.agent_id);
    a.deposited += Number(d.amount ?? 0);
    a.deposits += 1;
  }

  const topAgents = Object.entries(byAgent)
    .sort(([, a], [, b]) => b.collected - a.collected)
    .slice(0, 8)
    .map(([id, v]) => ({ name: nameOf(profilesMap[id]), total: Math.round(v.collected), count: v.collections }));

  const perAgent = Object.entries(byAgent)
    .sort(([, a], [, b]) => (b.collected + b.deposited) - (a.collected + a.deposited))
    .map(([id, v]) => ({
      name: nameOf(profilesMap[id]),
      phone: profilesMap[id]?.phone_number || "—",
      collections: v.collections,
      collected: Math.round(v.collected),
      deposits: v.deposits,
      deposited: Math.round(v.deposited),
    }));

  // ---- Advance repayment projections (starting tomorrow EAT) ----
  const { data: activeAdvances } = await admin
    .from("agent_advances")
    .select("id, principal, outstanding_balance, daily_installment, monthly_rate, expires_at, status, prepaid_installments_remaining")
    .in("status", ["active", "repaying", "approved", "disbursed"])
    .gt("outstanding_balance", 0);

  const tomorrowStart = new Date(new Date(endISO).getTime()); // endISO of the report day == start of next EAT day
  const HORIZONS = [
    { label: "Tomorrow", days: 1 },
    { label: "Next 7 days", days: 7 },
    { label: "Next 30 days", days: 30 },
    { label: "Next 60 days", days: 60 },
    { label: "Next 90 days", days: 90 },
  ];
  const horizonResults = HORIZONS.map((h) => ({
    label: h.label,
    days: h.days,
    contributingAdvances: 0,
    principalDue: 0,
    interestDue: 0,
    totalDue: 0,
  }));
  let totalOutstanding = 0;
  for (const adv of (activeAdvances ?? []) as any[]) {
    const principal = Number(adv.principal ?? 0);
    const outstanding = Number(adv.outstanding_balance ?? 0);
    const dailyInstallment = Number(adv.daily_installment ?? 0);
    const monthlyRate = Number(adv.monthly_rate ?? 0);
    const prepaid = Number(adv.prepaid_installments_remaining ?? 0);
    totalOutstanding += outstanding;
    if (dailyInstallment <= 0 || outstanding <= 0) continue;

    // Days remaining based on expires_at (cap so we don't count past-due)
    const expiresMs = adv.expires_at ? new Date(adv.expires_at).getTime() : tomorrowStart.getTime() + 90 * 86400000;
    const daysLeftByExpiry = Math.max(0, Math.ceil((expiresMs - tomorrowStart.getTime()) / 86400000));
    // Days remaining based on outstanding balance
    const daysLeftByBalance = Math.max(0, Math.ceil(outstanding / dailyInstallment));
    const daysRemaining = Math.min(daysLeftByExpiry, daysLeftByBalance);
    if (daysRemaining <= 0) continue;

    // Interest per day proxy: principal × (monthly_rate / 30). If monthly_rate
    // is missing, back-solve from the daily installment vs. principal.
    let interestPerDay = principal * (monthlyRate / 30);
    if (interestPerDay <= 0 && daysLeftByBalance > 0) {
      const totalInterestExpected = Math.max(0, dailyInstallment * daysLeftByBalance - outstanding);
      interestPerDay = totalInterestExpected / Math.max(1, daysLeftByBalance);
    }
    const principalPerDay = Math.max(0, dailyInstallment - interestPerDay);

    for (const h of horizonResults) {
      // Prepaid installments produce no cash inflow — they're already paid.
      const billableDays = Math.max(0, Math.min(h.days, daysRemaining) - Math.min(prepaid, h.days));
      if (billableDays <= 0) continue;
      h.contributingAdvances += 1;
      h.principalDue += principalPerDay * billableDays;
      h.interestDue += interestPerDay * billableDays;
      h.totalDue += dailyInstallment * billableDays;
    }
  }

  return {
    date: dateStr,
    collectionsCount: collections.length,
    collectionsTotal,
    depositsCount: deposits.length,
    depositsTotal,
    advancesCount: advances.length,
    advancesPending,
    advancesApproved,
    advancesTotal,
    uniqueAgents,
    hourly,
    hourlyVolume,
    topAgents,
    perAgent,
    receivables: {
      horizons: horizonResults.map((h) => ({
        ...h,
        principalDue: Math.round(h.principalDue),
        interestDue: Math.round(h.interestDue),
        totalDue: Math.round(h.totalDue),
      })),
      activeAdvances: (activeAdvances ?? []).length,
      totalOutstanding: Math.round(totalOutstanding),
    },
    activity: await buildActivityBlock(admin, startISO, endISO),
  };
}

async function buildActivityBlock(
  admin: ReturnType<typeof createClient>,
  startISO: string,
  endISO: string,
): Promise<ActivityBlock> {
  const countIn = async (
    table: string,
    dateCol: string,
    extra?: (q: any) => any,
  ): Promise<number> => {
    let q: any = admin.from(table).select("id", { count: "exact", head: true })
      .gte(dateCol, startISO).lt(dateCol, endISO);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) {
      console.warn(`[agent-ops-daily-report] count ${table}.${dateCol} failed:`, error.message);
      return 0;
    }
    return count ?? 0;
  };

  const [
    listingsCreated,
    listingsVerified,
    listingsRejected,
    landlordsOnboarded,
    landlordsVerified,
    subAgentsRecruited,
    subAgentsVerified,
    campaignRegistrations,
  ] = await Promise.all([
    countIn("house_listings", "created_at"),
    countIn("house_listings", "verified_at", (q) => q.eq("verified", true)),
    countIn("house_listings", "updated_at", (q) => q.eq("status", "rejected")),
    countIn("landlords", "created_at"),
    countIn("landlords", "verified_at", (q) => q.eq("verified", true)),
    countIn("agent_subagents", "created_at"),
    countIn("agent_subagents", "verified_at"),
    countIn("recruitment_campaign_registrations", "registered_at"),
  ]);

  // Field visits: count rows + unique agents
  const { data: visits } = await admin
    .from("agent_visits")
    .select("agent_id")
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  const fieldVisits = (visits ?? []).length;
  const visitingAgents = new Set((visits ?? []).map((v: any) => v.agent_id).filter(Boolean)).size;

  // Landlord payouts settled today
  const { data: payouts } = await admin
    .from("landlord_payouts")
    .select("amount")
    .gte("updated_at", startISO)
    .lt("updated_at", endISO)
    .in("status", ["completed", "paid", "success"]);
  const landlordPayoutsAmount = (payouts ?? []).reduce(
    (s: number, p: any) => s + Number(p.amount ?? 0),
    0,
  );

  // Advance repayments actually applied today
  const { data: repay } = await admin
    .from("agent_advance_ledger")
    .select("amount_deducted, interest_accrued")
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  const advanceRepaymentsAmount = (repay ?? []).reduce(
    (s: number, r: any) => s + Number(r.amount_deducted ?? 0),
    0,
  );
  const advanceInterestAccrued = (repay ?? []).reduce(
    (s: number, r: any) => s + Number(r.interest_accrued ?? 0),
    0,
  );

  return {
    listingsCreated,
    listingsVerified,
    listingsRejected,
    landlordsOnboarded,
    landlordsVerified,
    subAgentsRecruited,
    subAgentsVerified,
    campaignRegistrations,
    fieldVisits,
    visitingAgents,
    landlordPayoutsCount: (payouts ?? []).length,
    landlordPayoutsAmount: Math.round(landlordPayoutsAmount),
    advanceRepaymentsCount: (repay ?? []).length,
    advanceRepaymentsAmount: Math.round(advanceRepaymentsAmount),
    advanceInterestAccrued: Math.round(advanceInterestAccrued),
  };
}

function kpiCell(label: string, value: string, color = "#1a1a2e"): string {
  return `<td style="padding:12px 8px;background:#f7f3ff;border-radius:8px;text-align:center;vertical-align:top;">
    <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;">${esc(label)}</div>
    <div style="font-size:19px;font-weight:700;color:${color};margin-top:4px;">${esc(value)}</div>
  </td>`;
}

function buildReceivablesSection(r: Report): string {
  const cards = r.receivables.horizons.map((h) => {
    const interestPct = h.totalDue > 0 ? (h.interestDue / h.totalDue) * 100 : 0;
    return `
      <td style="width:20%;padding:6px;vertical-align:top;">
        <div style="background:linear-gradient(160deg, ${PURPLE} 0%, ${PURPLE_DK} 100%);color:#fff;border-radius:14px;padding:16px 14px;box-shadow:0 6px 18px rgba(76,22,150,.18);">
          <div style="font-size:11px;opacity:.85;text-transform:uppercase;letter-spacing:.6px;">${esc(h.label)}</div>
          <div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.1;">${esc(fmtUGX(h.totalDue))}</div>
          <div style="height:1px;background:rgba(255,255,255,.25);margin:10px 0;"></div>
          <div style="font-size:11px;opacity:.9;">Interest generated</div>
          <div style="font-size:16px;font-weight:700;color:#ffe89a;margin-top:2px;">${esc(fmtUGX(h.interestDue))}</div>
          <div style="font-size:10px;opacity:.75;margin-top:2px;">${interestPct.toFixed(1)}% of collections</div>
          <div style="height:1px;background:rgba(255,255,255,.25);margin:10px 0;"></div>
          <div style="font-size:10px;opacity:.85;">Principal ${esc(fmtUGX(h.principalDue))}</div>
          <div style="font-size:10px;opacity:.85;margin-top:2px;">${h.contributingAdvances.toLocaleString()} active advances</div>
        </div>
      </td>`;
  }).join("");

  const totalInterestNext90 = r.receivables.horizons.find((h) => h.days === 90)?.interestDue ?? 0;
  const totalNext90 = r.receivables.horizons.find((h) => h.days === 90)?.totalDue ?? 0;

  return `
    <table role="presentation" style="width:100%;background:#fef7ec;border:1px solid #f5d38a;border-radius:14px;margin-bottom:18px;border-collapse:separate;">
      <tr>
        <td style="padding:14px 16px;vertical-align:top;">
          <h2 style="margin:0;font-size:17px;color:${PURPLE_DK};">Advance Repayments Receivable</h2>
          <p style="margin:4px 0 0;font-size:11px;color:#7a5a1a;">Projected inflows from ${r.receivables.activeAdvances.toLocaleString()} active agent advances · Total outstanding ${esc(fmtUGX(r.receivables.totalOutstanding))}</p>
        </td>
        <td style="padding:14px 16px;text-align:right;vertical-align:top;white-space:nowrap;">
          <div style="font-size:10px;color:#7a5a1a;text-transform:uppercase;letter-spacing:.4px;">Projected interest (90d)</div>
          <div style="font-size:20px;font-weight:800;color:${GREEN};">${esc(fmtUGX(totalInterestNext90))}</div>
          <div style="font-size:10px;color:#7a5a1a;">of ${esc(fmtUGX(totalNext90))} total collections</div>
        </td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:22px;">
      <tr>${cards}</tr>
    </table>
  `;
}

function buildActivitySection(a: ActivityBlock): string {
  const row = (
    label: string,
    value: string,
    sub?: string,
    color = PURPLE_DK,
  ) => `
    <td style="padding:12px 10px;background:#faf7ff;border:1px solid #ece5fb;border-radius:10px;text-align:center;vertical-align:top;">
      <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;">${esc(label)}</div>
      <div style="font-size:20px;font-weight:800;color:${color};margin-top:4px;">${esc(value)}</div>
      ${sub ? `<div style="font-size:10px;color:#888;margin-top:3px;">${esc(sub)}</div>` : ""}
    </td>`;
  return `
    <h2 style="font-size:15px;margin:22px 0 8px;color:${PURPLE_DK};">Agent activity today</h2>
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:6px;">
      <tr>
        ${row("Houses listed", a.listingsCreated.toLocaleString())}
        ${row("Houses verified", a.listingsVerified.toLocaleString(), undefined, GREEN)}
        ${row("Houses rejected", a.listingsRejected.toLocaleString(), undefined, RED)}
        ${row("Landlords added", a.landlordsOnboarded.toLocaleString())}
      </tr>
      <tr>
        ${row("Landlords verified", a.landlordsVerified.toLocaleString(), undefined, GREEN)}
        ${row("Sub-agents recruited", a.subAgentsRecruited.toLocaleString())}
        ${row("Sub-agents verified", a.subAgentsVerified.toLocaleString(), undefined, GREEN)}
        ${row("Campaign sign-ups", a.campaignRegistrations.toLocaleString(), undefined, SKY)}
      </tr>
      <tr>
        ${row("Field visits", a.fieldVisits.toLocaleString(), `${a.visitingAgents.toLocaleString()} agents`)}
        ${row("Landlord payouts", a.landlordPayoutsCount.toLocaleString(), fmtUGX(a.landlordPayoutsAmount), GREEN)}
        ${row("Advance repayments", a.advanceRepaymentsCount.toLocaleString(), fmtUGX(a.advanceRepaymentsAmount), GREEN)}
        ${row("Interest accrued", fmtUGX(a.advanceInterestAccrued), "on active advances", AMBER)}
      </tr>
    </table>
  `;
}

function buildHtml(r: Report & { activity: ActivityBlock }, prettyDate: string): string {
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  // Chart 1 — hourly collections (count + volume dual axis).
  const hourlyChart = chartUrl({
    type: "bar",
    data: {
      labels: hourLabels,
      datasets: [
        { label: "Collections", data: r.hourly, backgroundColor: PURPLE },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Collections by hour (EAT)" }, legend: { display: false } },
      scales: { y: { title: { display: true, text: "Count" }, beginAtZero: true } },
    },
  }, 700, 320);

  // Chart 2 — activity mix doughnut.
  const mixChart = chartUrl({
    type: "doughnut",
    data: {
      labels: ["Rent collections", "Wallet deposits", "Advance requests"],
      datasets: [{ data: [r.collectionsCount, r.depositsCount, r.advancesCount], backgroundColor: [PURPLE, GREEN, AMBER] }],
    },
    options: { plugins: { title: { display: true, text: "Activity mix" }, legend: { position: "bottom" } } },
  }, 340, 300);

  // Chart 3 — top agents by collected volume.
  const topChart = r.topAgents.length
    ? chartUrl({
        type: "bar",
        data: {
          labels: r.topAgents.map((a) => a.name.slice(0, 18)),
          datasets: [{ label: "Collected (UGX)", data: r.topAgents.map((a) => a.total), backgroundColor: PURPLE_DK }],
        },
        options: { indexAxis: "y", plugins: { title: { display: true, text: "Top agents by volume" }, legend: { display: false } }, scales: { x: { beginAtZero: true } } },
      }, 340, 300)
    : "";

  const perAgentRows = r.perAgent.length
    ? r.perAgent
        .map(
          (a, i) => `
      <tr style="background:${i % 2 ? "#faf7ff" : "#ffffff"}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${esc(a.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#555;">${esc(a.phone)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${a.collections}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtUGX(a.collected)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${a.deposits}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${fmtUGX(a.deposited)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" style="padding:14px;text-align:center;color:#888;">No agent field activity recorded for this day.</td></tr>`;

  const avgPerAgent = r.uniqueAgents ? r.collectionsTotal / r.uniqueAgents : 0;

  return `<!doctype html><html><body style="margin:0;background:#f4f1fa;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <div style="max-width:780px;margin:0 auto;padding:20px;">
    <div style="background:${PURPLE};color:#fff;border-radius:12px 12px 0 0;padding:22px 26px;">
      <h1 style="margin:0;font-size:21px;">Agent Ops Daily Report</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.9;">${esc(prettyDate)} (East Africa Time)</p>
    </div>
    <div style="background:#fff;padding:22px 26px;border:1px solid #e7e0f5;border-top:0;border-radius:0 0 12px 12px;">

      <!-- HEADLINE: Advance repayment receivables (top-of-report) -->
      ${buildReceivablesSection(r)}

      <!-- Field activity KPIs (original report) -->
      <h2 style="font-size:15px;margin:0 0 8px;color:${PURPLE_DK};">Field activity today</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:8px;">
        <tr>
          ${kpiCell("Active agents", String(r.uniqueAgents))}
          ${kpiCell("Collections", String(r.collectionsCount), PURPLE)}
          ${kpiCell("Collected", fmtUGX(r.collectionsTotal), GREEN)}
          ${kpiCell("Avg / agent", fmtUGX(avgPerAgent))}
        </tr>
        <tr>
          ${kpiCell("Wallet deposits", String(r.depositsCount))}
          ${kpiCell("Deposited", fmtUGX(r.depositsTotal), GREEN)}
          ${kpiCell("Advances pending", String(r.advancesPending), AMBER)}
          ${kpiCell("Advances approved", String(r.advancesApproved))}
        </tr>
      </table>

      ${buildActivitySection(r.activity)}

      <div style="margin:22px 0;">
        <img src="${hourlyChart}" alt="Collections by hour" width="700" style="width:100%;max-width:700px;border:1px solid #eee;border-radius:8px;" />
      </div>

      <table style="width:100%;border-collapse:collapse;margin:0 0 6px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:8px;">
            <img src="${mixChart}" alt="Activity mix" width="340" style="width:100%;max-width:340px;border:1px solid #eee;border-radius:8px;" />
          </td>
          <td style="width:50%;vertical-align:top;padding-left:8px;">
            ${topChart ? `<img src="${topChart}" alt="Top agents" width="340" style="width:100%;max-width:340px;border:1px solid #eee;border-radius:8px;" />` : ""}
          </td>
        </tr>
      </table>

      <h2 style="font-size:15px;margin:26px 0 8px;">Per agent breakdown</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:${PURPLE};color:#fff;text-align:left;">
            <th style="padding:8px 10px;">Agent</th>
            <th style="padding:8px 10px;">Phone</th>
            <th style="padding:8px 10px;text-align:right;">Collections</th>
            <th style="padding:8px 10px;text-align:right;">Collected</th>
            <th style="padding:8px 10px;text-align:right;">Deposits</th>
            <th style="padding:8px 10px;text-align:right;">Deposited</th>
          </tr>
        </thead>
        <tbody>${perAgentRows}</tbody>
      </table>

      <p style="margin:24px 0 0;font-size:11px;color:#999;">
        Generated automatically from Welile agent field activity (rent collections, wallet deposits and
        credit advance requests) for the reporting day (Africa/Kampala). Internal operations report.
      </p>
    </div>
  </div>
  </body></html>`;
}

function buildText(r: Report, prettyDate: string): string {
  const lines: string[] = [];
  lines.push(`Agent Ops Daily Report — ${prettyDate} (EAT)`);
  lines.push("");
  lines.push("== Advance Repayments Receivable ==");
  lines.push(`Active advances: ${r.receivables.activeAdvances.toLocaleString()} · Outstanding: ${fmtUGX(r.receivables.totalOutstanding)}`);
  for (const h of r.receivables.horizons) {
    lines.push(`- ${h.label}: ${fmtUGX(h.totalDue)} (interest ${fmtUGX(h.interestDue)}, principal ${fmtUGX(h.principalDue)})`);
  }
  lines.push("");
  lines.push("== Field activity ==");
  lines.push(`Active agents: ${r.uniqueAgents}`);
  lines.push(`Rent collections: ${r.collectionsCount} (${fmtUGX(r.collectionsTotal)})`);
  lines.push(`Wallet deposits: ${r.depositsCount} (${fmtUGX(r.depositsTotal)})`);
  lines.push(`Advance requests: ${r.advancesCount} (pending ${r.advancesPending}, approved ${r.advancesApproved})`);
  lines.push("");
  lines.push("Per agent:");
  for (const a of r.perAgent) {
    lines.push(`- ${a.name} (${a.phone}): ${a.collections} collections ${fmtUGX(a.collected)}, ${a.deposits} deposits ${fmtUGX(a.deposited)}`);
  }
  if (!r.perAgent.length) lines.push("- No agent field activity recorded for this day.");
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
      .eq("event_type", "agent_ops_daily_report")
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
  const subject = `Agent Ops — ${prettyDate}: ${report.collectionsCount} collections (${fmtUGX(report.collectionsTotal)}), ${report.uniqueAgents} agents`;

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
      label: "agent-ops-daily-report",
      idempotency_key: `agent-ops-daily-report:${dateStr}:${to}`,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    };

    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "agent-ops-daily-report",
      recipient_email: to,
      status: "pending",
      metadata: { subject, date: dateStr },
    });

    const { error: enqErr } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });
    results[to] = enqErr ? `error: ${enqErr.message}` : "queued";
    if (enqErr) console.error("[agent-ops-daily-report] enqueue error:", to, enqErr);
  }

  await admin.from("system_events").insert({
    event_type: "agent_ops_daily_report",
    metadata: {
      date: dateStr,
      recipients: REPORT_RECIPIENTS,
      collections: report.collectionsCount,
      collected: report.collectionsTotal,
      deposits: report.depositsCount,
      unique_agents: report.uniqueAgents,
      results,
    },
  });

  return {
    date: dateStr,
    recipients: REPORT_RECIPIENTS,
    collections: report.collectionsCount,
    collected: report.collectionsTotal,
    deposits: report.depositsCount,
    unique_agents: report.uniqueAgents,
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const force = body?.force === true;
    const preview = body?.preview === true;
    let dates: string[];
    if (Array.isArray(body?.dates) && body.dates.length) {
      dates = body.dates.map((d: string) => String(d).slice(0, 10));
    } else if (typeof body?.date === "string" && body.date) {
      dates = [body.date.slice(0, 10)];
    } else {
      dates = [eatToday()];
    }

    if (preview) {
      const dateStr = dates[0];
      const report = await buildReport(admin, dateStr);
      const prettyDate = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
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

    // Best-effort: trigger the dispatcher so emails go out promptly.
    fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch((e) => console.error("[agent-ops-daily-report] dispatch trigger failed:", e));

    return new Response(JSON.stringify({ success: true, reports: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[agent-ops-daily-report] Fatal:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});