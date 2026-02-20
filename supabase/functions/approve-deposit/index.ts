import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client for authenticated user
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body (read ONCE)
    const body = await req.json().catch(() => ({}));
    const { deposit_request_id, action, rejection_reason } = body as {
      deposit_request_id?: string;
      action?: string;
      rejection_reason?: string;
    };

    // UUID validation
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!deposit_request_id || typeof deposit_request_id !== 'string' || !UUID_REGEX.test(deposit_request_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing deposit_request_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'approve' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize rejection_reason
    const safeRejectionReason = typeof rejection_reason === 'string' ? rejection_reason.trim().slice(0, 1000) : undefined;

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the deposit request
    const { data: depositRequest, error: fetchError } = await supabaseAdmin
      .from("deposit_requests")
      .select("*")
      .eq("id", deposit_request_id)
      .single();

    if (fetchError || !depositRequest) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Deposit request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify authorization - allow if manager OR assigned agent
    const { data: isManagerRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    if (roleError) {
      console.error("Role check error:", roleError);
    }

    const isAuthorized = !!isManagerRole || depositRequest.agent_id === user.id;

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Not authorized to process this request" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already processed
    if (depositRequest.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Deposit request already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the processor's name for notification
    const { data: processorProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const processorName = processorProfile?.full_name || "Manager";

    if (action === "approve") {
      // Update deposit request status with processor info
      const { error: updateError } = await supabaseAdmin
        .from("deposit_requests")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          processed_by: user.id,
        })
        .eq("id", deposit_request_id);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      // Credit the user's wallet atomically using RPC or read-then-update
      // First ensure wallet exists
      await supabaseAdmin
        .from("wallets")
        .upsert({ user_id: depositRequest.user_id, balance: 0, updated_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });

      // Read current balance, then add deposit amount
      const { data: currentWallet, error: readErr } = await supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", depositRequest.user_id)
        .single();

      if (readErr || !currentWallet) {
        console.error("Wallet read error:", readErr);
        throw new Error("Could not read wallet balance");
      }

      const newBalance = (currentWallet.balance || 0) + depositRequest.amount;
      const { error: walletError } = await supabaseAdmin
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", depositRequest.user_id)
        .eq("balance", currentWallet.balance); // Optimistic lock

      if (walletError) {
        console.error("Wallet credit error:", walletError);
        throw new Error("Failed to credit wallet. Please retry.");
      }

      // Create notification for user with manager details
      await supabaseAdmin.from("notifications").insert({
        user_id: depositRequest.user_id,
        title: "Deposit Approved! 💰",
        message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} has been approved by ${processorName} and added to your wallet.`,
        type: "success",
        metadata: { 
          deposit_request_id, 
          amount: depositRequest.amount,
          processed_by: user.id,
          processed_by_name: processorName
        },
      });

      // Log audit entry
      await supabaseAdmin.from("audit_logs").insert({
        action_type: "approve",
        table_name: "deposit_requests",
        record_id: deposit_request_id,
        performed_by: user.id,
        old_values: { status: "pending" },
        new_values: { status: "approved", approved_at: new Date().toISOString() },
        metadata: { amount: depositRequest.amount, user_id: depositRequest.user_id },
      });

      console.log(`Deposit approved: ${deposit_request_id}, amount: ${depositRequest.amount}, by: ${processorName}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Deposit approved successfully",
          amount: depositRequest.amount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Reject the deposit with processor info
      const { error: updateError } = await supabaseAdmin
        .from("deposit_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejection_reason: safeRejectionReason || "Rejected by manager",
          processed_by: user.id,
        })
        .eq("id", deposit_request_id);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      // Create notification for user with manager details
      await supabaseAdmin.from("notifications").insert({
        user_id: depositRequest.user_id,
        title: "Deposit Rejected ❌",
        message: `Your deposit request of UGX ${depositRequest.amount.toLocaleString()} was rejected by ${processorName}. Reason: ${safeRejectionReason || "No reason provided"}`,
        type: "warning",
        metadata: { 
          deposit_request_id, 
          amount: depositRequest.amount, 
          reason: safeRejectionReason,
          processed_by: user.id,
          processed_by_name: processorName
        },
      });

      // Log audit entry
      await supabaseAdmin.from("audit_logs").insert({
        action_type: "reject",
        table_name: "deposit_requests",
        record_id: deposit_request_id,
        performed_by: user.id,
        old_values: { status: "pending" },
        new_values: { status: "rejected", rejected_at: new Date().toISOString() },
        reason: safeRejectionReason || "Rejected by manager",
        metadata: { amount: depositRequest.amount, user_id: depositRequest.user_id },
      });

      console.log(`Deposit rejected: ${deposit_request_id}, by: ${processorName}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Deposit rejected",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
