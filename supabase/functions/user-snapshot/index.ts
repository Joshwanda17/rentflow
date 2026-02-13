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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user from token
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Fetch user roles first to determine what data to fetch
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, enabled")
      .eq("user_id", userId);

    const activeRoles = (roles || [])
      .filter((r) => r.enabled)
      .map((r) => r.role);

    // Batch all queries in parallel
    const queries: Record<string, Promise<any>> = {};

    // Referrals — every user can have these
    queries.referrals = supabase
      .from("referrals")
      .select("id, referred_id, bonus_amount, credited, credited_at, created_at")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    queries.referralCount = supabase
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", userId);

    // Agent-specific data
    if (activeRoles.includes("agent")) {
      // Sub-agents
      queries.subAgents = supabase
        .from("agent_subagents")
        .select("id, sub_agent_id, created_at, source")
        .eq("parent_agent_id", userId);

      // Pending sub-agent invites
      queries.pendingSubAgentInvites = supabase
        .from("supporter_invites")
        .select("id, full_name, phone, status, created_at")
        .eq("created_by", userId)
        .eq("role", "agent")
        .eq("status", "pending");

      // User invites (tenants + landlords registered by agent)
      queries.userInvites = supabase
        .from("supporter_invites")
        .select("id, full_name, phone, role, status, created_at")
        .eq("created_by", userId)
        .in("role", ["tenant", "landlord"]);

      // Link signups (referrals via agent link)
      queries.linkSignups = supabase
        .from("profiles")
        .select("id, full_name, phone, created_at")
        .eq("referrer_id", userId)
        .limit(50);

      // Agent earnings summary
      queries.earningsSummary = supabase
        .from("agent_earnings")
        .select("earning_type, amount")
        .eq("agent_id", userId);
    }

    // Tenant-specific data
    if (activeRoles.includes("tenant")) {
      queries.landlords = supabase
        .from("landlords")
        .select("id, name, phone, property_address, monthly_rent, verified")
        .eq("tenant_id", userId);

      queries.rentRequests = supabase
        .from("rent_requests")
        .select(
          "id, rent_amount, total_repayment, daily_repayment, duration_days, status, schedule_status, created_at, number_of_payments"
        )
        .eq("tenant_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
    }

    // Supporter-specific data
    if (activeRoles.includes("supporter")) {
      queries.supporterReferrals = supabase
        .from("supporter_referrals")
        .select("id, referred_id, bonus_amount, bonus_credited, first_investment_at, created_at")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
    }

    // Execute all queries in parallel
    const results: Record<string, any> = {};
    const entries = Object.entries(queries);
    const settled = await Promise.allSettled(entries.map(([, q]) => q));

    for (let i = 0; i < entries.length; i++) {
      const [key] = entries[i];
      const result = settled[i];
      if (result.status === "fulfilled") {
        const { data, count, error } = result.value;
        if (error) {
          console.error(`Query ${key} error:`, error.message);
          results[key] = null;
        } else {
          results[key] = count !== undefined && count !== null ? { data, count } : data;
        }
      } else {
        console.error(`Query ${key} rejected:`, result.reason);
        results[key] = null;
      }
    }

    // Build snapshot
    const snapshot = {
      userId,
      roles: activeRoles,
      fetchedAt: new Date().toISOString(),

      // Referrals
      referrals: results.referrals || [],
      referralCount: results.referralCount?.count ?? (results.referrals?.length || 0),

      // Agent data
      subAgents: results.subAgents || [],
      pendingSubAgentInvites: results.pendingSubAgentInvites || [],
      userInvites: results.userInvites || [],
      linkSignups: results.linkSignups || [],
      earningsSummary: results.earningsSummary || [],

      // Tenant data
      landlords: results.landlords || [],
      rentRequests: results.rentRequests || [],

      // Supporter data
      supporterReferrals: results.supporterReferrals || [],
    };

    return new Response(JSON.stringify(snapshot), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("user-snapshot error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
