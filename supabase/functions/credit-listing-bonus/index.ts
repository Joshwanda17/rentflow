import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LISTING_BONUS = 5000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is authenticated manager
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const managerId = claimsData.claims.sub as string;

    const body = await req.json();
    const { listing_id } = body;

    if (!listing_id || typeof listing_id !== "string") {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify manager role
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", managerId)
      .in("role", ["manager", "coo"])
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Only managers can verify listings" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the listing
    const { data: listing, error: listingErr } = await adminClient
      .from("house_listings")
      .select("id, agent_id, title, listing_bonus_paid, verified, landlord_id")
      .eq("id", listing_id)
      .single();

    if (listingErr || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listing.listing_bonus_paid) {
      return new Response(JSON.stringify({ message: "Bonus already paid", already_paid: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agentId = listing.agent_id;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "No agent linked to this listing" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the listing and mark bonus as paid
    const now = new Date().toISOString();
    const { error: updateErr } = await adminClient
      .from("house_listings")
      .update({
        verified: true,
        verified_at: now,
        verified_by: managerId,
        listing_bonus_paid: true,
        listing_bonus_paid_at: now,
      })
      .eq("id", listing_id);

    if (updateErr) throw updateErr;

    // Also verify the linked landlord if present
    if (listing.landlord_id) {
      await adminClient
        .from("landlords")
        .update({ verified: true, verified_at: now, verified_by: managerId })
        .eq("id", listing.landlord_id);
    }

    // Credit agent wallet via ledger
    const { error: ledgerErr } = await adminClient.from("general_ledger").insert({
      user_id: agentId,
      amount: LISTING_BONUS,
      direction: "credit",
      category: "agent_bonus",
      source_table: "house_listings",
      source_id: listing_id,
      description: `UGX 5,000 house listing bonus: ${listing.title}`,
      ledger_scope: "wallet",
      transaction_date: now,
      transaction_group_id: crypto.randomUUID(),
    });

    if (ledgerErr) throw ledgerErr;

    // Record in agent_earnings for tracking
    await adminClient.from("agent_earnings").insert({
      agent_id: agentId,
      amount: LISTING_BONUS,
      earning_type: "listing_bonus",
      source_user_id: managerId,
      description: `House listing verified bonus: ${listing.title}`,
    });

    // Record wallet transaction for visibility
    await adminClient.from("wallet_transactions").insert({
      sender_id: agentId,
      recipient_id: agentId,
      amount: LISTING_BONUS,
      description: `House listing bonus: ${listing.title}`,
    });

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: managerId,
      action_type: "listing_verification_bonus",
      table_name: "house_listings",
      record_id: listing_id,
      metadata: {
        agent_id: agentId,
        bonus_amount: LISTING_BONUS,
        listing_title: listing.title,
        reason: `Manager verified house listing and credited UGX ${LISTING_BONUS} bonus to agent`,
      },
    });

    console.log(`[credit-listing-bonus] Credited UGX ${LISTING_BONUS} to agent ${agentId} for listing ${listing.title}`);

    return new Response(JSON.stringify({
      success: true,
      bonus: LISTING_BONUS,
      agent_id: agentId,
      listing_title: listing.title,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[credit-listing-bonus] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
