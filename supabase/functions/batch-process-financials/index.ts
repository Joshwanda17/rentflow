import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: Record<string, unknown> = {};

    // 1. Batch auto-approve deposits with TID matching
    const { data: approveResult, error: approveErr } = await supabase.rpc("batch_auto_approve_deposits", { p_batch_size: 500 });
    results.auto_approve = approveErr ? { error: approveErr.message } : approveResult;

    // 2. Auto-dispatch withdrawals to agents
    const { data: dispatchResult, error: dispatchErr } = await supabase.rpc("auto_dispatch_withdrawals", { p_batch_size: 200 });
    results.auto_dispatch = dispatchErr ? { error: dispatchErr.message } : dispatchResult;

    // 3. Anomaly detection: velocity abuse (>5 deposits from same user in 1 hour)
    const { data: velocityAbuse } = await supabase
      .from("deposit_requests")
      .select("user_id, count:id")
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 3600000).toISOString());

    // Group by user_id client-side for velocity check
    if (velocityAbuse) {
      const userCounts = new Map<string, number>();
      for (const row of velocityAbuse) {
        userCounts.set(row.user_id, (userCounts.get(row.user_id) || 0) + 1);
      }
      for (const [userId, count] of userCounts) {
        if (count > 5) {
          await supabase.from("financial_anomalies").insert({
            anomaly_type: "velocity_abuse",
            severity: "high",
            title: `Velocity alert: ${count} deposits in 1 hour`,
            description: `User submitted ${count} deposit requests in the last hour`,
            related_user_id: userId,
            metadata: { count, window: "1h" },
          });
        }
      }
    }

    // 4. Reset agent daily queue counts at midnight
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
      await supabase.from("cashout_agents").update({ current_queue_count: 0 }).gt("current_queue_count", 0);
      results.queue_reset = true;
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
