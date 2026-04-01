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

    const authHeader = req.headers.get("authorization") || "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const managerId = caller.id;

    const body = await req.json();
    const { listing_id, notes } = body;

    if (!listing_id || typeof listing_id !== "string") {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify Landlord Ops / manager role
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", managerId)
      .in("role", ["manager", "coo", "super_admin", "operations", "employee"])
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Only internal staff can verify listings" }), {
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

    // Check if approval already exists
    const { data: existingApproval } = await adminClient
      .from("listing_bonus_approvals")
      .select("id, status")
      .eq("listing_id", listing_id)
      .maybeSingle();

    if (existingApproval) {
      return new Response(JSON.stringify({
        message: `Bonus approval already ${existingApproval.status}`,
        approval_id: existingApproval.id,
        status: existingApproval.status,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    // Step 1: Verify the listing (mark as verified)
    await adminClient
      .from("house_listings")
      .update({
        verified: true,
        verified_at: now,
        verified_by: managerId,
      })
      .eq("id", listing_id);

    // Also verify landlord if present
    if (listing.landlord_id) {
      await adminClient
        .from("landlords")
        .update({ verified: true, verified_at: now, verified_by: managerId })
        .eq("id", listing.landlord_id);
    }

    // Step 2: Create approval record (pending_cfo) — Landlord Ops approves, forwards to CFO
    const { data: approval, error: approvalErr } = await adminClient
      .from("listing_bonus_approvals")
      .insert({
        listing_id: listing_id,
        agent_id: agentId,
        amount: LISTING_BONUS,
        status: "pending_cfo",
        landlord_ops_approved_by: managerId,
        landlord_ops_approved_at: now,
        landlord_ops_notes: notes || `Verified by Landlord Ops`,
      })
      .select("id")
      .single();

    if (approvalErr) throw approvalErr;

    // Notify agent that bonus is pending CFO approval
    await adminClient.from("notifications").insert({
      user_id: agentId,
      title: "Listing Verified! 🏠",
      message: `Your listing "${listing.title}" has been verified! UGX ${LISTING_BONUS.toLocaleString()} bonus is pending CFO approval.`,
      type: "info",
      metadata: {
        listing_id,
        bonus_amount: LISTING_BONUS,
        approval_id: approval?.id,
      },
    });

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: managerId,
      action_type: "listing_verification_bonus_queued",
      table_name: "listing_bonus_approvals",
      record_id: approval?.id || listing_id,
      metadata: {
        agent_id: agentId,
        bonus_amount: LISTING_BONUS,
        listing_title: listing.title,
        reason: `Landlord Ops verified listing and queued UGX ${LISTING_BONUS} bonus for CFO approval`,
      },
    });

    console.log(`[credit-listing-bonus] Listing ${listing.title} verified, bonus queued for CFO approval`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "🏡 Listing Bonus", body: "Activity: listing bonus", url: "/manager" }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      success: true,
      message: "Listing verified — bonus forwarded to CFO for approval",
      approval_id: approval?.id,
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
