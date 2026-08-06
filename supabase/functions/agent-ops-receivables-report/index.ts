// Agent Ops daily receivables report.
//
// Aggregates, for tenants on an ACTIVE rent repayment (status funded/repaying):
//   1. Total tenants
//   2. Receivable from all tenants
//   3. Total agents (super + sub)
//   4. Receivable from agent accounts
//   5. Total service centres
//   6. Receivable from service centre managers
//   7. Total landlords
//   8. Receivable from landlord accounts
//
// Emails the brief once per EAT day (idempotent via system_events).
// Options: { force: true }, { preview: true }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_RECIPIENTS = ["pexpert46@gmail.com"];
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";
const EVENT_TYPE = "agent_ops_receivables_report";
const LABEL = "agent-ops-receivables-report";

type Admin = ReturnType<typeof createClient>;

const PURPLE = "#6c21c4";

function fmtUGX(n: unknown): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}
function num(n: unknown): string {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

interface Stats {
  tenants_count: number;
  active_plans_count: number;
  tenants_receivable: number;
  agents_count: number;
  super_agents_count: number;
  sub_agents_count: number;
  agents_receivable: number;
  super_agents_receivable: number;
  sub_agents_receivable: number;
  service_centers_total: number;
  service_centers_count: number;
  service_centers_receivable: number;
  landlords_count: number;
  landlords_receivable: number;
}

async function loadStats(admin: Admin): Promise<Stats> {
  const { data, error } = await admin.rpc("get_agent_ops_receivables_report");
  if (error) throw new Error(`get_agent_ops_receivables_report failed: ${error.message}`);
  return data as unknown as Stats;
}

function row(label: string, count: string, amount: string): string {
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${esc(label)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111;text-align:right;font-weight:600;">${esc(count)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111;text-align:right;font-weight:600;">${esc(amount)}</td>
  </tr>`;
}

function buildHtml(s: Stats, prettyDate: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f6f6f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:660px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e6ec;">
    <div style="background:${PURPLE};padding:20px 24px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">Agent Ops — Daily Receivables</div>
      <div style="color:#e8dcfa;font-size:13px;margin-top:4px;">${esc(prettyDate)} · tenants on an active rent repayment</div>
    </div>
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;text-transform:uppercase;">Group</th>
            <th style="text-align:right;padding:8px 12px;font-size:12px;color:#666;text-transform:uppercase;">Count</th>
            <th style="text-align:right;padding:8px 12px;font-size:12px;color:#666;text-transform:uppercase;">Receivable</th>
          </tr>
        </thead>
        <tbody>
          ${row("Tenants (active repayment)", num(s.tenants_count), fmtUGX(s.tenants_receivable))}
          ${row("Agents — total (super + sub)", num(s.agents_count), fmtUGX(s.agents_receivable))}
          ${row("· Super agents", num(s.super_agents_count), fmtUGX(s.super_agents_receivable))}
          ${row("· Sub agents", num(s.sub_agents_count), fmtUGX(s.sub_agents_receivable))}
          ${row("Service centres (with active book)", `${num(s.service_centers_count)} of ${num(s.service_centers_total)}`, fmtUGX(s.service_centers_receivable))}
          ${row("Landlords", num(s.landlords_count), fmtUGX(s.landlords_receivable))}
        </tbody>
      </table>
      <p style="font-size:13px;color:#555;line-height:1.6;margin-top:18px;">
        Active rent plans counted: <strong>${esc(num(s.active_plans_count))}</strong>.
        Receivable is total repayment less amount already repaid, on rent plans in
        <em>funded</em> or <em>repaying</em> state. Agent, service centre and landlord figures
        are the same tenant book viewed through each accountable party, so they are not additive.
      </p>
    </div>
    <div style="padding:14px 24px;background:#faf8fe;color:#777;font-size:11px;">
      Welile · automated Agent Ops brief
    </div>
  </div></body></html>`;
}

function buildText(s: Stats, prettyDate: string): string {
  return [
    `Agent Ops — Daily Receivables (${prettyDate})`,
    `Tenants on active repayment: ${num(s.tenants_count)} — ${fmtUGX(s.tenants_receivable)}`,
    `Agents total (super+sub): ${num(s.agents_count)} — ${fmtUGX(s.agents_receivable)}`,
    `  Super agents: ${num(s.super_agents_count)} — ${fmtUGX(s.super_agents_receivable)}`,
    `  Sub agents: ${num(s.sub_agents_count)} — ${fmtUGX(s.sub_agents_receivable)}`,
    `Service centres: ${num(s.service_centers_count)} of ${num(s.service_centers_total)} — ${fmtUGX(s.service_centers_receivable)}`,
    `Landlords: ${num(s.landlords_count)} — ${fmtUGX(s.landlords_receivable)}`,
    `Active rent plans: ${num(s.active_plans_count)}`,
  ].join("\n");
}

async function sendForDate(admin: Admin, dateStr: string, force: boolean) {
  if (!force) {
    const { data: existing } = await admin
      .from("system_events").select("id").eq("event_type", EVENT_TYPE)
      .contains("metadata", { date: dateStr }).limit(1).maybeSingle();
    if (existing) return { date: dateStr, skipped: true, reason: "Already sent" };
  }

  const stats = await loadStats(admin);
  const prettyDate = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const html = buildHtml(stats, prettyDate);
  const text = buildText(stats, prettyDate);
  const subject = `Agent Ops receivables - ${prettyDate}: ${num(stats.tenants_count)} tenants, ${fmtUGX(stats.tenants_receivable)} receivable`;

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
      label: LABEL,
      idempotency_key: `${LABEL}:${dateStr}:${to}${force ? `:${messageId}` : ""}`,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    };

    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: LABEL,
      recipient_email: to,
      status: "pending",
      metadata: { subject, date: dateStr },
    });

    const { error: enqErr } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });
    results[to] = enqErr ? `error: ${enqErr.message}` : "queued";
    if (enqErr) console.error(`[${LABEL}] enqueue error:`, to, enqErr);
  }

  await admin.from("system_events").insert({
    event_type: EVENT_TYPE,
    metadata: { date: dateStr, recipients: REPORT_RECIPIENTS, stats, results },
  });

  return { date: dateStr, recipients: REPORT_RECIPIENTS, stats, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    const dateStr = typeof body?.date === "string" && body.date ? body.date.slice(0, 10) : eatToday();

    if (body?.preview === true) {
      const stats = await loadStats(admin);
      const prettyDate = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      });
      return new Response(buildHtml(stats, prettyDate), {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const report = await sendForDate(admin, dateStr, body?.force === true);

    fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch((e) => console.error(`[${LABEL}] dispatch trigger failed:`, e));

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
