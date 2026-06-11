import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function formatPhoneInternational(phone: string): string {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[resend-subagent-invite] Missing AT credentials");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  const to = formatPhoneInternational(phone);
  if (!to) return false;
  try {
    const body = new URLSearchParams({ username, to, message, from: "WELILE" });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
        Accept: "application/json",
      },
      body: body.toString(),
    });
    const raw = await res.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { return false; }
    const recipients = data?.SMSMessageData?.Recipients || [];
    return recipients.some((r: any) => r.statusCode === 100 || r.statusCode === 101);
  } catch (err) {
    console.error("[resend-subagent-invite] SMS send failed:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "No authorization header" }, 401);

    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const reqBody = await req.json().catch(() => ({}));
    const { subAgentId } = reqBody;
    const origin = typeof reqBody?.origin === "string" && reqBody.origin.startsWith("http")
      ? reqBody.origin.replace(/\/+$/, "")
      : "https://welilereceipts.com";

    if (!subAgentId || typeof subAgentId !== "string") {
      return json({ error: "Missing subAgentId" }, 400);
    }

    // Find the pending relationship where caller is the parent
    const { data: link, error: linkErr } = await adminClient
      .from("agent_subagents")
      .select("id, parent_agent_id, sub_agent_id, status, acceptance_token")
      .eq("parent_agent_id", user.id)
      .eq("sub_agent_id", subAgentId)
      .maybeSingle();

    if (linkErr) return json({ error: linkErr.message }, 500);
    if (!link) return json({ error: "No sub-agent relationship found." }, 404);
    if (link.status !== "pending_acceptance") {
      return json({ error: "This invite is no longer pending." }, 400);
    }

    // Regenerate a fresh acceptance token and extend expiration
    const newToken = crypto.randomUUID();
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updErr } = await adminClient
      .from("agent_subagents")
      .update({ acceptance_token: newToken, expires_at: inviteExpiresAt })
      .eq("id", link.id);
    if (updErr) return json({ error: updErr.message }, 500);

    // Get profiles for both parties
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const parentName = callerProfile?.full_name || "A Welile agent";

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", subAgentId)
      .maybeSingle();
    if (!targetProfile) return json({ error: "Sub-agent profile not found." }, 404);

    // Send notifications
    const acceptLink = `${origin}/sub-agent-invite?token=${newToken}`;
    const firstName = (targetProfile.full_name || "").trim().split(/\s+/)[0] || "there";
    let smsSent = false;
    let emailSent = false;

    if (targetProfile.phone) {
      smsSent = await sendSMS(
        targetProfile.phone,
        `Hi ${firstName}, ${parentName} re-sent your sub-agent invite on Welile. Tap to accept: ${acceptLink}`,
      );
    }

    if (targetProfile.email && !targetProfile.email.endsWith("@welile.user")) {
      try {
        const { error: emailErr } = await adminClient.functions.invoke("send-transactional-email", {
          body: {
            templateName: "sub-agent-invite",
            recipientEmail: targetProfile.email,
            idempotencyKey: `subagent-invite-resend-${newToken}`,
            templateData: {
              recipient_name: targetProfile.full_name || "there",
              parent_name: parentName,
              accept_url: acceptLink,
            },
          },
        });
        emailSent = !emailErr;
      } catch (e) {
        console.error("[resend-subagent-invite] email invoke failed:", e);
      }
    }

    return json({ ok: true, smsSent, emailSent, name: targetProfile.full_name });
  } catch (err) {
    return json({ error: (err as Error)?.message || "Unexpected error" }, 500);
  }
});
