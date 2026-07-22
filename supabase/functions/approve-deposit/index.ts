import "../_shared/smsFooterInterceptor.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import { logDepositDecision } from "../_shared/depositDecisionAudit.ts";
import { attemptYoolaPrimary } from "../_shared/yoolaPrimary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Server-side retry helper for transient RPC failures ──
// Large deposits (10M / 15M) trigger the most complex paths in this
// function (deposit ledger → rent repayment → debt clearance → prepay
// → commission credits). These paths each issue several Postgres RPCs
// and any one of them can flake on a transient connection drop or a
// brief 5xx from the database pooler, causing the whole approval to
// 500 even though the wallet was already credited.
//
// We wrap each RPC in a small bounded retry with structured logging
// so we (a) surface exactly which sub-step failed and (b) recover
// from transient flakes automatically. We deliberately do NOT retry
// the wallet_deposit credit itself here — that one is protected by
// the idempotency guard at the top of the loop and re-attempted by
// the client retry layer in TidVerification.tsx.
async function withRetry<T>(
  label: string,
  depositId: string,
  fn: () => Promise<{ data?: T; error: any } | { error: any }>,
  maxAttempts = 3,
): Promise<{ data?: T; error: any; attempts: number; ms: number }> {
  let lastErr: any = null;
  const t0 = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const stepStart = Date.now();
    try {
      const res: any = await fn();
      const stepMs = Date.now() - stepStart;
      if (!res?.error) {
        if (attempt > 1) {
          console.log(
            `[approve-deposit] ${label} succeeded on attempt ${attempt}/${maxAttempts} ` +
            `(deposit=${depositId}, step_ms=${stepMs}, total_ms=${Date.now() - t0})`,
          );
        }
        return { data: res.data, error: null, attempts: attempt, ms: Date.now() - t0 };
      }
      lastErr = res.error;
      const msg = String(res.error?.message ?? res.error ?? "");
      const code = String(res.error?.code ?? "");
      const isTransient =
        /timeout|fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|connection|temporarily|deadlock|serializ/i.test(msg) ||
        ["08006", "08001", "08004", "40001", "40P01", "57014", "57P01", "57P03"].includes(code);
      console.warn(
        `[approve-deposit] ${label} attempt ${attempt}/${maxAttempts} failed ` +
        `(deposit=${depositId}, step_ms=${stepMs}, transient=${isTransient}, code=${code}): ${msg}`,
      );
      if (!isTransient || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    } catch (thrown: any) {
      lastErr = thrown;
      const msg = String(thrown?.message ?? thrown);
      console.warn(
        `[approve-deposit] ${label} attempt ${attempt}/${maxAttempts} threw ` +
        `(deposit=${depositId}): ${msg}`,
      );
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  return { data: undefined, error: lastErr, attempts: maxAttempts, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Admin client is created up-front so the deposit-decision audit trail can
    // record EVERY rejection/block — including the early validation returns
    // below — not just the ones that happen after the main flow starts.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { deposit_request_id, action, rejection_reason, bulk_ids, access_token, auto_approved, auto_match_method, system_auto_credit } = body as {
      deposit_request_id?: string;
      action?: string;
      rejection_reason?: string;
      bulk_ids?: string[];
      access_token?: string;
      auto_approved?: boolean;
      auto_match_method?: string;
      system_auto_credit?: boolean;
    };

    const authHeader = req.headers.get("Authorization")
      || (typeof access_token === 'string' && access_token.length > 0 ? `Bearer ${access_token}` : null);
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── System auto-credit branch ──────────────────────────────────
    // The Gmail poller can auto-credit an operational-float deposit on
    // behalf of a known user the moment a MoMo receipt is parsed. It calls
    // us with `Authorization: Bearer <service_role_key>` and
    // `system_auto_credit:true`. We impersonate the deposit OWNER so the
    // existing eligibleAutoApprove + gmail re-verification path runs
    // unchanged. No human user is involved in this call.
    const isSystemAutoCredit =
      !!system_auto_credit && authHeader === `Bearer ${supabaseServiceKey}`;

    let user: { id: string } | null = null;
    let actorEmail: string | null = null;
    if (!isSystemAutoCredit) {
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !authUser) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = { id: authUser.id };
      actorEmail = authUser.email ?? null;
    } else {
      actorEmail = "system_auto_credit";
    }

    if (!action || !["approve", "reject", "reopen"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'approve', 'reject', or 'reopen'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let idsToProcess: string[] = [];
    if (bulk_ids && Array.isArray(bulk_ids)) {
      if (bulk_ids.length > 100) {
        return new Response(
          JSON.stringify({ error: "Cannot process more than 100 deposits at once" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      idsToProcess = bulk_ids.filter(id => typeof id === 'string' && UUID_REGEX.test(id));
    } else if (deposit_request_id && typeof deposit_request_id === 'string' && UUID_REGEX.test(deposit_request_id)) {
      idsToProcess = [deposit_request_id];
    }

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid deposit IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safeRejectionReason = typeof rejection_reason === 'string' ? rejection_reason.trim().slice(0, 1000) : undefined;

    // Audit requirement: rejecting a deposit MUST be accompanied by a clear
    // operator-written reason (≥10 chars) so reconciliation, the user
    // notification SMS, and the audit_logs entry all carry traceable context.
    // This was previously only enforced in the UI; an API caller could
    // bypass it. The reason is also stamped onto deposit_requests.rejection_reason
    // and broadcast in the user notification — never accept a blank.
    if (action === 'reject' && (!safeRejectionReason || safeRejectionReason.length < 10)) {
      await logDepositDecision(supabaseAdmin, {
        source: "approval",
        decision: "blocked",
        reason: "rejection_reason_required",
        actor_id: user?.id ?? null,
        actor_email: actorEmail,
        metadata: { ids: idsToProcess, action },
      });
      return new Response(
        JSON.stringify({
          error: 'rejection_reason_required',
          message: 'A rejection reason of at least 10 characters is required for auditing.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Reopen flow ──────────────────────────────────────────────────
    // Financial Ops can put a previously-rejected user deposit back into
    // the `pending` queue so the TID search / User Deposits tab surfaces
    // it again for re-review and possible approval. Manager-only — the
    // same role that can approve/reject in the first place.
    if (action === 'reopen') {
      const { data: isMgr } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'manager')
        .maybeSingle();
      if (!isMgr) {
        return new Response(
          JSON.stringify({ error: 'Only managers can reopen rejected deposits' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const { data: rejected, error: rejErr } = await supabaseAdmin
        .from('deposit_requests')
        .select('id, status, user_id, amount, deposit_purpose, transaction_id')
        .in('id', idsToProcess)
        .eq('status', 'rejected');
      if (rejErr || !rejected || rejected.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No rejected deposit requests found to reopen' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const reopenNote = (typeof rejection_reason === 'string' ? rejection_reason : '').trim().slice(0, 1000);
      const reopened: Array<{ id: string; user_id: string; amount: number }> = [];
      for (const r of rejected) {
        const { error: updErr } = await supabaseAdmin
          .from('deposit_requests')
          .update({
            status: 'pending',
            rejection_reason: null,
            rejected_at: null,
            processed_by: null,
          })
          .eq('id', r.id)
          .eq('status', 'rejected');
        if (updErr) {
          console.error('[approve-deposit] reopen update failed', r.id, updErr);
          continue;
        }
        await supabaseAdmin.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'deposit_request_reopened',
          table_name: 'deposit_requests',
          record_id: r.id,
          metadata: {
            previous_status: 'rejected',
            new_status: 'pending',
            reason: reopenNote || 'Reopened for re-review',
            deposit_purpose: (r as any).deposit_purpose ?? null,
            amount: Number(r.amount),
            tid: (r as any).transaction_id ?? null,
            target_user_id: r.user_id,
          },
        });
        reopened.push({ id: r.id, user_id: r.user_id, amount: Number(r.amount) });
      }
      return new Response(
        JSON.stringify({ success: true, action: 'reopened', count: reopened.length, results: reopened }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Treasury guard: block credits when paused (deposits credit user wallets)
    const guardBlock = await checkTreasuryGuard(supabaseAdmin, "credit", req.headers.get("Authorization"));
    if (guardBlock) return guardBlock;

    const { data: depositRequests, error: fetchError } = await supabaseAdmin
      .from("deposit_requests")
      .select("*")
      .in("id", idsToProcess)
      .eq("status", "pending");

    if (fetchError || !depositRequests || depositRequests.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          already_processed: true,
          message:
            "These deposit requests were already processed (likely by a concurrent click or another operator). Refresh to see the latest status.",
          processed: 0,
          total: idsToProcess.length,
          results: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── FORTRESS: cash-code deposits can ONLY be approved after the depositor
    // entered the receipt code. Regardless of caller (manager, Financial-Ops
    // matcher auto-approve, auto_approved flag, or system auto-credit), every
    // provider='cash_deposit' row in this batch MUST have a matching
    // `cash_deposit_verifications` row with status='verified'. The legit
    // cash-deposit-verify-code flow stamps status='verified' BEFORE invoking us,
    // so it passes; any other path (e.g. an email auto-match) is blocked here.
    if (action === "approve") {
      const cashDeposits = depositRequests.filter(
        (d) => String(d.provider || "").toLowerCase() === "cash_deposit",
      );
      if (cashDeposits.length > 0) {
        const cashIds = cashDeposits.map((d) => d.id);
        const { data: vers, error: verErr } = await supabaseAdmin
          .from("cash_deposit_verifications")
          .select("deposit_request_id, status")
          .in("deposit_request_id", cashIds);
        if (verErr) {
          return new Response(
            JSON.stringify({ error: "verification_lookup_failed", message: verErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const verifiedSet = new Set(
          (vers ?? [])
            .filter((v) => String((v as any).status) === "verified")
            .map((v) => (v as any).deposit_request_id),
        );
        const unverified = cashDeposits.filter((d) => !verifiedSet.has(d.id));
        if (unverified.length > 0) {
          for (const d of unverified) {
            await logDepositDecision(supabaseAdmin, {
              source: "approval",
              decision: "blocked",
              reason: "cash_code_required",
              deposit_request_id: d.id,
              amount: Number(d.amount),
              actor_id: user?.id ?? null,
              actor_email: actorEmail,
              metadata: {
                provider: d.provider ?? null,
                auto_approved: !!auto_approved,
                system_auto_credit: isSystemAutoCredit,
                auto_match_method: auto_match_method ?? null,
              },
            });
          }
          return new Response(
            JSON.stringify({
              error: "cash_code_required",
              message:
                "Cash deposits can only be credited after the depositor enters the receipt code. This deposit has not been code-verified.",
              unverified_ids: unverified.map((d) => d.id),
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // For system auto-credit, impersonate the deposit owner now that we
    // know who it is. All rows in a single call must belong to the same
    // owner — refuse otherwise.
    if (isSystemAutoCredit) {
      const ownerId = depositRequests[0].user_id;
      if (!depositRequests.every((d) => d.user_id === ownerId)) {
        return new Response(
          JSON.stringify({ error: 'system_auto_credit: mixed owners not allowed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      user = { id: ownerId };
    }
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: isManagerRole } = isSystemAutoCredit
      ? { data: null }
      : await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "manager")
          .maybeSingle();

    const { data: processorProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const processorName = isSystemAutoCredit
      ? 'System Auto-Credit'
      : (processorProfile?.full_name || "Manager");

    // ── Cash-deposit system credit bypass ───────────────────────────────
    // The cash-deposit-verify-code function calls us with the service-role
    // key + system_auto_credit:true AFTER it has hashed + matched the
    // depositor's receipt code, enforced expiry/attempt limits, and atomically
    // claimed the verification row. The code check IS the authorization, so we
    // skip the MoMo gmail re-verification / agent-ownership gate below — but
    // ONLY for genuine cash deposits (every row provider='cash_deposit',
    // pending) approved via the trusted service-role path. Any other provider
    // still falls through to the existing checks.
    const eligibleCashSystemCredit =
      isSystemAutoCredit &&
      action === 'approve' &&
      depositRequests.every(
        (d) =>
          String(d.provider || '').toLowerCase() === 'cash_deposit' &&
          String(d.status) === 'pending',
      );

    if (!isManagerRole && !eligibleCashSystemCredit) {
      // ── Auto-approve path (MoMo gmail match) ──────────────────────────
      // A regular user (typically an agent) can self-approve their OWN
      // pending deposit IF and ONLY IF:
      //   • the request body carries `auto_approved:true` + action `approve`
      //   • they are the deposit's `user_id` (owner)
      //   • provider is MTN ('mtn') or Airtel ('airtel') — bank refs still
      //     require a human reviewer
      //   • server-side we can re-prove a parsed `gmail_transactions` row
      //     exists, was linked to THIS deposit by `try_link_gmail_for_deposit`,
      //     direction='in'/'credit', amount matches, normalized TID matches,
      //     and the receipt is at most 7 days old.
      // This bypass leans on `gmail_transactions` being service-role-write
      // only — the client cannot fabricate a match.
      const ownerOnly = depositRequests.every(
        (d) => d.user_id === user.id || d.agent_id === user.id,
      );
      const eligibleAutoApprove =
        action === 'approve' &&
        !!auto_approved &&
        ownerOnly &&
        depositRequests.every(
          (d) =>
            d.user_id === user.id &&
            ['mtn', 'airtel'].includes(String(d.provider || '').toLowerCase()) &&
            String(d.status) === 'pending',
        );

      if (eligibleAutoApprove) {
        // Re-verify each row has a real linked Gmail receipt that proves
        // provider+TID+amount match. We never trust the client flag alone.
        let allVerified = true;
        for (const dep of depositRequests) {
          const normDigits = String(dep.transaction_id || '').replace(/[^0-9]/g, '');
          if (!normDigits) { allVerified = false; break; }
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          const { data: gmailMatch } = await supabaseAdmin
            .from('gmail_transactions')
            .select('id, amount, transaction_id, direction, internal_date')
            .eq('linked_deposit_request_id', dep.id)
            .eq('parsed', true)
            .in('direction', ['in', 'credit'])
            .gte('internal_date', sevenDaysAgo)
            .limit(1)
            .maybeSingle();
          if (!gmailMatch) { allVerified = false; break; }
          const gDigits = String(gmailMatch.transaction_id || '').replace(/[^0-9]/g, '');
          if (gDigits !== normDigits) { allVerified = false; break; }
          if (Number(gmailMatch.amount) !== Number(dep.amount)) { allVerified = false; break; }
        }
        if (!allVerified) {
          for (const d of depositRequests) {
            await logDepositDecision(supabaseAdmin, {
              source: "approval",
              decision: "blocked",
              reason: "auto_approve_unverified",
              deposit_request_id: d.id,
              amount: Number(d.amount),
              actor_id: user?.id ?? null,
              actor_email: actorEmail,
              metadata: { provider: d.provider ?? null, transaction_id: d.transaction_id ?? null },
            });
          }
          return new Response(
            JSON.stringify({
              error: 'auto_approve_unverified',
              message:
                'No matching mobile-money receipt could be re-verified server-side. Submission still goes to Financial Ops review.',
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        // ✅ Owner + verified gmail match. Allow the approval to proceed.
      } else {
      const unauthorized = depositRequests.filter(d => d.agent_id !== user.id);
      if (unauthorized.length > 0) {
        for (const d of unauthorized) {
          await logDepositDecision(supabaseAdmin, {
            source: "approval",
            decision: "blocked",
            reason: "not_authorized",
            deposit_request_id: d.id,
            amount: Number(d.amount),
            actor_id: user?.id ?? null,
            actor_email: actorEmail,
            metadata: { action },
          });
        }
        return new Response(
          JSON.stringify({ error: "Not authorized to process some requests" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      }
    }

    const results: Array<{ id: string; status: string; amount: number; user_id: string; repayment_applied?: number; debt_cleared?: number; days_prepaid?: number }> = [];

    for (const depositRequest of depositRequests) {
      const depositStartedAt = Date.now();
      const isLargeDeposit = Number(depositRequest.amount) >= 10_000_000;
      // ── Purpose → ledger-category mapping (single source of truth) ──
      // The ledger category drives wallet routing via wallet_route_for_category:
      //   - 'agent_float_deposit' → wallets.float_balance
      //   - 'wallet_deposit'      → wallets.withdrawable_balance
      // The UI collects deposit_purpose; the edge function (here) chooses
      // the category. Wallet buckets are NEVER computed in the UI or written
      // directly — the routing trigger + apply_wallet_movement own that.
      const rawPurpose = (depositRequest.deposit_purpose || '').toString().trim().toLowerCase();
      // Auto-verified deposits (matched against MoMo email receipt by the
      // system / Zero-Touch poller / EmailAutoMatchPanel) ALWAYS land in
      // Operational Float — that's the platform default for agent-sourced
      // mobile-money inflows. The user can still pick 'personal_deposit'
      // explicitly in the UI, but if the deposit was auto-approved we
      // override the bucket to float regardless of `deposit_purpose`.
      const isFloatDeposit =
        rawPurpose === 'operational_float' ||
        (!!auto_approved && rawPurpose !== 'personal_deposit');
      const depositCategory: 'agent_float_deposit' | 'wallet_deposit' =
        isFloatDeposit ? 'agent_float_deposit' : 'wallet_deposit';
      const depositBucket: 'float' | 'withdrawable' =
        isFloatDeposit ? 'float' : 'withdrawable';
      if (!rawPurpose) {
        // Missing purpose → safe default to personal (withdrawable). Logged
        // so ops can spot any UI regression that stops sending purpose.
        console.warn(
          `[approve-deposit] deposit_purpose missing for ${depositRequest.id}; ` +
          `defaulting to wallet_deposit (withdrawable). user=${depositRequest.user_id}`,
        );
      } else if (!['operational_float', 'personal_deposit'].includes(rawPurpose)) {
        // Unknown purpose (e.g. legacy 'partnership_deposit', 'other') →
        // keep historical behavior of crediting withdrawable, but log.
        console.warn(
          `[approve-deposit] Unrecognized deposit_purpose='${rawPurpose}' for ${depositRequest.id}; ` +
          `falling back to wallet_deposit (withdrawable).`,
        );
      }
      if (isLargeDeposit) {
        console.log(
          `[approve-deposit] LARGE deposit start id=${depositRequest.id} ` +
          `amount=${depositRequest.amount} user=${depositRequest.user_id} action=${action} ` +
          `purpose=${rawPurpose || 'none'} category=${depositCategory}`,
        );
      }
      try {
        if (action === "approve") {
          // ── Idempotency guard ────────────────────────────────────────
          // The wallet-credit ledger RPC and the `status='approved'` UPDATE
          // are TWO separate writes. If the UPDATE silently fails (RLS,
          // trigger reject without raising, race), the row stays 'pending'
          // and the operator re-clicks Approve → ledger credits AGAIN.
          //
          // We've seen this in production (LUKODDA JOSEPH, 2026-04-27 —
          // single deposit credited 3×). Refuse to re-credit if a
          // wallet_deposit ledger entry for this deposit already exists.
          {
            const { count: existingCredits, error: existingErr } =
              await supabaseAdmin
                .from('general_ledger')
                .select('id', { count: 'exact', head: true })
                .eq('source_table', 'deposit_requests')
                .eq('source_id', depositRequest.id)
                .in('category', ['wallet_deposit', 'agent_float_deposit'])
                .eq('direction', 'cash_in')
                .eq('ledger_scope', 'wallet');

            if (!existingErr && (existingCredits ?? 0) > 0) {
              // Wallet was already credited on a prior call — just reconcile
              // the request status (which clearly didn't stick last time)
              // and return success without touching the ledger.
              console.warn(
                `[approve-deposit] Idempotent re-approve for ${depositRequest.id} — ` +
                `${existingCredits} existing wallet_deposit credit(s); skipping ledger RPC.`,
              );

              const { data: reconRows, error: reconErr } = await supabaseAdmin
                .from('deposit_requests')
                .update({
                  status: 'approved',
                  approved_at:
                    depositRequest.approved_at || new Date().toISOString(),
                  processed_by: depositRequest.processed_by || user.id,
                })
                .eq('id', depositRequest.id)
                .eq('status', 'pending')
                .select('id');

              await supabaseAdmin.from('audit_logs').insert({
                user_id: user.id,
                action_type: 'approve_idempotent_skip',
                table_name: 'deposit_requests',
                record_id: depositRequest.id,
                metadata: {
                  amount: depositRequest.amount,
                  target_user_id: depositRequest.user_id,
                  existing_wallet_credits: existingCredits,
                  reconcile_update_rows: reconRows?.length ?? 0,
                  reconcile_update_error: reconErr?.message ?? null,
                  transaction_id: depositRequest.transaction_id ?? null,
                },
              });

              results.push({
                id: depositRequest.id,
                status: 'approved',
                amount: depositRequest.amount,
                user_id: depositRequest.user_id,
              });
              continue;
            }
          }

          // Ensure wallet row exists. The wallet bucket is NOT credited by any
          // trigger (sync_wallet_from_ledger has been a permanent no-op since
          // 2026-04-23 — see Wallet sole-writer rule). The actual bucket credit
          // happens via the explicit apply_wallet_movement RPC call below, AFTER
          // the ledger post + status flip succeed.
          //
          // We intentionally do NOT mark the request 'approved' yet — only after
          // the wallet-deposit ledger RPC succeeds. This prevents a "phantom-
          // approved" request with no corresponding wallet credit if the RPC fails.
          await supabaseAdmin
            .from("wallets")
            .upsert({ user_id: depositRequest.user_id, balance: 0, updated_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });

          // ── Ledger-first deposit credit (balanced double-entry) ──
          const { error: depositLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
            entries: [
              {
                user_id: depositRequest.user_id,
                amount: depositRequest.amount,
                direction: 'cash_in',
                category: depositCategory,
                ledger_scope: 'wallet',
                source_table: 'deposit_requests',
                source_id: depositRequest.id,
                reference_id: depositRequest.transaction_id || depositRequest.id,
                description: isFloatDeposit
                  ? `Operational float deposit via ${depositRequest.provider || 'mobile money'}`
                  : `Wallet deposit via ${depositRequest.provider || 'mobile money'}`,
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
              },
              {
                direction: 'cash_out',
                amount: depositRequest.amount,
                category: depositCategory,
                ledger_scope: 'platform',
                source_table: 'deposit_requests',
                source_id: depositRequest.id,
                description: isFloatDeposit
                  ? 'Platform: float deposit credited to agent float bucket'
                  : 'Platform liability: deposit credited to user wallet',
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
              },
            ],
          });

          if (depositLedgerErr) {
            console.error(`[approve-deposit] Deposit ledger entry failed for ${depositRequest.id}:`, depositLedgerErr.message);
            // Phantom-approved guard: keep the request out of 'approved' state and
            // mark it 'failed' with a reason so ops can retry rather than the user
            // seeing an "approved" deposit they never received.
            await supabaseAdmin
              .from("deposit_requests")
              .update({
                status: "failed",
                rejection_reason: `Ledger credit failed: ${depositLedgerErr.message?.slice(0, 500) || 'unknown error'}`,
                processed_by: user.id,
              })
              .eq("id", depositRequest.id);

            // Audit trail — schema-correct insert (audit_logs has: user_id,
            // action_type, table_name, record_id, metadata). All contextual
            // detail (old/new state, reason) lives in metadata.
            await supabaseAdmin.from("audit_logs").insert({
              user_id: user.id,
              action_type: "approve_failed",
              table_name: "deposit_requests",
              record_id: depositRequest.id,
              metadata: {
                amount: depositRequest.amount,
                target_user_id: depositRequest.user_id,
                old_status: "pending",
                new_status: "failed",
                reason: `Wallet credit RPC failed: ${depositLedgerErr.message?.slice(0, 500) || 'unknown'}`,
                deposit_purpose: depositRequest.deposit_purpose ?? null,
                provider: depositRequest.provider ?? null,
                transaction_id: depositRequest.transaction_id ?? null,
              },
            });

            // Monitoring signal — emit deposit_failed so ops dashboards see
            // stuck deposits without scraping audit_logs.
            await logSystemEvent(
              supabaseAdmin,
              "deposit_failed",
              depositRequest.user_id,
              "deposit_requests",
              depositRequest.id,
              {
                amount: depositRequest.amount,
                processed_by: user.id,
                rpc: "create_ledger_transaction",
                error: depositLedgerErr.message?.slice(0, 500) || "unknown",
                provider: depositRequest.provider ?? null,
                transaction_id: depositRequest.transaction_id ?? null,
                deposit_purpose: depositRequest.deposit_purpose ?? null,
              },
            );

            throw new Error(`Deposit ledger entry failed: ${depositLedgerErr.message}`);
          }

          // ✅ Ledger credit confirmed — NOW mark the request approved.
          // CRITICAL: capture the result and verify a row was actually
          // updated. A silent failure here (RLS, trigger, race) is what
          // caused the LUKODDA JOSEPH 3× double-credit incident — the
          // ledger fired but the row stayed 'pending', so the operator
          // re-clicked and re-credited.
          const { data: updatedRows, error: updateErr } = await supabaseAdmin
            .from('deposit_requests')
            .update({
              status: 'approved',
              approved_at: new Date().toISOString(),
              processed_by: user.id,
            })
            .eq('id', depositRequest.id)
            .eq('status', 'pending')
            .select('id');

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            // The wallet was credited but the request couldn't be marked
            // approved. Surface this loudly so ops can intervene before
            // anyone re-clicks Approve. The idempotency guard above will
            // prevent a double-credit on retry, but we still need a hard
            // signal.
            const errMsg =
              updateErr?.message
              || 'deposit_requests UPDATE returned 0 rows (RLS or status race)';
            console.error(
              `[approve-deposit] CRITICAL: wallet credited but status update failed for ${depositRequest.id}: ${errMsg}`,
            );
            await supabaseAdmin.from('audit_logs').insert({
              user_id: user.id,
              action_type: 'approve_status_update_failed',
              table_name: 'deposit_requests',
              record_id: depositRequest.id,
              metadata: {
                amount: depositRequest.amount,
                target_user_id: depositRequest.user_id,
                error: errMsg,
                wallet_already_credited: true,
                transaction_id: depositRequest.transaction_id ?? null,
              },
            });
            throw new Error(
              `Wallet credited but failed to mark deposit approved: ${errMsg}`,
            );
          }

          // ── PERMANENT WALLET BUCKET CREDIT ───────────────────────────
          // The ledger has the truth; the wallet cache must now be moved.
          // `apply_wallet_movement` is the SOLE writer of wallet buckets
          // (Wallet sole-writer rule, 2026-04-23). `recipient_type` is the
          // SOLE bucket router (Wallet Routing v2):
          //   'operational_wallet' → wallets.float_balance
          //   'user'               → wallets.withdrawable_balance
          // Without this call, ledger and wallet drift forever — that is
          // the bug that left agent float deposits ledger-only / wallet-zero
          // since the sync trigger was retired.
          const recipientType: 'user' | 'operational_wallet' =
            isFloatDeposit ? 'operational_wallet' : 'user';
          const { error: walletWriterErr } = await withRetry(
            'apply_wallet_movement',
            depositRequest.id,
            () => supabaseAdmin.rpc('apply_wallet_movement', {
              p_user_id: depositRequest.user_id,
              p_category: depositCategory,
              p_amount: depositRequest.amount,
              p_direction: 'cash_in',
              p_recipient_type: recipientType,
            }),
          );
          if (walletWriterErr) {
            // Ledger is already posted and the request is already approved.
            // Do NOT roll those back — double-entry stays the source of truth.
            // Surface loudly: audit + system_event so CFO drift monitors
            // (phantom_wallet_drift cron, wallet_withdrawable_drift_alerts)
            // pick this up and the operator gets a hard signal.
            console.error(
              `[approve-deposit] CRITICAL: apply_wallet_movement failed for ${depositRequest.id} ` +
              `(ledger already posted, request already approved): ${walletWriterErr.message}`,
            );
            await supabaseAdmin.from('audit_logs').insert({
              user_id: user.id,
              action_type: 'approve_wallet_writer_failed',
              table_name: 'deposit_requests',
              record_id: depositRequest.id,
              metadata: {
                amount: depositRequest.amount,
                target_user_id: depositRequest.user_id,
                category: depositCategory,
                recipient_type: recipientType,
                error: String(walletWriterErr.message ?? walletWriterErr).slice(0, 500),
                ledger_already_posted: true,
                request_already_approved: true,
              },
            });
            await logSystemEvent(
              supabaseAdmin,
              'wallet.writer_failed',
              depositRequest.user_id,
              'deposit_requests',
              depositRequest.id,
              {
                amount: depositRequest.amount,
                category: depositCategory,
                recipient_type: recipientType,
                error: String(walletWriterErr.message ?? walletWriterErr).slice(0, 500),
              },
            );
            throw new Error(
              `Deposit approved + ledger posted but wallet bucket credit failed: ${walletWriterErr.message}. ` +
              `Run reconciliation against v_user_wallet_strict.`,
            );
          }

          // ── STRICT BACKEND-AUTHORITY CONTRACT ───────────────────────
          // Every approved deposit lands in `withdrawable_balance`. Period.
          //
          // The previous "operational float sweep" (which inferred routing
          // from `deposit_purpose` + agent-role + proxy-status) has been
          // permanently removed. Routing money based on a frontend-supplied
          // purpose violated the strict contract:
          //   user intent → backend → ledger → trigger → wallet → realtime
          //
          // Float funding is now a separate, explicit, backend-only step
          // that the agent must invoke via `transfer-to-float`. The
          // `deposit_purpose` column is preserved for analytics ONLY and
          // is no longer read here.
          // ────────────────────────────────────────────────────────────

          // ── Step 1: Auto-deduct rent repayment ──
          // apply_wallet_movement (above) has now credited the wallet bucket.
          let repaymentApplied = 0;
          let rentRequestId: string | null = null;
          let newOutstanding = 0;
          // Declared at outer scope so post-block notification/audit (lines ~889+)
          // can reference them even when isFloatDeposit short-circuits the block.
          let debtCleared = 0;
          let daysPrepaid = 0;
          let prepaidAmount = 0;

          // Float deposits are operational money the agent collected from
          // tenants in the field. They must NEVER be auto-applied to the
          // depositing agent's own rent / debt / prepay — that money does
          // not belong to the agent personally. Skip the entire auto-apply
          // pipeline below for float deposits.
          if (!isFloatDeposit) {

          // Re-read wallet after ledger credit to know available balance
          const { data: walletAfterCredit } = await supabaseAdmin
            .from("wallets")
            .select("withdrawable_balance")
            .eq("user_id", depositRequest.user_id)
            .single();

          // Auto-apply only ever spends withdrawable money — never float.
          let availableBalance = Number(walletAfterCredit?.withdrawable_balance || 0);

          const { data: activeRentRequest } = await supabaseAdmin
            .from("rent_requests")
            .select("id, total_repayment, amount_repaid, rent_amount, status")
            .eq("tenant_id", depositRequest.user_id)
            .in("status", ["funded", "disbursed", "approved"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeRentRequest) {
            const outstanding = Number(activeRentRequest.total_repayment) - Number(activeRentRequest.amount_repaid);
            rentRequestId = activeRentRequest.id;

            if (outstanding > 0 && availableBalance > 0) {
              repaymentApplied = Math.min(availableBalance, outstanding);
              newOutstanding = outstanding - repaymentApplied;

              // Record repayment via RPC (updates rent_requests.amount_repaid, landlords.rent_balance_due, inserts repayment + ledger)
              const { error: repaymentError } = await supabaseAdmin.rpc(
                "record_rent_request_repayment",
                { p_tenant_id: depositRequest.user_id, p_amount: repaymentApplied }
              );

              if (repaymentError) {
                console.error(`[approve-deposit] Repayment RPC failed for ${depositRequest.id}:`, repaymentError.message);
                repaymentApplied = 0;
                newOutstanding = outstanding;
              } else {
                // Balanced RPC: wallet cash_out + platform cash_in (retried on transient failures)
                const rentLedgerRes = await withRetry<string>(
                  'rent_repayment_ledger',
                  depositRequest.id,
                  () => supabaseAdmin.rpc('create_ledger_transaction', {
                  entries: [
                    {
                      user_id: depositRequest.user_id,
                      amount: repaymentApplied,
                      direction: 'cash_out',
                      category: 'tenant_repayment',
                      ledger_scope: 'wallet',
                      source_table: 'deposit_requests',
                      source_id: depositRequest.id,
                      reference_id: depositRequest.transaction_id || depositRequest.id,
                      description: `Auto rent deduction from deposit (TXN: ${depositRequest.transaction_id || 'N/A'})`,
                      currency: 'UGX',
                      linked_party: rentRequestId,
                      transaction_date: new Date().toISOString(),
                    },
                    {
                      direction: 'cash_in',
                      amount: repaymentApplied,
                      category: 'tenant_repayment',
                      ledger_scope: 'platform',
                      source_table: 'deposit_requests',
                      source_id: depositRequest.id,
                      description: `Platform receives rent repayment from deposit`,
                      currency: 'UGX',
                      transaction_date: new Date().toISOString(),
                    },
                  ],
                  }),
                );
                const txGroupId = rentLedgerRes.data;
                const rentLedgerErr = rentLedgerRes.error;
                if (rentLedgerErr) {
                  console.error(
                    `[approve-deposit] Rent ledger RPC permanently failed for ${depositRequest.id} ` +
                    `after ${rentLedgerRes.attempts} attempts (${rentLedgerRes.ms}ms):`,
                    rentLedgerErr,
                  );
                }

                availableBalance -= repaymentApplied;

                // ── Credit agent commission via RPC (single-writer — RPC owns commission) ──
                if (rentRequestId) {
                  await supabaseAdmin.rpc("credit_agent_rent_commission", {
                    p_rent_request_id: rentRequestId,
                    p_repayment_amount: repaymentApplied,
                    p_tenant_id: depositRequest.user_id,
                    p_event_reference_id: `approve-deposit-rent-${txGroupId}`,
                  });
                }
              }
            }
          }

          // ── Step 2: Clear accumulated debt & pre-pay future days ──
          // (debtCleared/daysPrepaid/prepaidAmount declared at outer scope above)
          let newNextChargeDate: string | null = null;

          const { data: activeSub } = await supabaseAdmin
            .from("subscription_charges")
            .select("id, accumulated_debt, charge_amount, charges_remaining, charges_completed, next_charge_date, tenant_failed_at, rent_request_id")
            .eq("tenant_id", depositRequest.user_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeSub) {
            // Re-read wallet to get actual balance (trigger may have updated it)
            const { data: walletNow } = await supabaseAdmin
              .from("wallets").select("balance")
              .eq("user_id", depositRequest.user_id).single();

            availableBalance = walletNow?.balance || 0;
            const subTxGroupId = crypto.randomUUID();

            // 2a. Clear accumulated debt
            const debt = Number(activeSub.accumulated_debt || 0);
            if (debt > 0 && availableBalance > 0) {
              debtCleared = Math.min(debt, availableBalance);

              // Update subscription debt
              await supabaseAdmin
                .from("subscription_charges")
                .update({ accumulated_debt: debt - debtCleared, updated_at: new Date().toISOString() })
                .eq("id", activeSub.id);

              // Balanced RPC: wallet cash_out + platform cash_in for debt clearance (retried on transient failures)
              const debtLedgerRes = await withRetry<string>(
                'debt_clearance_ledger',
                depositRequest.id,
                () => supabaseAdmin.rpc('create_ledger_transaction', {
                entries: [
                  {
                    user_id: depositRequest.user_id,
                    amount: debtCleared,
                    direction: 'cash_out',
                    category: 'tenant_repayment',
                    ledger_scope: 'wallet',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    reference_id: depositRequest.transaction_id || depositRequest.id,
                    description: `Auto debt clearance from deposit (UGX ${debtCleared.toLocaleString()})`,
                    currency: 'UGX',
                    linked_party: activeSub.rent_request_id,
                    transaction_date: new Date().toISOString(),
                  },
                  {
                    direction: 'cash_in',
                    amount: debtCleared,
                    category: 'tenant_repayment',
                    ledger_scope: 'platform',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    description: `Platform receives debt clearance from deposit`,
                    currency: 'UGX',
                    transaction_date: new Date().toISOString(),
                  },
                ],
                }),
              );
              const debtLedgerErr = debtLedgerRes.error;
              if (debtLedgerErr) {
                console.error(
                  `[approve-deposit] Debt ledger RPC permanently failed for ${depositRequest.id} ` +
                  `after ${debtLedgerRes.attempts} attempts (${debtLedgerRes.ms}ms):`,
                  debtLedgerErr,
                );
              }

              availableBalance -= debtCleared;

              // Record as rent repayment if linked to a rent request
              if (activeSub.rent_request_id) {
                await supabaseAdmin.rpc("record_rent_request_repayment", {
                  p_tenant_id: depositRequest.user_id,
                  p_amount: debtCleared,
                });

                // Credit agent commission via RPC (single-writer)
                if (activeSub.rent_request_id) {
                  await supabaseAdmin.rpc("credit_agent_rent_commission", {
                    p_rent_request_id: activeSub.rent_request_id,
                    p_repayment_amount: debtCleared,
                    p_tenant_id: depositRequest.user_id,
                    p_event_reference_id: `approve-deposit-debt-${subTxGroupId}`,
                  });
                }
              }
            }

            // 2b. Pre-pay future days if surplus remains
            // Re-read wallet again since trigger may have fired
            const { data: walletForPrepay } = await supabaseAdmin
              .from("wallets").select("balance")
              .eq("user_id", depositRequest.user_id).single();
            availableBalance = walletForPrepay?.balance || 0;

            const chargeAmount = Number(activeSub.charge_amount || 0);
            const chargesRemaining = Number(activeSub.charges_remaining || 0);
            if (chargeAmount > 0 && availableBalance >= chargeAmount && chargesRemaining > 0) {
              daysPrepaid = Math.min(
                Math.floor(availableBalance / chargeAmount),
                chargesRemaining
              );
              prepaidAmount = daysPrepaid * chargeAmount;

              const currentNext = new Date(activeSub.next_charge_date);
              currentNext.setDate(currentNext.getDate() + daysPrepaid);
              newNextChargeDate = currentNext.toISOString();

              // Update subscription
              await supabaseAdmin
                .from("subscription_charges")
                .update({
                  charges_completed: Number(activeSub.charges_completed || 0) + daysPrepaid,
                  charges_remaining: chargesRemaining - daysPrepaid,
                  next_charge_date: newNextChargeDate,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", activeSub.id);

              // Balanced RPC: wallet cash_out + platform cash_in for prepaid fees (retried on transient failures)
              const prepayLedgerRes = await withRetry<string>(
                'prepay_ledger',
                depositRequest.id,
                () => supabaseAdmin.rpc('create_ledger_transaction', {
                entries: [
                  {
                    user_id: depositRequest.user_id,
                    amount: prepaidAmount,
                    direction: 'cash_out',
                    category: 'tenant_repayment',
                    ledger_scope: 'wallet',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    reference_id: depositRequest.transaction_id || depositRequest.id,
                    description: `Pre-paid ${daysPrepaid} days (UGX ${prepaidAmount.toLocaleString()})`,
                    currency: 'UGX',
                    linked_party: activeSub.rent_request_id,
                    transaction_date: new Date().toISOString(),
                  },
                  {
                    direction: 'cash_in',
                    amount: prepaidAmount,
                    category: 'access_fee_collected',
                    ledger_scope: 'platform',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    description: `Pre-paid ${daysPrepaid} days access fee`,
                    currency: 'UGX',
                    transaction_date: new Date().toISOString(),
                  },
                ],
                }),
              );
              const prepayLedgerErr = prepayLedgerRes.error;
              if (prepayLedgerErr) {
                console.error(
                  `[approve-deposit] Prepay ledger RPC permanently failed for ${depositRequest.id} ` +
                  `after ${prepayLedgerRes.attempts} attempts (${prepayLedgerRes.ms}ms):`,
                  prepayLedgerErr,
                );
              }

              availableBalance -= prepaidAmount;

              // Record as rent repayment if linked
              if (activeSub.rent_request_id) {
                await supabaseAdmin.rpc("record_rent_request_repayment", {
                  p_tenant_id: depositRequest.user_id,
                  p_amount: prepaidAmount,
                });

                // Credit agent commission via RPC (single-writer)
                if (activeSub.rent_request_id) {
                  await supabaseAdmin.rpc("credit_agent_rent_commission", {
                    p_rent_request_id: activeSub.rent_request_id,
                    p_repayment_amount: prepaidAmount,
                    p_tenant_id: depositRequest.user_id,
                    p_event_reference_id: `approve-deposit-prepay-${subTxGroupId}`,
                  });
                }
              }
            }

            // 2c. Clear grace period
            if (activeSub.tenant_failed_at && (debtCleared > 0 || prepaidAmount > 0)) {
              await supabaseAdmin
                .from("subscription_charges")
                .update({ tenant_failed_at: null, updated_at: new Date().toISOString() })
                .eq("id", activeSub.id);
            }
            // ── Notify agent via push when debt is cleared ──
            if (debtCleared > 0 && depositRequest.agent_id) {
              const { data: tenantProfile } = await supabaseAdmin
                .from("profiles").select("full_name").eq("id", depositRequest.user_id).single();
              const tenantName = tenantProfile?.full_name || "A tenant";

              // In-app notification for the agent
              await supabaseAdmin.from("notifications").insert({
                user_id: depositRequest.agent_id,
                title: "Tenant Debt Cleared! ✅",
                message: `${tenantName}'s debt of UGX ${debtCleared.toLocaleString()} has been auto-cleared from their deposit.${daysPrepaid > 0 ? ` ${daysPrepaid} day(s) also pre-paid.` : ''}`,
                type: "success",
                metadata: {
                  tenant_id: depositRequest.user_id,
                  debt_cleared: debtCleared,
                  days_prepaid: daysPrepaid,
                  deposit_request_id: depositRequest.id,
                },
              });

              // Push notification to agent
              try {
                await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    userIds: [depositRequest.agent_id],
                    payload: {
                      title: "Tenant Debt Cleared! ✅",
                      body: `${tenantName}'s debt of UGX ${debtCleared.toLocaleString()} auto-cleared from deposit.`,
                      url: "/dashboard/agent",
                      type: "success",
                    },
                  }),
                });
              } catch (pushErr) {
                console.warn("[approve-deposit] Agent push notification failed:", pushErr);
              }
            }
          }
          } // end if (!isFloatDeposit) — float deposits skip auto-apply

          // ── Notification ──
          const repaymentNote = repaymentApplied > 0
            ? ` UGX ${repaymentApplied.toLocaleString()} auto-deducted for rent (remaining: UGX ${newOutstanding.toLocaleString()}).`
            : "";
          const debtNote = debtCleared > 0
            ? ` Debt of UGX ${debtCleared.toLocaleString()} cleared.`
            : "";
          const prepaidNote = daysPrepaid > 0
            ? ` ${daysPrepaid} future day(s) pre-paid (UGX ${prepaidAmount.toLocaleString()}). Next charge: ${newNextChargeDate ? new Date(newNextChargeDate).toLocaleDateString() : 'N/A'}.`
            : "";

          let notifTitle = "Deposit Approved! 💰";
          if (isFloatDeposit) notifTitle = "Float Deposit Approved! 🏘️";
          else if (debtCleared > 0 || daysPrepaid > 0) notifTitle = "Deposit Approved & Auto-Applied! 💰";
          else if (repaymentApplied > 0) notifTitle = "Deposit Approved & Rent Deducted! 💰";

          await supabaseAdmin.from("notifications").insert({
            user_id: depositRequest.user_id,
            title: auto_approved ? "Deposit Auto-Verified ⚡" : notifTitle,
            message: auto_approved
              ? `Your deposit of UGX ${depositRequest.amount.toLocaleString()} was automatically verified against the bank email${depositRequest.transaction_id ? ` (TID ${depositRequest.transaction_id})` : ''} and credited to your wallet.${repaymentNote}${debtNote}${prepaidNote}`
              : isFloatDeposit
              ? `Your operational float deposit of UGX ${depositRequest.amount.toLocaleString()} was approved by ${processorName} and credited to your Float bucket.`
              : `Your deposit of UGX ${depositRequest.amount.toLocaleString()} approved by ${processorName}.${repaymentNote}${debtNote}${prepaidNote}`,
            type: "success",
            metadata: {
              deposit_request_id: depositRequest.id,
              amount: depositRequest.amount,
              deposit_purpose: rawPurpose || null,
              ledger_category: depositCategory,
              wallet_bucket: depositBucket,
              repayment_applied: repaymentApplied,
              debt_cleared: debtCleared,
              days_prepaid: daysPrepaid,
              prepaid_amount: prepaidAmount,
              auto_approved: !!auto_approved,
              auto_match_method: auto_match_method ?? null,
            },
          });

          // ── Auto-approved: stamp flag + send branded receipt email ──
          // Triggered when the email auto-matcher (EmailAutoMatchPanel)
          // approves the deposit without operator review. The depositor
          // gets an instant in-app notification (above) AND a transactional
          // email with the credited amount and transaction reference.
          if (auto_approved) {
            try {
              await supabaseAdmin
                .from('deposit_requests')
                .update({ auto_approved: true })
                .eq('id', depositRequest.id);
            } catch (flagErr) {
              console.warn('[approve-deposit] auto_approved flag update failed:', flagErr);
            }

            try {
              const { data: depProfile } = await supabaseAdmin
                .from('profiles')
                .select('email, full_name, phone')
                .eq('id', depositRequest.user_id)
                .maybeSingle();
              // Treat placeholder emails (e.g. "0712345678@welile.user")
              // as missing — they won't deliver and just clutter the queue.
              const rawEmail = (depProfile?.email ?? '').trim();
              const isPlaceholderEmail =
                !rawEmail || /@welile\.user$/i.test(rawEmail);
              const recipientEmail = isPlaceholderEmail ? null : rawEmail;

              // Pull the freshly-credited bucket balance so the user sees
              // it in both the SMS and email receipt.
              const { data: walletRow } = await supabaseAdmin
                .from('wallets')
                .select('withdrawable_balance, float_balance')
                .eq('user_id', depositRequest.user_id)
                .maybeSingle();
              const isFloat = depositBucket === 'float';
              const newBucketBalance = Number(
                isFloat
                  ? walletRow?.float_balance ?? 0
                  : walletRow?.withdrawable_balance ?? 0,
              );
              const firstName =
                (depProfile?.full_name ?? '').split(' ')[0] || 'there';
              const fmtUGX = (n: number) =>
                `UGX ${Math.round(Number(n) || 0).toLocaleString('en-UG')}`;
              const providerLabelShort = (depositRequest.provider || 'MOBILE MONEY')
                .toString()
                .toUpperCase();
              const txRef =
                depositRequest.transaction_id ||
                `DEP-${String(depositRequest.id).slice(0, 8).toUpperCase()}`;

              // ── SMS receipt (Africa's Talking) ─────────────────────
              if (depProfile?.phone) {
                const bucketLabel = isFloat
                  ? 'Operational Float'
                  : 'Wallet';
                // Last 4 digits of the credited phone so the user can verify
                // the deposit landed on the right MoMo number (important
                // when an account has multiple SIMs / proxy phones).
                const phoneDigits = String(depProfile.phone).replace(/\D/g, '');
                const phoneTail = phoneDigits.slice(-4) || '----';
                const smsMsg =
                  `Welile: Hi ${firstName}, ${fmtUGX(depositRequest.amount)} from ` +
                  `${providerLabelShort} (TID ${txRef}) was auto-credited to your ` +
                  `${bucketLabel} on phone •••${phoneTail}. New ${isFloat ? 'float' : 'wallet'} balance: ` +
                  `${fmtUGX(newBucketBalance)}.` +
                  `\n\nAccess your dashboard to view your wallet, transactions, and account details:\n` +
                  `https://welileapp.com/ZQhyGb`;
               await sendSmsViaAfricasTalking(depProfile.phone, smsMsg, {
                 admin: supabaseAdmin,
                 recipientUserId: depositRequest.user_id,
                 recipientName: depProfile?.full_name ?? null,
                 referenceId: String(depositRequest.id),
               });
              } else {
                console.warn(
                  `[approve-deposit] no phone for user ${depositRequest.user_id}; skipping auto-approval SMS`,
                );
              }

              if (recipientEmail) {
                const txRef =
                  depositRequest.transaction_id ||
                  `DEP-${String(depositRequest.id).slice(0, 8).toUpperCase()}`;
                const sourceLabel = (depositRequest.provider || 'email_match')
                  .toString()
                  .toUpperCase();
                // Use the float-specific receipt template when the deposit
                // was credited to the Operational Float bucket; otherwise
                // fall back to the generic wallet-deposit template.
                const templateName = isFloat
                  ? 'operational-float-credit'
                  : 'partner-wallet-deposit';
                const baseTemplateData: Record<string, unknown> = {
                  partner_name: depProfile?.full_name || 'Customer',
                  transaction_id: txRef,
                  amount: Number(depositRequest.amount) || 0,
                  currency: 'UGX',
                  date: new Date().toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  }),
                  source: isFloat
                    ? providerLabelShort === 'MTN'
                      ? 'MTN MoMo'
                      : providerLabelShort === 'AIRTEL'
                        ? 'Airtel Money'
                        : `Auto-verified · ${sourceLabel}`
                    : `Auto-verified · ${sourceLabel}`,
                };
                if (isFloat) {
                  baseTemplateData.new_float_balance = newBucketBalance;
                }
                const { error: emailErr } = await supabaseAdmin.functions.invoke(
                  'send-transactional-email',
                  {
                    body: {
                      templateName,
                      recipientEmail,
                      idempotencyKey: `auto-deposit-${depositRequest.id}`,
                      templateData: baseTemplateData,
                    },
                  },
                );
                if (emailErr) {
                  console.warn(
                    '[approve-deposit] auto-approval email send failed:',
                    emailErr,
                  );
                }
              } else {
                console.warn(
                  `[approve-deposit] no deliverable email for user ${depositRequest.user_id} (raw="${rawEmail}"); skipping auto-approval email`,
                );
              }
            } catch (mailErr) {
              console.warn('[approve-deposit] auto-approval email block threw:', mailErr);
            }
          }

          // Audit
          await supabaseAdmin.from("audit_logs").insert({
            action_type: "approve",
            table_name: "deposit_requests",
            record_id: depositRequest.id,
            performed_by: user.id,
            old_values: { status: "pending" },
            new_values: { status: "approved" },
            metadata: { amount: depositRequest.amount, repayment_applied: repaymentApplied, debt_cleared: debtCleared, days_prepaid: daysPrepaid, prepaid_amount: prepaidAmount },
          });

          results.push({ id: depositRequest.id, status: "approved", amount: depositRequest.amount, user_id: depositRequest.user_id, repayment_applied: repaymentApplied, debt_cleared: debtCleared, days_prepaid: daysPrepaid });
        } else {
          // Reject — safeRejectionReason is guaranteed non-empty (validated above).
          await supabaseAdmin
            .from("deposit_requests")
            .update({
              status: "rejected",
              rejected_at: new Date().toISOString(),
              rejection_reason: safeRejectionReason,
              processed_by: user.id,
            })
            .eq("id", depositRequest.id);

          await supabaseAdmin.from("notifications").insert({
            user_id: depositRequest.user_id,
            title: "Deposit Rejected ❌",
            message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} rejected by ${processorName}. Reason: ${safeRejectionReason}`,
            type: "warning",
            metadata: { deposit_request_id: depositRequest.id, amount: depositRequest.amount, reason: safeRejectionReason },
          });

          await supabaseAdmin.from("audit_logs").insert({
            action_type: "reject",
            table_name: "deposit_requests",
            record_id: depositRequest.id,
            performed_by: user.id,
            old_values: { status: "pending" },
            new_values: { status: "rejected" },
            reason: safeRejectionReason || "Rejected by manager",
            metadata: { amount: depositRequest.amount },
          });

          results.push({ id: depositRequest.id, status: "rejected", amount: depositRequest.amount, user_id: depositRequest.user_id });
        }
        if (isLargeDeposit) {
          console.log(
            `[approve-deposit] LARGE deposit done id=${depositRequest.id} ` +
            `amount=${depositRequest.amount} action=${action} total_ms=${Date.now() - depositStartedAt}`,
          );
        }
      } catch (innerErr) {
        console.error(
          `[approve-deposit] Error processing ${depositRequest.id} ` +
          `(amount=${depositRequest.amount}, total_ms=${Date.now() - depositStartedAt}):`,
          innerErr,
        );
        const alreadyCredited = action === 'approve'
          ? await supabaseAdmin
              .from('general_ledger')
              .select('id', { count: 'exact', head: true })
              .eq('source_table', 'deposit_requests')
              .eq('source_id', depositRequest.id)
              .in('category', ['wallet_deposit', 'agent_float_deposit'])
              .eq('direction', 'cash_in')
              .eq('ledger_scope', 'wallet')
          : { count: 0 };

        if (action === 'approve' && (alreadyCredited.count ?? 0) > 0) {
          await supabaseAdmin
            .from('deposit_requests')
            .update({
              status: 'approved',
              approved_at: depositRequest.approved_at || new Date().toISOString(),
              processed_by: depositRequest.processed_by || user.id,
            })
            .eq('id', depositRequest.id);
          results.push({ id: depositRequest.id, status: "approved", amount: depositRequest.amount, user_id: depositRequest.user_id });
        } else {
          results.push({ id: depositRequest.id, status: "error", amount: depositRequest.amount, user_id: depositRequest.user_id });
        }
      }
    }

    console.log(`[approve-deposit] ${processorName} ${action}d ${results.filter(r => r.status !== 'error').length}/${depositRequests.length} deposits`);

    // Log system events for each processed deposit
    for (const r of results) {
      if (r.status !== 'error') {
        logSystemEvent(supabaseAdmin, action === 'approve' ? 'deposit_approved' : 'deposit_rejected', user.id, 'deposit_requests', r.id, { amount: r.amount, user_id: r.user_id });
      }
    }

    // Deposit-decision audit trail — record the final outcome of every
    // processed deposit attempt (approved / rejected / failed) alongside
    // the block/reject reasons already logged above.
    for (const r of results) {
      await logDepositDecision(supabaseAdmin, {
        source: "approval",
        decision: r.status === "error" ? "failed" : r.status,
        reason:
          r.status === "rejected"
            ? (safeRejectionReason ?? "rejected")
            : r.status === "error"
              ? "processing_error"
              : null,
        deposit_request_id: r.id,
        amount: Number(r.amount),
        actor_id: user.id,
        actor_email: actorEmail,
        metadata: {
          action,
          target_user_id: r.user_id,
          auto_approved: !!auto_approved,
          system_auto_credit: isSystemAutoCredit,
          auto_match_method: auto_match_method ?? null,
          repayment_applied: (r as any).repayment_applied ?? null,
          debt_cleared: (r as any).debt_cleared ?? null,
          days_prepaid: (r as any).days_prepaid ?? null,
        },
      });
    }


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "💰 Deposit Processed", body: "Activity: deposit", url: "/dashboard/manager" }),
    }).catch(() => {});

    // Push notification to each approved user (fire-and-forget)
    for (const r of results) {
      if (r.status === "approved") {
        fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            userIds: [r.user_id],
            payload: { title: "✅ Deposit Approved", body: `Your deposit of UGX ${r.amount.toLocaleString()} has been approved`, url: "/dashboard/agent", type: "success" },
          }),
        }).catch(() => {});
      }
    }


    const failedCount = results.filter(r => r.status === 'error').length;

    return new Response(
      JSON.stringify({
        success: failedCount === 0,
        message: `${results.filter(r => r.status !== 'error').length} deposit(s) ${action}d`,
        results,
      }),
      { status: failedCount === 0 ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── SMS helper (Africa's Talking) ─────────────────────────────────────
// Mirrors the helper in gmail-poll-transactions so auto-approved deposits
// notify the user via SMS the moment funds land in their wallet bucket.
function formatPhoneIntl(phone: string): string {
  const d = String(phone || '').replace(/[^0-9]/g, '');
  if (d.startsWith('256')) return `+${d}`;
  if (d.startsWith('0')) return `+256${d.slice(1)}`;
  if (d.length === 9) return `+256${d}`;
  return `+${d}`;
}

async function sendSmsViaAfricasTalking(
  phone: string,
  message: string,
  logCtx?: {
    admin: ReturnType<typeof createClient>;
    recipientUserId?: string | null;
    recipientName?: string | null;
    referenceId?: string | null;
  },
): Promise<boolean> {
  if (await attemptYoolaPrimary(phone, message, { source: "approve-deposit" })) return true;
  const apiKey = Deno.env.get('AFRICASTALKING_API_KEY');
  const username = Deno.env.get('AFRICASTALKING_USERNAME');
  if (!apiKey || !username) {
    console.warn('[approve-deposit] AT credentials missing — skipping SMS');
    if (logCtx?.admin) {
      try {
        await logCtx.admin.from('sms_delivery_log').insert({
          recipient_phone: formatPhoneIntl(phone),
          recipient_user_id: logCtx.recipientUserId ?? null,
          recipient_name: logCtx.recipientName ?? null,
          message,
          status: 'failed',
          source: 'approve-deposit',
          reference_id: logCtx.referenceId ?? null,
          error: 'AT credentials missing',
        });
      } catch (_) { /* non-fatal */ }
    }
    return false;
  }
  const isSandbox = username.toLowerCase() === 'sandbox';
  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        username,
        to: formatPhoneIntl(phone),
        from: "WELILE",
        message,
      }).toString(),
    });
    const txt = await res.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { /* ignore */ }
    const recipients = data?.SMSMessageData?.Recipients ?? [];
    const ok = recipients.some(
      (r: any) => r.statusCode === 101 || r.statusCode === 100,
    );
    console.log(
      `[approve-deposit] SMS ${ok ? 'sent' : 'failed'} to ${formatPhoneIntl(phone)} (status ${res.status})`,
    );
    if (logCtx?.admin) {
      const recip = recipients[0] ?? {};
      try {
        await logCtx.admin.from('sms_delivery_log').insert({
          recipient_phone: formatPhoneIntl(phone),
          recipient_user_id: logCtx.recipientUserId ?? null,
          recipient_name: logCtx.recipientName ?? null,
          message,
          status: ok ? 'sent' : 'failed',
          source: 'approve-deposit',
          reference_id: logCtx.referenceId ?? null,
          provider_message_id: recip?.messageId ?? null,
          provider_response: data ?? { raw: txt.slice(0, 500) },
          cost: recip?.cost ?? null,
          error: ok ? null : (recip?.status ?? `HTTP ${res.status}`),
        });
      } catch (_) { /* non-fatal */ }
    }
    return ok;
  } catch (e) {
    console.warn('[approve-deposit] SMS send error:', e);
    if (logCtx?.admin) {
      try {
        await logCtx.admin.from('sms_delivery_log').insert({
          recipient_phone: formatPhoneIntl(phone),
          recipient_user_id: logCtx.recipientUserId ?? null,
          recipient_name: logCtx.recipientName ?? null,
          message,
          status: 'failed',
          source: 'approve-deposit',
          reference_id: logCtx.referenceId ?? null,
          error: String(e).slice(0, 500),
        });
      } catch (_) { /* non-fatal */ }
    }
    return false;
  }
}
