import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import { notifyLc1Bonus } from "../_shared/notifyLc1Bonus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Instant leg of the UGX 5,000 LC1 registration reward. Paid the moment the
// agent registers a NEW LC1 chairperson. The remaining UGX 4,000 is paid by
// `credit-lc1-verification-bonus` when Landlord Ops verifies them.
const REGISTERED_BONUS = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity (the registering agent)
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
    const { lc1_id } = body;
    if (!lc1_id || typeof lc1_id !== "string") {
      return new Response(JSON.stringify({ error: "lc1_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Treasury guard: credits agent wallet — block when paused
    const guardBlock = await checkTreasuryGuard(adminClient, "credit", authHeader);
    if (guardBlock) return guardBlock;

    // Load the LC1 record
    const { data: lc1, error: lc1Err } = await adminClient
      .from("lc1_chairpersons")
      .select("id, name, registered_by, listed_bonus_paid")
      .eq("id", lc1_id)
      .single();

    if (lc1Err || !lc1) {
      return new Response(JSON.stringify({ error: "LC1 chairperson not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: only pay once per LC1 record
    if (lc1.listed_bonus_paid) {
      return new Response(JSON.stringify({ success: true, already_paid: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agentId = lc1.registered_by;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "No agent linked to this LC1 chairperson" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only the registering agent can trigger their own instant bonus
    if (agentId !== user.id) {
      return new Response(JSON.stringify({ error: "Only the registering agent can claim this bonus" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    // ─── Balanced double-entry: wallet agent_commission (cash_in) ↔ platform
    // marketing_expense (cash_out). recipient_type 'user' routes the credit to
    // the agent's WITHDRAWABLE bucket. ───
    const { error: ledgerErr } = await adminClient.rpc("create_ledger_transaction", {
      entries: [
        {
          user_id: agentId,
          amount: REGISTERED_BONUS,
          direction: "cash_in",
          category: "agent_commission",
          ledger_scope: "wallet",
          recipient_type: "user",
          source_table: "lc1_chairpersons",
          source_id: lc1_id,
          description: `UGX ${REGISTERED_BONUS.toLocaleString()} instant LC1-registration reward — ${lc1.name || "LC1 chairperson"}`,
          currency: "UGX",
          transaction_date: now,
        },
        {
          amount: REGISTERED_BONUS,
          direction: "cash_out",
          category: "marketing_expense",
          ledger_scope: "platform",
          source_table: "lc1_chairpersons",
          source_id: lc1_id,
          description: `Platform expense: instant LC1-registration reward — ${lc1.name || "LC1 chairperson"}`,
          currency: "UGX",
          transaction_date: now,
        },
      ],
    });

    if (ledgerErr) {
      console.error("[credit-lc1-registered-bonus] Ledger write failed:", ledgerErr.message);
      return new Response(JSON.stringify({ error: "Failed to credit registration reward" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark paid only after money has moved (idempotency anchor)
    const { error: flagErr } = await adminClient
      .from("lc1_chairpersons")
      .update({ listed_bonus_paid: true, listed_bonus_paid_at: now })
      .eq("id", lc1_id)
      .eq("listed_bonus_paid", false);

    if (flagErr) {
      console.error("[credit-lc1-registered-bonus] Flag update failed (money already moved):", flagErr.message);
    }

    console.log(`[credit-lc1-registered-bonus] Credited UGX ${REGISTERED_BONUS} to ${agentId} for LC1 ${lc1_id}`);

    // Notify the agent immediately (in-app + SMS/WhatsApp). Best-effort.
    await notifyLc1Bonus(adminClient, {
      agentId,
      stage: "registered",
      lc1Name: lc1.name,
      lc1Id: lc1_id,
    }).catch((e) => console.error("[credit-lc1-registered-bonus] notify failed:", e));

    return new Response(JSON.stringify({ success: true, bonus: REGISTERED_BONUS }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[credit-lc1-registered-bonus] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
