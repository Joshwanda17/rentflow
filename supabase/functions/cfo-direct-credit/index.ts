import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { runShadowAudit } from "../_shared/shadowLogger.ts";
import { shadowValidateCfoAdjustment } from "../_shared/shadowValidation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") || "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
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

    if (!target_user_id || typeof target_user_id !== "string") {
      throw new Error("Invalid target user");
    }
    if (!amount || typeof amount !== "number" || amount <= 0 || amount > 50000000) {
      throw new Error("Invalid amount (1 - 50,000,000)");
    }
    if (!reason || typeof reason !== "string" || reason.length < 10) {
      throw new Error("Reason must be at least 10 characters");
    }

    // Phase 3: Shadow audit — non-blocking, fire-and-forget
    const callerRoles = (roles || []).map((r: any) => r.role);
    runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation },
      true, () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles })
    );

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
      // Platform → Wallet: credit user, debit platform
      await adminClient.from("general_ledger").insert([
        {
          user_id: target_user_id,
          amount,
          direction: "cash_in",
          type: "cfo_direct_credit",
          description: `CFO Credit: ${reason}`,
          transaction_group_id: groupId,
          ledger_scope: "bridge",
        },
        {
          user_id: null,
          amount,
          direction: "cash_out",
          type: "platform_expense",
          description: `Platform → ${targetProfile.full_name}: ${reason}`,
          transaction_group_id: groupId,
          ledger_scope: "platform",
        },
      ]);
    } else {
      // Wallet → Platform: debit user, credit platform
      await adminClient.from("general_ledger").insert([
        {
          user_id: target_user_id,
          amount,
          direction: "cash_out",
          type: "cfo_direct_debit",
          description: `CFO Debit: ${reason}`,
          transaction_group_id: groupId,
          ledger_scope: "bridge",
        },
        {
          user_id: null,
          amount,
          direction: "cash_in",
          type: "platform_income",
          description: `${targetProfile.full_name} → Platform: ${reason}`,
          transaction_group_id: groupId,
          ledger_scope: "platform",
        },
      ]);
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
