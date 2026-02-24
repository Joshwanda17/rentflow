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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify manager role
    const { data: managerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    if (!managerRole) {
      return new Response(
        JSON.stringify({ error: "Only managers can approve wallet operations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { operation_id, action, rejection_reason, bulk_ids } = body as {
      operation_id?: string;
      action: "approve" | "reject";
      rejection_reason?: string;
      bulk_ids?: string[];
    };

    const idsToProcess = bulk_ids || (operation_id ? [operation_id] : []);

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No operation IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reject" && !rejection_reason) {
      return new Response(
        JSON.stringify({ error: "Rejection reason required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch pending operations
    const { data: operations, error: fetchErr } = await adminClient
      .from("pending_wallet_operations")
      .select("*")
      .in("id", idsToProcess)
      .eq("status", "pending");

    if (fetchErr || !operations || operations.length === 0) {
      return new Response(
        JSON.stringify({ error: "No pending operations found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; status: string; user_id: string; amount: number }> = [];

    for (const op of operations) {
      if (action === "approve") {
        // Insert into general_ledger (this triggers wallet balance update via existing trigger)
        const { error: ledgerErr } = await adminClient
          .from("general_ledger")
          .insert({
            user_id: op.user_id,
            amount: op.amount,
            direction: op.direction,
            category: op.category,
            description: op.description,
            source_table: op.source_table,
            source_id: op.source_id,
            transaction_group_id: op.transaction_group_id,
            linked_party: op.linked_party,
            reference_id: op.reference_id,
            account: op.account,
          });

        if (ledgerErr) {
          console.error(`[approve-wallet-op] Ledger insert failed for ${op.id}:`, ledgerErr);
          continue;
        }

        // If this is an agent rent payment for a tenant, update receivables
        if (op.category === 'rent_payment_for_tenant' && op.direction === 'cash_in' && op.user_id) {
          // The cash_in direction means tenant wallet was credited — update their rent repayment
          try {
            await adminClient.rpc("record_rent_request_repayment", {
              p_tenant_id: op.user_id,
              p_amount: op.amount,
            });
            console.log(`[approve-wallet-op] Updated receivables for tenant ${op.user_id}, amount: ${op.amount}`);
          } catch (rpcErr) {
            console.error(`[approve-wallet-op] Failed to update receivables for ${op.id}:`, rpcErr);
          }
        }

        // Mark as approved
        await adminClient
          .from("pending_wallet_operations")
          .update({
            status: "approved",
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id);

        // Notify user
        await adminClient.from("notifications").insert({
          user_id: op.user_id,
          title: op.direction === "cash_in" ? "Wallet Credited ✅" : "Wallet Debited ✅",
          message: `UGX ${op.amount.toLocaleString()} - ${op.description || op.category}. Approved by admin.`,
          type: "success",
          metadata: { operation_id: op.id, amount: op.amount, direction: op.direction },
        });

        results.push({ id: op.id, status: "approved", user_id: op.user_id, amount: op.amount });
      } else {
        // Reject
        await adminClient
          .from("pending_wallet_operations")
          .update({
            status: "rejected",
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            rejection_reason: rejection_reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id);

        // Notify user
        await adminClient.from("notifications").insert({
          user_id: op.user_id,
          title: "Transaction Rejected ❌",
          message: `UGX ${op.amount.toLocaleString()} - ${op.description || op.category}. Reason: ${rejection_reason}`,
          type: "warning",
          metadata: { operation_id: op.id, amount: op.amount, reason: rejection_reason },
        });

        results.push({ id: op.id, status: "rejected", user_id: op.user_id, amount: op.amount });
      }
    }

    console.log(`[approve-wallet-op] Manager ${user.id} ${action}d ${results.length} operations`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${results.length} operation(s) ${action}d`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[approve-wallet-op] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
