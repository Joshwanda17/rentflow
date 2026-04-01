import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate tenant from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = user.id;

    // Parse and validate input
    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Amount must be greater than 0" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Get tenant's wallet balance
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance, full_name")
      .eq("id", tenantId)
      .single();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Could not find tenant profile" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.wallet_balance < amount) {
      return new Response(
        JSON.stringify({
          error: "Insufficient wallet balance",
          wallet_balance: profile.wallet_balance,
          requested: amount,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find active rent request
    const { data: rentRequest, error: rrErr } = await supabaseAdmin
      .from("rent_requests")
      .select("id, total_repayment, amount_repaid, landlord_id, status")
      .eq("tenant_id", tenantId)
      .in("status", ["funded", "disbursed", "approved", "repaying"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rrErr) {
      return new Response(
        JSON.stringify({ error: "Error looking up rent request" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rentRequest) {
      return new Response(
        JSON.stringify({ error: "No active rent request found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const outstanding = rentRequest.total_repayment - rentRequest.amount_repaid;
    const payAmount = Math.min(amount, outstanding);

    if (payAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Rent is already fully paid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const txnGroupId = crypto.randomUUID();

    // 1. Insert cash_out ledger entry for tenant wallet deduction
    const { error: ledgerErr } = await supabaseAdmin
      .from("general_ledger")
      .insert({
        user_id: tenantId,
        amount: payAmount,
        direction: "cash_out",
        category: "rent_payment",
        source_table: "rent_requests",
        source_id: rentRequest.id,
        description: `Rent payment from wallet`,
        linked_party: rentRequest.landlord_id,
        reference_id: rentRequest.id,
        transaction_group_id: txnGroupId,
      });

    if (ledgerErr) {
      console.error("Ledger insert error:", ledgerErr);
      return new Response(
        JSON.stringify({ error: "Failed to record payment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Call record_rent_request_repayment RPC (updates rent_requests, repayments, landlords)
    // Do NOT pass transaction_group_id here — the RPC's ledger entry is audit-only (no wallet trigger)
    const { error: rpcErr } = await supabaseAdmin.rpc(
      "record_rent_request_repayment",
      { p_tenant_id: tenantId, p_amount: payAmount }
    );

    if (rpcErr) {
      console.error("RPC error:", rpcErr);
      return new Response(
        JSON.stringify({ error: "Payment recorded but repayment update failed. Contact support.", partial: true }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Credit the assigned agent's commission (non-blocking)
    const { error: commissionErr } = await supabaseAdmin.rpc(
      "credit_agent_rent_commission",
      {
        p_rent_request_id: rentRequest.id,
        p_repayment_amount: payAmount,
        p_source_table: "tenant_pay_rent",
        p_source_id: rentRequest.id,
      }
    );
    if (commissionErr) {
      console.error("Commission error (non-blocking):", commissionErr);
    }

    // 4. Get updated wallet balance
    const { data: updatedProfile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", tenantId)
      .single();

    // 4. Get updated rent request
    const { data: updatedRent } = await supabaseAdmin
      .from("rent_requests")
      .select("amount_repaid, total_repayment, status")
      .eq("id", rentRequest.id)
      .single();

    const remainingBalance = updatedRent
      ? updatedRent.total_repayment - updatedRent.amount_repaid
      : outstanding - payAmount;

    return new Response(
      JSON.stringify({
        success: true,
        amount_paid: payAmount,
        remaining_balance: remainingBalance,
        new_wallet_balance: updatedProfile?.wallet_balance ?? profile.wallet_balance - payAmount,
        rent_status: updatedRent?.status ?? rentRequest.status,
        reference: `PAY-${txnGroupId.slice(0, 8).toUpperCase()}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
