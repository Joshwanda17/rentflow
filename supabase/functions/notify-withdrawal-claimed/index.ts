import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── SMS helper (Africa's Talking) — mirrors approve-withdrawal ──────────
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
async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) return false;
  if (!isUgandanPhone(phone)) return false;
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const body = new URLSearchParams({
      username,
      to: formatPhoneInternational(phone),
      message,
      from: "WELILE",
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
    const data = await res.json();
    const recipients = data?.SMSMessageData?.Recipients || [];
    return recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
  } catch (err) {
    console.error("[notify-withdrawal-claimed] SMS error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate caller (must be a logged-in user).
    const authHeader = req.headers.get("Authorization") || "";
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

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must be an active merchant (cash-out) agent — only they claim payouts.
    const { data: agentRow } = await admin
      .from("cashout_agents")
      .select("id")
      .eq("agent_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!agentRow) {
      return new Response(JSON.stringify({ error: "Forbidden: not a merchant agent" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const withdrawalId = typeof body?.withdrawal_id === "string" ? body.withdrawal_id : null;
    if (!withdrawalId) {
      return new Response(JSON.stringify({ error: "withdrawal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the withdrawal and confirm it is claimed by THIS agent.
    const { data: w, error: wErr } = await admin
      .from("withdrawal_requests")
      .select("id, user_id, amount, assigned_cashout_agent_id")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (wErr || !w) {
      return new Response(JSON.stringify({ error: "Withdrawal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (w.assigned_cashout_agent_id !== agentRow.id) {
      return new Response(JSON.stringify({ error: "Withdrawal is not claimed by you" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve requester phone and merchant agent name.
    const [{ data: requester }, { data: merchant }] = await Promise.all([
      admin.from("profiles").select("full_name, phone").eq("id", w.user_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);

    const merchantName = (merchant as any)?.full_name?.trim() || "a Welile merchant agent";
    const amount = Number(w.amount) || 0;

    const smsMsg =
      `WELILE: Good news! Welile merchant agent ${merchantName} is now processing ` +
      `your withdrawal request of UGX ${amount.toLocaleString()}. ` +
      `You'll get another SMS once the payout is complete. ` +
      `Track it at https://welilereceipts.com/auth`;

    let sent = false;
    if ((requester as any)?.phone) {
      sent = await sendSMS((requester as any).phone, smsMsg);
    }

    // In-app notification center entry so the requester sees that a named
    // merchant agent is now processing their withdrawal — independent of SMS.
    // Fire-and-forget; never let a notification write fail the claim flow.
    try {
      await admin.from("notifications").insert({
        user_id: w.user_id,
        type: "info",
        title: "Withdrawal is being processed",
        message:
          `Welile merchant agent ${merchantName} is now processing your withdrawal ` +
          `of UGX ${amount.toLocaleString()}. You'll be notified again once the payout is complete.`,
        metadata: {
          kind: "withdrawal_update",
          stage: "processing",
          withdrawal_id: w.id,
          amount,
          merchant_agent: merchantName,
        },
      });
    } catch (e) {
      console.warn("[notify-withdrawal-claimed] notification insert failed:", e);
    }

    // Audit trail in the same log Financial Ops already watches.
    try {
      await admin.from("withdrawal_notification_log").insert({
        withdrawal_id: w.id,
        recipient_id: w.user_id,
        recipient_email: (requester as any)?.phone ?? null,
        amount,
        status: sent ? "sent" : "failed",
        error_message: sent
          ? null
          : ((requester as any)?.phone
              ? "Claim SMS provider rejected or unconfigured"
              : "No phone on file for the withdrawing user"),
      });
    } catch (e) {
      console.warn("[notify-withdrawal-claimed] log insert failed:", e);
    }

    return new Response(JSON.stringify({ ok: true, sent, merchant: merchantName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[notify-withdrawal-claimed] error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
