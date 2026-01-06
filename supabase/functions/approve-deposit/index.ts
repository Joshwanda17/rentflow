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

    if (!deposit_request_id || !action) {
      return new Response(
        JSON.stringify({ error: "Missing deposit_request_id or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'approve' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

      // Credit the user's wallet
      const { error: walletError } = await supabaseAdmin
        .from("wallets")
        .update({
          balance: depositRequest.amount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", depositRequest.user_id);

      // If no wallet exists, we need to upsert
      if (walletError) {
        const { error: upsertError } = await supabaseAdmin
          .from("wallets")
          .upsert({
            user_id: depositRequest.user_id,
            balance: depositRequest.amount,
            updated_at: new Date().toISOString(),
          });

        if (upsertError) {
          console.error("Wallet upsert error:", upsertError);
          throw upsertError;
        }
      } else {
        // Add to existing balance
        const { data: wallet } = await supabaseAdmin
          .from("wallets")
          .select("balance")
          .eq("user_id", depositRequest.user_id)
          .single();

        if (wallet) {
          await supabaseAdmin
            .from("wallets")
            .update({
              balance: (wallet.balance || 0) + depositRequest.amount,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", depositRequest.user_id);
        }
      }

      // Create notification for user
      await supabaseAdmin.from("notifications").insert({
        user_id: depositRequest.user_id,
        title: "Deposit Approved! 💰",
        message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} has been approved and added to your wallet.`,
        type: "success",
        metadata: { deposit_request_id, amount: depositRequest.amount },
      });

      console.log(`Deposit approved: ${deposit_request_id}, amount: ${depositRequest.amount}`);

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
          rejection_reason: rejection_reason || "Rejected by manager",
          processed_by: user.id,
        })
        .eq("id", deposit_request_id);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      // Create notification for user
      await supabaseAdmin.from("notifications").insert({
        user_id: depositRequest.user_id,
        title: "Deposit Rejected",
        message: `Your deposit request of UGX ${depositRequest.amount.toLocaleString()} was rejected. Reason: ${rejection_reason || "Rejected by agent"}`,
        type: "warning",
        metadata: { deposit_request_id, amount: depositRequest.amount, reason: rejection_reason },
      });

      console.log(`Deposit rejected: ${deposit_request_id}`);

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
