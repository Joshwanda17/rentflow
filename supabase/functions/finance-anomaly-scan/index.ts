// Finance / wallet anomaly auto-detection + notification.
//
// Runs `run_finance_anomaly_scan(trigger_source)` (nine wallet & ledger
// integrity checks) and, when anomalies are found, emails the full report to
// the configured finance recipients (via enqueue_email -> process-email-queue)
// and sends a condensed SMS summary.
//
// Triggers:
//   - "publish"  : invoked immediately after every publish/deploy
//   - "cron"     : scheduled sweep
//   - "manual"   : CFO/CTO on-demand run
//
// Body: { trigger_source?: string, force?: boolean }
//   force=true sends the report even when the scan is clean.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSMS } from "../_shared/sendSmsMultiProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FROM = "Welile Reports <info@welile.com>";
const SENDER_DOMAIN = "notify.welile.com";

interface Check {
  key: string;
  label: string;
  severity: string;
  count: number;
  amount: number;
  sample?: unknown[];
}

function fmtUGX(n: unknown): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
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

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#b42318",
  high: "#b54708",
  medium: "#854a0e",
  clean: "#067647",
};

function checkRow(c: Check): string {
  const clean = c.count === 0;
  return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(c.label)}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${c.count}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${clean ? "—" : fmtUGX(c.amount)}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-transform:uppercase;color:${SEVERITY_COLOR[c.severity] ?? "#333"};font-weight:600">${clean ? "clean" : esc(c.severity)}</td>
</tr>`;
}

function sampleBlock(c: Check): string {
  const rows = (c.sample ?? []) as Record<string, unknown>[];
  if (!c.count || !rows.length) return "";
  const items = rows
    .map(
      (r) =>
        `<li style="margin:2px 0;font:12px ui-monospace,monospace;color:#444">${esc(
          Object.entries(r)
            .map(([k, v]) => `${k}=${typeof v === "number" ? Math.round(v) : v}`)
            .join("  "),
        )}</li>`,
    )
    .join("");
  return `<h4 style="margin:16px 0 4px;font:600 13px system-ui">${esc(c.label)} — first ${rows.length}</h4>
<ul style="margin:0;padding-left:18px">${items}</ul>`;
}

function buildHtml(
  report: Record<string, unknown>,
  checks: Check[],
  triggerSource: string,
): string {
  const severity = String(report.severity ?? "clean");
  const count = Number(report.anomaly_count ?? 0);
  const failing = checks.filter((c) => c.count > 0);
  return `<div style="font:14px system-ui;color:#111;max-width:820px">
  <h2 style="margin:0 0 4px;font:700 18px system-ui">
    Finance &amp; wallet anomaly report —
    <span style="color:${SEVERITY_COLOR[severity] ?? "#333"};text-transform:uppercase">${esc(severity)}</span>
  </h2>
  <p style="margin:0 0 14px;color:#555">
    Trigger: <strong>${esc(triggerSource)}</strong> ·
    Scanned: ${esc(report.scanned_at)} ·
    Threshold: ${fmtUGX(report.min_amount)} ·
    Findings: <strong>${count}</strong> ·
    Exposure: <strong>${fmtUGX(report.total_exposure)}</strong>
  </p>
  <table style="width:100%;border-collapse:collapse;font:13px system-ui">
    <thead><tr style="background:#f6f6f6;text-align:left">
      <th style="padding:8px 10px">Check</th>
      <th style="padding:8px 10px;text-align:right">Items</th>
      <th style="padding:8px 10px;text-align:right">Amount</th>
      <th style="padding:8px 10px">Severity</th>
    </tr></thead>
    <tbody>${checks.map(checkRow).join("")}</tbody>
  </table>
  ${failing.map(sampleBlock).join("")}
  <p style="margin:22px 0 0;color:#777;font-size:12px">
    Ledger is the source of truth. Never correct a wallet with a direct update —
    post a balanced admin_correction pair. Review in CFO dashboard → Reconcile.
  </p>
</div>`;
}

function buildSms(report: Record<string, unknown>, checks: Check[]): string {
  const failing = checks.filter((c) => c.count > 0);
  const severity = String(report.severity ?? "clean").toUpperCase();
  if (!failing.length) {
    return `WELILE FINANCE: wallet & ledger scan clean. No anomalies detected. Full report emailed.`;
  }
  const top = failing
    .slice(0, 3)
    .map((c) => `${c.label}: ${c.count} (${fmtUGX(c.amount)})`)
    .join("; ");
  const more = failing.length > 3 ? ` +${failing.length - 3} more` : "";
  return `WELILE FINANCE ALERT [${severity}]: ${report.anomaly_count} wallet/ledger anomalies, exposure ${fmtUGX(
    report.total_exposure,
  )}. ${top}${more}. Full report emailed.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    let body: { trigger_source?: string; force?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const triggerSource = String(body.trigger_source ?? "manual").slice(0, 40);
    const force = body.force === true;

    const { data: cfg } = await admin
      .from("finance_anomaly_alert_config")
      .select("enabled, min_amount, notify_emails, notify_phones")
      .eq("id", 1)
      .maybeSingle();

    if (cfg && cfg.enabled === false) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "alerts disabled in config" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: scan, error: scanErr } = await admin.rpc("run_finance_anomaly_scan", {
      p_trigger_source: triggerSource,
    });
    if (scanErr) throw new Error(`scan failed: ${scanErr.message}`);

    const report = (scan ?? {}) as Record<string, unknown>;
    const checks = ((report.checks ?? []) as Check[]).map((c) => ({
      ...c,
      count: Number(c.count ?? 0),
      amount: Number(c.amount ?? 0),
    }));
    const anomalyCount = Number(report.anomaly_count ?? 0);
    const scanId = report.scan_id as string | undefined;

    if (anomalyCount === 0 && !force) {
      return new Response(
        JSON.stringify({
          scan_id: scanId,
          severity: report.severity,
          anomaly_count: 0,
          notified: false,
          reason: "clean scan — no notification sent",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- recipients ----
    const emails = ((cfg?.notify_emails as string[] | null) ?? []).filter(Boolean);
    let phones = ((cfg?.notify_phones as string[] | null) ?? []).filter(Boolean);

    if (!phones.length) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["cfo", "cto"]);
      const ids = (roleRows ?? []).map((r) => r.user_id as string);
      if (ids.length) {
        const { data: profs } = await admin
          .from("profiles")
          .select("phone")
          .in("id", ids)
          .not("phone", "is", null);
        phones = Array.from(
          new Set((profs ?? []).map((p) => String(p.phone)).filter(Boolean)),
        );
      }
    }

    const subject =
      `Finance anomaly report — ${String(report.severity ?? "clean").toUpperCase()} · ` +
      `${anomalyCount} finding${anomalyCount === 1 ? "" : "s"} · ${fmtUGX(report.total_exposure)} (${triggerSource})`;

    const html = buildHtml(report, checks, triggerSource);
    const text = [
      subject,
      "",
      ...checks.map(
        (c) => `${c.count === 0 ? "OK  " : "FAIL"} ${c.label}: ${c.count} · ${fmtUGX(c.amount)} · ${c.severity}`,
      ),
    ].join("\n");

    const stamp = new Date().toISOString();
    const emailResults: Record<string, string> = {};
    for (const to of emails) {
      const messageId = crypto.randomUUID();
      const unsubscribeToken = await ensureUnsubscribeToken(admin, to);
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "finance-anomaly-report",
        recipient_email: to,
        status: "pending",
        metadata: { subject, scan_id: scanId, anomalies: anomalyCount },
      });
      const { error: enqErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to,
          from: FROM,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: "transactional",
          label: "finance-anomaly-report",
          idempotency_key: `finance-anomaly:${scanId ?? stamp}:${to}`,
          unsubscribe_token: unsubscribeToken,
          queued_at: stamp,
        },
      });
      emailResults[to] = enqErr ? `error: ${enqErr.message}` : "queued";
      if (enqErr) console.error("[finance-anomaly-scan] enqueue error", to, enqErr);
    }

    const smsBody = buildSms(report, checks);
    const smsResults: Record<string, string> = {};
    for (const phone of phones) {
      try {
        const ok = await sendSMS(phone, smsBody, {
          admin,
          source: "finance-anomaly-scan",
          reference_id: scanId ?? null,
          idempotencyKey: `finance-anomaly:${scanId ?? stamp}:${phone}`,
        });
        smsResults[phone] = ok ? "sent" : "failed";
      } catch (e) {
        smsResults[phone] = `error: ${(e as Error)?.message ?? e}`;
      }
    }

    const anyEmail = Object.values(emailResults).some((v) => v === "queued");
    const anySms = Object.values(smsResults).some((v) => v === "sent");

    if (scanId) {
      await admin
        .from("finance_anomaly_scans")
        .update({
          email_recipients: emails,
          sms_recipients: phones,
          notified: anyEmail || anySms,
          notify_error:
            anyEmail || anySms
              ? null
              : `email=${JSON.stringify(emailResults)} sms=${JSON.stringify(smsResults)}`,
        })
        .eq("id", scanId);
    }

    await admin.from("system_events").insert({
      event_type: "finance_anomaly_scan_completed",
      metadata: {
        scan_id: scanId,
        trigger_source: triggerSource,
        severity: report.severity,
        anomaly_count: anomalyCount,
        total_exposure: report.total_exposure,
        email_results: emailResults,
        sms_results: smsResults,
      },
    });

    return new Response(
      JSON.stringify({
        scan_id: scanId,
        severity: report.severity,
        anomaly_count: anomalyCount,
        total_exposure: report.total_exposure,
        checks: checks.map(({ key, count, amount, severity }) => ({ key, count, amount, severity })),
        email_results: emailResults,
        sms_results: smsResults,
        notified: anyEmail || anySms,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[finance-anomaly-scan]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
