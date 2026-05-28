import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Scheduled monitor — runs every 15 min via pg_cron.
 *
 * 1. Calls public.detect_bulk_payout_stuck_alerts() to insert a row into
 *    bulk_payout_stuck_alerts for every settled bulk allocation whose
 *    related withdrawal_request is still in-flight AND whose required
 *    ledger legs (wallet debit + platform offset) are missing.
 * 2. For every NEWLY raised alert, emits a `withdrawal.bulk_payout_stuck.detected`
 *    system_event carrying the exact missing-ledger description, so the
 *    Ops team sees it in their alerts inbox / dashboards.
 * 3. Returns a summary the caller can inspect.
 *
 * Idempotent: the open-alert unique index dedupes per (wr, allocation).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Run detection
    const { data: detectRes, error: detectErr } = await admin.rpc(
      "detect_bulk_payout_stuck_alerts",
    );
    if (detectErr) {
      console.error("[monitor-bulk-payout-stuck] detect rpc failed", detectErr);
      return new Response(JSON.stringify({ error: detectErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inserted = Array.isArray(detectRes) ? detectRes[0]?.inserted_count ?? 0 : 0;
    const totalOpen = Array.isArray(detectRes) ? detectRes[0]?.total_open ?? 0 : 0;

    // 2. Fetch ALL currently open alerts so we can emit / re-emit a
    //    system_event at most once per (alert_id, day). The system_events
    //    table is the canonical fan-out — Ops dashboards subscribe to it.
    const { data: openAlerts, error: openErr } = await admin
      .from("bulk_payout_stuck_alerts")
      .select(
        "id, withdrawal_request_id, allocation_id, partner_id, proxy_agent_id, amount, bank_reference, wr_status, severity, missing_ledger_entries, detected_at",
      )
      .eq("status", "open")
      .order("detected_at", { ascending: false })
      .limit(500);

    if (openErr) {
      console.error("[monitor-bulk-payout-stuck] open alerts fetch failed", openErr);
    }

    let emitted = 0;
    if (openAlerts && openAlerts.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const events = openAlerts.map((a: any) => ({
        event_type: "withdrawal.bulk_payout_stuck.detected",
        actor_id: null,
        target_id: a.withdrawal_request_id,
        idempotency_key: `bulk-payout-stuck:${a.id}:${today}`,
        severity: a.severity ?? "high",
        payload: {
          alert_id: a.id,
          withdrawal_request_id: a.withdrawal_request_id,
          allocation_id: a.allocation_id,
          partner_id: a.partner_id,
          proxy_agent_id: a.proxy_agent_id,
          amount: Number(a.amount),
          bank_reference: a.bank_reference,
          wr_status: a.wr_status,
          severity: a.severity,
          detected_at: a.detected_at,
          missing_ledger_entries: a.missing_ledger_entries,
          ops_action_required:
            "Reconcile the missing ledger leg(s) listed in missing_ledger_entries.expected, " +
            "then mark this alert resolved in the Ops dashboard.",
        },
      }));

      const { error: evErr, count } = await admin
        .from("system_events")
        .upsert(events, { onConflict: "idempotency_key", count: "exact", ignoreDuplicates: true });
      if (evErr) {
        console.error("[monitor-bulk-payout-stuck] system_events upsert failed", evErr);
      } else {
        emitted = count ?? events.length;
      }
    }

    const summary = {
      ok: true,
      run_at: new Date().toISOString(),
      newly_inserted: inserted,
      total_open: totalOpen,
      events_emitted: emitted,
    };
    console.log("[monitor-bulk-payout-stuck]", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[monitor-bulk-payout-stuck] unexpected", e);
    return new Response(JSON.stringify({ error: e?.message || "unexpected" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});