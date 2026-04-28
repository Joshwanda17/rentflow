// Resolve a single phantom_wallet_drift row by writing the cached wallet
// balance down (or up) to match ledger truth via the sole-writer path
// (apply_wallet_movement + create_ledger_transaction with the
// `system_balance_correction` category).
//
// Auth: super_admin or cfo only.
// Idempotent: keyed on `phantom-drift-resolve-<driftId>`.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  drift_id: string;
  reason?: string; // optional operator note (>=10 chars, audit_logs requires it)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Resolve caller
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } =
      await adminClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ error: "Invalid auth token" }, 401);
    }
    const callerId = userData.user.id;

    // Gate: super_admin or cfo
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const allowed = (roles ?? []).some(
      (r: { role: string }) =>
        r.role === "super_admin" || r.role === "cfo",
    );
    if (!allowed) {
      return json({ error: "Forbidden: super_admin or CFO only" }, 403);
    }

    const body = (await req.json()) as Body;
    if (!body?.drift_id) {
      return json({ error: "drift_id is required" }, 400);
    }
    const reason = (body.reason ?? "Write-down to ledger truth (phantom drift cleanup)").trim();
    if (reason.length < 10) {
      return json({ error: "reason must be at least 10 characters" }, 400);
    }

    // Load drift row
    const { data: drift, error: driftErr } = await adminClient
      .from("phantom_wallet_drift")
      .select("*")
      .eq("id", body.drift_id)
      .maybeSingle();
    if (driftErr || !drift) {
      return json({ error: "Drift row not found" }, 404);
    }
    if (drift.status === "resolved" || drift.status === "false_positive") {
      return json({ error: `Already ${drift.status}` }, 409);
    }

    const userId: string = drift.user_id;
    const walletCached = Number(drift.wallet_balance);
    const ledgerNet = Number(drift.ledger_net);
    const gap = walletCached - ledgerNet; // +ve = phantom inflation, -ve = over-debit
    const absGap = Math.abs(gap);
    if (absGap < 1) {
      // Nothing meaningful to correct — just close the row.
      await adminClient
        .from("phantom_wallet_drift")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: callerId,
          resolution_notes: "Drift below 1 UGX; closed without ledger entry.",
        })
        .eq("id", body.drift_id);
      return json({ ok: true, applied: 0, note: "drift < 1 UGX, closed without write" });
    }

    // Direction: if wallet > ledger we DEBIT the user (write down)
    // if wallet < ledger we CREDIT the user (write up)
    const direction: "debit" | "credit" = gap > 0 ? "debit" : "credit";

    // 1) Write the balanced ledger pair (user + platform) under
    //    system_balance_correction. create_ledger_transaction enforces
    //    SUM(cash_in)==SUM(cash_out).
    const idempotency = `phantom-drift-resolve-${body.drift_id}`;
    const userLeg = {
      user_id: userId,
      linked_party: "platform",
      amount: absGap,
      direction: direction === "debit" ? "cash_out" : "cash_in",
      category: "system_balance_correction",
      description:
        direction === "debit"
          ? `Phantom drift write-down (CFO reconcile): -UGX ${absGap.toLocaleString()}`
          : `Phantom drift write-up (CFO reconcile): +UGX ${absGap.toLocaleString()}`,
      classification: "admin_correction",
      ledger_scope: "wallet",
      currency: "UGX",
      source_table: "phantom_wallet_drift",
      source_id: body.drift_id,
    };
    const platformLeg = {
      user_id: userId,
      linked_party: "platform",
      amount: absGap,
      direction: direction === "debit" ? "cash_in" : "cash_out",
      category: "system_balance_correction",
      description: `Counter-leg for drift ${body.drift_id}`,
      classification: "admin_correction",
      ledger_scope: "platform",
      currency: "UGX",
      source_table: "phantom_wallet_drift",
      source_id: body.drift_id,
    };

    const { error: ledgerErr } = await adminClient.rpc(
      "create_ledger_transaction",
      {
        entries: [userLeg, platformLeg],
        idempotency_key: idempotency,
        skip_balance_check: false,
      },
    );
    if (ledgerErr) {
      return json(
        { error: `Ledger write failed: ${ledgerErr.message}` },
        500,
      );
    }

    // 2) Mutate the wallet cache via the sole writer
    const { error: walletErr } = await adminClient.rpc(
      "apply_wallet_movement",
      {
        p_user_id: userId,
        p_category: "system_balance_correction",
        p_amount: absGap,
        p_direction: direction,
      },
    );
    if (walletErr) {
      return json(
        { error: `Wallet movement failed: ${walletErr.message}` },
        500,
      );
    }

    // 3) Mark drift row resolved
    await adminClient
      .from("phantom_wallet_drift")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: callerId,
        resolution_notes: `${direction === "debit" ? "Wrote down" : "Wrote up"} cache by ${absGap.toLocaleString()} UGX. ${reason}`,
      })
      .eq("id", body.drift_id);

    // 4) Audit log (mandatory: action_type, table_name, record_id, reason)
    await adminClient.from("audit_logs").insert({
      action_type: "phantom_drift_resolution",
      table_name: "phantom_wallet_drift",
      record_id: body.drift_id,
      user_id: callerId,
      reason,
      metadata: {
        target_user_id: userId,
        wallet_cached_before: walletCached,
        ledger_net: ledgerNet,
        gap_signed: gap,
        direction,
        amount_applied: absGap,
        idempotency_key: idempotency,
      },
    });

    return json({
      ok: true,
      direction,
      amount_applied: absGap,
      idempotency_key: idempotency,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
