import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isRealEmail = (e: unknown): e is string =>
  typeof e === "string" && /\S+@\S+\.\S+/.test(e) && !e.endsWith("@welile.user");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const withdrawalId = typeof body?.withdrawal_id === "string" ? body.withdrawal_id : null;
    if (!withdrawalId) {
      return new Response(JSON.stringify({ error: "withdrawal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the withdrawal
    const { data: w, error: wErr } = await admin
      .from("withdrawal_requests")
      .select("id, user_id, amount, payout_method, reason, created_at")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (wErr || !w) {
      return new Response(JSON.stringify({ error: "Withdrawal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Requester details
    const { data: requester } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", w.user_id)
      .maybeSingle();

    // Active merchant (cash-out) agents
    const { data: agents } = await admin
      .from("cashout_agents")
      .select("agent_id")
      .eq("is_active", true);
    const agentIds = Array.from(
      new Set((agents || []).map((a: any) => a.agent_id).filter(Boolean)),
    );
    if (agentIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no active merchant agents" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", agentIds);

    const recipients = (profs || []).filter((p: any) => isRealEmail(p.email));

    const templateData = {
      amountUgx: Number(w.amount) || 0,
      requesterName: requester?.full_name || "A Welile user",
      requesterPhone: requester?.phone || "",
      payoutMethod: w.payout_method || "cash",
      requestReference: `REQ-${String(w.id).slice(0, 12).toUpperCase()}`,
      requestedAt: new Date(w.created_at || Date.now()).toLocaleString("en-UG", {
        timeZone: "Africa/Kampala",
      }),
    };

    let sent = 0;
    await Promise.all(
      recipients.map(async (p: any) => {
        const { error } = await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "new-withdrawal-merchant-alert",
            recipientEmail: p.email,
            idempotencyKey: `new-withdrawal-merchant-${w.id}-${p.id}`,
            templateData,
          },
        });
        if (!error) sent++;
        else console.error(`[notify-merchants] email failed for ${p.id}:`, error.message);
        // Audit log: record each notification email attempt for delivery troubleshooting
        await admin.from("withdrawal_notification_log").insert({
          withdrawal_id: w.id,
          recipient_id: p.id,
          recipient_email: p.email,
          amount: Number(w.amount) || 0,
          status: error ? "failed" : "sent",
          error_message: error ? String(error.message || error) : null,
        });
      }),
    );

    return new Response(JSON.stringify({ ok: true, sent, recipients: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[notify-merchants-new-withdrawal] error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
