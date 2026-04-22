import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["cto", "super_admin", "manager"]);
    if (!roles || roles.length === 0) {
      return json({ error: "Insufficient permissions" }, 403);
    }

    const url = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Pull recent log rows in one go (capped) — used for KPIs, time-series, and table
    const { data: rows, error: rowsErr } = await adminClient
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (rowsErr) return json({ error: rowsErr.message }, 500);

    const all = rows ?? [];

    // KPIs
    const totalSent = all.filter((r) => r.status === "sent").length;
    const totalFailed = all.filter((r) => r.status === "failed" || r.status === "dlq").length;
    const totalBounced = all.filter((r) => r.status === "bounced").length;
    const totalPending = all.filter((r) => r.status === "pending").length;
    const totalSuppressed = all.filter((r) => r.status === "suppressed").length;
    const total = all.length;
    const deliveryRate = total > 0 ? Math.round((totalSent / total) * 1000) / 10 : 0;
    const uniqueRecipients = new Set(all.map((r) => r.recipient_email)).size;

    // Daily series
    const seriesMap = new Map<string, { day: string; sent: number; failed: number; pending: number; total: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const k = d.toISOString().slice(0, 10);
      seriesMap.set(k, { day: k, sent: 0, failed: 0, pending: 0, total: 0 });
    }
    for (const r of all) {
      const k = (r.created_at as string).slice(0, 10);
      const bucket = seriesMap.get(k);
      if (!bucket) continue;
      bucket.total++;
      if (r.status === "sent") bucket.sent++;
      else if (r.status === "failed" || r.status === "dlq" || r.status === "bounced") bucket.failed++;
      else if (r.status === "pending") bucket.pending++;
    }
    const series = Array.from(seriesMap.values());

    // Template summary table
    const tplMap = new Map<string, { template: string; total: number; sent: number; failed: number; pending: number; lastSentAt: string | null }>();
    for (const r of all) {
      const key = r.template_name || "unknown";
      const cur = tplMap.get(key) || { template: key, total: 0, sent: 0, failed: 0, pending: 0, lastSentAt: null };
      cur.total++;
      if (r.status === "sent") cur.sent++;
      else if (r.status === "failed" || r.status === "dlq" || r.status === "bounced") cur.failed++;
      else if (r.status === "pending") cur.pending++;
      const ts = r.created_at as string;
      if (!cur.lastSentAt || ts > cur.lastSentAt) cur.lastSentAt = ts;
      tplMap.set(key, cur);
    }
    const templateSummary = Array.from(tplMap.values()).sort((a, b) => b.total - a.total);

    // Recent emails (cap UI payload)
    const recent = all.slice(0, 100);

    // Suppression count
    const { count: suppressedCount } = await adminClient
      .from("suppressed_emails")
      .select("id", { count: "exact", head: true });

    return json({
      rangeDays: days,
      kpis: {
        total,
        totalSent,
        totalFailed,
        totalBounced,
        totalPending,
        totalSuppressed,
        suppressedTotal: suppressedCount ?? 0,
        deliveryRate,
        uniqueRecipients,
      },
      series,
      templateSummary,
      recent,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}