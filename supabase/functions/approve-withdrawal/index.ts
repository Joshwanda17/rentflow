import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import {
  buildReturnsDisbursementRequest,
  dispatchTransactionalEmail,
  buildWithdrawalPaidReceiptRequest,
} from "../_shared/partnership-emails.ts";
import {
  buildReceiptCopyRecipients,
  enforceArchiveOnly,
} from "./receipt-copy-guard.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";
import {
  logSmsDelivery,
  reserveSmsIdempotency,
  finalizeSmsDelivery,
  type SmsAttemptRecord,
} from "../_shared/smsDeliveryLog.ts";
import { parseSMS } from "./smsParser.ts";

/** Digit-tail normalizer: collapses carrier prefixes (MP/AT) + separators so
 *  "MP40781351736", "40781351736" and "40781351-736" all compare equal.
 *  Mirrors `public.normalize_momo_tid` / `src/lib/momoTid.ts`. */
const normalizeMomoTid = (tid: string | null | undefined): string =>
  (tid ?? "").replace(/\D+/g, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── SMS helper (Africa's Talking) ─────────────────────────────────────
// Mirrors the pattern in approve-rent-request so users get an immediate
// text alert when Financial Ops approves and pays out their withdrawal.
function formatPhoneInternational(phone: string): string {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return digits ? `+${digits}` : "";
}
function isUgandanPhone(phone: string): boolean {
  const f = formatPhoneInternational(phone);
  return f.startsWith("+256") && f.length >= 13;
}
// Provider chain: Yoola (PRIMARY) → Africa's Talking → LANA (final fallback).
// Each provider is tried only if the previous is unconfigured or rejects, so a
// single provider running out of credit never blocks delivery.
function toMsisdn(phone: string): string {
  return formatPhoneInternational(phone).replace(/^\+/, "");
}
async function sendViaYoola(
  phone: string,
  message: string,
): Promise<{ ok: boolean; error: string | null; response?: unknown } | null> {
  const apiKey = Deno.env.get("YOOLA_SMS_API_KEY")?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://yoolasms.com/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone: toMsisdn(phone), message, api_key: apiKey, sender: "WELILE" }),
    });
    const raw = await res.text();
    let data: any; try { data = JSON.parse(raw); } catch { data = null; }
    const status = String(data?.status ?? "").toLowerCase();
    const ok = res.ok &&
      (status === "success" || status === "ok" || status === "sent" || status === "queued" ||
        (!data?.error && status === ""));
    if (!ok) console.warn(`[approve-withdrawal] Yoola rejected HTTP ${res.status} ${status}`);
    return {
      ok,
      error: ok ? null : `Yoola rejected (HTTP ${res.status} ${status || "no-status"})`,
      response: data ?? raw?.slice(0, 300),
    };
  } catch (err) {
    console.error("[approve-withdrawal] Yoola error:", err);
    return { ok: false, error: `Yoola network error: ${(err as Error)?.message || err}`, response: null };
  }
}
async function sendViaAT(
  phone: string,
  message: string,
): Promise<{ ok: boolean; error: string | null; response?: unknown } | null> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) return null;
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const body = new URLSearchParams({
      username,
      from: "WELILE",
      to: formatPhoneInternational(phone),
      message,
    });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
        Accept: "application/json",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      console.warn(`[approve-withdrawal] AT HTTP ${res.status}`);
      const text = await res.text().catch(() => "");
      return { ok: false, error: `AT HTTP ${res.status}`, response: text?.slice(0, 300) || null };
    }
    const data = await res.json();
    const recipients = data?.SMSMessageData?.Recipients || [];
    const accepted = recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
    const reason = recipients.map((r: any) => `${r.number}:${r.status}`).join(", ");
    return {
      ok: accepted,
      error: accepted ? null : (reason ? `AT rejected (${reason})` : "AT no accepted recipients"),
      response: data,
    };
  } catch (err) {
    console.error("[approve-withdrawal] AT error:", err);
    return { ok: false, error: `AT network error: ${(err as Error)?.message || err}`, response: null };
  }
}
async function sendViaLana(
  phone: string,
  message: string,
): Promise<{ ok: boolean; error: string | null; response?: unknown } | null> {
  const apiKey = Deno.env.get("LANA_SMS_API_KEY")?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.lanasms.com/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ phone: toMsisdn(phone), message, sender_id: "WELILE" }),
    });
    const raw = await res.text();
    let data: any; try { data = JSON.parse(raw); } catch { data = null; }
    const ok = res.ok && data?.status === true;
    if (!ok) console.warn(`[approve-withdrawal] LANA rejected: ${data?.message ?? res.status}`);
    return {
      ok,
      error: ok ? null : `LANA rejected (${data?.message || `HTTP ${res.status}`})`,
      response: data ?? raw?.slice(0, 300),
    };
  } catch (err) {
    console.error("[approve-withdrawal] LANA error:", err);
    return { ok: false, error: `LANA network error: ${(err as Error)?.message || err}`, response: null };
  }
}
// Optional delivery-status logging context. When supplied, sendSMS records a
// full audit row (provider response, attempts, failures) to `sms_delivery_log`.
interface SmsLogCtx {
  admin: any;
  source: string; // 'withdrawal_payout' | 'merchant_commission' | 'proxy_payout'
  reference_id?: string | null;
  recipient_user_id?: string | null;
  recipient_name?: string | null;
  // When set, the SMS is reserved before sending so a retried approval can
  // never send the same text twice.
  idempotencyKey?: string | null;
}
async function sendSMS(
  phone: string,
  message: string,
  logCtx?: SmsLogCtx,
): Promise<boolean> {
  // Idempotency guard: reserve the send slot up front. If a prior attempt
  // already delivered this SMS (or one is in flight), skip sending entirely.
  let reservedLogId: string | null = null;
  if (logCtx?.admin && logCtx.idempotencyKey) {
    const reservation = await reserveSmsIdempotency(logCtx.admin, {
      idempotency_key: logCtx.idempotencyKey,
      recipient_phone: phone || "unknown",
      recipient_user_id: logCtx.recipient_user_id ?? null,
      recipient_name: logCtx.recipient_name ?? null,
      message,
      reference_id: logCtx.reference_id ?? null,
      source: logCtx.source,
    });
    if (!reservation.proceed) {
      console.log(
        `[approve-withdrawal] SMS skipped (${logCtx.source} / ${logCtx.idempotencyKey}): ${reservation.reason}`,
      );
      // Treat an already-delivered SMS as success so callers don't fall back
      // to a duplicate email receipt.
      return reservation.alreadySent;
    }
    reservedLogId = reservation.logId;
  }

  const providerNames: Record<string, string> = {
    sendViaYoola: "yoola",
    sendViaAT: "africastalking",
    sendViaLana: "lana",
  };
  const trail: SmsAttemptRecord[] = [];
  let delivered = false;
  let invalid = false;

  if (!isUgandanPhone(phone)) {
    invalid = true;
  } else {
    for (const send of [sendViaYoola, sendViaAT, sendViaLana]) {
      const r = await send(phone, message);
      if (r === null) continue; // provider unconfigured → try next
      trail.push({ provider: providerNames[send.name] || send.name, ok: r.ok, error: r.error, response: (r as any).response, attempt: 1 });
      if (r.ok) { delivered = true; break; } // delivered
    }
  }

  const errorText = delivered
    ? null
    : invalid
    ? "Invalid Ugandan phone/MoMo number"
    : (trail.filter((t) => !t.ok && t.error).map((t) => `${t.provider}: ${t.error}`).join(" | ") || "No SMS provider configured");

  if (reservedLogId) {
    // Finalize the reserved audit row with the real outcome.
    await finalizeSmsDelivery(logCtx!.admin, reservedLogId, {
      status: delivered ? "sent" : "failed",
      attempts: trail,
      retries: 0,
      error: errorText,
    });
  } else if (logCtx?.admin) {
    await logSmsDelivery(logCtx.admin, {
      recipient_phone: phone || "unknown",
      recipient_user_id: logCtx.recipient_user_id ?? null,
      recipient_name: logCtx.recipient_name ?? null,
      message,
      status: delivered ? "sent" : "failed",
      attempts: trail,
      retries: 0,
      reference_id: logCtx.reference_id ?? null,
      source: logCtx.source,
      error: errorText,
    });
  }

  return delivered;
}

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

    // Authenticate caller. Two paths:
    //  - normal: user JWT, role check below
    //  - system: service-role JWT + body.system_caller=true (used by
    //    auto-settle-bulk-bank-payout). We impersonate the first super_admin
    //    so downstream audit/RPC calls see a real staff user id.
    let user: any = null;
    let isSystemCall = false;
    const tokenOnly = (authHeader || "").replace(/^Bearer\s+/i, "");
    if (tokenOnly && tokenOnly === serviceKey) {
      isSystemCall = true;
    } else {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: u }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !u) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = u;
    }

    // Check caller role (staff OR active cashout agent)
    const admin = createClient(supabaseUrl, serviceKey);

    // Treasury guard: block withdrawals when paused
    const guardBlock = await checkTreasuryGuard(admin, "debit", req.headers.get("Authorization"));
    if (guardBlock) return guardBlock;
    const allowedRoles = ["super_admin", "manager", "cfo", "coo", "operations", "cto"];
    let hasStaffRole = false;
    if (isSystemCall) {
      // Pick first super_admin as the audit actor
      const { data: sysUser } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .limit(1)
        .maybeSingle();
      if (!sysUser?.user_id) {
        return new Response(JSON.stringify({ error: "No super_admin available for system call" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = { id: sysUser.user_id };
      hasStaffRole = true;
    } else {
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      hasStaffRole = (roles || []).some((r: any) => allowedRoles.includes(r.role));
    }

    // Also check if caller is an active cashout agent (regardless of hasStaffRole)
    const { data: agentRow } = await admin
      .from("cashout_agents")
      .select("id")
      .eq("agent_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const isCashoutAgent = !!agentRow;

    // Merchant compensation (principal reimbursement + 0.5% commission + SMS)
    // must ONLY go to a genuine merchant agent who fronted their OWN MTN/Airtel
    // cash to pay the customer. The authoritative signal is the explicit
    // `acting_as_merchant` intent flag the merchant queue sends (resolved after
    // the body is parsed below), combined with the caller actually being an
    // active cashout agent. Role no longer gates this: nearly every merchant
    // also holds staff roles (manager/super_admin/etc.), and the old
    // `!hasStaffRole` gate was silently denying them commission + SMS. The
    // Financial Ops desk never sends the flag, and system/bulk auto-settlement
    // impersonates a super_admin without the flag — so neither qualifies.
    let actingAsMerchant = false;

    if (!hasStaffRole && !isCashoutAgent) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { withdrawal_id, reference, payment_method } = body;
    // Cash withdrawals are gated by a one-time WPO-XXXXX pickup code that
    // was issued to the requester at submission time. Financial Ops MUST
    // pass the exact, unexpired code back here (typed from what the user
    // presented). Mismatches return structured 4xx errors below.
    const payoutCodeRaw =
      typeof (body as any)?.payout_code === "string"
        ? (body as any).payout_code
        : null;
    const payoutCodeNormalized = payoutCodeRaw
      ? payoutCodeRaw.trim().toUpperCase()
      : null;
    // System auto-approval (gmail-poll MoMo match) forces the debit onto the
    // REQUESTER's own wallet — consuming the "reserved against pending
    // requests" hold — instead of auto-routing to a proxy agent. The cash
    // physically left via the requester's MoMo number, so the requester is
    // the funder by definition.
    const forceRequesterDebit = Boolean((body as any)?.force_requester_debit) && isSystemCall;

    // POOL-FUNDED proxy bank settlement (SKYBUBBLES bulk-bank email match).
    // When auto-settle-bulk-bank-payout matches a proxy partner bank payout to
    // an outgoing company bank-payout email with enough remaining pool
    // capacity, the company pool FIRST tops up the proxy agent's FLOAT bucket
    // for the exact amount, then the payout debits that same float — net zero
    // on the agent wallet. This draws against the pool (the matched email),
    // NOT against the agent's pre-existing withdrawable balance. System-only.
    const poolFunded = Boolean((body as any)?.pool_funded) && isSystemCall;

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

    // Fraud/freeze gate MUST run before any ledger write. The database trigger
    // also blocks status changes, but this early check prevents a ledger debit
    // from being posted and then failing only when the request flips to
    // completed.
    const { data: requesterProfile } = await admin
      .from("profiles")
      .select("is_frozen, frozen_reason")
      .eq("id", wr.user_id)
      .maybeSingle();
    const { data: requesterFraudBlocked } = await admin.rpc(
      "is_fraud_identifier_blocked",
      { p_type: "user_id", p_value: wr.user_id },
    );
    if (requesterProfile?.is_frozen || requesterFraudBlocked === true) {
      const blockedReason = requesterProfile?.frozen_reason ||
        "This account is restricted for fraud review and cannot receive withdrawals.";
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action_type: "withdrawal_blocked_fraud_account",
        action: "withdrawal_blocked_fraud_account",
        table_name: "withdrawal_requests",
        record_id: withdrawal_id,
        metadata: {
          reason: blockedReason,
          request_owner_id: wr.user_id,
          amount: wr.amount,
        },
      });
      return new Response(JSON.stringify({
        success: false,
        error: blockedReason,
        code: "FRAUD_ACCOUNT_BLOCKED",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A genuine merchant is an active cashout agent who completes the payout
    // FROM THE MERCHANT QUEUE (the only caller that sends `acting_as_merchant`).
    // They fronted their own MoMo/cash, so they earn the principal reimbursement
    // + 0.5% commission + SMS — even if they also hold staff roles. Staff
    // settling from the Financial Ops desk never send the flag, and system/bulk
    // auto-settlement never sends it either, so neither wrongly earns merchant
    // compensation. Backward-compatible: if a legacy merchant client omits the
    // flag but the caller is a cashout agent AND no staff settlement desk is in
    // play, we still credit them.
    const bodyActingFlag =
      (body as any)?.acting_as_merchant === true ||
      (body as any)?.actingAsMerchant === true;
    actingAsMerchant = isCashoutAgent && !isSystemCall && bodyActingFlag;

    // ── WPO pickup-code gate (cash payouts only) ────────────────────────
    // Validated BEFORE the atomic claim/processing flip so a wrong code
    // never locks the request into "processing". System auto-approvals
    // (gmail-poll MoMo match, etc.) bypass this gate because cash flows
    // are never auto-routed.
    const wrPayoutMethod = String((wr as any).payout_method || "").toLowerCase();
    const isCashPayout =
      wrPayoutMethod === "cash" || wrPayoutMethod === "cash_pickup";

    // ── Server-side confirmation-SMS verification ───────────────────────
    // When a merchant agent settles a MoMo/bank payout they paste the raw
    // "you have sent…" SMS from their telecom/bank app. We re-parse it HERE
    // (never trusting the client's extraction) and enforce that:
    //   1. the TID in the SMS matches the `reference` submitted, and
    //   2. the amount sent in the SMS equals the amount the user requested.
    // Only enforced for non-cash merchant completions that actually carry an
    // SMS; cash pickups use the WPO code and never provide one.
    const pasteSmsRaw =
      typeof (body as any)?.paste_sms === "string"
        ? (body as any).paste_sms
        : typeof (body as any)?.sms_text === "string"
          ? (body as any).sms_text
          : null;
    const pasteSms = pasteSmsRaw && pasteSmsRaw.trim().length > 0 ? pasteSmsRaw : null;
    if (pasteSms && actingAsMerchant && !isCashPayout) {
      const parsed = parseSMS(pasteSms);
      const requestedAmount = Math.round(Number((wr as any).amount || 0));

      // Fire-and-forget audit log for EVERY pasted SMS (matched or not) so
      // there is a durable record of the raw text, what we extracted, and the
      // validation verdict. Never let an audit hiccup block a real payout.
      const smsAuditIp =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        null;
      const smsAuditUa = req.headers.get("user-agent") || null;
      const smsAuditRole = hasStaffRole
        ? "staff"
        : isCashoutAgent
        ? "cashout_agent"
        : "unknown";
      const logSmsPaste = async (
        result: string,
        code: string | null,
        message: string | null,
      ) => {
        try {
          await admin.from("payout_claim_sms_audit_log").insert({
            withdrawal_request_id: withdrawal_id,
            request_owner_id: (wr as any)?.user_id ?? null,
            raw_sms: pasteSms,
            extracted_tid: parsed.transactionId ?? null,
            extracted_amount: parsed.amount ?? null,
            reference_entered: reference ?? null,
            requested_amount: requestedAmount,
            validation_result: result,
            validation_code: code,
            validation_message: message,
            approver_id: user?.id ?? null,
            approver_email: (user && (user.email as string)) || null,
            approver_role: smsAuditRole,
            payout_method: wrPayoutMethod,
            ip_address: smsAuditIp,
            user_agent: smsAuditUa,
            metadata: { payment_method: payment_method ?? null },
          });
        } catch (e) {
          console.warn("[approve-withdrawal] sms audit log insert failed", e);
        }
      };

      // (2) Amount sent must equal the amount requested.
      if (parsed.amount == null) {
        await logSmsPaste(
          "mismatch",
          "sms_amount_unreadable",
          "Amount could not be read from the pasted SMS.",
        );
        return new Response(
          JSON.stringify({
            error:
              "Could not read the amount from the pasted SMS. Paste the full confirmation message.",
            code: "sms_amount_unreadable",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (Math.round(parsed.amount) !== requestedAmount) {
        await logSmsPaste(
          "mismatch",
          "sms_amount_mismatch",
          `SMS amount ${Math.round(parsed.amount)} does not match requested ${requestedAmount}.`,
        );
        return new Response(
          JSON.stringify({
            error: `Amount mismatch: the SMS shows UGX ${Math.round(parsed.amount).toLocaleString()} sent, but the user requested UGX ${requestedAmount.toLocaleString()}. They must match.`,
            code: "sms_amount_mismatch",
            sms_amount: Math.round(parsed.amount),
            requested_amount: requestedAmount,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // (1) TID in the SMS must match the reference submitted (digit-tail
      // comparison so carrier prefixes/separators don't cause false negatives).
      if (parsed.transactionId) {
        const smsTid = normalizeMomoTid(parsed.transactionId);
        const refTid = normalizeMomoTid(reference);
        if (smsTid.length > 0 && refTid.length > 0 && smsTid !== refTid) {
          await logSmsPaste(
            "mismatch",
            "sms_tid_mismatch",
            "TID in SMS does not match the reference entered.",
          );
          return new Response(
            JSON.stringify({
              error:
                "TID mismatch: the transaction ID in the pasted SMS does not match the reference entered.",
              code: "sms_tid_mismatch",
              sms_tid: parsed.transactionId,
              reference,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // All checks passed for this paste.
      await logSmsPaste("matched", null, null);
    }

    // Hoisted so the post-completion success-burn block can also write
    // an "approved" audit log entry referencing the resolved code row.
    let resolvedPayoutCodeId: string | null = null;
    let resolvedCodeOnFile: string | null = null;
    let logCodeAttempt:
      | ((params: {
          outcome: string;
          errorCode?: string | null;
          errorMessage?: string | null;
          statusResult?: string | null;
          codeOnFile?: string | null;
          payoutCodeId?: string | null;
        }) => Promise<void>)
      | null = null;
    if (isCashPayout && !isSystemCall) {
      // ── Chosen-merchant gate ─────────────────────────────────────────
      // When the requester selected a specific merchant agent for in-person
      // cash pickup, ONLY that merchant (or platform staff) may settle the
      // code. A different cashout agent typing the code is rejected.
      const preferredAgentId = (wr as any).preferred_cashout_agent_id ?? null;
      if (preferredAgentId && !hasStaffRole) {
        if (!agentRow || (agentRow as any).id !== preferredAgentId) {
          return new Response(
            JSON.stringify({
              error: "WRONG_MERCHANT",
              code: "wrong_merchant",
              message:
                "This customer chose a different merchant agent for cash pickup. Only the selected merchant can settle this payout code.",
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      // Audit logger for every WPO code verification attempt. Fire-and-forget
      // so audit DB hiccups never block a real payout decision.
      const ipAddress =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        null;
      const userAgent = req.headers.get("user-agent") || null;
      const approverRole = hasStaffRole
        ? "staff"
        : isCashoutAgent
        ? "cashout_agent"
        : "unknown";
      const approverEmail =
        (user && (user.email as string)) ||
        null;
      logCodeAttempt = async (params: {
        outcome: string;
        errorCode?: string | null;
        errorMessage?: string | null;
        statusResult?: string | null;
        codeOnFile?: string | null;
        payoutCodeId?: string | null;
      }) => {
        try {
          await admin.from("payout_code_audit_log").insert({
            withdrawal_request_id: withdrawal_id,
            payout_code_id: params.payoutCodeId ?? null,
            code_entered: payoutCodeNormalized,
            code_on_file: params.codeOnFile ?? null,
            outcome: params.outcome,
            status_result: params.statusResult ?? null,
            approver_id: user?.id ?? null,
            approver_email: approverEmail,
            approver_role: approverRole,
            request_owner_id: (wr as any)?.user_id ?? null,
            amount: (wr as any)?.amount ?? null,
            error_code: params.errorCode ?? null,
            error_message: params.errorMessage ?? null,
            ip_address: ipAddress,
            user_agent: userAgent,
            metadata: {
              payout_method: wrPayoutMethod,
              reference: reference ?? null,
              payment_method: payment_method ?? null,
            },
          });
        } catch (e) {
          console.warn("[approve-withdrawal] audit log insert failed", e);
        }
      };

      // ── Brute-force gate (rate limit + retry limit) ─────────────────────
      // A 4-digit code only has 10,000 combinations, so an unthrottled
      // merchant could guess it in seconds. We cap failed code entries two
      // ways, both read from the existing payout_code_audit_log:
      //   1. Per withdrawal request: after MAX_FAILED_PER_REQUEST wrong codes
      //      inside RETRY_WINDOW_MS, the code is frozen for everyone.
      //   2. Per merchant (approver): after MAX_FAILED_PER_APPROVER wrong
      //      codes across ANY request inside APPROVER_WINDOW_MS, that merchant
      //      is throttled so they can't iterate across many requests.
      // Only genuine "guesses" count: mismatches and missing-code rejections.
      const FAILED_OUTCOMES = ["mismatch", "rejected", "rate_limited"];
      const RETRY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
      const MAX_FAILED_PER_REQUEST = 5;
      const APPROVER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
      const MAX_FAILED_PER_APPROVER = 20;

      const retrySinceIso = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
      const approverSinceIso = new Date(Date.now() - APPROVER_WINDOW_MS).toISOString();

      try {
        const [{ count: failedForRequest }, { count: failedForApprover }] =
          await Promise.all([
            admin
              .from("payout_code_audit_log")
              .select("id", { count: "exact", head: true })
              .eq("withdrawal_request_id", withdrawal_id)
              .in("outcome", FAILED_OUTCOMES)
              .gte("created_at", retrySinceIso),
            user?.id
              ? admin
                  .from("payout_code_audit_log")
                  .select("id", { count: "exact", head: true })
                  .eq("approver_id", user.id)
                  .in("outcome", FAILED_OUTCOMES)
                  .gte("created_at", approverSinceIso)
              : Promise.resolve({ count: 0 } as any),
          ]);

        const requestLocked = (failedForRequest ?? 0) >= MAX_FAILED_PER_REQUEST;
        const approverLocked = (failedForApprover ?? 0) >= MAX_FAILED_PER_APPROVER;

        if (requestLocked || approverLocked) {
          const scope = requestLocked ? "request" : "approver";
          await logCodeAttempt({
            outcome: "rate_limited",
            errorCode: "CASH_CODE_RATE_LIMITED",
            errorMessage:
              `Too many failed code attempts (scope=${scope}, ` +
              `request=${failedForRequest ?? 0}, approver=${failedForApprover ?? 0})`,
            statusResult: "rejected",
          });
          const retryMinutes = requestLocked
            ? Math.ceil(RETRY_WINDOW_MS / 60000)
            : Math.ceil(APPROVER_WINDOW_MS / 60000);
          return new Response(
            JSON.stringify({
              error: "CASH_CODE_RATE_LIMITED",
              code: "cash_code_rate_limited",
              retry_after: retryMinutes * 60,
              message: requestLocked
                ? `Too many incorrect codes were entered for this payout. It is locked for about ${retryMinutes} minutes to prevent guessing. Ask the customer to confirm the exact code, then try again later.`
                : `You've entered too many incorrect codes recently. Please wait about ${retryMinutes} minutes before trying again.`,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        // Fail open on a counter read error — never block a legitimate payout
        // because the audit table hiccuped. Real code validation still runs.
        console.warn("[approve-withdrawal] brute-force counter read failed", e);
      }

      if (!payoutCodeNormalized) {
        await logCodeAttempt({
          outcome: "rejected",
          errorCode: "CASH_CODE_REQUIRED",
          errorMessage: "No WPO code provided",
          statusResult: "rejected",
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_REQUIRED",
            code: "cash_code_required",
            message:
              "Cash withdrawals require the WPO-XXXXX pickup code. Ask the user for the code they received by email and enter it before approving.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Fetch the canonical code row for this specific withdrawal. We
      // never trust the code alone — it MUST be tied to this exact
      // withdrawal_request_id, otherwise a code from another request
      // could be replayed here.
      const { data: codeRow, error: codeErr } = await admin
        .from("payout_codes")
        .select("id, code, status, expires_at, withdrawal_request_id")
        .eq("withdrawal_request_id", withdrawal_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (codeErr) {
        console.error("[approve-withdrawal] payout_codes lookup failed", codeErr);
        await logCodeAttempt({
          outcome: "lookup_failed",
          errorCode: "CASH_CODE_LOOKUP_FAILED",
          errorMessage: codeErr.message || "Lookup failed",
          statusResult: "error",
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_LOOKUP_FAILED",
            code: "cash_code_lookup_failed",
            message: "Could not verify the WPO pickup code right now. Retry in a moment.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!codeRow) {
        await logCodeAttempt({
          outcome: "rejected",
          errorCode: "CASH_CODE_NOT_FOUND",
          errorMessage: "No WPO code exists for this withdrawal",
          statusResult: "rejected",
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_NOT_FOUND",
            code: "cash_code_not_found",
            message:
              "No WPO pickup code exists for this cash request. Reject and ask the user to resubmit so a fresh code is issued.",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const onFileCode = String(codeRow.code || "").trim().toUpperCase();
      if (onFileCode !== payoutCodeNormalized) {
        await logCodeAttempt({
          outcome: "mismatch",
          errorCode: "CASH_CODE_MISMATCH",
          errorMessage: "Entered code does not match issued code",
          statusResult: "rejected",
          codeOnFile: onFileCode,
          payoutCodeId: codeRow.id,
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_MISMATCH",
            code: "cash_code_mismatch",
            message:
              "The WPO code you entered does not match the code issued for this request. Double-check the user's email/SMS and try again.",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (codeRow.status === "paid") {
        await logCodeAttempt({
          outcome: "already_used",
          errorCode: "CASH_CODE_ALREADY_USED",
          errorMessage: "WPO code already paid out",
          statusResult: "rejected",
          codeOnFile: onFileCode,
          payoutCodeId: codeRow.id,
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_ALREADY_USED",
            code: "cash_code_already_used",
            message:
              "This WPO code has already been paid out. The same code cannot settle a second payout.",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (codeRow.status === "expired") {
        await logCodeAttempt({
          outcome: "expired",
          errorCode: "CASH_CODE_EXPIRED",
          errorMessage: "WPO code already marked expired",
          statusResult: "rejected",
          codeOnFile: onFileCode,
          payoutCodeId: codeRow.id,
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_EXPIRED",
            code: "cash_code_expired",
            message:
              "This WPO code has expired. Reject the request and ask the user to resubmit so a fresh code is issued.",
          }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const expiresAtMs = codeRow.expires_at
        ? new Date(codeRow.expires_at).getTime()
        : 0;
      if (!expiresAtMs || expiresAtMs <= Date.now()) {
        // Best-effort flip to 'expired' so future approvals fail fast.
        await admin
          .from("payout_codes")
          .update({ status: "expired" })
          .eq("id", codeRow.id);
        await logCodeAttempt({
          outcome: "expired",
          errorCode: "CASH_CODE_EXPIRED",
          errorMessage: "WPO code TTL elapsed",
          statusResult: "rejected",
          codeOnFile: onFileCode,
          payoutCodeId: codeRow.id,
        });
        return new Response(
          JSON.stringify({
            error: "CASH_CODE_EXPIRED",
            code: "cash_code_expired",
            message:
              "This WPO code has expired. Reject the request and ask the user to resubmit so a fresh code is issued.",
          }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Code passed all gates — record the verified attempt up-front. The
      // final 'approved' outcome is logged after the payout completes.
      await logCodeAttempt({
        outcome: "verified",
        statusResult: "verified",
        codeOnFile: onFileCode,
        payoutCodeId: codeRow.id,
      });
      resolvedPayoutCodeId = codeRow.id;
      resolvedCodeOnFile = onFileCode;
    }

    // Only allow approval of live, unpaid requests. Re-approving `rejected`
    // requests is blocked because old refund paths could restore balance after
    // physical payout, then allow the same row to be approved again.
    const approvableStatuses = ["pending", "requested", "manager_approved"];
    if (!approvableStatuses.includes(wr.status)) {
      return new Response(JSON.stringify({ error: `Cannot approve: withdrawal is already '${wr.status}'` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Double-payout safeguard #1: same MoMo TID / bank reference cannot
    //    be used for two different withdrawals. FinOps sometimes pastes the
    //    same MoMo confirmation TID into a duplicate request — that means
    //    the cash physically only moved once and we must NOT debit twice.
    //
    //    EXCEPTION — POOL-FUNDED SKYBUBBLES BULK SETTLEMENT: one SKYBUBBLES
    //    bulk-bank email is a SINGLE physical bank transfer that legitimately
    //    covers MANY proxy-partner payouts. They all share the same bank
    //    reference by design, so the duplicate-reference guard must NOT apply
    //    here — otherwise only the first leg of a bulk disbursement settles
    //    and the rest get a false 409 DUPLICATE_REFERENCE. The bulk settler
    //    already enforces one allocation per request via
    //    `bulk_bank_payout_allocations`, so double-payout is still prevented.
    const refTrimmed = reference.trim().toUpperCase();
    const { data: dupRefRows } = poolFunded
      ? { data: null }
      : await admin
          .from("withdrawal_requests")
          .select("id, status, user_id, amount")
          .eq("fin_ops_reference", refTrimmed)
          .neq("id", withdrawal_id)
          .in("status", ["completed", "processing", "paid", "disbursed"])
          .limit(1);
    if (!poolFunded && dupRefRows && dupRefRows.length > 0) {
      const dup = dupRefRows[0] as any;
      return new Response(
        JSON.stringify({
          error: "DUPLICATE_REFERENCE",
          message:
            `MoMo/bank reference "${refTrimmed}" was already used on withdrawal ${dup.id} ` +
            `(status: ${dup.status}). The same physical payment cannot settle two requests. ` +
            `If this is a new payout, enter the new TID; if the original request is wrong, reject it instead.`,
          existing_withdrawal_id: dup.id,
          existing_status: dup.status,
          code: "duplicate_reference",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Double-payout safeguard #2: ATOMIC CLAIM.
    //    Compare-and-set the row's status from one of the approvable values
    //    to 'processing'. If two operators (or two clicks) hit this endpoint
    //    in parallel, only one UPDATE returns a row — the other gets nothing
    //    and is rejected with 409 BEFORE any ledger debit is posted.
    //    This closes the long TOCTOU window between the status check above
    //    and the final 'completed' update at the bottom of this function.
    const previousStatus: string = wr.status;
    const { data: claimedRows, error: claimErr } = await admin
      .from("withdrawal_requests")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        processing_started_by: user.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", withdrawal_id)
      .in("status", approvableStatuses)
      .select("id");
    if (claimErr || !claimedRows || claimedRows.length === 0) {
      // Re-fetch current status so the operator sees what blocked them.
      const { data: now } = await admin
        .from("withdrawal_requests")
        .select("status, fin_ops_reference")
        .eq("id", withdrawal_id)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          error: "ALREADY_BEING_PROCESSED",
          message:
            `This withdrawal is already being processed by another operator ` +
            `(current status: ${now?.status ?? "unknown"}). Refresh the queue before retrying.`,
          current_status: now?.status ?? null,
          existing_reference: now?.fin_ops_reference ?? null,
          code: "already_being_processed",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Helper used by the early-failure paths below to release the claim so
    // the operator can retry after fixing the issue (insufficient balance,
    // wallet drift, ledger write failure, etc.). The claim is held only
    // when we're past the point of no return (ledger entries posted).
    //
    // IMPORTANT: a failed confirmation must FULLY return the request to the
    // shared queue — not just flip the status back to pending. Previously the
    // row was reverted to `previousStatus` while STILL assigned to the merchant
    // agent, so it sat in their "Claimed by you" list, kept the one-claim lock
    // engaged, and blocked them from ever claiming another payout. Clearing the
    // assignment (assigned_cashout_agent_id / dispatched_at) unblocks the agent
    // immediately and lets any agent (or FinOps) pick the request back up.
    const releaseClaim = async () => {
      try {
        await admin
          .from("withdrawal_requests")
          .update({
            status: previousStatus,
            assigned_cashout_agent_id: null,
            dispatched_at: null,
            processing_started_at: null,
            processing_started_by: null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", withdrawal_id)
          .eq("status", "processing");
      } catch (e) {
        console.error("[approve-withdrawal] releaseClaim failed:", (e as Error).message);
      }
    };

    // Proxy payouts are requested by the agent and funded from the proxy
    // agent's wallet. Newer rows are partner-owned for visibility
    // (`user_id = partner`) but carry `agent_id` / `proxy_partner_id`, so
    // detection must use those structural fields instead of only checking
    // whether the reason starts with the legacy phrase.
    const reasonLooksProxy =
      typeof wr.reason === "string" &&
      wr.reason.includes("Proxy payout delivery for");

    // Landlord-float payouts: an agent's CFO-funded landlord float is paid out
    // by a merchant agent through this same queue. The float was already
    // deducted at disburse time (agent_landlord_float), so we MUST NOT debit
    // the agent's withdrawable wallet here. The merchant still gets the
    // principal reimbursement + 0.5% commission like any other cash payout.
    const isLandlordFloatPayout =
      typeof wr.reason === "string" && wr.reason.startsWith("Landlord float payout");

    let proxyPartnerId =
      (wr as any).proxy_partner_id ||
      (wr.linked_party && wr.linked_party !== wr.user_id ? wr.linked_party : null) ||
      ((wr as any).beneficiary_id && (wr as any).beneficiary_id !== (wr as any).agent_id
        ? (wr as any).beneficiary_id
        : null);

    const proxyAgentCandidates = [
      (wr as any).agent_id,
      (wr as any).initiated_by,
      wr.linked_party && wr.linked_party !== wr.user_id ? wr.user_id : null,
    ].filter((id, index, arr): id is string =>
      typeof id === "string" && id.length > 0 && id !== proxyPartnerId && arr.indexOf(id) === index
    );

    let managedProxyAgentId: string | null = null;
    if (proxyPartnerId && proxyAgentCandidates.length > 0) {
      const { data: managedAssignment } = await admin
        .from("proxy_agent_assignments")
        .select("agent_id")
        .eq("beneficiary_id", proxyPartnerId)
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .eq("is_managed_account", true)
        .in("agent_id", proxyAgentCandidates)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      managedProxyAgentId = managedAssignment?.agent_id ?? null;
    }

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

    let isProxyPayout =
      Boolean(proxyPartnerId && (reasonLooksProxy || managedProxyAgentId || proxyAgentCandidates.length > 0)) ||
      (reasonLooksProxy && ((wr.linked_party && wr.linked_party !== wr.user_id) || isProxyAgent));

    // ── Resolve the proxy agent whose wallet FUNDS this proxy payout ──────
    // Policy (per product owner): a proxy agent who requests a withdrawal on
    // behalf of their partner is debited from THEIR OWN wallet. Resolve the
    // funding agent in priority order: explicit managed assignment → the
    // agent recorded on the request (agent_id / initiated_by) → any active +
    // approved proxy assignment for the partner. The partner remains the
    // beneficiary for audit / settlement.
    let resolvedProxyAgentId: string | null =
      managedProxyAgentId ?? (proxyAgentCandidates[0] ?? null);
    if (isProxyPayout && proxyPartnerId && !resolvedProxyAgentId) {
      const { data: anyAssignment } = await admin
        .from("proxy_agent_assignments")
        .select("agent_id")
        .eq("beneficiary_id", proxyPartnerId)
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("is_managed_account", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedProxyAgentId =
        (anyAssignment?.agent_id && anyAssignment.agent_id !== proxyPartnerId)
          ? (anyAssignment.agent_id as string)
          : null;
    }

    const amount = Number(wr.amount);
    let beneficiaryUserId =
      isProxyPayout && proxyPartnerId ? proxyPartnerId : wr.user_id;
    // Debit the resolved proxy agent's wallet. Fall back to the partner only
    // if no agent could be resolved (keeps legacy partner-owned rows working).
    let fundingUserId = isProxyPayout && resolvedProxyAgentId
      ? resolvedProxyAgentId
      : (isProxyPayout && proxyPartnerId ? proxyPartnerId : wr.user_id);

    // ── Partner → Proxy Agent auto-routing ────────────────────────────────
    // Policy: whenever the requester (`wr.user_id`) is a partner with an
    // ACTIVE + APPROVED `proxy_agent_assignment`, debit the assigned proxy
    // agent's wallet instead of the partner's — even when the request was
    // not originally tagged as a proxy payout. This guarantees that the
    // physical cash (which sits on the proxy agent's wallet per the
    // Managed-Proxy Payout Routing rule) is the one debited, even if the
    // partner's own wallet shows zero. Skipped when the request already
    // carries proxy metadata (handled by the standard pipeline above) or
    // when the partner has no active proxy assignment at all.
    let autoRoutedToProxy = false;
    let autoRouteAssignedAgentId: string | null = null;
    if (forceRequesterDebit) {
      // Override any inferred proxy routing — debit the requester directly.
      proxyPartnerId = null;
      beneficiaryUserId = wr.user_id;
      fundingUserId = wr.user_id;
      isProxyPayout = false;
      managedProxyAgentId = null;
      console.log(
        `[approve-withdrawal] force_requester_debit=true — debiting requester ${wr.user_id} ` +
        `(bypassing proxy auto-routing) for system MoMo auto-approval`
      );
    } else if (!isProxyPayout && !actingAsMerchant) {
      // NOTE: skipped when `actingAsMerchant` is true. Under the Float model a
      // merchant dispenses the physical cash from THEIR OWN float bucket, so
      // that float is the sole funding source — we must NOT re-route the
      // funding debit onto some other proxy agent's wallet. Re-routing here
      // would (a) debit the wrong party and (b) set isProxyPayout=true, which
      // silently skips the merchant-float-consume block below, leaving the
      // merchant's float untouched. For merchant-settled cash-outs we keep
      // fundingUserId = the requester (their withdrawable liability is
      // discharged) and let the float consume debit the merchant's float.
      const { data: partnerAssignment } = await admin
        .from("proxy_agent_assignments")
        .select("agent_id, is_managed_account, created_at")
        .eq("beneficiary_id", wr.user_id)
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("is_managed_account", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (partnerAssignment?.agent_id && partnerAssignment.agent_id !== wr.user_id) {
        autoRoutedToProxy = true;
        autoRouteAssignedAgentId = partnerAssignment.agent_id as string;
        proxyPartnerId = wr.user_id;
        beneficiaryUserId = wr.user_id;
        fundingUserId = partnerAssignment.agent_id as string;
        isProxyPayout = true;
        console.log(
          `[approve-withdrawal] auto-routed partner ${wr.user_id} withdrawal to ` +
          `assigned proxy agent ${fundingUserId} (managed=${partnerAssignment.is_managed_account})`
        );
      }
    }

    console.log(
      `[approve-withdrawal] withdrawal ${withdrawal_id}: isProxyPayout=${isProxyPayout}, ` +
      `request_owner=${wr.user_id}, debiting=${fundingUserId}, beneficiary=${beneficiaryUserId}, ` +
      `managed_proxy_agent=${managedProxyAgentId ?? "n/a"}, amount=${amount}`
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
    // Managed proxy partner delivery is funded by the proxy agent wallet;
    // the credited returns may sit in either withdrawable or legacy float,
    // but must never draw from advance_balance.
    const withdrawable = walletWithdrawable;
    const cachedSpendable = isProxyPayout
      ? Math.max(0, walletWithdrawable) + Math.max(0, walletFloat)
      : withdrawable;
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

      // Only use the partner-EARMARK gate for legacy custody / managed-ROI
      // rows that explicitly carry `linked_party` (ROI credits parked on the
      // agent wallet, tagged to the partner). Agent-initiated proxy
      // withdrawals from the dialog have NO linked_party — they spend the
      // agent's own withdrawable/float and must use the agent full-wallet gate
      // below (the `else if (isProxyPayout)` branch).
      const proxyLedgerPartnerId =
        isProxyPayout && wr.linked_party && String(wr.linked_party) !== String(fundingUserId)
          ? String(wr.linked_party)
          : null;
      if (proxyLedgerPartnerId) {

        const { data: linkedRows, error: linkedErr } = await admin
          .from("general_ledger")
          .select("amount, direction, category, account")
          .eq("user_id", fundingUserId)
          .eq("ledger_scope", "wallet")
          .eq("linked_party", proxyLedgerPartnerId)
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
          .neq("id", withdrawal_id)
          .or(`user_id.eq.${fundingUserId},agent_id.eq.${fundingUserId},initiated_by.eq.${fundingUserId}`)
          .or(`linked_party.eq.${proxyLedgerPartnerId},proxy_partner_id.eq.${proxyLedgerPartnerId},beneficiary_id.eq.${proxyLedgerPartnerId}`)
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
        // Partner-owned managed-proxy rows have `user_id = partner` and no
        // linked_party, but `fundingUserId` was resolved above to the proxy
        // agent. Gate against that agent's wallet ledger and allow draining
        // either float or withdrawable; the partner identity remains on the
        // withdrawal row and settlement table.
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
          .neq("id", withdrawal_id)
          .or(`user_id.eq.${fundingUserId},agent_id.eq.${fundingUserId},initiated_by.eq.${fundingUserId}`)
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

    // For every proxy payout, the resolved proxy agent ledger is authoritative
    // (see ledgerAvailable computation above). The wallets view/cache can lag
    // or show zero on partner-owned proxy rows, so never let it veto a
    // ledger-earmarked delivery that will be debited from `fundingUserId`.
    //
    // For NORMAL (non-proxy) payouts the `wallets` table is now a read-only
    // view derived from the ledger (`v_user_wallet_strict`), so the legacy
    // `cachedSpendable` figure is just another rendering of the same ledger
    // and CANNOT be more authoritative. We therefore trust the ledger figure
    // directly. This is what unblocks "approve full balance": when the ledger
    // proves UGX X is available, the cache can no longer veto it.
    const totalSpendable = ledgerAvailable;
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

    if (!poolFunded && !isLandlordFloatPayout && (!wallet || totalSpendable < amount)) {
      const failureReason = isProxyPayout
        ? `Insufficient proxy agent wallet balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. This payout debits the assigned proxy agent wallet for the selected partner.`
        : `Insufficient withdrawable balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. Cached withdrawable UGX ${Math.round(cachedSpendable).toLocaleString()}, ledger-true UGX ${Math.round(ledgerAvailable).toLocaleString()}. Float and advance buckets cannot fund payouts.`;
      await auditFailedWithdrawalAttempt(failureReason, "INSUFFICIENT_WITHDRAWABLE");
      await releaseClaim();
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

    // ── Merchant-agent FLOAT pre-check (Float model, 2026) ────────────────
    // Merchant agents settle customer cash-outs from COMPANY FLOAT that the
    // CFO/treasury pre-loaded into their float bucket — they no longer front
    // their own cash for a withdrawable reimbursement. Block the claim up-front
    // (before any debit) if the merchant does not hold enough float, so we
    // never process a payout the merchant can't cover. This also applies when
    // the merchant is cashing out their own wallet: the user's withdrawable
    // balance is reduced by the normal withdrawal leg, and the physical company
    // cash/float they dispensed must still leave the merchant float bucket.
    //
    // PROXY PAYOUTS (2026-07): a merchant who delivers a proxy partner payout
    // physically dispenses company cash from THEIR OWN float too, so the payout
    // must drain BOTH the proxy agent's wallet (funding debit below) AND the
    // merchant's float (consume block further down). We therefore require and
    // check the merchant's float here for proxy payouts as well — if they don't
    // hold enough float the CFO/treasury must top them up before settling.
    // (pool-funded settlements already debit float in the main block, so they
    // stay excluded to avoid a double debit.)
    let merchantFloatAvailable = 0;
    if (
      actingAsMerchant &&
      !poolFunded &&
      amount > 0
    ) {
      const { data: merchantWallet } = await admin
        .from("wallets")
        .select("float_balance")
        .eq("user_id", user.id)
        .maybeSingle();
      merchantFloatAvailable = Number((merchantWallet as any)?.float_balance ?? 0);
      if (merchantFloatAvailable < amount) {
        const floatMsg =
          `Insufficient merchant float. You hold UGX ${Math.round(merchantFloatAvailable).toLocaleString()} ` +
          `but this payout needs UGX ${amount.toLocaleString()}. Ask the CFO/treasury to top up your float before claiming.`;
        await auditFailedWithdrawalAttempt(floatMsg, "INSUFFICIENT_MERCHANT_FLOAT");
        await releaseClaim();
        return new Response(
          JSON.stringify({
            success: false,
            error: floatMsg,
            code: "INSUFFICIENT_MERCHANT_FLOAT",
            float_available: Math.round(merchantFloatAvailable),
            requested: amount,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
    // BUCKET ROUTING: normal external withdrawals drain withdrawable. Managed
    // proxy ROI is always credited as withdrawable on the proxy agent wallet,
    // earmarked by linked_party=partner, so FinOps must debit that same agent
    // withdrawable bucket in one full amount — never split against float.
    const refUpper = reference.trim().toUpperCase();
    const baseDesc = `${payment_method} ref: ${refUpper}`;
    const nowIso = new Date().toISOString();

    // When this withdrawal was auto-routed to a proxy agent, try to find a
    // matching outgoing Gmail payout email (by TID or amount+phone within
    // the last 7 days) and stamp the match into ledger metadata for audit.
    let autoRouteEmail: { gmail_message_id: string | null; gmail_transaction_id: string | null; email_tid: string | null } | null = null;
    if (autoRoutedToProxy) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        let match: any = null;
        if (refUpper && refUpper.length >= 3) {
          const { data } = await (admin.from("gmail_transactions") as any)
            .select("id, gmail_message_id, transaction_id")
            .eq("transaction_id", refUpper)
            .in("direction", ["out", "charge"])
            .order("internal_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          match = data;
        }
        if (!match) {
          const { data } = await (admin.from("gmail_transactions") as any)
            .select("id, gmail_message_id, transaction_id")
            .in("direction", ["out", "charge"])
            .eq("amount", amount)
            .gte("internal_date", sevenDaysAgo)
            .order("internal_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          match = data;
        }
        if (match) {
          autoRouteEmail = {
            gmail_message_id: match.gmail_message_id ?? null,
            gmail_transaction_id: match.id ?? null,
            email_tid: match.transaction_id ?? null,
          };
        }
      } catch (e) {
        console.warn("[approve-withdrawal] gmail email lookup failed:", (e as Error).message);
      }
    }
    const autoRouteMeta = autoRoutedToProxy
      ? {
          auto_routed_via_proxy: true,
          partner_id: wr.user_id,
          proxy_agent_id: autoRouteAssignedAgentId,
          ...(autoRouteEmail || {}),
        }
      : undefined;

    // Landlord-float payouts skip the agent wallet debit entirely (float already
    // deducted in agent_landlord_float). For all other payouts we post the
    // standard withdrawable/float/pool debit legs.
    let txnGroupId: any = null;
    if (!isLandlordFloatPayout) {
    // POOL-FUNDED settlements debit FLOAT (company money) after an in-transaction
    // top-up; all other payouts debit withdrawable as before.
    const proxyFloatPortion = 0;
    const proxyWithdrawablePortion = isProxyPayout ? amount - proxyFloatPortion : 0;
    const withdrawablePortion = poolFunded ? 0 : (isProxyPayout ? proxyWithdrawablePortion : amount);
    const floatPortion = poolFunded ? amount : proxyFloatPortion;

    const debitEntries: any[] = [];
    if (poolFunded) {
      // Leg 1: company pool funds the proxy agent's FLOAT bucket (platform → wallet).
      debitEntries.push({
        user_id: fundingUserId,
        amount,
        direction: "cash_in",
        category: "agent_float_assignment",
        ledger_scope: "wallet",
        description: `Pool top-up for proxy partner payout – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
        recipient_type: "operational_wallet",
        wallet_bucket: "float",
        routing_source: "pool_funded_proxy_bank_float_topup",
        ...(autoRouteMeta ? { metadata: autoRouteMeta } : {}),
      });
      // Leg 1b: platform-side counterparty for the pool top-up (pool money out).
      debitEntries.push({
        amount,
        direction: "cash_out",
        category: "agent_float_funding",
        ledger_scope: "platform",
        description: `Pool deploys company funds for proxy partner payout – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
      });
      // Leg 2: the proxy partner payout drains the agent's FLOAT (wallet → out).
      debitEntries.push({
        user_id: fundingUserId,
        amount,
        direction: "cash_out",
        category: "proxy_partner_withdrawal",
        ledger_scope: "wallet",
        description: `Proxy partner payout from pool float – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
        linked_party: wr.linked_party || beneficiaryUserId,
        recipient_type: "operational_wallet",
        wallet_bucket: "float",
        routing_source: "pool_funded_proxy_bank_float_debit",
        ...(autoRouteMeta ? { metadata: autoRouteMeta } : {}),
      });
    } else if (withdrawablePortion > 0) {
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
        recipient_type: "user",
        wallet_bucket: "withdrawable",
        routing_source: isProxyPayout
          ? "managed_proxy_withdrawal_agent_withdrawable_debit"
          : "standard_withdrawal_withdrawable_debit",
        ...(autoRouteMeta ? { metadata: autoRouteMeta } : {}),
      });
    }
    if (!poolFunded && floatPortion > 0) {
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
          await releaseClaim();
          return new Response(
            JSON.stringify({ error: "BALANCE_MISMATCH", detail: recheck }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    const { data: _txnGroupId, error: ledgerErr } = await admin.rpc("create_ledger_transaction", {
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
    txnGroupId = _txnGroupId;

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
          ? `Insufficient proxy agent wallet balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. This payout debits the assigned proxy agent wallet for the selected partner.`
          : `Insufficient withdrawable balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. Cached withdrawable UGX ${Math.round(cachedSpendable).toLocaleString()}, ledger-true UGX ${Math.round(ledgerAvailable).toLocaleString()}. Float and advance buckets cannot fund payouts.`
        : "Failed to record ledger entry: " + ledgerMessage;
      if (isInsufficientBalance) {
        await auditFailedWithdrawalAttempt(failureReason, "INSUFFICIENT_WITHDRAWABLE");
      }
      await releaseClaim();
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
    } // end if (!isLandlordFloatPayout)

    // Update withdrawal request status
    const { error: updateErr } = await admin
      .from("withdrawal_requests")
      .update({
        status: "completed",
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

    // ── Landlord-float payout completion ─────────────────────────────────
    // When a merchant settles a landlord-float payout, advance the linked
    // landlord_payouts row to 'awaiting_agent_receipt' (the same state FinOps
    // used to set after disbursing) so the existing agent receipt-upload flow
    // continues, SMS the landlord, and notify the agent.
    if (isLandlordFloatPayout) {
      try {
        const landlordPayoutId = (wr as any).landlord_payout_id ?? null;
        const momoRef = reference.trim().toUpperCase();
        if (landlordPayoutId) {
          const { data: lp } = await admin
            .from("landlord_payouts")
            .update({
              status: "awaiting_agent_receipt",
              finops_disbursed_by: user.id,
              finops_disbursed_at: new Date().toISOString(),
              momo_reference: momoRef,
              disbursed_at: new Date().toISOString(),
            } as any)
            .eq("id", landlordPayoutId)
            .eq("status", "pending_merchant_payout")
            .select("id, agent_id, landlord_name, landlord_phone, mobile_money_provider, amount")
            .maybeSingle();

          if (lp) {
            // SMS the landlord that they have been paid (best-effort).
            if (lp.landlord_phone) {
              admin.functions.invoke("sms-otp", {
                body: {
                  skipOtp: true,
                  phone: lp.landlord_phone,
                  message: `Welile sent UGX ${Number(lp.amount).toLocaleString()} to your ${lp.mobile_money_provider ?? "mobile money"} number. Ref: ${momoRef}`,
                },
              }).catch((e: unknown) =>
                console.error("[approve-withdrawal] landlord SMS failed:", e),
              );
            }
            // Notify the agent to upload the receipt (best-effort).
            try {
              await admin.from("notifications").insert({
                user_id: lp.agent_id,
                type: "landlord_payout_disbursed",
                title: "Landlord paid",
                message: `A merchant agent sent UGX ${Number(lp.amount).toLocaleString()} to ${lp.landlord_name ?? "the landlord"}. Please upload the receipt now.`,
                metadata: { payout_id: lp.id, momo_reference: momoRef },
              });
            } catch { /* non-blocking */ }
          }
        }
      } catch (lpEx) {
        console.error("[approve-withdrawal] landlord payout completion failed:", lpEx);
      }
    }

    // Burn the WPO pickup code so it cannot be replayed for another
    // payout. We do this AFTER the withdrawal flips to 'completed' so a
    // late ledger failure doesn't strand the code in 'paid' while the
    // request itself rolled back.
    if (isCashPayout && payoutCodeNormalized) {
      try {
        await admin
          .from("payout_codes")
          .update({
            status: "paid",
            paid_by: user.id,
            paid_at: new Date().toISOString(),
          })
          .eq("withdrawal_request_id", withdrawal_id)
          .neq("status", "paid");
      } catch (e) {
        console.warn("[approve-withdrawal] payout_codes burn failed", e);
      }
      if (logCodeAttempt) {
        await logCodeAttempt({
          outcome: "approved",
          statusResult: "approved",
          codeOnFile: resolvedCodeOnFile,
          payoutCodeId: resolvedPayoutCodeId,
        });
      }
    }

    // ── Proxy payout settlements ────────────────────────────────────────
    // For proxy partner withdrawals, FIFO-close the partner's CFO-approved
    // unsettled ROI approvals up to the withdrawn amount. This permanently
    // retires the approval cards from the agent's Proxy Partners list.
    try {
      // IMPORTANT: reuse the partner already resolved by the main pipeline
      // above (`proxyPartnerId`). The previous local recompute only looked at
      // `proxy_partner_id` / `linked_party`, so Custody-V2 partner-owned rows
      // (user_id = partner, no linked_party) and auto-routed partner
      // withdrawals resolved to null here and NEVER wrote a settlement row —
      // leaving the approval "open" forever, so paid partners kept reappearing
      // and their card totals ballooned every ROI cycle.
      const settlePartnerId =
        proxyPartnerId ||
        (beneficiaryUserId && beneficiaryUserId !== fundingUserId ? beneficiaryUserId : null) ||
        ((wr as any).proxy_partner_id ?? null) ||
        (wr.linked_party && wr.linked_party !== wr.user_id ? wr.linked_party : null);
      if (settlePartnerId) {
        const proxyPartnerId = settlePartnerId;
        const { data: portfolios } = await admin
          .from("investor_portfolios")
          .select("id, portfolio_code")
          .eq("investor_id", proxyPartnerId);
        // SCOPE TO THE ROUTED PORTFOLIO. A partner can hold several portfolios,
        // each with its own ROI payout shown as a separate proxy card. The
        // withdrawal stamps "Route: portfolio <id|code>" into its reason, so we
        // settle ONLY that portfolio's approvals — settling FIFO across every
        // portfolio would retire a sibling portfolio's still-owed approval and
        // make that card vanish even though it was never paid.
        let portfolioIds = (portfolios || []).map((p: any) => p.id);
        const _routeMatch = wr.reason
          ? wr.reason.match(/Route:\s*portfolio\s+(\S+)/i)
          : null;
        if (_routeMatch) {
          const _token = _routeMatch[1];
          const _isUuid = /^[0-9a-fA-F-]{36}$/.test(_token);
          const _scoped = (portfolios || []).find((p: any) =>
            _isUuid ? p.id === _token : p.portfolio_code === _token,
          );
          if (_scoped) {
            portfolioIds = [_scoped.id];
            console.log(
              `[approve-withdrawal] proxy settlement scoped to routed portfolio ${_scoped.id}`,
            );
          } else {
            console.warn(
              `[approve-withdrawal] routed portfolio "${_token}" not found for partner ${proxyPartnerId}; settling across all portfolios`,
            );
          }
        }
        if (portfolioIds.length > 0) {
          const { data: openApprovals } = await admin
            .from("pending_wallet_operations")
            .select("id, amount, target_wallet_user_id")
            .eq("category", "roi_payout")
            .eq("status", "approved")
            .not("metadata->coo_approved_by", "is", null)
            .in("source_id", portfolioIds)
            // Settle NEWEST approvals first so the order matches the UI, which
            // displays and lets the agent act on the newest CFO-approved payout
            // per partner (see ProxyPartnerFunds partnerBalances: rows are
            // sorted descending by created_at and allocated newest-first).
            // Settling oldest-first here retired stale old approvals while the
            // newest (displayed) card stayed visible forever — making already
            // paid-out proxy cards reappear.
            .order("created_at", { ascending: false });

          // Drop already-settled
          const { data: existing } = await admin
            .from("proxy_payout_settlements")
            .select("approval_id")
            .in("approval_id", (openApprovals || []).map((o: any) => o.id));
          const settledIds = new Set((existing || []).map((r: any) => r.approval_id));
          const unsettled = (openApprovals || []).filter((o: any) => !settledIds.has(o.id));

          let remaining = Number(amount) || 0;
          const rows: any[] = [];
          for (const op of unsettled) {
            if (remaining <= 0) break;
            const opAmt = Number(op.amount) || 0;
            const settle = Math.min(opAmt, remaining);
            rows.push({
              approval_id: op.id,
              withdrawal_id: withdrawal_id,
              partner_id: proxyPartnerId,
              agent_id: op.target_wallet_user_id || (wr as any).agent_id || user.id,
              amount_settled: settle,
              notes: `FIFO-settled by withdrawal ${withdrawal_id}`,
            });
            remaining -= opAmt;
          }
          if (rows.length > 0) {
            const { error: settleErr } = await admin
              .from("proxy_payout_settlements")
              .insert(rows);
            if (settleErr) {
              console.warn("[approve-withdrawal] settlement insert error:", settleErr);
            } else {
              console.log(`[approve-withdrawal] settled ${rows.length} proxy approval(s) for partner ${proxyPartnerId}`);
            }
          }
        }
      }
    } catch (settleEx) {
      console.warn("[approve-withdrawal] proxy settlement step failed:", settleEx);
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

    if (autoRoutedToProxy) {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action_type: "withdrawal_auto_routed_to_proxy",
        record_id: withdrawal_id,
        table_name: "withdrawal_requests",
        metadata: {
          reason: `Auto-routed partner withdrawal to active proxy agent (TID: ${autoRouteEmail?.email_tid ?? "none"})`,
          partner_id: wr.user_id,
          proxy_agent_id: autoRouteAssignedAgentId,
          amount,
          fin_ops_reference: reference.trim().toUpperCase(),
          gmail_match: autoRouteEmail,
        },
      });
    }

    // ── Merchant-agent FLOAT consumption (Float model, 2026) ─────────────
    // Merchant agents no longer front their own cash for a withdrawable
    // reimbursement. They hold COMPANY FLOAT (pre-loaded by CFO/treasury) and
    // every cash payout they settle draws the principal DOWN from their float
    // bucket. Net effect: the withdrawing user's withdrawable liability is
    // discharged against the company float the merchant was holding — nothing
    // ever lands in the merchant's withdrawable. Float sufficiency was already
    // verified up-front; the DB non-negative constraint is the hard backstop.
    // Applies to standard cash payouts AND proxy partner deliveries settled by
    // a merchant agent: in both cases the merchant physically dispenses company
    // cash from their float, so it must be consumed here (proxy payouts also
    // drain the proxy agent's wallet via the funding debit above — draining
    // both is intentional). Pool-funded settlements already debit float in the
    // main block, so they stay excluded to avoid a double debit.
    let merchantFloatConsumed = 0;
    if (
      actingAsMerchant &&
      !poolFunded &&
      amount > 0
    ) {
      try {
        const txDate = new Date().toISOString();
        const { error: floatErr } = await admin.rpc("create_ledger_transaction", {
          entries: [
            {
              user_id: user.id, ledger_scope: "wallet", direction: "cash_out",
              amount, category: "agent_float_settlement",
              recipient_type: "operational_wallet", wallet_bucket: "float",
              source_table: "withdrawal_requests", source_id: withdrawal_id,
              description: `Company float used to settle customer cash-out ${withdrawal_id}`,
              currency: "UGX", reference_id: `${withdrawal_id}-merchant-float-consume`, transaction_date: txDate,
            },
            {
              user_id: user.id, ledger_scope: "platform", direction: "cash_in",
              amount, category: "agent_float_settlement",
              source_table: "withdrawal_requests", source_id: withdrawal_id,
              description: `Merchant float settled to customer for withdrawal ${withdrawal_id}`,
              currency: "UGX", reference_id: `${withdrawal_id}-merchant-float-consume`, transaction_date: txDate,
            },
          ],
          idempotency_key: `approve-withdrawal-merchant-float-consume-${withdrawal_id}`,
        });
        if (floatErr) {
          console.error("[approve-withdrawal] Merchant float consume RPC error:", floatErr);
        } else {
          merchantFloatConsumed = amount;
        }
      } catch (e) {
        console.error("[approve-withdrawal] Merchant float consume exception:", e);
      }
    }

    // Public proof-of-payment receipt link (unguessable token). Fetched once so
    // both the customer SMS and the merchant confirmation SMS can share it.
    let receiptToken: string | null = null;
    try {
      const { data: rtRow } = await admin
        .from("withdrawal_requests")
        .select("receipt_token")
        .eq("id", withdrawal_id)
        .maybeSingle();
      receiptToken = (rtRow as any)?.receipt_token ?? null;
    } catch (e) {
      console.error("[approve-withdrawal] receipt token fetch failed (non-fatal):", e);
    }
    const receiptUrl = receiptToken
      ? `https://welileapp.com/r/${receiptToken}`
      : `https://welileapp.com/receipt/${withdrawal_id}`;

    // Cashout agent 0.5% commission (when caller is an active cashout agent, including staff roles).
    // Company funds (platform cash_out) move INSTANTLY into the agent's own
    // withdrawable wallet bucket (recipient_type: "user" guarantees withdrawable
    // routing), then we SMS the agent to confirm the earning.
    let cashoutCommission = 0;
    if (actingAsMerchant) {
      cashoutCommission = Math.round(amount * 0.005);
      if (cashoutCommission > 0) {
        try {
          const txDate = new Date().toISOString();
          const { error: commErr } = await admin.rpc("create_ledger_transaction", {
            entries: [
              {
                user_id: user.id, ledger_scope: "platform", direction: "cash_out",
                amount: cashoutCommission, category: "agent_commission_earned",
                source_table: "withdrawal_requests", source_id: withdrawal_id,
                description: `Cashout payout commission expense (0.5%) for withdrawal ${withdrawal_id}`,
                currency: "UGX", reference_id: `${withdrawal_id}-cashout-commission`, transaction_date: txDate,
              },
              {
                user_id: user.id, ledger_scope: "wallet", direction: "cash_in",
                amount: cashoutCommission, category: "agent_commission_earned",
                recipient_type: "user", wallet_bucket: "withdrawable",
                source_table: "withdrawal_requests", source_id: withdrawal_id,
                description: `Cashout payout commission (0.5%) for withdrawal ${withdrawal_id}`,
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

      // ── Cashout agent commission SMS (into withdrawable) ──
      // Confirms the merchant agent's 0.5% payout commission was credited to
      // their withdrawable wallet, using the exact wording set by the business.
      if (cashoutCommission > 0) {
        try {
          const { data: agentProfile } = await admin
            .from("profiles")
            .select("phone, full_name")
            .eq("id", user.id)
            .maybeSingle();
          if (agentProfile?.phone) {
            const customerName = (profile?.full_name || "the customer").toString().trim();
            const merchantTid = reference.trim().toUpperCase();
            const commMsg =
              `WELILE: Payout Completed. You have successfully paid UGX ${amount.toLocaleString()} to ${customerName}.\n` +
              `Commission Earned: UGX ${cashoutCommission.toLocaleString()} (0.5%), added to your withdrawable wallet.\n` +
              `Transaction ID: ${merchantTid}\n` +
              `Receipt: ${receiptUrl}`;
            sendSMS(agentProfile.phone, commMsg, {
              admin,
              source: "merchant_commission",
              reference_id: withdrawal_id,
              recipient_user_id: user.id,
              recipient_name: (agentProfile as any)?.full_name ?? null,
              idempotencyKey: `merchant_commission:${withdrawal_id}`,
            }).catch((e) =>
              console.error("[approve-withdrawal] cashout commission SMS failed:", e),
            );
          }
        } catch (e) {
          console.error("[approve-withdrawal] cashout commission SMS exception:", e);
        }
      }

      // ── Web push: notify merchant agent that commission was earned ──
      if (cashoutCommission > 0) {
        fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            userIds: [user.id],
            payload: {
              title: "💰 Commission Earned",
              body: `You earned UGX ${cashoutCommission.toLocaleString()} (0.5%) for processing a UGX ${amount.toLocaleString()} payout. Added to your withdrawable wallet.`,
              type: "merchant_commission",
              url: "/dashboard/agent",
            },
          }),
        }).catch((e) => console.error("[approve-withdrawal] commission push failed:", e));
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
          title: "✅ Withdrawal Completed",
          body: `Your withdrawal of UGX ${amount.toLocaleString()} has been processed successfully. Tap to view your receipt.`,
          url: receiptToken ? `/r/${receiptToken}` : "/dashboard/agent",
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

    // ── User SMS alert (paid) ───────────────────────────────────────────
    // Fired the moment the merchant agent enters the transaction proof
    // (MoMo/airtel transaction ID, bank deposit reference, or cash receipt).
    // The withdrawing user gets the full withdrawal details PLUS their new
    // wallet balance so the wallet change is transparent. Fire-and-forget so
    // a telco hiccup never blocks the approval response. The result is logged
    // to `withdrawal_notification_log` so Financial Ops can see it.
    {
      const refUpper = reference.trim().toUpperCase();

      // Classify the proof the merchant entered for a clear, friendly label.
      const pm = (payment_method || "").toString().toLowerCase();
      let proofLabel = "Transaction ID";
      if (pm.includes("bank")) proofLabel = "Bank deposit reference";
      else if (pm.includes("cash")) proofLabel = "Cash receipt";
      else if (pm.includes("mtn") || pm.includes("airtel") || pm.includes("momo") || pm.includes("mobile")) proofLabel = "Mobile Money Transaction ID";

      // Fetch the user's NEW withdrawable balance (post-debit) so the SMS can
      // show the wallet change. Strict ledger-backed RPC — never inflated.
      let newBalance: number | null = null;
      try {
        const { data: bal } = await admin.rpc("get_user_available_balance", {
          p_user_id: beneficiaryUserId,
        });
        const n = Number(bal);
        if (Number.isFinite(n)) newBalance = n;
      } catch (e) {
        console.error("[approve-withdrawal] balance fetch for SMS failed (non-fatal):", e);
      }

      const balanceLine =
        newBalance !== null
          ? ` New wallet balance: UGX ${Math.round(newBalance).toLocaleString()}.`
          : "";

      // For bank transfers, include the destination bank name and account
      // number so the user can reconcile the payout against their bank record.
      let bankLine = "";
      if (pm.includes("bank")) {
        const bankName = String((wr as any).bank_name || "").trim();
        const bankAcct = String((wr as any).bank_account_number || "").trim();
        const parts: string[] = [];
        if (bankName) parts.push(bankName);
        if (bankAcct) parts.push(`A/C ${bankAcct}`);
        if (parts.length) bankLine = ` Bank details: ${parts.join(" - ")}.`;
      }

      // When a genuine merchant agent settled this payout, identify them by
      // phone number in the receipt so the withdrawing user knows exactly who
      // processed it (and can reach them if needed).
      let merchantLine = "";
      let merchantName: string | null = null;
      let merchantPhone: string | null = null;
      if (actingAsMerchant) {
        try {
          const { data: mp } = await admin
            .from("profiles")
            .select("full_name, phone")
            .eq("id", user.id)
            .maybeSingle();
          const mName = (mp as any)?.full_name?.trim();
          const mPhone = (mp as any)?.phone?.toString().trim();
          if (mName) {
            merchantName = mName;
          }
          if (mPhone) merchantPhone = mPhone;
          const agentLabel = merchantName
            ? `${merchantName}${merchantPhone ? ` (${merchantPhone})` : ""}`
            : merchantPhone || "";
          merchantLine = agentLabel
            ? ` Processed by Welile merchant agent ${agentLabel}.`
            : ` Processed by a Welile merchant agent.`;
        } catch (e) {
          console.error("[approve-withdrawal] merchant name fetch for SMS failed (non-fatal):", e);
        }
      }

      // Payout recipient name — the destination account holder the money was
      // sent to (MoMo name / bank account name), falling back to the customer's
      // own name. Shown on the receipt so the user can confirm who was paid.
      const recipientName =
        String((wr as any).mobile_money_name || "").trim() ||
        String((wr as any).bank_account_name || "").trim() ||
        String(profile?.full_name || "").trim() ||
        "";
      const recipientLine = recipientName ? ` Recipient: ${recipientName}.` : "";

      // Date & time of payment in East Africa Time (UTC+3).
      const paidAtEat = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const paidAtLabel =
        `${paidAtEat.toISOString().slice(0, 10)} ` +
        `${paidAtEat.toISOString().slice(11, 16)} EAT`;

      const customerFirstName = (profile?.full_name || "").toString().trim().split(/\s+/)[0] || "Customer";
      const smsMsg =
        `WELILE: Withdrawal Successful. Dear ${customerFirstName}, your cash withdrawal of ` +
        `UGX ${amount.toLocaleString()} has been completed successfully.\n` +
        `Transaction ID: ${refUpper}.` +
        `${recipientLine}` +
        `${bankLine}` +
        `${merchantLine}` +
        ` Date: ${paidAtLabel}.` +
        `${balanceLine}` +
        `\n\nYour digital receipt is ready (no sign-in required):\n` +
        `${receiptUrl}` +
        `\n\nThank you for choosing Welile Technologies Ltd. Help: +256777607640`;

      // In-app notification center entry so the user sees the approval update
      // (merchant agent name + remaining wallet balance) without relying on SMS.
      // Fire-and-forget — a notification write must never block the approval.
      try {
        const balText =
          newBalance !== null
            ? ` Your new wallet balance is UGX ${Math.round(newBalance).toLocaleString()}.`
            : "";
        admin
          .from("notifications")
          .insert({
            user_id: beneficiaryUserId,
            type: "success",
            title: "Withdrawal approved & paid",
            message:
              `Your withdrawal of UGX ${amount.toLocaleString()} has been approved and paid via ` +
              `${payment_method} (${proofLabel}: ${refUpper}).` +
              `${merchantName ? ` Processed by Welile merchant agent ${merchantName}.` : ""}` +
              `${balText}`,
            metadata: {
              kind: "withdrawal_update",
              stage: "approved",
              withdrawal_id,
              amount,
              merchant_agent: merchantName,
              new_balance: newBalance,
              payment_method,
              reference: refUpper,
              receipt_url: receiptUrl,
              receipt_token: receiptToken,
            },
          })
          .then(({ error }) => {
            if (error) console.warn("[approve-withdrawal] notification insert failed:", error.message);
          });
      } catch (e) {
        console.warn("[approve-withdrawal] notification insert threw (non-fatal):", e);
      }

      // Resolve the recipient email so the Financial Ops notification log
      // shows who was alerted.
      let recipientEmailForLog: string | null = null;
      try {
        const { data: rp } = await admin
          .from("profiles")
          .select("email")
          .eq("id", beneficiaryUserId)
          .maybeSingle();
        recipientEmailForLog = (rp as any)?.email ?? null;
      } catch { /* non-fatal */ }

      // Multi-channel proof of payment. The customer now receives the SAME
      // receipt link via SMS, email AND WhatsApp (best-effort) — not just SMS.
      // Each channel is idempotent per withdrawal so retries never duplicate.
      let receiptEmailSent = false;
      const sendReceiptEmail = (reasonTag: string) => {
        if (receiptEmailSent) return;
        if (!recipientEmailForLog || !/@/.test(recipientEmailForLog)) return;
        receiptEmailSent = true;
        try {
          const emailReq = buildWithdrawalPaidReceiptRequest({
            recipientEmail: recipientEmailForLog,
            recipientName: profile?.full_name ?? null,
            withdrawalId: String(withdrawal_id),
            amount,
            paymentMethod: payment_method,
            proofLabel,
            proofReference: refUpper,
            newBalance,
            receiptUrl,
          });
          dispatchTransactionalEmail(supabaseUrl, serviceKey, emailReq, "approve-withdrawal");
          console.log(
            `[approve-withdrawal] receipt email queued to ${recipientEmailForLog} (${reasonTag})`,
          );
        } catch (e) {
          console.error("[approve-withdrawal] receipt email failed:", e);
        }
      };
      // Backwards-compatible alias for the existing SMS-failure call sites.
      const sendFallbackReceiptEmail = sendReceiptEmail;

      // Always email the receipt (in addition to SMS), whenever we have an
      // address on file — no longer gated on SMS delivery failure.
      if (recipientEmailForLog && /@/.test(recipientEmailForLog)) {
        sendReceiptEmail("primary channel");
      }

      // WhatsApp proof of payment (best-effort, no-op if Twilio WhatsApp
      // sender is not configured). Carries the same secure receipt link.
      if (profile?.phone) {
        const customerFirstNameWa = (profile?.full_name || "").toString().trim().split(/\s+/)[0] || "Customer";
        const waMsg =
          `WELILE: Withdrawal Successful. Dear ${customerFirstNameWa}, your cash withdrawal of ` +
          `UGX ${amount.toLocaleString()} has been completed successfully.\n` +
          `Transaction ID: ${refUpper}.\n\n` +
          `Your digital receipt (no sign-in required):\n${receiptUrl}\n\n` +
          `Thank you for choosing Welile Technologies Ltd.`;
        sendWhatsApp(profile.phone, waMsg, {
          contentVariables: {
            "1": customerFirstNameWa,
            "2": `UGX ${amount.toLocaleString()}`,
            "3": refUpper,
            "4": receiptUrl,
          },
        })
          .then((r) => {
            if (r.ok) console.log(`[approve-withdrawal] WhatsApp receipt sent (sid ${r.sid}).`);
            else if (!r.skipped) console.warn(`[approve-withdrawal] WhatsApp receipt failed: ${r.error}`);
          })
          .catch((e) => console.error("[approve-withdrawal] WhatsApp receipt threw:", e));
      }

      if (profile?.phone) {
        // 1) Record the SMS as "queued" up front so Financial Ops can see the
        //    delivery is in flight, then 2) flip it to "sent"/"failed" once the
        //    provider responds. This gives a full queued → sent/failed lifecycle.
        admin
          .from("withdrawal_notification_log")
          .insert({
            withdrawal_id,
            recipient_id: beneficiaryUserId,
            recipient_email: recipientEmailForLog ?? profile.phone ?? null,
            amount,
            status: "queued",
            error_message: null,
          })
          .select("id")
          .single()
          .then(({ data: logRow }) => {
            const logId = (logRow as any)?.id ?? null;
            sendSMS(profile.phone, smsMsg, {
              admin,
              source: "withdrawal_payout",
              reference_id: withdrawal_id,
              recipient_user_id: beneficiaryUserId,
              recipient_name: (profile as any)?.full_name ?? null,
              idempotencyKey: `withdrawal_payout:${withdrawal_id}`,
            })
              .then((ok) => {
                if (!ok) sendFallbackReceiptEmail("provider rejected");
                if (!logId) return;
                admin
                  .from("withdrawal_notification_log")
                  .update({
                    status: ok ? "sent" : "failed",
                    error_message: ok ? null : "SMS provider rejected or unconfigured",
                  })
                  .eq("id", logId)
                  .then(() => {}, () => {});
              })
              .catch((e) => {
                console.error("[approve-withdrawal] paid SMS failed:", e);
                sendFallbackReceiptEmail("send threw");
                if (!logId) return;
                admin
                  .from("withdrawal_notification_log")
                  .update({
                    status: "failed",
                    error_message: e?.message ? String(e.message).slice(0, 500) : "SMS send threw",
                  })
                  .eq("id", logId)
                  .then(() => {}, () => {});
              });
          }, (e) => {
            console.error("[approve-withdrawal] notification log insert failed:", e);
            // Still attempt the SMS even if logging failed.
            sendSMS(profile.phone, smsMsg, {
              admin,
              source: "withdrawal_payout",
              reference_id: withdrawal_id,
              recipient_user_id: beneficiaryUserId,
              recipient_name: (profile as any)?.full_name ?? null,
              idempotencyKey: `withdrawal_payout:${withdrawal_id}`,
            })
              .then((ok) => {
                if (!ok) sendFallbackReceiptEmail("provider rejected (log insert failed)");
              })
              .catch(() => sendFallbackReceiptEmail("send threw (log insert failed)"));
          });
      } else {
        // No phone on file — still record that the user could not be SMS'd.
        // Fall back to an email receipt so the user still gets confirmation.
        sendFallbackReceiptEmail("no phone on file");
        admin
          .from("withdrawal_notification_log")
          .insert({
            withdrawal_id,
            recipient_id: beneficiaryUserId,
            recipient_email: recipientEmailForLog,
            amount,
            status: "failed",
            error_message:
              "No phone number on file for the withdrawing user" +
              (recipientEmailForLog ? " — fallback email receipt sent" : ""),
          })
          .then(() => {}, () => {});
      }

      // ── Receipt copy to the records archive ─────────────────────────────
      // Policy (locked, unit-tested in receipt-copy-guard.test.ts): the ONLY
      // internal recipient of a withdrawal-approval receipt copy is the shared
      // records archive mailbox (weliletenants@gmail.com). No CFO / Financial
      // Ops / manager / agent address may receive a copy. The customer still
      // gets their own primary receipt separately. buildReceiptCopyRecipients()
      // is the single source of truth; enforceArchiveOnly() is a defensive
      // runtime net that drops any non-archive address before dispatch.
      try {
        const { allowed: copyRecipients, rejected } = enforceArchiveOnly(
          buildReceiptCopyRecipients(),
        );
        if (rejected.length > 0) {
          console.error(
            "[approve-withdrawal] BLOCKED non-archive receipt copy recipients:",
            rejected.map((r) => r.email),
          );
        }

        // Dedupe by email; the customer already received the primary receipt.
        const customerEmailLc = (recipientEmailForLog || "").trim().toLowerCase();
        const seen = new Set<string>();
        for (const rec of copyRecipients) {
          const key = rec.email.trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (key === customerEmailLc) continue; // already got the primary copy
          const emailReq = buildWithdrawalPaidReceiptRequest({
            recipientEmail: rec.email,
            recipientName: rec.role,
            withdrawalId: String(withdrawal_id),
            amount,
            paymentMethod: payment_method,
            proofLabel,
            proofReference: refUpper,
            receiptUrl,
            copyFor: rec.role,
            idempotencySuffix: key.replace(/[^a-z0-9]/g, "").slice(0, 40),
            commissionEarned: null,
          });
          dispatchTransactionalEmail(supabaseUrl, serviceKey, emailReq, "approve-withdrawal");
        }
        console.log(
          `[approve-withdrawal] receipt copies queued to ${seen.size} internal/archive recipient(s).`,
        );
      } catch (e) {
        console.error("[approve-withdrawal] receipt copy fan-out failed (non-fatal):", e);
      }
    }

    // ── User in-app notification (paid) ─────────────────────────────────
    // notifications table writes may be suppressed by the lean-DB policy
    // (notifications trigger) — wrap in try/catch so failures are silent.
    try {
      const notifyRows = notifyUserIds.map((uid) => ({
        user_id: uid,
        title: "✅ Withdrawal Paid",
        message:
          `Your withdrawal of UGX ${amount.toLocaleString()} has been ` +
          `approved and paid via ${payment_method}. Ref: ${reference.trim().toUpperCase()}.`,
        type: "financial",
      }));
      if (notifyRows.length > 0) {
        await admin.from("notifications").insert(notifyRows);
      }
    } catch { /* suppressed */ }

    // ── Returns Disbursement Confirmation email ───────────────────────────
    // Sent ONLY now (after the merchant agent has actually confirmed payment
    // and the ledger has been written) so partners are never told their
    // returns were disbursed for a release/rejected/unconfirmed payout.
    try {
      // Beneficiary partner = wr.linked_party for proxy payouts, else self.
      const partnerId = beneficiaryUserId;
      const { data: partnerProfile } = await admin
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", partnerId)
        .maybeSingle();

      // ── Proxy Partner SMS alert (paid on behalf) ─────────────────────────
      if (isProxyPayout && fundingUserId !== partnerId && partnerProfile?.phone) {
        const refUpper = reference.trim().toUpperCase();
        // ── Detect what was actually withdrawn ──────────────────────────────
        // NOT every payout a merchant/proxy agent settles is a partnership
        // (ROI) return. The confirmation SMS must describe the correct
        // purpose, otherwise a landlord-float payout, a rent-plan refund or a
        // plain wallet cash-out gets wrongly announced as "partnership return".
        // We classify from the request `reason`, which carries the structural
        // intent set at request time.
        const _reasonRaw = typeof wr.reason === "string" ? wr.reason : "";
        const _reason = _reasonRaw.toLowerCase();
        const _amt = amount.toLocaleString();
        const _dash = "https://welileapp.com/auth";
        let proxySmsMsg: string;
        if (_reason.startsWith("landlord float payout") || _reason.includes("landlord float")) {
          // Merchant paid out an agent's CFO-funded landlord float.
          proxySmsMsg =
            `Your landlord payout of UGX ${_amt} has been successfully paid by your authorized Welile agent on your behalf.\n\n` +
            `Reference: ${refUpper}\n\n` +
            `Log in to your Welile dashboard to view your payments and account: ${_dash}\n\n` +
            `Thank you for partnering with Welile Technologies Limited.`;
        } else if (
          _reason.includes("portfolio") ||
          _reason.includes("partnership") ||
          _reason.includes("roi") ||
          _reason.includes("return")
        ) {
          // Partnership / portfolio (ROI) return.
          proxySmsMsg =
            `Your partnership return of UGX ${_amt} has been successfully withdrawn and paid by your authorized proxy agent on your behalf.\n\n` +
            `Reference: ${refUpper}\n\n` +
            `We encourage you to log in to your Welile dashboard to monitor your partnership performance, track payouts, and manage your account directly: ${_dash}\n\n` +
            `Thank you for partnering with Welile Technologies Limited.\n\n` +
            `"Welile is Turning Rent into an Asset."`;
        } else {
          // Any other proxy-settled withdrawal — keep it purpose-neutral.
          proxySmsMsg =
            `Your withdrawal of UGX ${_amt} has been successfully paid by your authorized Welile agent on your behalf.\n\n` +
            `Reference: ${refUpper}\n\n` +
            `Log in to your Welile dashboard to view your wallet, transactions and account: ${_dash}\n\n` +
            `Thank you for partnering with Welile Technologies Limited.`;
        }
        sendSMS(partnerProfile.phone, proxySmsMsg, {
          admin,
          source: "proxy_payout",
          reference_id: withdrawal_id,
          recipient_user_id: partnerId,
          recipient_name: (partnerProfile as any)?.full_name ?? null,
          idempotencyKey: `proxy_payout:${withdrawal_id}`,
        }).catch((e) =>
          console.error("[approve-withdrawal] proxy partner SMS failed:", e),
        );
      }

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

        // ── Resolve the EXACT portfolio this withdrawal is for ───────────
        // The proxy withdrawal dialog stamps the chosen portfolio into the
        // request reason as "... | Route: portfolio <portfolio_code|id>".
        // We MUST base the disbursement email's principal / ROI % on that
        // specific portfolio — not just the partner's most-recently-created
        // one. Partners commonly hold many portfolios (incident: every
        // email for a 9-portfolio partner showed the newest portfolio's
        // principal regardless of which portfolio was actually withdrawn
        // for, 2026-06-04).
        let portfolio:
          | { portfolio_code: string | null; roi_percentage: number | null; investment_amount: number | null }
          | null = null;
        const _routeMatch = typeof wr.reason === "string"
          ? wr.reason.match(/Route:\s*portfolio\s+(\S+)/i)
          : null;
        const _routeToken = _routeMatch?.[1]?.trim() || "";
        const _isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_routeToken);
        if (_routeToken) {
          const { data: routedPortfolio } = await admin
            .from("investor_portfolios")
            .select("portfolio_code, roi_percentage, investment_amount")
            .eq("investor_id", partnerId)
            .eq(_isUuid ? "id" : "portfolio_code", _routeToken)
            .maybeSingle();
          if (routedPortfolio) {
            portfolio = routedPortfolio as typeof portfolio;
            console.log(
              `[approve-withdrawal] Disbursement principal sourced from routed portfolio ${_routeToken} ` +
                `(principal=${(routedPortfolio as any).investment_amount}, roi=${(routedPortfolio as any).roi_percentage}%)`,
            );
          } else {
            console.warn(
              `[approve-withdrawal] Routed portfolio "${_routeToken}" not found for partner ${partnerId}; ` +
                `falling back to most-recent portfolio for the disbursement email.`,
            );
          }
        }
        // Fallback: no explicit route token (e.g. saved-method payout) — use
        // the partner's most-recently-created portfolio so the email still
        // shows a sensible reference.
        if (!portfolio) {
          const { data: latestPortfolio } = await admin
            .from("investor_portfolios")
            .select("portfolio_code, roi_percentage, investment_amount")
            .eq("investor_id", partnerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          portfolio = (latestPortfolio as typeof portfolio) ?? null;
        }

        // ── Returns-source guard ──────────────────────────────────────────
        // The "Returns Disbursement Confirmation" template must ONLY be sent
        // when this withdrawal is actually backed by Supporter returns/ROI
        // credits paid out on behalf of a funder.
        //
        // Per Wallet Routing v2 + Supporter Withdrawal Policy, proxy
        // partners can no longer self-withdraw their ROI returns — those
        // funds can only leave the platform through their assigned proxy
        // agent. Therefore a SELF withdrawal can never be a returns
        // disbursement, even if the user happens to have a portfolio and
        // historical ROI credits (incident: regular wallet cashouts were
        // wrongly triggering this email for any user with any past ROI
        // leg, 2026-05-15).
        //
        // Discriminator: must be a proxy payout (agent acting for partner)
        // AND the partner must have an investor portfolio AND at least one
        // ROI credit leg in the general_ledger.
        if (!isProxyPayout || fundingUserId === partnerId) {
          console.log(
            `[approve-withdrawal] Skipping returns-disbursement email: not a proxy payout (partner=${partnerId}, funder=${fundingUserId})`,
          );
          break sendReturnsEmail;
        }
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
        // Build a friendly payout method label + masked destination so the
        // disbursement email matches the template intent
        // ("Mobile Money (MTN) •••• 4521" / "Bank Transfer (Stanbic) •••• 1234").
        const _lastFour = (s?: string | null) => {
          const digits = String(s ?? "").replace(/\D+/g, "");
          return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "";
        };
        const _providerLabel = (p?: string | null) => {
          const v = String(p ?? "").toLowerCase();
          if (v.includes("mtn")) return "MTN";
          if (v.includes("airtel")) return "Airtel";
          return p ? String(p) : "";
        };
        const _wrPm = String((wr as any).payout_method || "").toLowerCase();
        let resolvedPayoutMethod: string = payment_method;
        let resolvedPayoutLast4 = "";
        if (_wrPm === "mobile_money" || /mobile\s*money|momo|mtn|airtel/i.test(payment_method)) {
          const prov = _providerLabel((wr as any).mobile_money_provider) || _providerLabel(payment_method);
          resolvedPayoutMethod = prov ? `Mobile Money (${prov})` : "Mobile Money";
          resolvedPayoutLast4 = _lastFour((wr as any).mobile_money_number);
        } else if (_wrPm === "bank_transfer" || /bank/i.test(payment_method)) {
          resolvedPayoutMethod = (wr as any).bank_name
            ? `Bank Transfer (${(wr as any).bank_name})`
            : "Bank Transfer";
          resolvedPayoutLast4 = _lastFour((wr as any).bank_account_number);
        } else if (_wrPm === "wallet" || /wallet/i.test(payment_method)) {
          resolvedPayoutMethod = "Wallet";
          resolvedPayoutLast4 = "";
        }
        const emailReq = buildReturnsDisbursementRequest({
          recipientEmail: partnerProfile.email,
          partnerName: partnerProfile.full_name,
          partnerId,
          txGroupId: String(txnGroupId ?? withdrawal_id),
          amount,
          transactionId: refUpper,
          portfolioCode: portfolio?.portfolio_code || undefined,
          payoutMethod: isProxyPayout
            ? `${resolvedPayoutMethod} — via Proxy Agent`
            : resolvedPayoutMethod,
          walletIdLast4: resolvedPayoutLast4,
          isManagedByAgent: isProxyPayout && fundingUserId !== partnerId,
          agentName,
          roiPercentage: Number((portfolio as any)?.roi_percentage) || undefined,
          principalAmount: Number((portfolio as any)?.investment_amount) || undefined,
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
            payoutMethod: `${resolvedPayoutMethod} — Proxy payout for ${partnerProfile.full_name || "funder"}`,
            walletIdLast4: resolvedPayoutLast4,
            // Agent gets the standard disbursement layout, NOT the
            // partner-facing "paid on your behalf" copy.
            isManagedByAgent: false,
            agentName,
            roiPercentage: Number((portfolio as any)?.roi_percentage) || undefined,
            principalAmount: Number((portfolio as any)?.investment_amount) || undefined,
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
        merchant_reimbursed: merchantFloatConsumed,
        merchant_float_consumed: merchantFloatConsumed,
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
