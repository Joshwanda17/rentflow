// Daily report of INDIVIDUAL merchant (cash-out) agent payouts.
//
// Scheduled at 22:00 EAT (19:00 UTC) via pg_cron. Figures come straight from
// the immutable general_ledger through the SECURITY DEFINER RPC
// `generate_merchant_cashout_daily_report`, so totals are accurate and match
// what merchants actually settled during the day.
//
// The rendered report (per-merchant summary + per-payout detail) is emailed to
// the fixed ops recipients below via the existing Lovable email queue
// (enqueue_email -> process-email-queue -> sendLovableEmail).
//
// Idempotent per EAT day via a `merchant_cashout_daily_report` system_event.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fixed recipients for the operational report.
const REPORT_RECIPIENTS = ["weliletenants@gmail.com", "joshwanda17@gmail.com", "benjaminmuhanguzi29@gmail.com"];

// Email sender identity (matches send-transactional-email scaffold).
const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";

function fmtUGX(n: number): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

// Generate a cryptographically random 32-byte hex token.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Ensure an unsubscribe token exists for a recipient (the email API requires
// one on transactional sends). Upsert-then-read handles concurrent inserts.
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

// Current calendar date in East Africa Time (UTC+3, no DST).
function eatToday(): string {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return eat.toISOString().slice(0, 10);
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SummaryRow {
  agent_id: string;
  merchant_name: string;
  merchant_phone: string | null;
  payouts: number;
  total_paid: number;
  total_commission: number;
  total_telecom?: number;
  total_float_consumed?: number;
}
interface DetailRow {
  time: string;
  merchant_name: string;
  merchant_phone: string | null;
  customer_name: string | null;
  amount: number;
  commission: number;
  telecom_charge?: number;
  float_consumed?: number;
  payout_method: string | null;
  withdrawal_id: string;
}

function buildHtml(report: any, prettyDate: string): string {
  const summary: SummaryRow[] = report.summary || [];
  const detail: DetailRow[] = report.detail || [];

  const summaryRows = summary.length
    ? summary
        .map(
          (r, i) => `
      <tr style="background:${i % 2 ? "#faf7ff" : "#ffffff"}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${esc(r.merchant_name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#555;">${esc(r.merchant_phone || "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.payouts}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtUGX(r.total_paid)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;color:#b45309;">${fmtUGX(r.total_telecom || 0)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtUGX(r.total_float_consumed || ((r.total_paid || 0) + (r.total_telecom || 0)))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;color:#6c21c4;">${fmtUGX(r.total_commission)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="7" style="padding:14px;text-align:center;color:#888;">No merchant cash-out payouts recorded for this day.</td></tr>`;

  const detailRows = detail
    .map(
      (r, i) => `
      <tr style="background:${i % 2 ? "#faf7ff" : "#ffffff"}">
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${esc(r.time)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${esc(r.merchant_name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${esc(r.customer_name || "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${esc(r.payout_method || "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmtUGX(r.amount)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#b45309;">${fmtUGX(r.telecom_charge || 0)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtUGX(r.float_consumed || ((r.amount || 0) + (r.telecom_charge || 0)))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#6c21c4;">${fmtUGX(r.commission)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f4f1fa;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <div style="max-width:760px;margin:0 auto;padding:20px;">
    <div style="background:#6c21c4;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px;">
      <h1 style="margin:0;font-size:20px;">Merchant Cash-Out Daily Payout Report</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.9;">${esc(prettyDate)} (East Africa Time)</p>
    </div>
    <div style="background:#fff;padding:20px 24px;border:1px solid #e7e0f5;border-top:0;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr>
          <td style="padding:10px;background:#f7f3ff;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#666;">Merchants</div>
            <div style="font-size:20px;font-weight:700;">${report.merchant_count || 0}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:10px;background:#f7f3ff;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#666;">Payouts</div>
            <div style="font-size:20px;font-weight:700;">${report.total_payouts || 0}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:10px;background:#f7f3ff;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#666;">Customer Payouts</div>
            <div style="font-size:20px;font-weight:700;">${fmtUGX(report.total_paid || 0)}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:10px;background:#fff7ed;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#666;">Telecom Charges</div>
            <div style="font-size:20px;font-weight:700;color:#b45309;">${fmtUGX(report.total_telecom || 0)}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:10px;background:#f7f3ff;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#666;">Float Consumed</div>
            <div style="font-size:20px;font-weight:700;">${fmtUGX(report.total_float_consumed || ((report.total_paid || 0) + (report.total_telecom || 0)))}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:10px;background:#f7f3ff;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#666;">Commission</div>
            <div style="font-size:20px;font-weight:700;color:#6c21c4;">${fmtUGX(report.total_commission || 0)}</div>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 14px;font-size:12px;color:#555;background:#f7f3ff;padding:10px 12px;border-radius:8px;">
        <strong>Reconciliation:</strong> Merchant Float Allocated = Customer Payouts + Telecom Charges + Remaining Float.
        Every shilling that leaves the merchant's Mobile Money account (payout or telecom fee) is deducted from their float bucket.
      </p>

      <h2 style="font-size:15px;margin:0 0 8px;">Per Merchant Agent</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#6c21c4;color:#fff;text-align:left;">
            <th style="padding:8px 10px;">Merchant</th>
            <th style="padding:8px 10px;">Phone</th>
            <th style="padding:8px 10px;text-align:right;">Payouts</th>
            <th style="padding:8px 10px;text-align:right;">Customer Payouts</th>
            <th style="padding:8px 10px;text-align:right;">Telecom</th>
            <th style="padding:8px 10px;text-align:right;">Float Consumed</th>
            <th style="padding:8px 10px;text-align:right;">Commission</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>

      ${
        detail.length
          ? `<h2 style="font-size:15px;margin:24px 0 8px;">Individual Payouts (${detail.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#4c1696;color:#fff;text-align:left;">
            <th style="padding:6px 8px;">Time</th>
            <th style="padding:6px 8px;">Merchant</th>
            <th style="padding:6px 8px;">Customer</th>
            <th style="padding:6px 8px;">Method</th>
            <th style="padding:6px 8px;text-align:right;">Amount</th>
            <th style="padding:6px 8px;text-align:right;">Telecom</th>
            <th style="padding:6px 8px;text-align:right;">Float Consumed</th>
            <th style="padding:6px 8px;text-align:right;">Commission</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>`
          : ""
      }

      <p style="margin:24px 0 0;font-size:11px;color:#999;">
        Generated automatically from the Welile financial ledger. Figures reflect merchant cash-out
        settlements posted for the reporting day (Africa/Kampala). This is an internal operations report.
      </p>
    </div>
  </div>
  </body></html>`;
}

function buildText(report: any, prettyDate: string): string {
  const lines: string[] = [];
  lines.push(`Merchant Cash-Out Daily Payout Report — ${prettyDate} (EAT)`);
  lines.push("");
  lines.push(`Merchants: ${report.merchant_count || 0}`);
  lines.push(`Payouts: ${report.total_payouts || 0}`);
  lines.push(`Customer payouts: ${fmtUGX(report.total_paid || 0)}`);
  lines.push(`Telecom charges: ${fmtUGX(report.total_telecom || 0)}`);
  lines.push(`Float consumed:  ${fmtUGX(report.total_float_consumed || ((report.total_paid || 0) + (report.total_telecom || 0)))}`);
  lines.push(`Total commission: ${fmtUGX(report.total_commission || 0)}`);
  lines.push("");
  lines.push("Per merchant agent:");
  for (const r of (report.summary || []) as SummaryRow[]) {
    lines.push(
      `- ${r.merchant_name} (${r.merchant_phone || "—"}): ${r.payouts} payouts, ` +
        `${fmtUGX(r.total_paid)} paid + ${fmtUGX(r.total_telecom || 0)} telecom = ` +
        `${fmtUGX(r.total_float_consumed || ((r.total_paid || 0) + (r.total_telecom || 0)))} float, ` +
        `${fmtUGX(r.total_commission)} commission`,
    );
  }
  if (!(report.summary || []).length) lines.push("- No payouts recorded for this day.");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Resolve target date (default: today in EAT). Allow override + force.
    let targetDate = eatToday();
    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
          targetDate = body.date;
        }
        force = body?.force === true;
      } catch (_) {
        // no/invalid body — use defaults
      }
    }

    // Idempotency: one report per EAT day unless forced.
    if (!force) {
      const { data: existing } = await admin
        .from("system_events")
        .select("id")
        .eq("event_type", "merchant_cashout_daily_report")
        .contains("metadata", { date: targetDate })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "Already sent", date: targetDate }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Pull accurate figures from the ledger-backed RPC.
    const { data: report, error: rpcErr } = await admin.rpc(
      "generate_merchant_cashout_daily_report",
      { p_date: targetDate },
    );
    if (rpcErr) {
      console.error("[merchant-cashout-daily-report] RPC error:", rpcErr);
      return new Response(JSON.stringify({ success: false, error: rpcErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prettyDate = new Date(`${targetDate}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    const html = buildHtml(report, prettyDate);
    const text = buildText(report, prettyDate);
    const subject = `Merchant Cash-Out Payouts — ${prettyDate}: ${fmtUGX(
      report?.total_paid || 0,
    )} paid + ${fmtUGX(report?.total_telecom || 0)} telecom across ${report?.total_payouts || 0} payouts`;

    // Enqueue one email per recipient into the existing Lovable email queue.
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
        label: "merchant-cashout-daily-report",
        idempotency_key: `merchant-cashout-daily-report:${targetDate}:${to}`,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      };

      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "merchant-cashout-daily-report",
        recipient_email: to,
        status: "pending",
        metadata: { subject, date: targetDate },
      });

      const { error: enqErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload,
      });
      results[to] = enqErr ? `error: ${enqErr.message}` : "queued";
      if (enqErr) console.error("[merchant-cashout-daily-report] enqueue error:", to, enqErr);
    }

    // Record the event for idempotency + auditability.
    await admin.from("system_events").insert({
      event_type: "merchant_cashout_daily_report",
      metadata: {
        date: targetDate,
        recipients: REPORT_RECIPIENTS,
        merchant_count: report?.merchant_count ?? 0,
        total_payouts: report?.total_payouts ?? 0,
        total_paid: report?.total_paid ?? 0,
        total_commission: report?.total_commission ?? 0,
        total_telecom: report?.total_telecom ?? 0,
        total_float_consumed: report?.total_float_consumed ?? 0,
        results,
      },
    });

    // Best-effort: trigger the dispatcher so the emails go out promptly.
    fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch((e) => console.error("[merchant-cashout-daily-report] dispatch trigger failed:", e));

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        recipients: REPORT_RECIPIENTS,
        merchant_count: report?.merchant_count ?? 0,
        total_payouts: report?.total_payouts ?? 0,
        total_paid: report?.total_paid ?? 0,
        total_commission: report?.total_commission ?? 0,
        total_telecom: report?.total_telecom ?? 0,
        total_float_consumed: report?.total_float_consumed ?? 0,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[merchant-cashout-daily-report] Fatal:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});