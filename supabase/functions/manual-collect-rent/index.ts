import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify manager auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is a manager
    const { data: managerProfile } = await supabase
      .from("profiles")
      .select("agent_type")
      .eq("id", user.id)
      .single();
    if (!managerProfile || managerProfile.agent_type !== "manager") {
      return new Response(JSON.stringify({ error: "Only managers can collect rent manually" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { rent_request_id } = body;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!rent_request_id || !UUID_REGEX.test(rent_request_id)) {
      return new Response(JSON.stringify({ error: "Invalid rent_request_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch rent request
    const { data: rr, error: rrErr } = await supabase
      .from("rent_requests")
      .select("*")
      .eq("id", rent_request_id)
      .single();

    if (rrErr || !rr) {
      return new Response(JSON.stringify({ error: "Rent request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outstanding = Number(rr.total_repayment) - Number(rr.amount_repaid);
    if (outstanding <= 0) {
      return new Response(JSON.stringify({ error: "No outstanding balance to collect" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant name
    const { data: tenantProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", rr.tenant_id)
      .single();
    const tenantName = tenantProfile?.full_name || "Unknown Tenant";

    // Try tenant wallet first
    const { data: tenantWallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", rr.tenant_id)
      .single();

    const tenantBalance = Number(tenantWallet?.balance || 0);
    const chargeAmount = Math.min(outstanding, rr.daily_repayment || outstanding);

    let tenantDeducted = 0;
    let agentDeducted = 0;
    let shortfall = chargeAmount;
    const txGroupId = crypto.randomUUID();

    // Deduct from tenant wallet
    if (tenantBalance > 0) {
      tenantDeducted = Math.min(tenantBalance, shortfall);
      const newBalance = tenantBalance - tenantDeducted;

      const { error: deductErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", rr.tenant_id)
        .eq("balance", tenantBalance); // optimistic lock

      if (deductErr) {
        return new Response(JSON.stringify({ error: "Failed to deduct from tenant wallet. Try again." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record ledger entry
      await supabase.from("pending_wallet_operations").insert({
        user_id: rr.tenant_id,
        amount: tenantDeducted,
        direction: "cash_out",
        category: "rent_repayment",
        source_table: "rent_requests",
        source_id: rr.id,
        transaction_group_id: txGroupId,
        description: `Manual collection by manager for rent instalment`,
        linked_party: "platform",
        status: "approved",
      });

      shortfall -= tenantDeducted;

      // Notify tenant
      await supabase.from("notifications").insert({
        user_id: rr.tenant_id,
        title: "💳 Rent Collected",
        message: `UGX ${tenantDeducted.toLocaleString()} was collected from your wallet for rent repayment by the manager.`,
        type: "info",
        metadata: { rent_request_id, amount: tenantDeducted, source: "manual_collection" },
      });
    }

    // Try agent wallet for remaining shortfall
    if (shortfall > 0 && rr.agent_id) {
      const { data: agentWallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", rr.agent_id)
        .single();

      const agentBalance = Number(agentWallet?.balance || 0);

      if (agentBalance > 0) {
        agentDeducted = Math.min(agentBalance, shortfall);
        const newAgentBalance = agentBalance - agentDeducted;

        const { error: agentErr } = await supabase
          .from("wallets")
          .update({ balance: newAgentBalance, updated_at: new Date().toISOString() })
          .eq("user_id", rr.agent_id)
          .eq("balance", agentBalance); // optimistic lock

        if (!agentErr) {
          await supabase.from("pending_wallet_operations").insert({
            user_id: rr.agent_id,
            amount: agentDeducted,
            direction: "cash_out",
            category: "rent_repayment",
            source_table: "rent_requests",
            source_id: rr.id,
            transaction_group_id: txGroupId,
            description: `Manual collection by manager: agent covering ${tenantName}'s rent instalment`,
            linked_party: rr.tenant_id,
            status: "approved",
          });

          shortfall -= agentDeducted;

          // Notify agent
          await supabase.from("notifications").insert({
            user_id: rr.agent_id,
            title: "💳 Agent Wallet Charged for Tenant",
            message: `UGX ${agentDeducted.toLocaleString()} was collected from your wallet to cover ${tenantName}'s rent repayment.`,
            type: "warning",
            metadata: { rent_request_id, tenant_name: tenantName, amount: agentDeducted, source: "manual_collection" },
          });
        }
      }
    }

    const totalCollected = tenantDeducted + agentDeducted;

    if (totalCollected === 0) {
      return new Response(JSON.stringify({ error: "Both tenant and agent wallets have insufficient funds" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record repayment on the rent request
    await supabase.rpc("record_rent_request_repayment", {
      p_tenant_id: rr.tenant_id,
      p_amount: totalCollected,
    });

    console.log(`[manual-collect-rent] Collected ${totalCollected} for ${rent_request_id}: tenant=${tenantDeducted}, agent=${agentDeducted}`);

    return new Response(JSON.stringify({
      success: true,
      total_collected: totalCollected,
      tenant_deducted: tenantDeducted,
      agent_deducted: agentDeducted,
      remaining_shortfall: shortfall,
      tenant_name: tenantName,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[manual-collect-rent] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
