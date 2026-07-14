import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import { notifyAgentBonus } from "../_shared/notifyAgentBonus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Instant leg of the UGX 5,000 listing reward. Paid the moment the agent
// lists a house. The remaining UGX 4,000 is paid by `credit-listing-bonus`
// when Landlord Ops verifies the house.
const LISTED_BONUS = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity (the listing agent)
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
    const { listing_id } = body;
    if (!listing_id || typeof listing_id !== "string") {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Treasury guard: credits agent wallet — block when paused
    const guardBlock = await checkTreasuryGuard(adminClient, "credit", authHeader);
    if (guardBlock) return guardBlock;

    // Load the listing
    const { data: listing, error: listingErr } = await adminClient
      .from("house_listings")
      .select("id, agent_id, title, listed_bonus_paid")
      .eq("id", listing_id)
      .single();

    if (listingErr || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: only pay once per listing
    if (listing.listed_bonus_paid) {
      return new Response(JSON.stringify({ success: true, already_paid: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agentId = listing.agent_id;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "No agent linked to this listing" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only the listing agent can trigger their own instant bonus
    if (agentId !== user.id) {
      return new Response(JSON.stringify({ error: "Only the listing agent can claim this bonus" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    // ─── Rejection-charge recovery rule ───
    // If this agent still has an UNCOVERED listing-rejection charge (a UGX 2,000
    // debit that landed while their wallet had nothing to debit), the listing
    // bonus must first go toward clearing that gap — the agent does NOT receive
    // it until the charge is fully covered. Any remainder above the outstanding
    // gap is paid to the agent as normal.
    let deficit = 0;
    try {
      const { data: deficitData, error: deficitErr } = await adminClient.rpc(
        "get_agent_listing_rejection_deficit",
        { p_agent_id: agentId },
      );
      if (deficitErr) {
        console.error("[credit-house-listed-bonus] deficit lookup failed:", deficitErr.message);
      } else {
        deficit = Math.max(0, Number(deficitData ?? 0));
      }
    } catch (e) {
      console.error("[credit-house-listed-bonus] deficit lookup threw:", e);
    }

    const offsetAmount = Math.min(deficit, LISTED_BONUS); // goes to clear the charge
    const payableAmount = LISTED_BONUS - offsetAmount;    // paid to the agent

    // Build the balanced double-entry. Both legs route to the agent's
    // WITHDRAWABLE bucket so the offset portion nets directly against the
    // outstanding rejection penalty (which also sits in withdrawable).
    const entries: Record<string, unknown>[] = [];

    if (offsetAmount > 0) {
      entries.push(
        {
          user_id: agentId,
          amount: offsetAmount,
          direction: "cash_in",
          category: "listing_rejection_offset",
          ledger_scope: "wallet",
          wallet_bucket: "withdrawable",
          recipient_type: "user",
          source_table: "house_listings",
          source_id: listing_id,
          description: `UGX ${offsetAmount.toLocaleString()} listing reward applied to outstanding rejection charge — ${listing.title || "house"}`,
          currency: "UGX",
          transaction_date: now,
        },
        {
          amount: offsetAmount,
          direction: "cash_out",
          category: "marketing_expense",
          ledger_scope: "platform",
          source_table: "house_listings",
          source_id: listing_id,
          description: `Platform expense: listing reward covering rejection charge — ${listing.title || "house"}`,
          currency: "UGX",
          transaction_date: now,
        },
      );
    }

    if (payableAmount > 0) {
      entries.push(
        {
          user_id: agentId,
          amount: payableAmount,
          direction: "cash_in",
          category: "agent_commission",
          ledger_scope: "wallet",
          recipient_type: "user",
          source_table: "house_listings",
          source_id: listing_id,
          description: `UGX ${payableAmount.toLocaleString()} instant house-listed reward — ${listing.title || "house"}`,
          currency: "UGX",
          transaction_date: now,
        },
        {
          amount: payableAmount,
          direction: "cash_out",
          category: "marketing_expense",
          ledger_scope: "platform",
          source_table: "house_listings",
          source_id: listing_id,
          description: `Platform expense: instant house-listed reward — ${listing.title || "house"}`,
          currency: "UGX",
          transaction_date: now,
        },
      );
    }

    const { error: ledgerErr } = await adminClient.rpc("create_ledger_transaction", {
      entries,
    });

    if (ledgerErr) {
      console.error("[credit-house-listed-bonus] Ledger write failed:", ledgerErr.message);
      return new Response(JSON.stringify({ error: "Failed to credit listing reward" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark paid only after money has moved (idempotency anchor)
    const { error: flagErr } = await adminClient
      .from("house_listings")
      .update({ listed_bonus_paid: true, listed_bonus_paid_at: now })
      .eq("id", listing_id)
      .eq("listed_bonus_paid", false);

    if (flagErr) {
      console.error("[credit-house-listed-bonus] Flag update failed (money already moved):", flagErr.message);
    }

    console.log(
      `[credit-house-listed-bonus] listing ${listing_id}: offset=${offsetAmount} payable=${payableAmount} (deficit was ${deficit}) for ${agentId}`,
    );

    if (offsetAmount > 0) {
      // Part or all of the reward covered an outstanding rejection charge.
      // Send a clear in-app notice instead of the celebratory bonus message.
      const remainingGap = Math.max(0, deficit - offsetAmount);
      const msg = payableAmount > 0
        ? `UGX ${offsetAmount.toLocaleString()} of your listing reward cleared your rejection charge; UGX ${payableAmount.toLocaleString()} was added to your wallet.`
        : `Your UGX ${offsetAmount.toLocaleString()} listing reward was applied to your outstanding rejection charge.` +
          (remainingGap > 0 ? ` UGX ${remainingGap.toLocaleString()} still to clear.` : ` Your charge is now fully cleared.`);
      try {
        await adminClient.from("notifications").insert({
          user_id: agentId,
          title: "🏠 Listing reward applied to charge",
          message: msg,
          type: remainingGap > 0 ? "warning" : "success",
          metadata: {
            action: "listing_reward_offset",
            listing_id,
            offset: offsetAmount,
            paid: payableAmount,
            remaining_gap: remainingGap,
          },
        });
      } catch (e) {
        console.error("[credit-house-listed-bonus] offset notify failed:", e);
      }
    } else {
      // No outstanding charge — normal celebratory bonus notice (in-app + SMS).
      try {
        await notifyAgentBonus(adminClient, {
          agentId,
          stage: "listed",
          listingTitle: listing.title,
          listingId: listing_id,
        });
      } catch (e) {
        console.error("[credit-house-listed-bonus] notify failed:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      bonus: payableAmount,
      offset_to_charge: offsetAmount,
      remaining_gap: Math.max(0, deficit - offsetAmount),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[credit-house-listed-bonus] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});