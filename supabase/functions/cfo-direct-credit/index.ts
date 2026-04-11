import { createClient } from "npm:@supabase/supabase-js@2";
import { runShadowAudit } from "../_shared/shadowLogger.ts";
import { shadowValidateCfoAdjustment } from "../_shared/shadowValidation.ts";
import { fetchShadowConfig, shouldSample } from "../_shared/shadowConfig.ts";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["cfo", "manager", "super_admin"]);

    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id, amount, reason, operation } = await req.json();
    const op = operation === "debit" ? "debit" : "credit";
    const callerRoles = (roles || []).map((r: any) => r.role);

    // Validate inputs — shadow on failure paths
    if (!target_user_id || typeof target_user_id !== "string") {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Invalid target user");
    }
    if (!amount || typeof amount !== "number" || amount <= 0 || amount > 50000000) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Invalid amount (1 - 50,000,000)");
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
      .select("id, full_name")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) throw new Error("Target user not found");

    // Ensure wallet exists
    const { data: existingWallet } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", target_user_id)
      .single();

    if (!existingWallet) {
      await adminClient.from("wallets").insert({ user_id: target_user_id, balance: 0 });
    }

    // For debit: check sufficient balance
    if (op === "debit") {
      const bal = existingWallet?.balance ?? 0;
      if (bal < amount) {
        throw new Error(`Insufficient balance. User has UGX ${bal.toLocaleString()}`);
      }
    }

    const groupId = crypto.randomUUID();

    if (op === "credit") {
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: target_user_id,
            amount,
            direction: 'cash_in',
            category: 'system_balance_correction',
            ledger_scope: 'wallet',
            description: `CFO Credit: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            direction: 'cash_out',
            amount,
            category: 'system_balance_correction',
            ledger_scope: 'platform',
            description: `Platform → ${targetProfile.full_name}: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
      });
      if (rpcErr) throw new Error(`Ledger error: ${rpcErr.message}`);
    } else {
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: target_user_id,
            amount,
            direction: 'cash_out',
            category: 'system_balance_correction',
            ledger_scope: 'wallet',
            description: `CFO Debit: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            direction: 'cash_in',
            amount,
            category: 'system_balance_correction',
            ledger_scope: 'platform',
            description: `${targetProfile.full_name} → Platform: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
      });
      if (rpcErr) throw new Error(`Ledger error: ${rpcErr.message}`);
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
      },
    });

    const verb = op === "credit" ? "credited to" : "debited from";

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "💳 CFO Direct Credit", body: "Activity: direct credit", url: "/manager" }),
    }).catch(() => {});

    // Push notification to target user (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [target_user_id],
        payload: { title: op === "credit" ? "💰 Wallet Credited" : "💸 Wallet Debited", body: `UGX ${amount.toLocaleString()} ${verb} your wallet`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      success: true,
      message: `UGX ${amount.toLocaleString()} ${verb} ${targetProfile.full_name}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
