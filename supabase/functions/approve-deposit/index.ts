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

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { deposit_request_id, action, rejection_reason, bulk_ids } = body as {
      deposit_request_id?: string;
      action?: string;
      rejection_reason?: string;
      bulk_ids?: string[];
    };

    // Validate action
    if (!action || !["approve", "reject"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'approve' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine IDs to process — single or bulk
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let idsToProcess: string[] = [];
    if (bulk_ids && Array.isArray(bulk_ids)) {
      if (bulk_ids.length > 100) {
        return new Response(
          JSON.stringify({ error: "Cannot process more than 100 deposits at once" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      idsToProcess = bulk_ids.filter(id => typeof id === 'string' && UUID_REGEX.test(id));
    } else if (deposit_request_id && typeof deposit_request_id === 'string' && UUID_REGEX.test(deposit_request_id)) {
      idsToProcess = [deposit_request_id];
    }

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid deposit IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safeRejectionReason = typeof rejection_reason === 'string' ? rejection_reason.trim().slice(0, 1000) : undefined;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authorization — manager or assigned agent
    const { data: isManagerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    // Get processor name once
    const { data: processorProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const processorName = processorProfile?.full_name || "Manager";

    // Fetch all deposit requests at once
    const { data: depositRequests, error: fetchError } = await supabaseAdmin
      .from("deposit_requests")
      .select("*")
      .in("id", idsToProcess)
      .eq("status", "pending");

    if (fetchError || !depositRequests || depositRequests.length === 0) {
      return new Response(
        JSON.stringify({ error: "No pending deposit requests found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify authorization for all requests
    if (!isManagerRole) {
      // Non-manager can only process deposits assigned to them as agent
      const unauthorized = depositRequests.filter(d => d.agent_id !== user.id);
      if (unauthorized.length > 0) {
        return new Response(
          JSON.stringify({ error: "Not authorized to process some requests" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const results: Array<{ id: string; status: string; amount: number; user_id: string; repayment_applied?: number }> = [];

    for (const depositRequest of depositRequests) {
      try {
        if (action === "approve") {
          // Update status
          await supabaseAdmin
            .from("deposit_requests")
            .update({ status: "approved", approved_at: new Date().toISOString(), processed_by: user.id })
            .eq("id", depositRequest.id);

          // Credit wallet with optimistic locking
          await supabaseAdmin
            .from("wallets")
            .upsert({ user_id: depositRequest.user_id, balance: 0, updated_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });

          const { data: currentWallet } = await supabaseAdmin
            .from("wallets")
            .select("balance")
            .eq("user_id", depositRequest.user_id)
            .single();

          if (currentWallet) {
            const newBalance = (currentWallet.balance || 0) + depositRequest.amount;
            await supabaseAdmin
              .from("wallets")
              .update({ balance: newBalance, updated_at: new Date().toISOString() })
              .eq("user_id", depositRequest.user_id)
              .eq("balance", currentWallet.balance);
          }

          // Check and apply rent repayment
          let repaymentApplied = 0;
          let rentRequestId: string | null = null;
          let previousBalance = 0;
          let newOutstanding = 0;

          const { data: activeRentRequest } = await supabaseAdmin
            .from("rent_requests")
            .select("id, total_repayment, amount_repaid, rent_amount, status")
            .eq("tenant_id", depositRequest.user_id)
            .in("status", ["funded", "disbursed", "approved"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeRentRequest) {
            const outstanding = Number(activeRentRequest.total_repayment) - Number(activeRentRequest.amount_repaid);
            previousBalance = outstanding;
            rentRequestId = activeRentRequest.id;

            const { error: repaymentError } = await supabaseAdmin.rpc(
              "record_rent_request_repayment",
              { p_tenant_id: depositRequest.user_id, p_amount: depositRequest.amount }
            );
            if (!repaymentError) {
              repaymentApplied = Math.min(depositRequest.amount, outstanding);
              newOutstanding = outstanding - repaymentApplied;

              const txGroupId = crypto.randomUUID();
              await supabaseAdmin.from("general_ledger").insert({
                user_id: depositRequest.user_id,
                amount: repaymentApplied,
                direction: "cash_out",
                category: "rent_repayment",
                source_table: "deposit_requests",
                source_id: depositRequest.id,
                reference_id: depositRequest.transaction_id || depositRequest.id,
                transaction_group_id: txGroupId,
                description: `Rent repayment from deposit (TXN: ${depositRequest.transaction_id || 'N/A'})`,
                linked_party: rentRequestId,
                transaction_date: new Date().toISOString(),
              });
            }
          }

          // Notification
          const repaymentNote = repaymentApplied > 0
            ? ` UGX ${repaymentApplied.toLocaleString()} applied to rent (remaining: UGX ${newOutstanding.toLocaleString()}).`
            : "";
          await supabaseAdmin.from("notifications").insert({
            user_id: depositRequest.user_id,
            title: "Deposit Approved! 💰",
            message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} approved by ${processorName}.${repaymentNote}`,
            type: "success",
            metadata: { deposit_request_id: depositRequest.id, amount: depositRequest.amount, repayment_applied: repaymentApplied },
          });

          // Audit
          await supabaseAdmin.from("audit_logs").insert({
            action_type: "approve",
            table_name: "deposit_requests",
            record_id: depositRequest.id,
            performed_by: user.id,
            old_values: { status: "pending" },
            new_values: { status: "approved" },
            metadata: { amount: depositRequest.amount, repayment_applied: repaymentApplied },
          });

          results.push({ id: depositRequest.id, status: "approved", amount: depositRequest.amount, user_id: depositRequest.user_id, repayment_applied: repaymentApplied });
        } else {
          // Reject
          await supabaseAdmin
            .from("deposit_requests")
            .update({
              status: "rejected",
              rejected_at: new Date().toISOString(),
              rejection_reason: safeRejectionReason || "Rejected by manager",
              processed_by: user.id,
            })
            .eq("id", depositRequest.id);

          await supabaseAdmin.from("notifications").insert({
            user_id: depositRequest.user_id,
            title: "Deposit Rejected ❌",
            message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} rejected by ${processorName}. Reason: ${safeRejectionReason || "No reason"}`,
            type: "warning",
            metadata: { deposit_request_id: depositRequest.id, amount: depositRequest.amount, reason: safeRejectionReason },
          });

          await supabaseAdmin.from("audit_logs").insert({
            action_type: "reject",
            table_name: "deposit_requests",
            record_id: depositRequest.id,
            performed_by: user.id,
            old_values: { status: "pending" },
            new_values: { status: "rejected" },
            reason: safeRejectionReason || "Rejected by manager",
            metadata: { amount: depositRequest.amount },
          });

          results.push({ id: depositRequest.id, status: "rejected", amount: depositRequest.amount, user_id: depositRequest.user_id });
        }
      } catch (innerErr) {
        console.error(`[approve-deposit] Error processing ${depositRequest.id}:`, innerErr);
        results.push({ id: depositRequest.id, status: "error", amount: depositRequest.amount, user_id: depositRequest.user_id });
      }
    }

    console.log(`[approve-deposit] ${processorName} ${action}d ${results.filter(r => r.status !== 'error').length}/${depositRequests.length} deposits`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${results.filter(r => r.status !== 'error').length} deposit(s) ${action}d`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
