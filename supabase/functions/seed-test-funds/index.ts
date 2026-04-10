import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Only managers can seed test funds
    const { data: managerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    if (!managerRole) {
      return new Response(
        JSON.stringify({ error: "Only managers can seed test funds" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { target_user_id, amount } = body as { target_user_id?: string; amount?: number };

    // Validate inputs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!target_user_id || !UUID_RE.test(target_user_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid target_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!amount || typeof amount !== "number" || amount <= 0 || amount > 10_000_000) {
      return new Response(
        JSON.stringify({ error: "Amount must be between 1 and 10,000,000" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user exists
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure wallet exists (trigger handles balance updates)
    await adminClient
      .from("wallets")
      .upsert(
        { user_id: target_user_id, balance: 0, updated_at: new Date().toISOString() },
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    // Generate reference ID
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `TST${yy}${mm}${dd}${seq}`;

    // Record via RPC (trigger handles wallet balance)
    const { data: txGroupId, error: ledgerErr } = await adminClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: target_user_id,
          amount,
          direction: 'cash_in',
          category: 'test_funds_cleanup',
          ledger_scope: 'wallet',
          source_table: 'wallets',
          description: `Test funds seeded by manager (${user.email})`,
          currency: 'UGX',
          reference_id: referenceId,
          linked_party: user.email || 'Manager',
          transaction_date: new Date().toISOString(),
        },
        {
          direction: 'cash_out',
          amount,
          category: 'test_funds_cleanup',
          ledger_scope: 'platform',
          source_table: 'wallets',
          description: `Platform seeded test funds to ${targetProfile.full_name}`,
          currency: 'UGX',
          reference_id: referenceId,
          transaction_date: new Date().toISOString(),
        },
      ],
    });

    if (ledgerErr) {
      console.error("Ledger RPC error:", ledgerErr);
      return new Response(
        JSON.stringify({ error: "Failed to record transaction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference_id: referenceId,
        target_user: targetProfile.full_name,
        amount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("seed-test-funds error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
