import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import {
  buildReturnsDisbursementRequest,
  dispatchTransactionalEmail,
} from "../_shared/partnership-emails.ts";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role (staff OR active cashout agent)
    const admin = createClient(supabaseUrl, serviceKey);

    // Treasury guard: block withdrawals when paused
    const guardBlock = await checkTreasuryGuard(admin, "debit", req.headers.get("Authorization"));
    if (guardBlock) return guardBlock;
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["super_admin", "manager", "cfo", "coo", "operations", "cto"];
    const hasStaffRole = (roles || []).some((r: any) => allowedRoles.includes(r.role));

    // Also check if caller is an active cashout agent
    let isCashoutAgent = false;
    if (!hasStaffRole) {
      const { data: agentRow } = await admin
        .from("cashout_agents")
        .select("id")
        .eq("agent_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      isCashoutAgent = !!agentRow;
    }

    if (!hasStaffRole && !isCashoutAgent) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { withdrawal_id, reference, payment_method } = body;

    if (!withdrawal_id || typeof withdrawal_id !== "string") {
      return new Response(JSON.stringify({ error: "withdrawal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reference || typeof reference !== "string" || reference.trim().length < 3) {
      return new Response(JSON.stringify({ error: "reference (TID/bank ref) must be at least 3 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment_method || typeof payment_method !== "string") {
      return new Response(JSON.stringify({ error: "payment_method is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch withdrawal request (fresh from DB — never trust cache)
    const { data: wr, error: wrErr } = await admin
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawal_id)
      .single();

    if (wrErr || !wr) {
      return new Response(JSON.stringify({ error: "Withdrawal request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only allow approval of pending/requested/manager_approved/rejected (re-approval)
    const approvableStatuses = ["pending", "requested", "manager_approved", "rejected"];
    if (!approvableStatuses.includes(wr.status)) {
      return new Response(JSON.stringify({ error: `Cannot approve: withdrawal is already '${wr.status}'` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Proxy payouts are requested by the agent and funded from the agent wallet.
    // Detection rules (any one is enough):
    //   1. The withdrawal carries a `linked_party` distinct from the submitter
    //      AND a "Proxy payout delivery for …" reason (the historical signal).
    //   2. The submitter is a registered proxy agent (has at least one
    //      active, approved row in `proxy_agent_assignments`) AND the reason
    //      still starts with "Proxy payout delivery for". This catches older
    //      proxy withdrawals that were created before `linked_party` was
    //      reliably populated — they should still drain partner float, not
    //      be blocked as personal withdrawals.
    const reasonLooksProxy =
      typeof wr.reason === "string" &&
      wr.reason.startsWith("Proxy payout delivery for");

    let isProxyAgent = false;
    if (reasonLooksProxy) {
      const { count: proxyCount } = await admin
        .from("proxy_agent_assignments")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", wr.user_id)
        .eq("is_active", true)
        .eq("approval_status", "approved");
      isProxyAgent = (proxyCount ?? 0) > 0;
    }

    const isProxyPayout =
      reasonLooksProxy &&
      ((wr.linked_party && wr.linked_party !== wr.user_id) || isProxyAgent);

    const fundingUserId = wr.user_id;
    const beneficiaryUserId =
      isProxyPayout && wr.linked_party && wr.linked_party !== wr.user_id
        ? wr.linked_party
        : wr.user_id;
    const amount = Number(wr.amount);

    console.log(
      `[approve-withdrawal] withdrawal ${withdrawal_id}: isProxyPayout=${isProxyPayout}, ` +
      `submitter=${wr.user_id}, debiting=${fundingUserId}, beneficiary=${beneficiaryUserId}, amount=${amount}`
    );

    // Trust the ledger: reconcile the funding wallet from general_ledger before
    // gating the withdrawal so CFO credits / corrections aren't blocked by stale
    // bucket columns.
    try {
      await admin.rpc("reconcile_wallet_from_ledger", { p_user_id: fundingUserId });
    } catch (reconErr) {
      console.error("[approve-withdrawal] reconcile_wallet_from_ledger failed:", (reconErr as Error).message);
    }

    const loadWallet = async () => {
      const { data } = await admin
        .from("wallets")
        .select("balance, withdrawable_balance, float_balance, advance_balance")
        .eq("user_id", fundingUserId)
        .maybeSingle();
      return data;
    };

    // 3-BUCKET WALLET MODEL: withdrawals can ONLY draw from withdrawable_balance.
    let wallet = await loadWallet();

    // Reverse any pre-existing 'withdrawal_pending' holds for this request before re-checking.
    const { data: pendingHolds } = await admin
      .from("general_ledger")
      .select("id, amount")
      .eq("source_table", "withdrawal_requests")
      .eq("source_id", withdrawal_id)
      .eq("category", "withdrawal_pending")
      .eq("direction", "cash_out");

    const totalPendingHold = (pendingHolds || []).reduce((sum: number, h: any) => sum + Number(h.amount), 0);

    if (pendingHolds && pendingHolds.length > 0) {
      for (const hold of pendingHolds) {
        await admin.from("general_ledger").delete().eq("id", hold.id);
      }

      try {
        await admin.rpc("reconcile_wallet_from_ledger", { p_user_id: fundingUserId });
      } catch (reconErr) {
        console.error(
          "[approve-withdrawal] reconcile_wallet_from_ledger failed after releasing pending holds:",
          (reconErr as Error).message,
        );
      }

      wallet = await loadWallet();
    }

    const walletBalance = Number(wallet?.balance ?? 0);
    const walletWithdrawable = Number((wallet as any)?.withdrawable_balance ?? 0);
    const walletFloat = Number((wallet as any)?.float_balance ?? 0);
    const walletAdvance = Number((wallet as any)?.advance_balance ?? 0);

    // Normal withdrawals can ONLY draw from withdrawable_balance.
    // Proxy partner delivery is different: the partner owns the credited
    // liability, but the assigned agent physically delivers it, so it may
    // draw only from that partner-linked float — never from generic float.
    const withdrawable = walletWithdrawable;
    const cachedSpendable = isProxyPayout ? walletFloat : withdrawable;
    let partnerLinkedFloatAvailable = 0;

    // STRICT LEDGER-BACKED GATE.
    // Compute the posting-time cap directly from general_ledger, excluding
    // this withdrawal request from holds. Do NOT add the request amount back
    // to the RPC result blindly: when cached float exists but withdrawable is
    // zero, that turns a true UGX 0 into a false approval and the ledger RPC
    // correctly rejects it later as a 500.
    let ledgerAvailable = 0;
    try {
      const sumLedgerRows = (rows: any[] = []) => rows.reduce((acc: number, r: any) => {
        const amt = Number(r.amount) || 0;
        if (r.direction === "cash_in" || r.direction === "credit") return acc + amt;
        if (r.direction === "cash_out" || r.direction === "debit") return acc - amt;
        return acc;
      }, 0);

      if (isProxyPayout && wr.linked_party && wr.linked_party !== wr.user_id) {
        const { data: linkedRows, error: linkedErr } = await admin
          .from("general_ledger")
          .select("amount, direction, category, account")
          .eq("user_id", fundingUserId)
          .eq("ledger_scope", "wallet")
          .eq("linked_party", wr.linked_party)
          .or("classification.is.null,classification.eq.production");
        if (linkedErr) throw linkedErr;

        const partnerLinkedNet = sumLedgerRows(linkedRows || []);
        const isFloatLinkedRow = (row: any) =>
          row?.account === "float" ||
          [
            "agent_float_deposit",
            "agent_float_assignment",
            "agent_float_topup",
            "agent_float_funding",
            "agent_float_used_for_rent",
            "agent_float_used",
            "agent_float_settlement",
            "agent_landlord_payout",
            "rent_disbursement",
            "rent_float_funding",
          ].includes(row?.category);
        partnerLinkedFloatAvailable = Math.max(0, sumLedgerRows((linkedRows || []).filter(isFloatLinkedRow)));
        const { data: partnerPendingRows, error: partnerPendingErr } = await admin
          .from("withdrawal_requests")
          .select("amount")
          .eq("user_id", fundingUserId)
          .eq("linked_party", wr.linked_party)
          .neq("id", withdrawal_id)
          .in("status", ["pending", "requested", "manager_approved", "processing"]);
        if (partnerPendingErr) throw partnerPendingErr;

        const partnerPendingHolds = (partnerPendingRows || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0,
        );

        // For proxy payouts, the partner-linked ledger is the authoritative
        // earmark — every credit/debit tagged with this partner's id sums to
        // the float Welile owes the partner. The cached `float_balance`
        // bucket can drift below this figure (cache lag, missed sync, manual
        // corrections), but that drift must NOT block a delivery the ledger
        // explicitly earmarked. Gate on the ledger figure alone.
        //
        // HOWEVER: physical cash delivery cannot exceed the cash the agent
        // actually holds. The partner may be "owed" UGX 390k on paper, but
        // if the agent's overall wallet only carries UGX 280k of real
        // cash, debiting 390k drives wallet.balance negative and trips
        // `wallets_balance_check`.
        //
        // The cap MUST be the TOTAL cash held by the agent
        // (`wallet.balance`), NOT `min(balance, float_balance)`. Partner-
        // linked ROI credits land in the **withdrawable** bucket (account=
        // 'withdrawable'), so float_balance is often 0 even when the
        // partner is fully funded. Using min() against float zeroed out
        // legitimate withdrawable-funded proxy payouts. The partner-
        // linked ledger already enforces the per-partner earmark.
        //
        // IMPORTANT: do NOT cap by the agent's `wallet.balance`. Proxy
        // partner money is ROI / Nearing-Payouts funds that live on the
        // PARTNER's ledger, not the agent's wallet. The agent is only the
        // delivery channel — their `wallet.balance` is routinely 0 even
        // when the partner is fully funded, so a physical-cash cap would
        // (and did) wrongly reject every legitimate proxy payout.
        ledgerAvailable = Math.max(
          0,
          Math.max(0, partnerLinkedNet) - partnerPendingHolds,
        );
      } else if (isProxyPayout) {
        // Proxy agent without a linked_party on the withdrawal row: gate
        // against the agent's overall wallet ledger and allow draining
        // EITHER float OR withdrawable (since this IS a proxy delivery —
        // partner identity is recorded in the reason text, not the
        // linked_party column, and partner-linked credits routinely land
        // in the withdrawable bucket).
        const { data: ledgerRows, error: ledgerErr } = await admin
          .from("general_ledger")
          .select("amount, direction")
          .eq("user_id", fundingUserId)
          .eq("ledger_scope", "wallet")
          .or("classification.is.null,classification.eq.production");
        if (ledgerErr) throw ledgerErr;

        const ledgerNet = sumLedgerRows(ledgerRows || []);

        const { data: pendingRows, error: pendingErr } = await admin
          .from("withdrawal_requests")
          .select("amount")
          .eq("user_id", fundingUserId)
          .neq("id", withdrawal_id)
          .in("status", ["pending", "requested", "manager_approved", "processing"]);
        if (pendingErr) throw pendingErr;

        const otherPendingHolds = (pendingRows || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0,
        );

        // Do NOT cap by `wallet.balance`. Proxy payouts deliver ROI /
        // Nearing-Payouts funds that live on the partner's ledger; the
        // agent's wallet cache routinely shows 0 even when the partner
        // is fully funded. Trust the ledger net.
        ledgerAvailable = Math.max(
          0,
          Math.max(0, ledgerNet) - otherPendingHolds,
        );
        // Allow the float-first debit path to also dip into withdrawable.
        partnerLinkedFloatAvailable = ledgerAvailable;
      } else {
        // Standard (non-proxy) payouts: defer to the strict RPC so that the
        // fresh-start anchor, admin-correction handling, and pending-hold
        // logic stay in lockstep with what the wallet UI shows. Doing a raw
        // ledger sum here re-introduces drift (e.g. an anchored agent whose
        // pre-anchor net is negative will read 0 even though the strict RPC
        // — and the wallet card — correctly show withdrawable > 0).
        // First, lift the cached `wallets.withdrawable_balance` up to the
        // strict ledger figure so that the MIN(cache, ledger) gate inside
        // `get_user_available_balance` is no longer artificially clamped by
        // a stale cache (e.g. wallet-transfer credits that landed in the
        // ledger but never updated the cache). This NEVER inflates beyond
        // ledger truth — it only lifts cache up to what the ledger proves.
        try {
          const { error: liftErr } = await admin.rpc(
            "lift_withdrawable_to_ledger",
            { p_user_id: fundingUserId },
          );
          if (liftErr) {
            console.warn(
              "[approve-withdrawal] lift_withdrawable_to_ledger failed (non-fatal):",
              liftErr.message,
            );
          }
        } catch (liftEx) {
          console.warn(
            "[approve-withdrawal] lift_withdrawable_to_ledger threw (non-fatal):",
            (liftEx as Error).message,
          );
        }
        const { data: rpcVal, error: rpcErr } = await admin.rpc(
          "get_user_available_balance",
          { p_user_id: fundingUserId },
        );
        if (rpcErr) throw rpcErr;
        // The strict RPC subtracts pending_holds which INCLUDES this
        // withdrawal (status='pending'/'requested'/etc.), so add the
        // request amount back to get the pre-hold available figure used
        // for the `< amount` comparison below.
        ledgerAvailable = Math.max(0, Number(rpcVal ?? 0) + Number(wr.amount || 0));
      }
    } catch (e) {
      console.warn(
        "[approve-withdrawal] inline ledger compute failed; falling back to strict RPC",
        (e as Error).message,
      );
      try {
        const { data: rpcVal, error: rpcErr } = await admin.rpc(
          "get_user_available_balance",
          { p_user_id: fundingUserId },
        );
        if (rpcErr) throw rpcErr;
        ledgerAvailable = Math.min(cachedSpendable, Number(rpcVal ?? 0));
      } catch (e2) {
        console.warn(
          "[approve-withdrawal] fallback strict RPC failed; failing closed",
          (e2 as Error).message,
        );
        ledgerAvailable = 0;
      }
    }

    // For partner-linked proxy payouts, the partner-linked ledger is the
    // authoritative figure (see ledgerAvailable computation above). The cached
    // float bucket can lag — never let it veto a ledger-earmarked delivery.
    //
    // For NORMAL (non-proxy) payouts the `wallets` table is now a read-only
    // view derived from the ledger (`v_user_wallet_strict`), so the legacy
    // `cachedSpendable` figure is just another rendering of the same ledger
    // and CANNOT be more authoritative. We therefore trust the ledger figure
    // directly. This is what unblocks "approve full balance": when the ledger
    // proves UGX X is available, the cache can no longer veto it.
    const isPartnerLinkedProxy =
      isProxyPayout && wr.linked_party && wr.linked_party !== wr.user_id;
    const totalSpendable = isPartnerLinkedProxy || !isProxyPayout
      ? ledgerAvailable
      : Math.min(cachedSpendable, ledgerAvailable);
    const effectiveBalance = totalSpendable;

    const auditFailedWithdrawalAttempt = async (failureReason: string, code: string, actualAvailable = totalSpendable) => {
      try {
        await admin.from("audit_logs").insert({
          user_id: user.id,
          action_type: "withdrawal_validation_failed",
          table_name: "withdrawal_requests",
          record_id: withdrawal_id,
          reason: failureReason.slice(0, 500),
          metadata: {
            code,
            entered_amount: amount,
            actual_ledger_balance: Math.round(actualAvailable),
            ledger_available: Math.round(ledgerAvailable),
            cached_available: Math.round(cachedSpendable),
            wallet_total: Math.round(walletBalance),
            funding_user_id: fundingUserId,
            beneficiary_user_id: beneficiaryUserId,
            is_proxy_payout: isProxyPayout,
            failed_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.error("[approve-withdrawal] failed to audit validation failure:", auditErr);
      }
    };

    if (!wallet || totalSpendable < amount) {
      const failureReason = isProxyPayout
        ? `Insufficient proxy partner balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. This payout can only use funds linked to the selected partner.`
        : `Insufficient withdrawable balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. Cached withdrawable UGX ${Math.round(cachedSpendable).toLocaleString()}, ledger-true UGX ${Math.round(ledgerAvailable).toLocaleString()}. Float and advance buckets cannot fund payouts.`;
      await auditFailedWithdrawalAttempt(failureReason, "INSUFFICIENT_WITHDRAWABLE");
      return new Response(
        JSON.stringify({
          success: false,
          error: failureReason,
          code: "INSUFFICIENT_WITHDRAWABLE",
          available: Math.round(totalSpendable),
          ledger_available: Math.round(ledgerAvailable),
          cached_available: Math.round(cachedSpendable),
          wallet_total: Math.round(walletBalance),
          requested: amount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get beneficiary profile for audit / notifications
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", beneficiaryUserId)
      .single();
    const targetName = profile?.full_name || "Unknown";

    // Create balanced ledger entries via RPC.
    //
    // BUCKET ROUTING: normal external withdrawals drain withdrawable. Verified
    // proxy partner deliveries drain the bucket where the partner-linked cash
    // actually sits (float first, then withdrawable) while keeping every debit
    // tagged to the beneficiary partner for earmark accounting.
    const refUpper = reference.trim().toUpperCase();
    const baseDesc = `${payment_method} ref: ${refUpper}`;
    const nowIso = new Date().toISOString();

    const proxyFloatPortion = isProxyPayout
      ? Math.min(amount, Math.max(0, walletFloat), partnerLinkedFloatAvailable)
      : 0;
    const proxyWithdrawablePortion = isProxyPayout ? amount - proxyFloatPortion : 0;
    const withdrawablePortion = isProxyPayout ? proxyWithdrawablePortion : amount;
    const floatPortion = proxyFloatPortion;

    const debitEntries: any[] = [];
    if (withdrawablePortion > 0) {
      debitEntries.push({
        user_id: fundingUserId,
        amount: withdrawablePortion,
        direction: "cash_out",
        category: "wallet_withdrawal",
        ledger_scope: "wallet",
        description: isProxyPayout
          ? `Proxy partner payout from withdrawable – ${baseDesc}`
          : `Wallet withdrawal approved – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
        linked_party: isProxyPayout ? (wr.linked_party || beneficiaryUserId) : user.id,
      });
    }
    if (floatPortion > 0) {
      debitEntries.push({
        user_id: fundingUserId,
        amount: floatPortion,
        direction: "cash_out",
        category: "agent_float_used_for_rent",
        ledger_scope: "wallet",
        description: `Proxy partner payout from float – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
        linked_party: wr.linked_party || beneficiaryUserId,
      });
    }

    const idempotencyKey = `approve-withdrawal-${withdrawal_id}`;
    // ── Pivot guard: block if wallet cache disagrees with ledger-derived pivot ──
    {
      const { data: pivotCheck, error: pivotErr } = await admin.rpc(
        "validate_wallet_against_pivot",
        { p_user_id: fundingUserId },
      );
      if (pivotErr) {
        console.error("[approve-withdrawal] pivot validate failed", pivotErr);
      } else if (pivotCheck && (pivotCheck as { ok?: boolean }).ok === false) {
        console.warn("[approve-withdrawal] pivot mismatch — attempting self-heal", pivotCheck);
        await admin.rpc("reconcile_wallet_from_pivot", { p_user_id: fundingUserId });
        const { data: recheck } = await admin.rpc(
          "validate_wallet_against_pivot",
          { p_user_id: fundingUserId },
        );
        if (recheck && (recheck as { ok?: boolean }).ok === false) {
          console.error("[approve-withdrawal] BALANCE_MISMATCH after self-heal", recheck);
          await auditFailedWithdrawalAttempt(
            "Wallet/pivot drift exceeds threshold after self-heal; withdrawal blocked.",
            "BALANCE_MISMATCH",
          );
          return new Response(
            JSON.stringify({ error: "BALANCE_MISMATCH", detail: recheck }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    const { data: txnGroupId, error: ledgerErr } = await admin.rpc("create_ledger_transaction", {
      entries: [
        ...debitEntries,
        {
          direction: "cash_in",
          amount,
          category: "wallet_withdrawal",
          ledger_scope: "platform",
          description: `Platform records withdrawal payout – ${baseDesc}`,
          currency: "UGX",
          source_table: "withdrawal_requests",
          source_id: withdrawal_id,
          transaction_date: nowIso,
        },
      ],
      idempotency_key: idempotencyKey,
      // We've already gated the withdrawal on the strict ledger figure above
      // (`get_user_available_balance` for normal payouts; partner-linked
      // ledger for proxy delivery). The generic guard inside
      // `create_ledger_transaction` re-applies a `MIN(cached, ledger)` cap
      // that errors out when the cached `wallets.withdrawable_balance` lags
      // the ledger — which is now the common case because `wallets` is a
      // ledger-derived VIEW rather than an authoritative cache. Skip that
      // duplicate check; the strict gate above is the source of truth.
      skip_balance_check: true,
    });

    if (ledgerErr) {
      console.error("[approve-withdrawal] Ledger RPC error:", ledgerErr);
      const ledgerMessage = ledgerErr.message || "unknown";
      const isInsufficientBalance =
        ledgerMessage.includes("wallets_buckets_nonneg") ||
        ledgerMessage.includes("wallets_balance_check") ||
        ledgerMessage.includes("violates check constraint") ||
        ledgerMessage.includes("Insufficient ledger balance");
      const failureReason = isInsufficientBalance
        ? isProxyPayout
          ? `Insufficient proxy partner balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. This payout can only use funds linked to the selected partner.`
          : `Insufficient withdrawable balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. Cached withdrawable UGX ${Math.round(cachedSpendable).toLocaleString()}, ledger-true UGX ${Math.round(ledgerAvailable).toLocaleString()}. Float and advance buckets cannot fund payouts.`
        : "Failed to record ledger entry: " + ledgerMessage;
      if (isInsufficientBalance) {
        await auditFailedWithdrawalAttempt(failureReason, "INSUFFICIENT_WITHDRAWABLE");
      }
      return new Response(JSON.stringify({
        success: false,
        error: failureReason,
        code: isInsufficientBalance ? "INSUFFICIENT_WITHDRAWABLE" : "LEDGER_WRITE_FAILED",
        available: Math.round(totalSpendable),
        ledger_available: Math.round(ledgerAvailable),
        cached_available: Math.round(cachedSpendable),
        wallet_total: Math.round(walletBalance),
        requested: amount,
      }), {
        status: isInsufficientBalance ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update withdrawal request status
    const { error: updateErr } = await admin
      .from("withdrawal_requests")
      .update({
        status: "approved",
        fin_ops_reference: reference.trim().toUpperCase(),
        fin_ops_payment_method: payment_method,
        fin_ops_approved_at: new Date().toISOString(),
        fin_ops_approved_by: user.id,
        fin_ops_verified_by: user.id,
        fin_ops_verified_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", withdrawal_id);

    if (updateErr) {
      console.error("[approve-withdrawal] Update error:", updateErr);
      // Ledger entry already exists — log but don't fail the user
    }

    // ── Read-after-write settlement wait ─────────────────────────────────
    // Wallet bucket triggers fire inside the same txn as the ledger RPC, but
    // downstream readers (UI snapshots, CFO diagnostics, this very response)
    // can race the commit and observe the pre-debit cache. Poll the strict
    // gate until it reflects the deduction (or a 1.5s budget elapses).
    let settledAvailable: number | null = null;
    {
      const expectedMax = Math.max(0, Math.round(effectiveBalance - amount));
      const deadline = Date.now() + 1500;
      let attempt = 0;
      while (Date.now() < deadline) {
        attempt++;
        const { data: avail, error: availErr } = await admin.rpc(
          "get_user_available_balance",
          { p_user_id: fundingUserId },
        );
        if (!availErr) {
          const n = Number(avail ?? 0);
          if (n <= expectedMax) {
            settledAvailable = n;
            console.log(`[approve-withdrawal] settled after ${attempt} poll(s): ${n} <= ${expectedMax}`);
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (settledAvailable === null) {
        console.warn(
          `[approve-withdrawal] settlement wait exhausted; cache may be transitional for ${fundingUserId}`,
        );
      }
    }

    // ── Payroll Growth Bonus: stop growth on withdrawn money ─────────────
    // Consume FIFO from any active payroll-growth tracker rows so the daily
    // 0.5% bonus only continues to accrue on what's still parked in the wallet.
    try {
      const { data: consumed, error: consumeErr } = await admin.rpc(
        "consume_payroll_growth",
        { _user_id: fundingUserId, _amount: amount },
      );
      if (consumeErr) {
        console.error("[approve-withdrawal] consume_payroll_growth error:", consumeErr.message);
      } else if (Number(consumed ?? 0) > 0) {
        console.log(`[approve-withdrawal] payroll growth consumed: UGX ${consumed} for ${fundingUserId}`);
      }
    } catch (e) {
      console.error("[approve-withdrawal] payroll growth consume threw:", e);
    }

    // Audit log
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action_type: "withdrawal_approved_ledger",
      record_id: withdrawal_id,
      table_name: "withdrawal_requests",
      metadata: {
        amount,
        target_user: beneficiaryUserId,
        target_user_name: targetName,
        reference: reference.trim().toUpperCase(),
        payment_method,
        txn_group_id: txnGroupId,
        previous_balance: effectiveBalance,
        new_balance: effectiveBalance - amount,
        pending_hold_released: totalPendingHold,
      },
    });

    // Cashout agent 1% commission (only when caller is a non-staff cashout agent)
    let cashoutCommission = 0;
    if (isCashoutAgent && !hasStaffRole) {
      cashoutCommission = Math.round(amount * 0.01);
      if (cashoutCommission > 0) {
        try {
          const txDate = new Date().toISOString();
          const { error: commErr } = await admin.rpc("create_ledger_transaction", {
            entries: [
              {
                user_id: user.id, ledger_scope: "platform", direction: "cash_out",
                amount: cashoutCommission, category: "agent_commission_earned",
                source_table: "withdrawal_requests", source_id: withdrawal_id,
                description: `Cashout payout commission expense (1%) for withdrawal ${withdrawal_id}`,
                currency: "UGX", reference_id: `${withdrawal_id}-cashout-commission`, transaction_date: txDate,
              },
              {
                user_id: user.id, ledger_scope: "wallet", direction: "cash_in",
                amount: cashoutCommission, category: "agent_commission_earned",
                source_table: "withdrawal_requests", source_id: withdrawal_id,
                description: `Cashout payout commission (1%) for withdrawal ${withdrawal_id}`,
                currency: "UGX", reference_id: `${withdrawal_id}-cashout-commission`, transaction_date: txDate,
              },
            ],
          });
          if (commErr) {
            console.error("[approve-withdrawal] Cashout commission RPC error:", commErr);
            cashoutCommission = 0;
          }
        } catch (e) {
          console.error("[approve-withdrawal] Cashout commission exception:", e);
          cashoutCommission = 0;
        }
      }
    }

    const notifyUserIds = [...new Set([fundingUserId, beneficiaryUserId].filter((value): value is string => Boolean(value)))];

    // Notify user (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: notifyUserIds,
        payload: {
          title: "✅ Withdrawal Approved",
          body: `UGX ${amount.toLocaleString()} has been sent to you via ${payment_method}`,
          url: "/dashboard/agent",
          type: "success",
        },
      }),
    }).catch(() => {});

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        title: "✅ Withdrawal Approved",
        body: `${targetName} – UGX ${amount.toLocaleString()} via ${payment_method}`,
        url: "/dashboard/manager",
      }),
    }).catch(() => {});

    // ── Returns Disbursement Confirmation email ───────────────────────────
    // Sent ONLY now (after the merchant agent has actually confirmed payment
    // and the ledger has been written) so partners are never told their
    // returns were disbursed for a release/rejected/unconfirmed payout.
    try {
      // Beneficiary partner = wr.linked_party for proxy payouts, else self.
      const partnerId = beneficiaryUserId;
      const { data: partnerProfile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", partnerId)
        .maybeSingle();

      if (partnerProfile?.email) {
       sendReturnsEmail: {
        let agentName: string | undefined;
        let agentEmail: string | undefined;
        if (isProxyPayout && fundingUserId !== partnerId) {
          const { data: agentProfile } = await admin
            .from("profiles")
            .select("full_name, email")
            .eq("id", fundingUserId)
            .maybeSingle();
          agentName = agentProfile?.full_name || undefined;
          agentEmail = agentProfile?.email || undefined;
        }

        const { data: portfolio } = await admin
          .from("investor_portfolios")
         .select("portfolio_code, roi_percentage, investment_amount")
          .eq("investor_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // ── Returns-source guard ──────────────────────────────────────────
        // The "Returns Disbursement Confirmation" template must ONLY be sent
        // when this withdrawal is actually backed by Supporter returns/ROI
        // credits. A plain wallet/commission/float cashout — even from a
        // user who happens to have an `investor_portfolios` row — must NOT
        // receive this email (incident: tcollines004@gmail.com, 2026-05-08).
        //
        // Discriminator: beneficiary must have (a) an investor portfolio
        // AND (b) at least one ROI credit leg in the general_ledger
        // (`roi_payout` or `roi_wallet_credit`). This holds for both
        // self-withdrawals by partners and proxy-agent withdrawals on
        // behalf of a partner, because `partnerId === beneficiaryUserId`
        // in either case.
        if (!portfolio?.portfolio_code) {
          console.log(
            `[approve-withdrawal] Skipping returns-disbursement email: beneficiary ${partnerId} has no investor portfolio`,
          );
          break sendReturnsEmail;
        }
        const { count: roiLegCount, error: roiLegErr } = await admin
          .from("general_ledger")
          .select("id", { count: "exact", head: true })
          .eq("user_id", partnerId)
          .in("category", ["roi_payout", "roi_wallet_credit"]);
        if (roiLegErr) {
          console.warn(
            "[approve-withdrawal] Could not verify ROI ledger source; suppressing returns email:",
            roiLegErr.message,
          );
          break sendReturnsEmail;
        }
        if (!roiLegCount || roiLegCount <= 0) {
          console.log(
            `[approve-withdrawal] Skipping returns-disbursement email: beneficiary ${partnerId} has no ROI ledger credits (portfolio=${portfolio.portfolio_code})`,
          );
          break sendReturnsEmail;
        }

        const refUpper = reference.trim().toUpperCase();
        const emailReq = buildReturnsDisbursementRequest({
          recipientEmail: partnerProfile.email,
          partnerName: partnerProfile.full_name,
          partnerId,
          txGroupId: String(txnGroupId ?? withdrawal_id),
          amount,
          transactionId: refUpper,
          portfolioCode: portfolio?.portfolio_code || undefined,
          payoutMethod: isProxyPayout
            ? `${payment_method} — via Proxy Agent`
            : payment_method,
          isManagedByAgent: isProxyPayout && fundingUserId !== partnerId,
          agentName,
        });
        dispatchTransactionalEmail(supabaseUrl, serviceKey, emailReq, "approve-withdrawal");

        // Also notify the proxy agent who submitted the withdrawal so they
        // have a written confirmation that the payout they processed on
        // behalf of the funder has been disbursed.
        if (isProxyPayout && agentEmail && fundingUserId !== partnerId) {
          const agentEmailReq = buildReturnsDisbursementRequest({
            recipientEmail: agentEmail,
            partnerName: agentName || "Agent",
            // Use fundingUserId so the idempotency key differs from the
            // partner's email and both are queued independently.
            partnerId: fundingUserId,
            txGroupId: String(txnGroupId ?? withdrawal_id),
            amount,
            transactionId: refUpper,
            portfolioCode: portfolio?.portfolio_code || undefined,
            payoutMethod: `${payment_method} — Proxy payout for ${partnerProfile.full_name || "funder"}`,
            isManagedByAgent: true,
            agentName,
          });
          dispatchTransactionalEmail(supabaseUrl, serviceKey, agentEmailReq, "approve-withdrawal");
        }
       }
      }
    } catch (emailErr) {
      console.warn(
        "[approve-withdrawal] returns-disbursement-confirmation enqueue failed:",
        (emailErr as Error).message,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal_id,
        amount,
        previous_balance: effectiveBalance,
        new_balance: effectiveBalance - amount,
        target_user: targetName,
        txn_group_id: txnGroupId,
        cashout_commission: cashoutCommission,
        settled_available: settledAvailable,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[approve-withdrawal] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
