import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LISTING_BONUS = 5000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[credit-listing-bonus] Function invoked");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") || "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !caller) {
      console.error("[credit-listing-bonus] Auth failed:", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const managerId = caller.id;
    console.log("[credit-listing-bonus] Caller:", managerId);

    const body = await req.json();
    const { listing_id, notes } = body;
    console.log("[credit-listing-bonus] listing_id:", listing_id);

    if (!listing_id || typeof listing_id !== "string") {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ─── ROLE CHECK FIRST (before any treasury / business logic) ───
    // Accept either:
    //   1. base role in (manager, coo, super_admin, operations, employee, ceo, cfo), OR
    //   2. staff_permissions row with permitted_dashboard='landlord_ops'
    const [roleRes, permRes] = await Promise.all([
      adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", managerId)
        .in("role", ["manager", "coo", "super_admin", "operations", "employee", "ceo", "cfo"])
        .limit(1),
      adminClient
        .from("staff_permissions")
        .select("permitted_dashboard")
        .eq("user_id", managerId)
        .eq("permitted_dashboard", "landlord_ops")
        .limit(1),
    ]);

    console.log(
      "[credit-listing-bonus] Role rows:", JSON.stringify(roleRes.data),
      "Perm rows:", JSON.stringify(permRes.data),
      "RoleErr:", roleRes.error?.message, "PermErr:", permRes.error?.message,
    );

    const hasBaseRole = (roleRes.data?.length ?? 0) > 0;
    const hasLandlordOpsPerm = (permRes.data?.length ?? 0) > 0;

    if (!hasBaseRole && !hasLandlordOpsPerm) {
      return new Response(JSON.stringify({
        error: `Only internal staff can verify listings (user ${managerId} has no operations role or landlord_ops permission)`,
      }), {
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

    // Step 2: Create approval row marked PAID (Landlord Ops auto-self-approves on verification)
    const { data: approval, error: approvalErr } = await adminClient
      .from("listing_bonus_approvals")
      .insert({
        listing_id: listing_id,
        agent_id: agentId,
        amount: LISTING_BONUS,
        status: "paid",
        landlord_ops_approved_by: managerId,
        landlord_ops_approved_at: now,
        landlord_ops_notes: notes || `Verified by Landlord Ops`,
        cfo_approved_by: managerId,
        cfo_approved_at: now,
        cfo_notes: "Auto-approved on Landlord Ops verification",
        paid_at: now,
      })
      .select("id")
      .single();

    if (approvalErr) throw approvalErr;

    // Step 3: Post balanced ledger entries (same legs as approve-listing-bonus)
    const { data: txGroupId, error: ledgerErr } = await adminClient.rpc("create_ledger_transaction", {
      entries: [
        {
          user_id: agentId,
          amount: LISTING_BONUS,
          direction: "cash_in",
          category: "agent_commission_earned",
          ledger_scope: "wallet",
          source_table: "listing_bonus_approvals",
          source_id: approval?.id,
          description: `UGX ${LISTING_BONUS.toLocaleString()} house listing bonus — auto-paid on verification`,
          currency: "UGX",
          transaction_date: now,
        },
        {
          direction: "cash_out",
          amount: LISTING_BONUS,
          category: "agent_commission_earned",
          ledger_scope: "platform",
          source_table: "listing_bonus_approvals",
          source_id: approval?.id,
          description: "Platform expense: agent listing bonus (auto-paid on Landlord Ops verification)",
          currency: "UGX",
          transaction_date: now,
        },
      ],
    });

    if (ledgerErr) {
      console.error("[credit-listing-bonus] Ledger write failed:", ledgerErr.message);
      throw new Error(`Ledger credit failed: ${ledgerErr.message}`);
    }

    // Step 4: Mark listing as bonus paid
    await adminClient
      .from("house_listings")
      .update({ listing_bonus_paid: true, listing_bonus_paid_at: now })
      .eq("id", listing_id);

    // Step 5: Record in agent_earnings
    await adminClient.from("agent_earnings").insert({
      agent_id: agentId,
      amount: LISTING_BONUS,
      earning_type: "listing_bonus",
      source_user_id: managerId,
      description: "House listing bonus (auto-paid on Landlord Ops verification)",
      currency: "UGX",
    });

    // Step 6: Credit event bonus to commission accrual ledger (best-effort)
    adminClient.rpc("credit_agent_event_bonus", {
      p_agent_id: agentId,
      p_tenant_id: null,
      p_event_type: "house_listed",
      p_source_id: approval?.id,
    }).then(({ error: bonusErr }: any) => {
      if (bonusErr) console.error("[credit-listing-bonus] Event bonus ledger error:", bonusErr.message);
    });

    // Step 7: Notify agent — bonus already in wallet
    await adminClient.from("notifications").insert({
      user_id: agentId,
      title: "Listing Verified — UGX 5,000 Credited! 💰",
      message: `Your listing "${listing.title}" has been verified. UGX ${LISTING_BONUS.toLocaleString()} has been credited to your commission wallet.`,
      type: "earning",
      metadata: {
        listing_id,
        bonus_amount: LISTING_BONUS,
        approval_id: approval?.id,
        tx_group_id: txGroupId,
      },
    });

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: managerId,
      action_type: "listing_bonus_auto_paid",
      table_name: "listing_bonus_approvals",
      record_id: approval?.id || listing_id,
      metadata: {
        agent_id: agentId,
        bonus_amount: LISTING_BONUS,
        listing_title: listing.title,
        tx_group_id: txGroupId,
        reason: "Landlord Ops verified listing — UGX 5,000 auto-credited to agent commission wallet",
      },
    });

    console.log(`[credit-listing-bonus] Listing ${listing.title} verified — UGX ${LISTING_BONUS} auto-credited to agent ${agentId}`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "🏡 Listing Bonus Auto-Paid", body: `UGX ${LISTING_BONUS.toLocaleString()} credited to agent`, url: "/dashboard/manager" }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      success: true,
      message: "Listing verified — UGX 5,000 credited to agent commission wallet",
      approval_id: approval?.id,
      bonus: LISTING_BONUS,
      agent_id: agentId,
      listing_title: listing.title,
      auto_paid: true,
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
