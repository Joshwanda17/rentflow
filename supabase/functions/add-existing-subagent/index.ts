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

    const { subAgentId } = await req.json().catch(() => ({}));
    if (!subAgentId || typeof subAgentId !== "string") {
      return json({ error: "Missing subAgentId" }, 400);
    }
    if (subAgentId === user.id) {
      return json({ error: "You cannot make yourself your own sub-agent." }, 400);
    }

    // Caller must be an active agent.
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("role", "agent")
      .maybeSingle();
    if (!callerRole) {
      return json({ error: "Only agents can add sub-agents." }, 403);
    }

    // Target user must exist.
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, full_name")
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

    // Link as a verified sub-agent of the caller.
    const { data: existingLink } = await adminClient
      .from("agent_subagents")
      .select("id, parent_agent_id, status")
      .eq("sub_agent_id", subAgentId)
      .maybeSingle();

    if (existingLink) {
      if (existingLink.parent_agent_id === user.id && existingLink.status === "verified") {
        return json({ ok: true, alreadyLinked: true, name: targetProfile.full_name });
      }
      const { error: updErr } = await adminClient
        .from("agent_subagents")
        .update({
          parent_agent_id: user.id,
          status: "verified",
          source: "agent_self_assignment",
          verified_by: user.id,
          verified_at: new Date().toISOString(),
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
          status: "verified",
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, name: targetProfile.full_name });
  } catch (err) {
    return json({ error: (err as Error)?.message || "Unexpected error" }, 500);
  }
});