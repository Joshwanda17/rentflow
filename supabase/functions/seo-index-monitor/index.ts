// SEO indexing monitor for welileapp.com.
//
// Polls Google Search Console (sitemap status + URL inspection) through the
// Lovable connector gateway, records a snapshot in
// `seo_index_monitor_snapshots`, and — when the state changes — emails an
// alert via the Gmail connector. Two alert transitions fire:
//   * first_indexation: pages start appearing in the index with NO errors
//   * errors: an indexing/sitemap error newly appears
//
// Invoked every 6 hours by pg_cron and on-demand from the CTO dashboard panel.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://welileapp.com/";
const SITEMAP_URL = "https://welileapp.com/sitemap.xml";
const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function gscHeaders() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gscKey = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (!lovableKey || !gscKey) throw new Error("Search Console connector creds missing");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gscKey,
    "Content-Type": "application/json",
  };
}

async function getSitemapStatus() {
  const enc = encodeURIComponent(SITE_URL);
  const encSm = encodeURIComponent(SITEMAP_URL);
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites/${enc}/sitemaps/${encSm}`, {
    headers: gscHeaders(),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true, data: await res.json() };
}

async function inspectUrl() {
  const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
    method: "POST",
    headers: gscHeaders(),
    body: JSON.stringify({ inspectionUrl: SITE_URL, siteUrl: SITE_URL }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true, data: await res.json() };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function sendEmail(to: string, subject: string, html: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !gmailKey) return { ok: false, status: 0, raw: "Gmail connector creds missing" };
  const encodedSubject = /[^\x00-\x7F]/.test(subject)
    ? `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(subject))}?=`
    : subject;
  const raw = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
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
  return { ok: res.ok, status: res.status, raw: await res.text() };
}

function buildEmailHtml(kind: "first_indexation" | "errors", snap: Record<string, unknown>): string {
  const good = kind === "first_indexation";
  const accent = good ? "#16a34a" : "#dc2626";
  const title = good
    ? "welileapp.com is now appearing in Google"
    : "Indexing issue detected on welileapp.com";
  const lead = good
    ? "Google Search Console now shows indexed pages for welileapp.com with no indexing errors."
    : "Google Search Console reported a new indexing or sitemap error for welileapp.com.";
  const row = (k: string, v: unknown) =>
    `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px">${k}</td><td style="padding:6px 12px;font-size:13px;font-weight:600">${v ?? "—"}</td></tr>`;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f5f3fa;margin:0;padding:24px;color:#1e1b2e">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2deec;border-radius:14px;overflow:hidden">
    <div style="background:${accent};color:#fff;padding:20px 24px">
      <div style="font-size:12px;letter-spacing:.4px;opacity:.9;text-transform:uppercase">Welile · SEO Monitor</div>
      <h1 style="margin:6px 0 0;font-size:20px">${title}</h1>
    </div>
    <div style="padding:22px 24px">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5">${lead}</p>
      <table style="width:100%;border-collapse:collapse;background:#faf9fc;border:1px solid #eee;border-radius:8px">
        ${row("Site", snap.site_url)}
        ${row("Sitemap URLs submitted", snap.sitemap_submitted_count)}
        ${row("URLs indexed", snap.sitemap_indexed_count)}
        ${row("Sitemap errors", snap.sitemap_errors)}
        ${row("URL inspection verdict", snap.url_verdict)}
        ${row("Coverage state", snap.coverage_state)}
        ${row("Indexing state", snap.indexing_state)}
        ${row("Google-chosen canonical", snap.google_canonical)}
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Checked at ${new Date().toISOString()}. Automated alert from the Welile SEO index monitor.</p>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const debug: Record<string, unknown> = {};

  try {
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch { /* no body */ }

    // Settings (single row).
    const { data: settings } = await supabase
      .from("seo_index_monitor_settings")
      .select("alert_email, alerts_enabled")
      .eq("id", true)
      .maybeSingle();
    const alertEmail = settings?.alert_email || "weliletenants@gmail.com";
    const alertsEnabled = settings?.alerts_enabled ?? true;

    // Pull GSC data.
    const [sitemap, inspection] = await Promise.all([getSitemapStatus(), inspectUrl()]);
    debug.sitemap_ok = sitemap.ok;
    debug.inspection_ok = inspection.ok;

    const smContents = (sitemap.ok ? sitemap.data?.contents?.[0] : null) ?? {};
    const sitemap_submitted_count = sitemap.ok ? Number(smContents.submitted ?? 0) : null;
    const sitemap_indexed_count = sitemap.ok ? Number(smContents.indexed ?? 0) : null;
    const sitemap_errors = sitemap.ok ? Number(sitemap.data?.errors ?? 0) : null;
    const sitemap_warnings = sitemap.ok ? Number(sitemap.data?.warnings ?? 0) : null;

    const idx = inspection.ok ? inspection.data?.inspectionResult?.indexStatusResult ?? {} : {};
    const url_verdict = idx.verdict ?? null;
    const coverage_state = idx.coverageState ?? null;
    const indexing_state = idx.indexingState ?? null;
    const robots_state = idx.robotsTxtState ?? null;
    const google_canonical = idx.googleCanonical ?? null;

    const pages_indexed = (sitemap_indexed_count ?? 0) > 0;
    const has_errors =
      (sitemap_errors ?? 0) > 0 ||
      (robots_state != null && robots_state !== "ALLOWED") ||
      (indexing_state != null && indexing_state !== "INDEXING_ALLOWED");

    // Previous snapshot for transition detection.
    const { data: prev } = await supabase
      .from("seo_index_monitor_snapshots")
      .select("pages_indexed, has_errors")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevIndexed = prev?.pages_indexed ?? false;
    const prevErrors = prev?.has_errors ?? false;

    let alert_type: string | null = null;
    if (!prevIndexed && pages_indexed && !has_errors) alert_type = "first_indexation";
    else if (!prevErrors && has_errors) alert_type = "errors";

    const snap = {
      site_url: SITE_URL,
      sitemap_submitted_count,
      sitemap_indexed_count,
      sitemap_errors,
      sitemap_warnings,
      url_verdict,
      coverage_state,
      indexing_state,
      robots_state,
      google_canonical,
      pages_indexed,
      has_errors,
      alert_type,
      alert_sent: false,
      raw: {
        sitemap: sitemap.ok ? sitemap.data : { error: sitemap.status, body: sitemap.body },
        inspection: inspection.ok ? inspection.data : { error: inspection.status, body: inspection.body },
      },
    };

    let alertSent = false;
    let emailResult: unknown = null;
    if (alert_type && (alert_type === "first_indexation" || alert_type === "errors") && alertsEnabled) {
      const subject = alert_type === "first_indexation"
        ? "✅ welileapp.com is now indexed in Google (no errors)"
        : "⚠️ Indexing issue detected on welileapp.com";
      const r = await sendEmail(alertEmail, subject, buildEmailHtml(alert_type, snap));
      alertSent = r.ok;
      emailResult = { ok: r.ok, status: r.status };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("seo_index_monitor_snapshots")
      .insert({ ...snap, alert_sent: alertSent })
      .select()
      .single();
    if (insErr) throw new Error(`insert failed: ${insErr.message}`);

    return new Response(
      JSON.stringify({
        ok: true,
        snapshot: inserted,
        alert_type,
        alert_sent: alertSent,
        email: emailResult,
        forced: force,
        debug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("seo-index-monitor error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), debug }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
