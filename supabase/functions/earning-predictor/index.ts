import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all user profiles
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id");

    if (profilesErr) throw profilesErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No users found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Process in batches of 50
    for (let i = 0; i < profiles.length; i += 50) {
      const batch = profiles.slice(i, i + 50);
      const userIds = batch.map((p) => p.id);

      // Fetch data for this batch in parallel
      const [earningsRes, receipts7dRes, referrals7dRes, rolesRes] = await Promise.all([
        supabase
          .from("agent_earnings")
          .select("agent_id, amount, created_at")
          .in("agent_id", userIds)
          .gte("created_at", fourteenDaysAgo),
        supabase
          .from("user_receipts")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("referrals")
          .select("referrer_id, created_at")
          .in("referrer_id", userIds)
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds),
      ]);

      // Group data by user
      const earningsByUser: Record<string, { total14d: number; total7d: number }> = {};
      for (const e of earningsRes.data || []) {
        if (!earningsByUser[e.agent_id]) earningsByUser[e.agent_id] = { total14d: 0, total7d: 0 };
        earningsByUser[e.agent_id].total14d += Number(e.amount);
        if (new Date(e.created_at) >= new Date(sevenDaysAgo)) {
          earningsByUser[e.agent_id].total7d += Number(e.amount);
        }
      }

      const receiptsByUser: Record<string, number> = {};
      for (const r of receipts7dRes.data || []) {
        receiptsByUser[r.user_id] = (receiptsByUser[r.user_id] || 0) + 1;
      }

      const referralsByUser: Record<string, number> = {};
      for (const r of referrals7dRes.data || []) {
        referralsByUser[r.referrer_id] = (referralsByUser[r.referrer_id] || 0) + 1;
      }

      const rolesByUser: Record<string, string[]> = {};
      for (const r of rolesRes.data || []) {
        if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
        rolesByUser[r.user_id].push(r.role);
      }

      // Calculate baselines and predictions for each user
      for (const user of batch) {
        const uid = user.id;
        const earnings = earningsByUser[uid] || { total14d: 0, total7d: 0 };
        const receiptCount7d = receiptsByUser[uid] || 0;
        const referralCount7d = referralsByUser[uid] || 0;
        const roles = rolesByUser[uid] || [];

        const avgDaily = earnings.total14d / 14;
        const avgWeekly = earnings.total7d;
        const avgReceiptsPerDay = receiptCount7d / 7;

        // Upsert baseline
        await supabase.from("earning_baselines").upsert({
          user_id: uid,
          avg_daily_earnings: Math.round(avgDaily),
          avg_weekly_earnings: Math.round(avgWeekly),
          avg_receipts_per_day: Math.round(avgReceiptsPerDay * 100) / 100,
          avg_referrals_per_week: referralCount7d,
          total_agent_earnings: earnings.total14d,
          receipt_count_7d: receiptCount7d,
          referral_count_7d: referralCount7d,
          last_calculated_at: now.toISOString(),
        }, { onConflict: "user_id" });

        // Calculate prediction multiplier
        let multiplier = 1;
        const isAgent = roles.includes("agent");
        const isSupporter = roles.includes("supporter");

        if (receiptCount7d >= 5) multiplier += 0.2;
        if (receiptCount7d >= 10) multiplier += 0.15;
        if (referralCount7d >= 2) multiplier += 0.3;
        if (referralCount7d >= 5) multiplier += 0.2;
        if (isAgent) multiplier += 0.25;
        if (isSupporter) multiplier += 0.4;

        // Base prediction on actual weekly earnings or minimum estimate
        const baseWeekly = avgWeekly > 0 ? avgWeekly : (isAgent ? 5000 : 1000);
        const predictedWeekly = Math.round(baseWeekly * multiplier);
        const confidence = Math.min(0.9, 0.3 + (avgWeekly > 0 ? 0.3 : 0) + (multiplier - 1) * 0.15);

        const assumptions: Record<string, unknown> = {
          receipts_7d: receiptCount7d,
          referrals_7d: referralCount7d,
          roles,
          multiplier: Math.round(multiplier * 100) / 100,
          base_weekly: Math.round(baseWeekly),
        };

        // Insert weekly prediction
        await supabase.from("earning_predictions").insert({
          user_id: uid,
          period: "weekly",
          predicted_earnings: predictedWeekly,
          confidence: Math.round(confidence * 100) / 100,
          assumptions,
        });

        processed++;
      }
    }

    // Clean up old predictions (keep last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("earning_predictions").delete().lt("created_at", thirtyDaysAgo);

    return new Response(
      JSON.stringify({ success: true, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("earning-predictor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
