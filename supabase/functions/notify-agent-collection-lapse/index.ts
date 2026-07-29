// Scans active tenancies and warns agents (via web push) when they have not
// collected rent or made a float allocation for a tenant in >= 5 days. If the
// idle gap exceeds 7 days (i.e. 8+), the tenant is locked so Agent Ops can
// reassign them to an active agent. Tenants with any collection inside the
// last 7 days are considered active and are NEVER locked.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WARN_AFTER_DAYS = 5;
const REASSIGN_AT_DAYS = 8; // strictly > 7 days idle

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Active tenancies with an assigned collecting agent.
    const { data: rr, error: rrErr } = await supabase
      .from("rent_requests")
      .select("id, tenant_id, agent_id, assigned_agent_id, funded_at, created_at, collection_locked_at")
      .eq("tenancy_status", "active")
      .is("collection_locked_at", null);

    if (rrErr) throw rrErr;
    const rows = rr ?? [];

    const now = Date.now();
    const todayKey = new Date().toISOString().slice(0, 10);
    let warned = 0;
    let skipped = 0;
      let locked = 0;

    // Cache tenant names.
    const tenantIds = [...new Set(rows.map((r: any) => r.tenant_id).filter(Boolean))];
    const nameById = new Map<string, string>();
    if (tenantIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", tenantIds);
      (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name || "your tenant"));
    }

    for (const row of rows as any[]) {
      const agentId = row.agent_id || row.assigned_agent_id;
      if (!agentId || !row.tenant_id) continue;

      // Last collection or allocation by this agent for this tenant.
      const { data: lastCol } = await supabase
        .from("agent_collections")
        .select("created_at")
        .eq("agent_id", agentId)
        .eq("tenant_id", row.tenant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const anchorIso: string =
        lastCol?.created_at || row.funded_at || row.created_at;
      if (!anchorIso) continue;

      const daysSince = Math.floor((now - new Date(anchorIso).getTime()) / 86_400_000);
      if (daysSince < WARN_AFTER_DAYS) continue;

      const idemKey = `collection_lapse:${row.tenant_id}:${todayKey}`;
      const daysLeft = Math.max(0, REASSIGN_AT_DAYS - daysSince);
      const tenantName = nameById.get(row.tenant_id) || "your tenant";

      // Day 5+: lock the tenant from this agent so Agent Ops can reassign.
      if (daysSince >= REASSIGN_AT_DAYS) {
        const { error: lockErr } = await supabase
          .from("rent_requests")
          .update({
            collection_locked_at: new Date().toISOString(),
            collection_locked_reason: `No collection for ${daysSince} days (grace period exceeded)`,
            collection_lock_days: daysSince,
          })
          .eq("id", row.id)
          .is("collection_locked_at", null);
        if (!lockErr) locked++;
      }

      const title = daysLeft > 0
        ? `Collect rent for ${tenantName}`
        : `${tenantName} locked — pending reassignment`;
      const body = daysLeft > 0
        ? `It's been ${daysSince} days since you last collected rent for ${tenantName}. Your tenant will be transferred to an active agent in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Collect rent to keep the tenant.`
        : `It's been ${daysSince} days without a rent collection for ${tenantName}. You can no longer collect for this tenant — Agent Ops will transfer them to an active agent.`;

      // Fire web push.
      await supabase.functions.invoke("send-push-notification", {
        body: {
          userIds: [agentId],
          payload: {
            title,
            body,
            type: daysLeft === 0 ? "error" : "warning",
            url: "/dashboard/agent",
            tag: `collection-lapse-${row.tenant_id}`,
            notificationId: idemKey,
          },
        },
      });

      warned++;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: rows.length, warned, locked, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("notify-agent-collection-lapse error", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});