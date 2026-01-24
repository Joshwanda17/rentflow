import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TenantSummary {
  tenant_id: string;
  tenant_name: string;
  current_savings: number;
  previous_savings: number;
  growth_amount: number;
  growth_percent: number;
  months_enrolled: number;
}

interface LandlordSummary {
  landlord_id: string;
  landlord_name: string;
  total_tenants: number;
  total_savings: number;
  monthly_growth: number;
  tenants: TenantSummary[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting Welile Homes monthly summary generation...");

    // Get all landlords with tenants in Welile Homes
    const { data: landlordRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "landlord")
      .eq("is_enabled", true);

    if (rolesError) {
      console.error("Error fetching landlords:", rolesError);
      throw rolesError;
    }

    if (!landlordRoles || landlordRoles.length === 0) {
      console.log("No active landlords found");
      return new Response(JSON.stringify({ message: "No landlords to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const landlordIds = landlordRoles.map((r) => r.user_id);
    console.log(`Processing ${landlordIds.length} landlords`);

    // Get landlord profiles
    const { data: landlordProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", landlordIds);

    const landlordProfileMap = new Map(
      landlordProfiles?.map((p) => [p.id, p.full_name || "Landlord"]) || []
    );

    // Process each landlord
    const summaries: LandlordSummary[] = [];

    for (const landlordId of landlordIds) {
      // Get tenants linked to this landlord via rent_requests
      const { data: rentRequests } = await supabase
        .from("rent_requests")
        .select("tenant_id")
        .eq("landlord_id", landlordId);

      if (!rentRequests || rentRequests.length === 0) continue;

      const tenantIds = [...new Set(rentRequests.map((rr) => rr.tenant_id))];

      // Get Welile Homes subscriptions for these tenants
      const { data: subscriptions } = await supabase
        .from("welile_homes_subscriptions")
        .select("*")
        .in("tenant_id", tenantIds)
        .eq("subscription_status", "active");

      if (!subscriptions || subscriptions.length === 0) continue;

      // Get tenant profiles
      const { data: tenantProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", subscriptions.map((s) => s.tenant_id));

      const tenantProfileMap = new Map(
        tenantProfiles?.map((p) => [p.id, p.full_name || "Tenant"]) || []
      );

      // Calculate monthly growth for each tenant
      // Get contributions from last month
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const tenantSummaries: TenantSummary[] = [];
      let totalMonthlyGrowth = 0;
      let totalSavings = 0;

      for (const sub of subscriptions) {
        // Get contributions from the last month
        const { data: contributions } = await supabase
          .from("welile_homes_contributions")
          .select("amount, contribution_type")
          .eq("subscription_id", sub.id)
          .gte("created_at", oneMonthAgo.toISOString());

        // Calculate growth (deposits + interest, minus withdrawals)
        const monthlyGrowth = contributions?.reduce((sum, c) => {
          if (c.contribution_type === "withdrawal") return sum - Math.abs(c.amount);
          return sum + c.amount;
        }, 0) || 0;

        const previousSavings = sub.total_savings - monthlyGrowth;
        const growthPercent = previousSavings > 0 
          ? ((monthlyGrowth / previousSavings) * 100) 
          : (monthlyGrowth > 0 ? 100 : 0);

        tenantSummaries.push({
          tenant_id: sub.tenant_id,
          tenant_name: tenantProfileMap.get(sub.tenant_id) || "Tenant",
          current_savings: sub.total_savings,
          previous_savings: previousSavings,
          growth_amount: monthlyGrowth,
          growth_percent: Math.round(growthPercent * 10) / 10,
          months_enrolled: sub.months_enrolled,
        });

        totalMonthlyGrowth += monthlyGrowth;
        totalSavings += sub.total_savings;
      }

      if (tenantSummaries.length > 0) {
        summaries.push({
          landlord_id: landlordId,
          landlord_name: landlordProfileMap.get(landlordId) || "Landlord",
          total_tenants: tenantSummaries.length,
          total_savings: totalSavings,
          monthly_growth: totalMonthlyGrowth,
          tenants: tenantSummaries,
        });
      }
    }

    console.log(`Generated summaries for ${summaries.length} landlords`);

    // Create notifications for each landlord
    const notifications = summaries.map((summary) => {
      const topGrowers = summary.tenants
        .sort((a, b) => b.growth_amount - a.growth_amount)
        .slice(0, 3);

      return {
        user_id: summary.landlord_id,
        type: "welile_homes_monthly_summary",
        title: "📊 Welile Homes Monthly Summary",
        message: `Your ${summary.total_tenants} tenant${summary.total_tenants > 1 ? "s have" : " has"} grown their savings by UGX ${summary.monthly_growth.toLocaleString()} this month! Total savings: UGX ${summary.total_savings.toLocaleString()}.`,
        metadata: {
          total_tenants: summary.total_tenants,
          total_savings: summary.total_savings,
          monthly_growth: summary.monthly_growth,
          top_growers: topGrowers.map((t) => ({
            name: t.tenant_name,
            growth: t.growth_amount,
            total: t.current_savings,
          })),
          month: new Date().toLocaleString("default", { month: "long", year: "numeric" }),
        },
      };
    });

    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Error creating notifications:", notifError);
        throw notifError;
      }
      console.log(`Created ${notifications.length} notifications`);
    }

    // Also try to send push notifications
    for (const summary of summaries) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_ids: [summary.landlord_id],
            payload: {
              title: "📊 Monthly Welile Homes Summary",
              body: `Your tenants grew their savings by UGX ${summary.monthly_growth.toLocaleString()} this month!`,
              type: "info",
              icon: "/welile-logo.png",
              url: "/landlord-welile-homes",
            },
          }),
        });
      } catch (pushErr) {
        console.log("Push notification attempted:", pushErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: summaries.length,
        notifications_created: notifications.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in monthly summary function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
