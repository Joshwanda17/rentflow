// Cron-driven redispatch + escalation for unclaimed withdrawals.
//
// Every run it finds withdrawals whose dispatch window has expired and are
// still unclaimed, then either:
//   • re-broadcasts to eligible online agents (rounds 2..MAX), or
//   • escalates to Operations / CFO once MAX rounds are exhausted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  dispatchWithdrawal,
  MAX_DISPATCH_ROUNDS,
  OPEN_STATUSES,
} from "../_shared/dispatchMerchants.ts";
import {
  sendSMS,
  formatPhoneInternational,
  isUgandanPhone,
} from "../_shared/sendSmsMultiProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    // Expired, still-open, unclaimed, not-yet-escalated dispatches.
    const { data: due } = await admin
      .from("withdrawal_requests")
      .select("id, amount, dispatch_round, status")
      .eq("auto_dispatched", true)
      .is("dispatch_claimed_by", null)
      .is("dispatch_escalated_at", null)
      .lt("dispatch_expires_at", nowIso)
      .in("status", OPEN_STATUSES)
      .limit(100);

    const requests = due || [];
    let rebroadcast = 0;
    let escalated = 0;

    // Pre-load escalation recipients once (Ops / CFO / COO / Manager).
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["operations", "cfo", "coo", "manager"]);
    const opsIds = Array.from(new Set((roleRows || []).map((r: any) => r.user_id)));

    for (const r of requests) {
      const nextRound = (Number(r.dispatch_round) || 1) + 1;

      if (nextRound <= MAX_DISPATCH_ROUNDS) {
        await dispatchWithdrawal(admin, supabaseUrl, serviceKey, r.id, nextRound);
        rebroadcast++;
        continue;
      }

      // Exhausted all rounds → escalate.
      await admin
        .from("withdrawal_requests")
        .update({ dispatch_escalated_at: nowIso })
        .eq("id", r.id);

      // Expire any lingering pending log rows.
      await admin
        .from("withdrawal_notification_log")
        .update({ response: "expired", expired_at: nowIso })
        .eq("withdrawal_id", r.id)
        .eq("response", "pending");

      await admin.from("system_events").insert({
        event_type: "withdrawal.dispatch.escalated",
        related_entity_type: "withdrawal_request",
        related_entity_id: r.id,
        metadata: {
          amount: Number(r.amount) || 0,
          rounds: Number(r.dispatch_round) || MAX_DISPATCH_ROUNDS,
        },
      });

      if (opsIds.length) {
        const amountLabel = `UGX ${(Number(r.amount) || 0).toLocaleString()}`;
        const ref = `WD-${String(r.id).replace(/-/g, "").slice(0, 12).toUpperCase()}`;

        // Push to ops staff.
        fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            userIds: opsIds,
            payload: {
              title: "⚠️ Unclaimed withdrawal — action needed",
              body: `${amountLabel} (${ref}) went unclaimed by all merchant agents. Assign manually.`,
              url: "/admin/financial-ops",
              type: "dispatch_escalation",
            },
          }),
        }).catch(() => {});

        // SMS the ops staff too.
        const { data: opsProfiles } = await admin
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", opsIds);
        await Promise.all(
          (opsProfiles || []).map(async (p: any) => {
            const raw = (p?.phone || "").trim();
            if (!isUgandanPhone(raw)) return;
            await sendSMS(
              formatPhoneInternational(raw),
              `WELILE: Withdrawal ${ref} (${amountLabel}) unclaimed by all merchant agents. Please assign manually.`,
              {
                admin,
                source: "withdrawal_dispatch_escalation",
                reference_id: r.id,
                recipient_user_id: p.id,
                recipient_name: p.full_name ?? null,
                idempotencyKey: `withdrawal_dispatch_escalation:${r.id}:${p.id}`,
              },
            );
          }),
        );
      }

      escalated++;
    }

    return new Response(
      JSON.stringify({ ok: true, processed: requests.length, rebroadcast, escalated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[redispatch-withdrawals] error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
