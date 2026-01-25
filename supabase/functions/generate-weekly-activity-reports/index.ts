import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate the week period (last 7 days)
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    
    const reportWeek = weekStart.toISOString().split('T')[0];
    
    console.log(`Generating weekly activity reports for week starting: ${reportWeek}`);

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone");

    if (usersError) throw usersError;

    console.log(`Processing ${users?.length || 0} users`);

    const reports = [];

    for (const user of users || []) {
      // Get login count for the week
      const { count: loginCount } = await supabase
        .from("user_login_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("login_at", weekStart.toISOString())
        .eq("success", true);

      // Get wallet transactions (sent)
      const { data: sentTxns } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("sender_id", user.id)
        .gte("created_at", weekStart.toISOString());

      // Get wallet transactions (received)
      const { data: receivedTxns } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("recipient_id", user.id)
        .gte("created_at", weekStart.toISOString());

      const transactionCount = (sentTxns?.length || 0) + (receivedTxns?.length || 0);
      const totalTransactionAmount = 
        (sentTxns?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0) +
        (receivedTxns?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0);

      // Get rent requests count
      const { count: rentRequestsCount } = await supabase
        .from("rent_requests")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", user.id)
        .gte("created_at", weekStart.toISOString());

      // Get repayments
      const { data: repayments } = await supabase
        .from("repayments")
        .select("amount")
        .eq("tenant_id", user.id)
        .gte("created_at", weekStart.toISOString());

      const repaymentsCount = repayments?.length || 0;
      const repaymentsAmount = repayments?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

      // Get activity log entries
      const { count: activityCount } = await supabase
        .from("user_activity_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", weekStart.toISOString());

      // Calculate engagement score (0-100)
      let engagementScore = 0;
      engagementScore += Math.min((loginCount || 0) * 10, 30); // Max 30 points for logins
      engagementScore += Math.min(transactionCount * 15, 30); // Max 30 points for transactions
      engagementScore += Math.min((rentRequestsCount || 0) * 20, 20); // Max 20 points for rent requests
      engagementScore += Math.min(repaymentsCount * 10, 20); // Max 20 points for repayments

      // Get previous week's report to determine trend
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      
      const { data: prevReport } = await supabase
        .from("user_activity_reports")
        .select("engagement_score")
        .eq("user_id", user.id)
        .eq("report_week", prevWeekStart.toISOString().split('T')[0])
        .single();

      let trend = "stable";
      if (prevReport) {
        const diff = engagementScore - prevReport.engagement_score;
        if (diff > 10) trend = "increasing";
        else if (diff < -10) trend = "decreasing";
      } else if (engagementScore > 0) {
        trend = "new";
      }

      const reportData = {
        user_name: user.full_name,
        user_email: user.email,
        user_phone: user.phone,
        period_start: weekStart.toISOString(),
        period_end: now.toISOString(),
        details: {
          logins: loginCount || 0,
          transactions_sent: sentTxns?.length || 0,
          transactions_received: receivedTxns?.length || 0,
          activity_entries: activityCount || 0,
        }
      };

      reports.push({
        user_id: user.id,
        report_week: reportWeek,
        login_count: loginCount || 0,
        transaction_count: transactionCount,
        total_transaction_amount: totalTransactionAmount,
        rent_requests_count: rentRequestsCount || 0,
        repayments_count: repaymentsCount,
        repayments_amount: repaymentsAmount,
        engagement_score: engagementScore,
        trend,
        report_data: reportData,
      });
    }

    // Upsert all reports
    if (reports.length > 0) {
      const { error: insertError } = await supabase
        .from("user_activity_reports")
        .upsert(reports, { onConflict: "user_id,report_week" });

      if (insertError) throw insertError;
    }

    // Notify managers about report generation
    const { data: managers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "manager")
      .eq("enabled", true);

    if (managers && managers.length > 0) {
      const activeUsers = reports.filter(r => r.engagement_score > 0).length;
      const increasingTrend = reports.filter(r => r.trend === "increasing").length;
      const decreasingTrend = reports.filter(r => r.trend === "decreasing").length;

      const notifications = managers.map(m => ({
        user_id: m.user_id,
        title: "📊 Weekly Activity Report Ready",
        message: `Generated reports for ${reports.length} users. Active this week: ${activeUsers}. Trending up: ${increasingTrend}, down: ${decreasingTrend}.`,
        type: "info",
        metadata: {
          report_week: reportWeek,
          total_users: reports.length,
          active_users: activeUsers,
          trending_up: increasingTrend,
          trending_down: decreasingTrend,
        }
      }));

      await supabase.from("notifications").insert(notifications);
    }

    console.log(`Successfully generated ${reports.length} weekly activity reports`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reports_generated: reports.length,
        report_week: reportWeek 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error generating weekly activity reports:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
