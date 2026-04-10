import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REGISTRATION_BONUS = 5000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { landlord_id } = body;

    if (!landlord_id || typeof landlord_id !== "string") {
      return new Response(JSON.stringify({ error: "landlord_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the landlord was registered by this user
    const { data: landlord, error: landlordErr } = await adminClient
      .from("landlords")
      .select("id, registered_by, name")
      .eq("id", landlord_id)
      .single();

    if (landlordErr || !landlord) {
      return new Response(JSON.stringify({ error: "Landlord not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (landlord.registered_by !== user.id) {
      return new Response(JSON.stringify({ error: "You did not register this landlord" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if bonus was already paid for this landlord (idempotency)
    const { data: existing } = await adminClient
      .from("agent_earnings")
      .select("id")
      .eq("agent_id", user.id)
      .eq("earning_type", "landlord_registration_bonus")
      .eq("description", `Landlord registration bonus: ${landlord.name}`)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ message: "Bonus already credited", already_paid: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure wallet exists (trigger handles balance updates)
    await adminClient
      .from("wallets")
      .upsert({ user_id: user.id, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

    const now = new Date().toISOString();

    // Record earning
    await adminClient.from("agent_earnings").insert({
      agent_id: user.id,
      amount: REGISTRATION_BONUS,
      earning_type: "landlord_registration_bonus",
      source_user_id: null,
      description: `Landlord registration bonus: ${landlord.name}`,
    });

    // Record in general ledger via RPC
    const { error: ledgerErr } = await adminClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: user.id,
          amount: REGISTRATION_BONUS,
          direction: 'cash_in',
          category: 'agent_commission_earned',
          ledger_scope: 'wallet',
          source_table: 'agent_earnings',
          source_id: landlord_id,
          description: `UGX 5,000 landlord registration bonus for ${landlord.name}`,
          currency: 'UGX',
          transaction_date: now,
        },
        {
          direction: 'cash_out',
          amount: REGISTRATION_BONUS,
          category: 'agent_commission_earned',
          ledger_scope: 'platform',
          source_table: 'agent_earnings',
          source_id: landlord_id,
          description: `Platform expense: landlord registration bonus for ${landlord.name}`,
          currency: 'UGX',
          transaction_date: now,
        },
      ],
    });

    if (ledgerErr) {
      console.error("[credit-landlord-bonus] Ledger RPC error:", ledgerErr);
      return new Response(JSON.stringify({ error: "Failed to record bonus" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record wallet transaction for visibility
    await adminClient.from("wallet_transactions").insert({
      sender_id: user.id,
      recipient_id: user.id,
      amount: REGISTRATION_BONUS,
      description: `Landlord registration bonus: ${landlord.name}`,
    });

    console.log(`[credit-landlord-bonus] Credited UGX ${REGISTRATION_BONUS} to ${user.id} for landlord ${landlord.name}`);

    return new Response(JSON.stringify({ 
      success: true, 
      bonus: REGISTRATION_BONUS,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[credit-landlord-bonus] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
