import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function formatPhoneInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[manual-collect-rent] Missing AT credentials, skipping SMS");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  const formattedPhone = formatPhoneInternational(phone);
  try {
    const body = new URLSearchParams({ username, to: formattedPhone, message });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apiKey, Accept: "application/json" },
      body: body.toString(),
    });
    const data = await res.json();
    const recipients = data?.SMSMessageData?.Recipients || [];
    const success = recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
    console.log(`[manual-collect-rent] SMS to ${formattedPhone}: ${success ? "sent" : "failed"}`);
    return success;
  } catch (err) {
    console.error("[manual-collect-rent] SMS error:", err);
    return false;
  }
}

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

    // Verify caller is staff via user_roles table
    const allowedRoles = ["manager", "super_admin", "operations", "coo", "cfo", "ceo", "employee"];
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const hasAllowedRole = userRoles?.some((r: any) => allowedRoles.includes(r.role));
    if (!hasAllowedRole) {
      return new Response(JSON.stringify({ error: "Only authorized staff can collect rent manually" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { rent_request_id, reason } = body;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!rent_request_id || !UUID_REGEX.test(rent_request_id)) {
      return new Response(JSON.stringify({ error: "Invalid rent_request_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
      return new Response(JSON.stringify({ error: "A reason of at least 10 characters is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmedReason = reason.trim();

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

    // Fetch tenant profile (name + phone)
    const { data: tenantProfile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", rr.tenant_id)
      .single();
    const tenantName = tenantProfile?.full_name || "Unknown Tenant";
    const tenantPhone = tenantProfile?.phone || "";

    // Fetch agent name
    const { data: agentProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const agentName = agentProfile?.full_name || "Your Agent";

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
        description: `Manual collection: ${trimmedReason}`,
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
            description: `Manual collection (agent share): ${trimmedReason}`,
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

    // Credit agent 10% commission on this repayment
    if (rr.id && totalCollected > 0) {
      await supabase.rpc("credit_agent_rent_commission", {
        p_rent_request_id: rr.id,
        p_repayment_amount: totalCollected,
        p_tenant_id: rr.tenant_id,
        p_event_reference_id: `manual-collect-${txGroupId}`,
      });
    }

    // Send SMS to tenant (especially for non-smartphone users)
    const remainingBalance = outstanding - totalCollected;
    if (tenantPhone) {
      const smsMessage = [
        `WELILE: Dear ${tenantName}, UGX ${totalCollected.toLocaleString()} has been paid towards your rent by ${agentName}.`,
        remainingBalance > 0
          ? `Balance remaining: UGX ${remainingBalance.toLocaleString()}.`
          : `Your rent is now fully paid! Thank you.`,
        `Did you know? With WELILE, you can access up to UGX 30,000,000 in credit. Ask your agent for details!`,
        `Ref: ${rent_request_id.slice(0, 8)}`,
      ].join("\n");
      sendSMS(tenantPhone, smsMessage).catch(e => console.error("[manual-collect-rent] SMS error:", e));
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "manual_rent_collection",
      table_name: "rent_requests",
      record_id: rent_request_id,
      metadata: {
        reason: trimmedReason,
        tenant_id: rr.tenant_id,
        tenant_name: tenantName,
        agent_id: rr.agent_id,
        total_collected: totalCollected,
        tenant_deducted: tenantDeducted,
        agent_deducted: agentDeducted,
      },
    });

    console.log(`[manual-collect-rent] Collected ${totalCollected} for ${rent_request_id}: tenant=${tenantDeducted}, agent=${agentDeducted}, reason="${trimmedReason}"`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "🏠 Manual Rent Collection", body: "Activity: rent collected", url: "/manager" }),
    }).catch(() => {});


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
