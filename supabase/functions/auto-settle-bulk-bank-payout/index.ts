import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const gmailTxId: string | undefined = body?.gmail_transaction_id;
    if (!gmailTxId) {
      return new Response(JSON.stringify({ error: "gmail_transaction_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tx, error: txErr } = await admin
      .from("gmail_transactions")
      .select("id, amount, transaction_id, gmail_message_id, is_bulk_bank_payout, bulk_payout_allocated_total, bulk_payout_settled_at, raw_body, snippet, subject, internal_date")
      .eq("id", gmailTxId)
      .maybeSingle();
    if (txErr || !tx) {
      return new Response(JSON.stringify({ error: "gmail tx not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!tx.is_bulk_bank_payout) {
      return new Response(JSON.stringify({ skipped: "not_bulk_bank_payout" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tx.bulk_payout_settled_at) {
      return new Response(JSON.stringify({ skipped: "already_settled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Parse amount from body as fallback — SKYBUBBLES Equity emails don't populate the amount column
    let totalAmount = Number(tx.amount || 0);
    if (!totalAmount) {
      const haystack = `${tx.subject || ""} ${tx.snippet || ""} ${tx.raw_body || ""}`;
      // Match "54785000.00 UGX" or "54,785,000.00 UGX" or "UGX 54,785,000"
      const patterns = [
        /([\d,]+(?:\.\d+)?)\s*UGX\s*was\s*sent/i,
        /([\d,]+(?:\.\d+)?)\s*UGX/i,
        /UGX\s*([\d,]+(?:\.\d+)?)/i,
      ];
      for (const re of patterns) {
        const m = haystack.match(re);
        if (m) {
          const parsed = Number(m[1].replace(/,/g, ""));
          if (parsed > 0) { totalAmount = parsed; break; }
        }
      }
      if (totalAmount > 0) {
        await admin.from("gmail_transactions").update({ amount: totalAmount }).eq("id", gmailTxId);
      }
    }
    let remaining = totalAmount - Number(tx.bulk_payout_allocated_total || 0);
    if (!totalAmount || remaining <= 0) {
      return new Response(JSON.stringify({ skipped: "no_remaining_amount" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Date window: only allocate to withdrawals made the SAME calendar day (UTC) as the bulk email
    const emailDateIso = tx.internal_date ? new Date(tx.internal_date).toISOString() : null;
    const dayStart = emailDateIso ? `${emailDateIso.slice(0, 10)}T00:00:00.000Z` : null;
    const dayEnd = emailDateIso ? `${emailDateIso.slice(0, 10)}T23:59:59.999Z` : null;

    // Candidate withdrawal requests: bank payout, pending, created on same date as email
    let query = admin
      .from("withdrawal_requests")
      .select("id, user_id, amount, payout_method, agent_id, proxy_partner_id, status, created_at")
      .in("status", ["pending", "manager_approved", "cfo_approved"])
      .ilike("payout_method", "bank%")
      .order("created_at", { ascending: true })
      .limit(200);
    if (dayStart && dayEnd) {
      query = query.gte("created_at", dayStart).lte("created_at", dayEnd);
    }
    const { data: candidates } = await query;

    const { data: alreadyAllocated } = await admin
      .from("bulk_bank_payout_allocations")
      .select("withdrawal_request_id");
    const allocatedSet = new Set((alreadyAllocated || []).map((r: any) => r.withdrawal_request_id));

    const settled: any[] = [];
    const skipped: any[] = [];

    for (const wr of candidates || []) {
      if (remaining <= 0) break;
      if (allocatedSet.has(wr.id)) continue;
      const wrAmount = Number(wr.amount || 0);
      if (wrAmount <= 0) { skipped.push({ id: wr.id, reason: "zero_amount" }); continue; }
      if (wrAmount > remaining) { skipped.push({ id: wr.id, reason: "exceeds_remaining" }); continue; }

      // Resolve active managed proxy for this partner
      const { data: proxy } = await admin
        .from("proxy_agent_assignments")
        .select("agent_id, is_managed_account, created_at")
        .eq("beneficiary_id", wr.user_id)
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("is_managed_account", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!proxy?.agent_id) { skipped.push({ id: wr.id, reason: "no_proxy" }); continue; }

      // Check proxy strict withdrawable
      const { data: avail } = await admin.rpc("get_user_available_balance", {
        p_user_id: proxy.agent_id,
      });
      const proxyAvailable = Number(avail || 0);
      if (proxyAvailable < wrAmount) {
        skipped.push({ id: wr.id, reason: "proxy_insufficient", available: proxyAvailable });
        continue;
      }

      // Invoke approve-withdrawal as system call
      const ref = (tx.transaction_id || tx.gmail_message_id || `SKYBUBBLES-${gmailTxId.slice(0, 8)}`).toString();
      const resp = await fetch(`${supabaseUrl}/functions/v1/approve-withdrawal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          system_caller: true,
          withdrawal_id: wr.id,
          reference: ref,
          payment_method: "bank_transfer",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        await admin.from("bulk_bank_payout_allocations").insert({
          gmail_transaction_id: gmailTxId,
          withdrawal_request_id: wr.id,
          partner_id: wr.user_id,
          proxy_agent_id: proxy.agent_id,
          allocated_amount: wrAmount,
          status: "failed",
          error_message: errText.slice(0, 500),
          metadata: { http_status: resp.status },
        });
        skipped.push({ id: wr.id, reason: "approve_failed", status: resp.status });
        continue;
      }

      await admin.from("bulk_bank_payout_allocations").insert({
        gmail_transaction_id: gmailTxId,
        withdrawal_request_id: wr.id,
        partner_id: wr.user_id,
        proxy_agent_id: proxy.agent_id,
        allocated_amount: wrAmount,
        status: "settled",
        remaining_after: remaining - wrAmount,
        metadata: {
          reference: ref,
          email_tid: tx.transaction_id,
          settled_via: "bulk_bank_payout",
          batch_total: totalAmount,
          remaining_before: remaining,
          remaining_after: remaining - wrAmount,
          email_date: emailDateIso,
          withdrawal_date: wr.created_at,
        },
      });
      remaining -= wrAmount;
      settled.push({ id: wr.id, amount: wrAmount, proxy_agent_id: proxy.agent_id });

      try {
        await admin.from("audit_logs").insert({
          action_type: "withdrawal_bulk_settled_skybubbles",
          table_name: "withdrawal_requests",
          record_id: wr.id,
          reason: `Auto-settled via SKYBUBBLES bulk email ${gmailTxId.slice(0, 10)}`,
          metadata: {
            gmail_transaction_id: gmailTxId,
            partner_id: wr.user_id,
            proxy_agent_id: proxy.agent_id,
            allocated_amount: wrAmount,
          },
        });
      } catch (_) { /* non-fatal */ }

      // ── Notify proxy agent: wallet was debited + pending request cleared ──
      try {
        // Resolve agent email + names
        const { data: agentProfile } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("id", proxy.agent_id)
          .maybeSingle();
        const { data: partnerProfile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", wr.user_id)
          .maybeSingle();

        // Compute remaining in-flight for this partner AFTER this settlement
        const { data: stillPending } = await admin
          .from("withdrawal_requests")
          .select("amount")
          .eq("user_id", wr.user_id)
          .in("status", ["pending", "requested", "manager_approved", "cfo_approved", "processing"]);
        const remainingInFlight = (stillPending || [])
          .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

        if (agentProfile?.email) {
          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "proxy-payout-settled",
              recipientEmail: agentProfile.email,
              idempotencyKey: `proxy-payout-settled-${wr.id}`,
              templateData: {
                agent_name: agentProfile.full_name || "Agent",
                partner_name: partnerProfile?.full_name || "your partner",
                amount: wrAmount,
                currency: "UGX",
                reference: ref,
                date: new Date().toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                remaining_in_flight: remainingInFlight,
              },
            },
          });
        }

        // Emit system event so UIs (proxy agent dashboard) can refresh
        await admin.from("system_events").insert({
          event_type: "proxy.payout.settled",
          payload: {
            withdrawal_request_id: wr.id,
            partner_id: wr.user_id,
            proxy_agent_id: proxy.agent_id,
            amount: wrAmount,
            reference: ref,
            gmail_transaction_id: gmailTxId,
            remaining_in_flight: remainingInFlight,
          },
        });
      } catch (notifyEx) {
        console.warn("[auto-settle] proxy notification failed:", notifyEx);
      }
    }

    const newAllocated = totalAmount - remaining;
    await admin
      .from("gmail_transactions")
      .update({
        bulk_payout_allocated_total: newAllocated,
        bulk_payout_settled_at: remaining <= 0 ? new Date().toISOString() : null,
      })
      .eq("id", gmailTxId);

    try {
      await admin.from("system_events").insert({
        event_type: "gmail.bulk_skybubbles.processed",
        payload: {
          gmail_transaction_id: gmailTxId,
          total_amount: totalAmount,
          allocated: newAllocated,
          remaining,
          settled_count: settled.length,
          skipped_count: skipped.length,
        },
      });
    } catch (_) { /* non-fatal */ }

    return new Response(
      JSON.stringify({ ok: true, total: totalAmount, allocated: newAllocated, remaining, settled, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});