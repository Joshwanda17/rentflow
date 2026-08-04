import { createClient } from "npm:@supabase/supabase-js@2";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import { sendSMS } from "../_shared/sendSmsMultiProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Bucket = "withdrawable" | "float";

/**
 * Structured reason codes. Free-text reasons produced unusable audit trails
 * ("not suposed h", "notb va;igbf"), so every move now carries a code plus a
 * human note.
 */
const REASON_CODES: Record<string, string> = {
  duplicate_credit: "Duplicate credit reversed",
  wrong_bucket: "Credited to the wrong wallet bucket",
  wrong_user: "Credited to the wrong user",
  fraud_hold: "Funds held pending fraud review",
  reconciliation: "Reconciliation adjustment",
  other: "Other",
};

/**
 * finops-wallet-move
 *
 * Financial-Ops power tool. Lets an authorised operator move money between ANY
 * two users' wallets, or pull money OUT of a user's wallet back to the platform
 * ("money we have") recorded on the cash-flow statement as an error correction.
 *
 * Every move is a balanced, double-entry transaction posted the ONLY sanctioned
 * way — through `create_ledger_transaction`. No direct wallet-column writes; the
 * `wallets` view derives every bucket live from `v_user_wallet_strict`, so the
 * balances update the instant the legs land.
 *
 * Bucket routing is carried by the explicit `wallet_bucket` + `recipient_type`
 * pair (Routing v2):
 *   • withdrawable → wallet_bucket='withdrawable', recipient_type='user'
 *   • float        → wallet_bucket='float',        recipient_type='operational_wallet'
 *
 * Overdraw is NEVER allowed: the operator can only move up to the source
 * bucket's current balance, validated server-side before posting.
 *
 * Modes:
 *   user_to_user     — debit source user's chosen bucket, credit dest user's
 *                      chosen bucket. Two wallet legs.
 *   error_correction — debit source user's chosen bucket (wallet leg) and credit
 *                      the platform with category `system_balance_correction`
 *                      (platform leg) so it lands on the cash-flow statement as
 *                      an error correction.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const { data: { user: authedUser }, error: authError } =
      await adminClient.auth.getUser(token);
    if (authError || !authedUser) return json({ error: "Unauthorized" }, 401);

    // Treasury guard — block any money movement while paused (CTO/super_admin bypass).
    const guardBlock = await checkTreasuryGuard(adminClient, "any", authedUser.id);
    if (guardBlock) return guardBlock;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authedUser.id)
      .in("role", ["cfo", "manager", "super_admin", "cto", "operations"]);
    if (!roles?.length) return json({ error: "Insufficient permissions" }, 403);
    const callerRoles = (roles || []).map((r: { role: string }) => r.role);

    // ── Input validation ──────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const mode: string = String(body?.mode ?? "").trim();
    const sourceUserId: string = String(body?.source_user_id ?? "").trim();
    const sourceBucket = String(body?.source_bucket ?? "").trim() as Bucket;
    const destUserId: string = String(body?.dest_user_id ?? "").trim();
    const destBucket = String(body?.dest_bucket ?? "withdrawable").trim() as Bucket;
    const reasonCode: string = String(body?.reason_code ?? "").trim();
    const reasonNote: string = String(body?.reason ?? "").trim();
    const confirmFullHistory = body?.confirm_full_history === true;
    const amount =
      typeof body?.amount === "number"
        ? body.amount
        : Number(String(body?.amount ?? "").replace(/[, _]/g, ""));

    if (mode !== "user_to_user" && mode !== "error_correction") {
      return json({ error: "Invalid mode." }, 400);
    }
    if (!UUID_RE.test(sourceUserId)) return json({ error: "Invalid source user." }, 400);
    if (sourceBucket !== "withdrawable" && sourceBucket !== "float") {
      return json({ error: "Source bucket must be Withdrawable or Float." }, 400);
    }
    if (mode === "user_to_user") {
      if (!UUID_RE.test(destUserId)) return json({ error: "Invalid destination user." }, 400);
      if (destBucket !== "withdrawable" && destBucket !== "float") {
        return json({ error: "Destination bucket must be Withdrawable or Float." }, 400);
      }
      if (destUserId === sourceUserId) {
        return json({ error: "Source and destination users must be different." }, 400);
      }
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000_000) {
      return json({ error: "Amount must be a positive number up to UGX 500,000,000." }, 400);
    }
    if (!Number.isInteger(amount)) {
      return json({ error: "Amount must be a whole number of UGX." }, 400);
    }
    if (!REASON_CODES[reasonCode]) {
      return json(
        {
          error: `A reason code is required. Allowed: ${Object.keys(REASON_CODES).join(", ")}.`,
        },
        400,
      );
    }
    if (reasonNote.length < 10) {
      return json({ error: "A reason note of at least 10 characters is required." }, 400);
    }
    const reason = `[${REASON_CODES[reasonCode]}] ${reasonNote}`;

    // ── Confirm the source has enough in the chosen bucket (NO overdraw) ───
    const { data: srcWallet, error: srcErr } = await adminClient
      .from("wallets")
      .select("withdrawable_balance, float_balance")
      .eq("user_id", sourceUserId)
      .maybeSingle();
    if (srcErr) return json({ error: `Wallet lookup failed: ${srcErr.message}` }, 500);

    const srcWithdrawable = Number(srcWallet?.withdrawable_balance ?? 0);
    const srcFloat = Number(srcWallet?.float_balance ?? 0);
    const srcAvailable = sourceBucket === "withdrawable" ? srcWithdrawable : srcFloat;
    if (srcAvailable < amount) {
      const label = sourceBucket === "withdrawable" ? "Withdrawable" : "Float";
      return json(
        {
          error: `Insufficient ${label} balance. Available: UGX ${srcAvailable.toLocaleString()}, requested: UGX ${amount.toLocaleString()}.`,
        },
        422,
      );
    }

    // ── Full-history sweep guard ──────────────────────────────────────────
    // 15 of 42 historical float error corrections removed exactly the user's
    // entire lifetime deposits. When the requested amount wipes out everything
    // the user ever deposited, demand a second, explicit confirmation.
    let lifetimeDeposits = 0;
    {
      const { data: deposits } = await adminClient
        .from("deposit_requests")
        .select("amount")
        .eq("user_id", sourceUserId)
        .eq("status", "approved");
      lifetimeDeposits = (deposits || []).reduce(
        (s: number, d: { amount: number | null }) => s + Number(d.amount ?? 0),
        0,
      );
    }
    if (
      mode === "error_correction" &&
      lifetimeDeposits > 0 &&
      amount >= lifetimeDeposits &&
      !confirmFullHistory
    ) {
      return json(
        {
          error:
            `FULL_HISTORY_SWEEP: UGX ${amount.toLocaleString()} equals or exceeds every deposit ` +
            `this user has ever made (UGX ${lifetimeDeposits.toLocaleString()}). ` +
            `Re-submit with confirm_full_history=true if this is genuinely correct.`,
          lifetime_deposits: lifetimeDeposits,
          requires_confirmation: "confirm_full_history",
        },
        409,
      );
    }

    // ── Resolve names for clean statements / linked_party ─────────────────
    const idsToName = [sourceUserId, ...(mode === "user_to_user" ? [destUserId] : [])];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", idsToName);
    const nameOf = (id: string) => {
      const p = profiles?.find((x) => x.id === id);
      return p?.full_name?.trim() || p?.phone || id;
    };
    const sourceName = nameOf(sourceUserId);
    const destName = mode === "user_to_user" ? nameOf(destUserId) : "Welile Platform";

    const bucketLeg = (
      userId: string,
      direction: "cash_in" | "cash_out",
      bucket: Bucket,
      linkedParty: string,
      description: string,
      refId: string,
      nowIso: string,
    ) => ({
      user_id: userId,
      amount,
      direction,
      category: bucket === "float" ? "agent_float_assignment" : "wallet_transfer",
      ledger_scope: "wallet",
      recipient_type: bucket === "float" ? "operational_wallet" : "user",
      wallet_bucket: bucket,
      routing_source: "finops_wallet_move",
      source_table: "finops_wallet_move",
      reference_id: refId,
      classification: "production",
      currency: "UGX",
      transaction_date: nowIso,
      linked_party: linkedParty,
      description,
    });

    const nowIso = new Date().toISOString();
    const fmt = `UGX ${amount.toLocaleString()}`;
    const srcBucketLabel = sourceBucket === "withdrawable" ? "Withdrawable" : "Float";

    let entries: Record<string, unknown>[];
    let refId: string;

    if (mode === "user_to_user") {
      refId = `FXW-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
      const dstBucketLabel = destBucket === "withdrawable" ? "Withdrawable" : "Float";
      entries = [
        bucketLeg(
          sourceUserId,
          "cash_out",
          sourceBucket,
          destName,
          `Operator move: sent ${fmt} from ${srcBucketLabel} to ${destName} (${dstBucketLabel}). ${reason}`,
          refId,
          nowIso,
        ),
        bucketLeg(
          destUserId,
          "cash_in",
          destBucket,
          sourceName,
          `Operator move: received ${fmt} into ${dstBucketLabel} from ${sourceName} (${srcBucketLabel}). ${reason}`,
          refId,
          nowIso,
        ),
      ];
    } else {
      // error_correction: wallet leg out, platform leg in (system_balance_correction)
      refId = `ECW-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
      entries = [
        bucketLeg(
          sourceUserId,
          "cash_out",
          sourceBucket,
          "Welile Platform",
          `Error correction: returned ${fmt} from ${sourceName}'s ${srcBucketLabel} to the platform. ${reason}`,
          refId,
          nowIso,
        ),
        {
          // Platform receives the funds back — recorded on the cash-flow
          // statement as a system balance / error correction.
          user_id: null,
          amount,
          direction: "cash_in",
          category: "system_balance_correction",
          ledger_scope: "platform",
          routing_source: "finops_wallet_move",
          source_table: "finops_wallet_move",
          reference_id: refId,
          currency: "UGX",
          transaction_date: nowIso,
          linked_party: sourceName,
          solvency_bypass_reason: "dispute_resolution",
          description: `Error correction: ${fmt} recovered from ${sourceName}'s ${srcBucketLabel} wallet. ${reason}`,
        },
      ];
    }

    // ── Post the balanced transaction ─────────────────────────────────────
    // Each transaction nets to zero on its own (cash_in === cash_out); we
    // pre-validated the source has enough, so skip the engine's withdrawable
    // check (it would otherwise mis-handle the float-bucket legs).
    const { data: groupId, error: rpcErr } = await adminClient.rpc(
      "create_ledger_transaction",
      { entries, skip_balance_check: true },
    );
    if (rpcErr) return json({ error: `Ledger error: ${rpcErr.message}` }, 500);

    // Refresh cached totals (buckets are derived by the view; this keeps the
    // cached `balance` column in step).
    try {
      await adminClient.rpc("reconcile_wallet_from_ledger", { p_user_id: sourceUserId });
      if (mode === "user_to_user") {
        await adminClient.rpc("reconcile_wallet_from_ledger", { p_user_id: destUserId });
      }
    } catch (_) {
      // Non-fatal: the strict view already reflects the move.
    }

    // ── Mandatory audit trail (audit governance) ──────────────────────────
    await adminClient.from("audit_logs").insert({
      user_id: authedUser.id,
      action_type: "finops_wallet_move",
      table_name: "general_ledger",
      record_id: groupId,
      metadata: {
        mode,
        source_user_id: sourceUserId,
        source_name: sourceName,
        source_bucket: sourceBucket,
        dest_user_id: mode === "user_to_user" ? destUserId : null,
        dest_name: destName,
        dest_bucket: mode === "user_to_user" ? destBucket : "platform",
        amount,
        reason,
        reason_code: reasonCode,
        reason_note: reasonNote,
        lifetime_deposits: lifetimeDeposits,
        full_history_sweep_confirmed:
          mode === "error_correction" && lifetimeDeposits > 0 && amount >= lifetimeDeposits,
        reference_id: refId,
        source_withdrawable_before: srcWithdrawable,
        source_float_before: srcFloat,
        caller_roles: callerRoles,
      },
    });

    // ── Event-based architecture: emit a system event ─────────────────────
    try {
      await adminClient.from("system_events").insert({
        event_type:
          mode === "user_to_user" ? "wallet.finops_move" : "wallet.finops_error_correction",
        description:
          mode === "user_to_user"
            ? `Operator moved ${fmt} from ${sourceName} to ${destName}`
            : `Operator recovered ${fmt} from ${sourceName} to the platform (error correction)`,
        metadata: {
          mode,
          source_user_id: sourceUserId,
          dest_user_id: mode === "user_to_user" ? destUserId : null,
          amount,
          reason,
          reference_id: refId,
          actor_id: authedUser.id,
        },
      });
    } catch (_) {
      // Lean-database policy: never let a non-critical event write fail the move.
    }

    // Read back fresh buckets straight from the strict-derived view.
    const { data: srcAfter } = await adminClient
      .from("wallets")
      .select("withdrawable_balance, float_balance")
      .eq("user_id", sourceUserId)
      .maybeSingle();
    let destAfter: { withdrawable_balance: number; float_balance: number } | null = null;
    if (mode === "user_to_user") {
      const { data } = await adminClient
        .from("wallets")
        .select("withdrawable_balance, float_balance")
        .eq("user_id", destUserId)
        .maybeSingle();
      destAfter = data as typeof destAfter;
    }

    const srcWithdrawableAfter = Number(srcAfter?.withdrawable_balance ?? 0);
    const srcFloatAfter = Number(srcAfter?.float_balance ?? 0);
    const srcBucketAfter = sourceBucket === "withdrawable" ? srcWithdrawableAfter : srcFloatAfter;

    // Belt-and-suspenders: if a race condition caused a negative bucket, flag it.
    if (srcBucketAfter < 0 || (destAfter && destBucket === "withdrawable" && Number(destAfter.withdrawable_balance) < 0) || (destAfter && destBucket === "float" && Number(destAfter.float_balance) < 0)) {
      try {
        await adminClient.from("wallet_overdraw_events").insert({
          user_id: sourceUserId,
          attempted_balance: amount,
          clamped_to: 0,
          float_before: srcFloat,
          float_after: srcFloatAfter,
          withdrawable_before: srcWithdrawable,
          withdrawable_after: srcWithdrawableAfter,
          trigger_op: "finops_wallet_move_negative_post",
        });
      } catch (_) {
        // Best-effort anomaly log.
      }
      return json(
        {
          error: `Move resulted in a negative balance. The transaction was posted but needs review.`,
          source: {
            user_id: sourceUserId,
            name: sourceName,
            withdrawable_after: srcWithdrawableAfter,
            float_after: srcFloatAfter,
          },
          dest:
            mode === "user_to_user"
              ? {
                  user_id: destUserId,
                  name: destName,
                  withdrawable_after: Number(destAfter?.withdrawable_balance ?? 0),
                  float_after: Number(destAfter?.float_balance ?? 0),
                }
              : { name: "Welile Platform" },
        },
        500,
      );
    }

    // ── Push notification (fire-and-forget) ──────────────────────────────
    if (mode === "user_to_user" && destUserId) {
      fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          userIds: [destUserId],
          payload: {
            title: "💰 Money Received",
            body: `${fmt} was added to your wallet.`,
            url: "/dashboard/agent",
            type: "success",
          },
        }),
      }).catch(() => {});
    }

    return json({
      success: true,
      mode,
      reference_id: refId,
      transaction_group_id: groupId,
      amount,
      source: {
        user_id: sourceUserId,
        name: sourceName,
        withdrawable_after: srcWithdrawableAfter,
        float_after: srcFloatAfter,
      },
      dest:
        mode === "user_to_user"
          ? {
              user_id: destUserId,
              name: destName,
              withdrawable_after: Number(destAfter?.withdrawable_balance ?? 0),
              float_after: Number(destAfter?.float_balance ?? 0),
            }
          : { name: "Welile Platform" },
      message:
        mode === "user_to_user"
          ? `Moved ${fmt} from ${sourceName} to ${destName}.`
          : `Recovered ${fmt} from ${sourceName} to the platform as an error correction.`,
    });
  } catch (err) {
    console.error("[finops-wallet-move] error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});