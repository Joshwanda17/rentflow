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
    console.error("[add-existing-subagent] Missing AT credentials");
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
    console.error("[add-existing-subagent] SMS send failed:", err);
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
    if (subAgentId === user.id) {
      return json({ error: "You cannot make yourself your own sub-agent." }, 400);
    }

    // Any authenticated user may add a sub-agent. If the caller is not yet an
    // agent, grant them the agent role so they become a parent agent and gain
    // an agent dashboard to manage the relationship (idempotent).
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("id, enabled")
      .eq("user_id", user.id)
      .eq("role", "agent")
      .maybeSingle();
    if (!callerRole) {
      const { error: callerRoleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: user.id, role: "agent", enabled: true });
      if (callerRoleErr && !callerRoleErr.message.toLowerCase().includes("duplicate")) {
        return json({ error: `Failed to grant agent role: ${callerRoleErr.message}` }, 500);
      }
    } else if (callerRole.enabled === false) {
      await adminClient
        .from("user_roles")
        .update({ enabled: true })
        .eq("id", callerRole.id);
    }

    // Caller's display name (used in the invite message).
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const parentName = callerProfile?.full_name || "A Welile agent";

    // Target user must exist.
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, phone, email")
      .eq("id", subAgentId)
      .maybeSingle();
    if (!targetProfile) {
      return json({ error: "Selected user was not found." }, 404);
    }

    // Ensure the target holds the agent role (idempotent).
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id, enabled")
      .eq("user_id", subAgentId)
      .eq("role", "agent")
      .maybeSingle();
    if (!existingRole) {
      const { error: roleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: subAgentId, role: "agent", enabled: true });
      if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) {
        return json({ error: `Failed to grant agent role: ${roleErr.message}` }, 500);
      }
    } else if (existingRole.enabled === false) {
      await adminClient
        .from("user_roles")
        .update({ enabled: true })
        .eq("id", existingRole.id);
    }

    // Link as a PENDING sub-agent of the caller — the sub-agent must accept
    // via the link they receive by email/SMS before the relationship (and any
    // commission) becomes active.
    const acceptanceToken = crypto.randomUUID();
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    const { data: existingLink } = await adminClient
      .from("agent_subagents")
      .select("id, parent_agent_id, status, acceptance_token")
      .eq("sub_agent_id", subAgentId)
      .maybeSingle();

    let effectiveToken = acceptanceToken;

    if (existingLink) {
      if (existingLink.parent_agent_id === user.id && existingLink.status === "verified") {
        return json({ ok: true, alreadyLinked: true, name: targetProfile.full_name });
      }
      // Re-issue a fresh pending invite (covers re-add after rejection, or a
      // re-send of an outstanding invite).
      const { error: updErr } = await adminClient
        .from("agent_subagents")
        .update({
          parent_agent_id: user.id,
          status: "pending_acceptance",
          source: "agent_self_assignment",
          verified_by: null,
          verified_at: null,
          accepted_at: null,
          acceptance_token: acceptanceToken,
          expires_at: inviteExpiresAt,
          rejection_reason: null,
        })
        .eq("id", existingLink.id);
      if (updErr) return json({ error: updErr.message }, 500);
    } else {
      const { error: insErr } = await adminClient
        .from("agent_subagents")
        .insert({
          parent_agent_id: user.id,
          sub_agent_id: subAgentId,
          source: "agent_self_assignment",
          status: "pending_acceptance",
          acceptance_token: acceptanceToken,
          expires_at: inviteExpiresAt,
        });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    // Notify the new sub-agent with the acceptance link (best-effort).
    const acceptLink = `${origin}/sub-agent-invite?token=${effectiveToken}`;
    const firstName = (targetProfile.full_name || "").trim().split(/\s+/)[0] || "there";
    let smsSent = false;
    let emailSent = false;

    if (targetProfile.phone) {
      smsSent = await sendSMS(
        targetProfile.phone,
        `Hi ${firstName}, ${parentName} invited you to be their sub-agent on Welile. Tap to accept: ${acceptLink}`,
      );
    }

    if (targetProfile.email && !targetProfile.email.endsWith("@welile.user")) {
      try {
        const { error: emailErr } = await adminClient.functions.invoke("send-transactional-email", {
          body: {
            templateName: "sub-agent-invite",
            recipientEmail: targetProfile.email,
            idempotencyKey: `subagent-invite-${effectiveToken}`,
            templateData: {
              recipient_name: targetProfile.full_name || "there",
              parent_name: parentName,
              accept_url: acceptLink,
            },
          },
        });
        emailSent = !emailErr;
      } catch (e) {
        console.error("[add-existing-subagent] email invoke failed:", e);
      }
    }

    return json({ ok: true, pending: true, name: targetProfile.full_name, smsSent, emailSent });
  } catch (err) {
    return json({ error: (err as Error)?.message || "Unexpected error" }, 500);
  }
});