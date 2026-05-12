import { createClient } from "npm:@supabase/supabase-js@2";
import { runShadowAudit } from "../_shared/shadowLogger.ts";
import { shadowValidateCfoAdjustment } from "../_shared/shadowValidation.ts";
import { fetchShadowConfig, shouldSample } from "../_shared/shadowConfig.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Fetch shadow config once (cached 60s)
  const shadowConfig = await fetchShadowConfig(adminClient);

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // Use admin client to verify the JWT token
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth verification failed:", authError?.message || "No user");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Treasury guard: block any money movement when paused. Pass the
    // already-validated caller UUID so CTO / super_admin maintenance bypass is
    // deterministic and does not depend on bearer-token re-validation.
    const guardBlock = await checkTreasuryGuard(adminClient, "any", userId);
    if (guardBlock) return guardBlock;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["cfo", "manager", "super_admin", "cto"]);

    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id, amount: rawAmount, reason, operation, wallet_category, platform_category, financial_impact, category_label, sub_category, recipient_type } = await req.json();
    const amount = typeof rawAmount === "number"
      ? rawAmount
      : Number(String(rawAmount ?? "").replace(/[, _]/g, ""));
    const op = operation === "debit" ? "debit" : "credit";
    const callerRoles = (roles || []).map((r: any) => r.role);
    const walletBucket = recipient_type === "operational_wallet" ? "float" : "withdrawable";
    const routingSource = op === "credit" ? "cfo_direct_credit_explicit_bucket" : "cfo_direct_debit_explicit_bucket";

    // ── Wallet Routing v2: recipient_type is the SOLE routing signal ───────
    // user                → money goes to withdrawable_balance (user owns it)
    // operational_wallet  → money goes to float_balance (company-controlled)
    if (!recipient_type || (recipient_type !== "user" && recipient_type !== "operational_wallet")) {
      return new Response(JSON.stringify({
        error: "RECIPIENT_TYPE_REQUIRED: choose 'user' (Withdrawable) or 'operational_wallet' (Float).",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allowed production categories
    const ALLOWED_CATEGORIES = [
      'roi_wallet_credit', 'roi_expense', 'agent_commission_earned',
      'system_balance_correction', 'wallet_transfer', 'wallet_deduction',
      'access_fee_collected', 'registration_fee_collected',
      'marketing_expense', 'payroll_expense', 'general_admin_expense',
      'research_development_expense', 'tax_expense', 'interest_expense', 'equipment_expense',
      // Agent float top-ups initiated by CFO when the standard agent deposit
      // approval path is unavailable. Routes to operational_wallet → float.
      'agent_float_deposit', 'rent_disbursement',
    ];
    // Default the wallet leg to `wallet_deposit` (user-visible) instead of
    // `system_balance_correction`, which `v_user_wallet_strict` and every
    // end-user wallet view filter out — that filter caused CFO direct credits
    // to silently disappear from users' wallets even though the cached
    // `wallets.balance` updated. See plan: Atuhaire Carolyne 26.5M repair.
    // Hard guard: when the operator chose `operational_wallet` (Float) we must
    // NEVER fall back to `wallet_deposit` (which routes to Withdrawable). If
    // the submitted category isn't in the allow-list for that path, reject
    // outright so the bug can never silently re-appear.
    const FLOAT_ROUTE_CATEGORIES = new Set([
      'agent_float_deposit', 'agent_float_assignment', 'agent_float_topup',
      'agent_float_funding', 'rent_float_funding', 'rent_disbursement',
    ]);
    if (op === 'credit' && recipient_type === 'operational_wallet') {
      if (!wallet_category || !FLOAT_ROUTE_CATEGORIES.has(wallet_category)) {
        return new Response(JSON.stringify({
          error: `INVALID_ROUTING: wallet_category '${wallet_category ?? '(none)'}' does not route to Float. Operational Wallet credits require one of: ${[...FLOAT_ROUTE_CATEGORIES].join(', ')}.`,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    const walletCatRaw = ALLOWED_CATEGORIES.includes(wallet_category) ? wallet_category : 'wallet_deposit';
    const platformCat = ALLOWED_CATEGORIES.includes(platform_category) ? platform_category : 'system_balance_correction';

    // Expense categories (payroll, marketing, tax, etc.) describe the PLATFORM
    // leg only — they are cash_out from the company. On the recipient's WALLET
    // leg (cash_in) those categories are not routable by wallet_route_for_category
    // and the ledger raises UNSUPPORTED_LEDGER_CATEGORY. Translate to a generic
    // wallet-impact credit category for the wallet leg; the platform leg keeps
    // the real expense category for accounting/reporting.
    const EXPENSE_CATEGORIES = new Set([
      'marketing_expense', 'payroll_expense', 'general_admin_expense',
      'research_development_expense', 'tax_expense', 'interest_expense', 'equipment_expense',
    ]);
    // For credits, expense categories describe the platform leg only; the
    // recipient's wallet leg must use a user-visible deposit category so the
    // strict ledger view (which filters out system_balance_correction) shows
    // the funds.
    const walletCat = (operation !== 'debit' && EXPENSE_CATEGORIES.has(walletCatRaw))
      ? 'wallet_deposit'
      : walletCatRaw;
    const impact = ['revenue', 'expense', 'neutral'].includes(financial_impact) ? financial_impact : 'neutral';

    // ── Wallet Routing v2: category ↔ recipient_type compatibility check ──
    // Money owned by an individual cannot land in an operational wallet.
    const USER_OWNED_CATEGORIES = new Set([
      'payroll_expense', 'salary_payout',
      'roi_wallet_credit', 'roi_payout',
      'agent_commission_earned', 'agent_commission', 'agent_bonus',
      'partner_commission', 'referral_bonus',
      'proxy_investment_commission', 'agent_investment_commission',
      'wallet_transfer', 'manager_credit',
      'marketing_expense', 'general_admin_expense', 'research_development_expense',
      'tax_expense', 'interest_expense', 'equipment_expense',
    ]);
    const OPERATIONAL_CATEGORIES = new Set([
      'agent_float_deposit', 'agent_float_assignment', 'agent_float_topup',
      'agent_float_funding', 'rent_float_funding', 'rent_disbursement',
    ]);
    if (op === 'credit' && recipient_type === 'operational_wallet' && USER_OWNED_CATEGORIES.has(walletCat)) {
      return new Response(JSON.stringify({
        error: `INVALID_ROUTING: '${walletCat}' is money owned by the recipient — choose 'User' (Withdrawable) instead of 'Operational Wallet'.`,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (op === 'credit' && recipient_type === 'user' && OPERATIONAL_CATEGORIES.has(walletCat)) {
      return new Response(JSON.stringify({
        error: `INVALID_ROUTING: '${walletCat}' is operational/company money — choose 'Operational Wallet' (Float) instead of 'User'.`,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate inputs — shadow on failure paths
    if (!target_user_id || typeof target_user_id !== "string") {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Invalid target user");
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500000000) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error(`Invalid amount: received '${rawAmount}' (typeof ${typeof rawAmount}). Allowed range 1 - 500,000,000.`);
    }
    if (!reason || typeof reason !== "string" || reason.length < 10) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, reason, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Reason must be at least 10 characters");
    }

    // Phase 5: Shadow audit on success path — sampled
    if (shouldSample(shadowConfig)) {
      runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation },
        true, () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) throw new Error("Target user not found");

    // Ensure wallet exists
    const { data: existingWallet } = await adminClient
      .from("wallets")
      .select("id, balance, withdrawable_balance, float_balance")
      .eq("user_id", target_user_id)
      .single();

    if (!existingWallet) {
      await adminClient.from("wallets").insert({ user_id: target_user_id, balance: 0 });
    }

    // CFO has authority to debit regardless of balance (corrections, clawbacks)
    // Log a warning if balance is insufficient for audit trail
    if (op === "debit") {
      const bal = existingWallet?.balance ?? 0;
      if (bal < amount) {
        console.warn(`[cfo-direct-credit] CFO debit exceeds balance: user=${target_user_id} balance=${bal} debit=${amount}`);
      }
    }

    const groupId = crypto.randomUUID();

    // Generate trackable PAY- reference (same format COO uses) for every CFO direct credit/debit
    const refId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (op === "credit") {
      console.log("[cfo-direct-credit] Creating CREDIT ledger entries for", target_user_id, "amount:", amount);
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: target_user_id,
            amount,
            direction: 'cash_in',
            category: walletCat,
            ledger_scope: 'wallet',
            recipient_type,
            wallet_bucket: walletBucket,
            routing_source: routingSource,
            source_table: 'cfo_direct_credit',
            reference_id: refId,
            description: `Welile Technologies Finance [${category_label || walletCat}]${sub_category ? ' → ' + sub_category : ''}: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            user_id: userId,
            direction: 'cash_out',
            amount,
            category: platformCat,
            ledger_scope: 'platform',
            source_table: 'cfo_direct_credit',
            reference_id: refId,
            description: `Welile Technologies Finance → ${targetProfile.full_name} [${impact}]: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
        skip_balance_check: true,
      });
      if (rpcErr) {
        console.error("[cfo-direct-credit] Credit ledger error:", rpcErr.message);
        throw new Error(`Ledger error: ${rpcErr.message}`);
      }
    } else {
      console.log("[cfo-direct-credit] Creating DEBIT ledger entries for", target_user_id, "amount:", amount);
      const nowIso = new Date().toISOString();
      const entries: any[] = [
        {
          user_id: target_user_id,
          amount,
          direction: 'cash_out',
          category: walletCat,
          ledger_scope: 'wallet',
          recipient_type,
          wallet_bucket: walletBucket,
          routing_source: routingSource,
          source_table: 'cfo_direct_credit',
          reference_id: refId,
          description: `CFO Debit [${category_label || walletCat}]: ${reason}`,
          currency: 'UGX',
          transaction_date: nowIso,
        },
        {
          user_id: userId,
          direction: 'cash_in',
          amount,
          category: platformCat,
          ledger_scope: 'platform',
          source_table: 'cfo_direct_credit',
          reference_id: refId,
          description: `${targetProfile.full_name} → Platform [${impact}]: ${reason}`,
          currency: 'UGX',
          transaction_date: nowIso,
        },
      ];

      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries,
        skip_balance_check: true,
      });
      if (rpcErr) {
        console.error("[cfo-direct-credit] Debit ledger error:", rpcErr.message);
        throw new Error(`Ledger error: ${rpcErr.message}`);
      }
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: `cfo_direct_${op}`,
      table_name: "general_ledger",
      record_id: groupId,
      metadata: {
        target_user_id,
        target_name: targetProfile.full_name,
        amount,
        reason,
        operation: op,
        wallet_category: walletCat,
        platform_category: platformCat,
        financial_impact: impact,
        category_label: category_label || walletCat,
        sub_category: sub_category || null,
        reference_id: refId,
        recipient_type,
        routing_version: 'v2',
      },
    });

    // ── Payroll Growth Bonus tracker ──────────────────────────────────────
    // When CFO credits a user for payroll, register the deposit so the daily
    // 0.5% growth job can compound un-withdrawn payroll. Only credits to a
    // real user (not operational_wallet) qualify.
    if (op === "credit" && platformCat === "payroll_expense" && recipient_type === "user") {
      const { error: pgbErr } = await adminClient.from("payroll_growth_balances").insert({
        user_id: target_user_id,
        original_amount: amount,
        current_balance: amount,
        accrued_growth: 0,
        daily_rate: 0.005,
        source_reference_id: refId,
        last_growth_at: new Date().toISOString(),
        status: "active",
      });
      if (pgbErr) {
        console.error("[cfo-direct-credit] payroll_growth_balances insert failed:", pgbErr.message);
      } else {
        console.log("[cfo-direct-credit] Payroll growth tracker created for", target_user_id, "amount:", amount);
      }
    }

    const verb = op === "credit" ? "credited to" : "debited from";

    // Force wallet bucket reconciliation so CFO-credited funds land in the
    // withdrawable bucket immediately (no drift between ledger and wallet columns).
    let newWithdrawableBalance: number | null = null;
    try {
      await adminClient.rpc("reconcile_wallet_from_ledger", { p_user_id: target_user_id });
      // Wallet Routing v2: enforce the operator's recipient_type choice on top
      // of the legacy category-based routing. This guarantees that, regardless
      // of category, money sent to a "user" lands in withdrawable_balance and
      // money sent to an "operational_wallet" lands in float_balance.
      const { error: enforceErr } = await adminClient.rpc("enforce_recipient_routing", {
        p_user_id: target_user_id,
        p_amount: amount,
        p_recipient_type: recipient_type,
      });
      if (enforceErr) {
        console.error("[cfo-direct-credit] enforce_recipient_routing failed:", enforceErr.message);
      }
      const { data: refreshed } = await adminClient
        .from("wallets")
        .select("withdrawable_balance")
        .eq("user_id", target_user_id)
        .single();
      newWithdrawableBalance = Number(refreshed?.withdrawable_balance ?? 0);
    } catch (reconErr) {
      console.error("[cfo-direct-credit] reconcile_wallet_from_ledger failed:", (reconErr as Error).message);
    }

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "💳 Welile Technologies Finance", body: "Activity: wallet credit", url: "/dashboard/manager" }),
    }).catch(() => {});

    // Push notification to target user (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [target_user_id],
        payload: { title: op === "credit" ? "💰 Welile Technologies Finance" : "💸 Wallet Debited", body: `UGX ${amount.toLocaleString()} ${verb} your wallet by Welile Technologies Finance`, url: "/dashboard/funder", type: "success" },
      }),
    }).catch(() => {});

    // ── Send Partner Wallet Deposit email on ROI payouts (mirrors approve-wallet-operation) ──
    if (op === "credit" && (walletCat === "roi_wallet_credit" || platformCat === "roi_expense")) {
      try {
        if (targetProfile.email) {
          const { data: partnerWallet } = await adminClient
            .from("wallets")
            .select("id")
            .eq("user_id", target_user_id)
            .maybeSingle();
          const walletLast4 = partnerWallet?.id
            ? partnerWallet.id.replace(/-/g, "").slice(-4)
            : "";

          const todayLabel = new Date().toLocaleDateString("en-GB", {
            day: "2-digit", month: "long", year: "numeric",
          });

          await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              templateName: "partner-wallet-deposit",
              recipientEmail: targetProfile.email,
              idempotencyKey: `partner-wallet-deposit-cfo-${groupId}`,
              templateData: {
                partner_name: targetProfile.full_name || "Partner",
                transaction_id: refId,
                amount,
                currency: "UGX",
                date: todayLabel,
                wallet_id_last4: walletLast4,
                source: "Platform",
                company_name: "Welile",
                logo_url: "https://welilereceipts.com/welile-logo.png",
              },
            }),
          });
          console.log(`[cfo-direct-credit] Partner wallet deposit email queued for ${target_user_id} ref=${refId}`);
        } else {
          console.warn(`[cfo-direct-credit] Skipping partner deposit email - no email for ${target_user_id}`);
        }
      } catch (emailErr) {
        console.warn(`[cfo-direct-credit] Partner deposit email failed:`, (emailErr as Error).message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `UGX ${amount.toLocaleString()} ${verb} ${targetProfile.full_name}`,
      new_withdrawable_balance: newWithdrawableBalance,
      reference_id: refId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[cfo-direct-credit] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
