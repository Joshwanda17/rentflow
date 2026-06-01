// Cash-with-agent deposit — Step 1.
// The depositor enters an amount and the agent's phone number. We resolve the
// agent, verify they have enough OPERATIONAL FLOAT to cover it, generate a
// 4-digit PIN, and store a pending session. The PIN is shown ONLY on the
// target agent's dashboard (RLS-scoped). The agent reads it back to the
// depositor after receiving the cash; the depositor enters it via
// agent-cash-deposit-confirm, which credits their withdrawable wallet and
// debits the agent's float.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Last 9 significant digits — the canonical Ugandan phone identity.
function last9(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.slice(-9);
}

function gen4DigitPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return String(n).padStart(4, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) return json(401, { error: "Unauthorized" });
    const depositor = authData.user;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const agentPhoneRaw = typeof body?.agent_phone === "string" ? body.agent_phone.trim() : "";

    if (!Number.isFinite(amount) || amount <= 0) {
      return json(400, { error: "invalid_amount", message: "Enter a valid amount" });
    }
    if (amount < 500) {
      return json(400, { error: "amount_too_small", message: "Minimum cash deposit is UGX 500" });
    }
    if (amount > 50_000_000) {
      return json(400, { error: "amount_too_large", message: "Amount exceeds the cash deposit limit" });
    }
    const phone9 = last9(agentPhoneRaw);
    if (phone9.length !== 9) {
      return json(400, { error: "invalid_phone", message: "Enter a valid agent phone number" });
    }

    // ── Resolve the agent by phone (try common stored formats) ──
    const candidates = [phone9, `0${phone9}`, `256${phone9}`, `+256${phone9}`];
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, full_name, phone")
      .in("phone", candidates);

    // Defensive: also match by normalised suffix in case stored format differs.
    let agentProfile = (profileRows ?? []).find((p: any) => last9(p.phone) === phone9) ?? null;
    if (!agentProfile) {
      return json(404, { error: "agent_not_found", message: "No Welile agent found with that phone number" });
    }

    if (agentProfile.id === depositor.id) {
      return json(400, { error: "self_deposit", message: "You cannot deposit cash to yourself" });
    }

    // Verify the resolved user actually holds the agent role.
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", agentProfile.id);
    const isAgent = (roleRows ?? []).some((r: any) => r.role === "agent");
    if (!isAgent) {
      return json(400, { error: "not_an_agent", message: "That phone number does not belong to a Welile agent" });
    }

    // ── Float sufficiency: agent must have enough operational float ──
    const { data: floatData, error: floatErr } = await admin.rpc("get_agent_float_balance", {
      p_agent_id: agentProfile.id,
    });
    if (floatErr) {
      console.error("[agent-cash-create] float lookup failed", floatErr);
      return json(500, { error: "float_lookup_failed", message: "Could not verify the agent's float" });
    }
    const agentFloat = Number(floatData ?? 0);
    if (agentFloat < amount) {
      return json(400, {
        error: "insufficient_agent_float",
        message: "This agent does not have enough float to give you this amount right now.",
      });
    }

    // ── Block stacking: avoid multiple live pending sessions for same pair ──
    const { data: existing } = await admin
      .from("agent_cash_deposit_sessions")
      .select("id")
      .eq("depositor_id", depositor.id)
      .eq("agent_id", agentProfile.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .limit(1);
    if (existing && existing.length > 0) {
      return json(409, {
        error: "session_in_progress",
        message: "You already have a pending cash deposit with this agent. Finish or cancel it first.",
        session_id: (existing[0] as any).id,
      });
    }

    const { data: depositorProfile } = await admin
      .from("profiles").select("full_name").eq("id", depositor.id).maybeSingle();

    const pin = gen4DigitPin();
    const { data: session, error: insErr } = await admin
      .from("agent_cash_deposit_sessions")
      .insert({
        depositor_id: depositor.id,
        depositor_name: depositorProfile?.full_name ?? depositor.email ?? "Welile user",
        agent_id: agentProfile.id,
        agent_phone: agentProfile.phone ?? agentPhoneRaw,
        amount,
        pin,
        status: "pending",
      } as any)
      .select("id, expires_at")
      .single();

    if (insErr || !session) {
      console.error("[agent-cash-create] insert failed", insErr);
      return json(400, { error: "create_failed", message: insErr?.message || "Could not start the deposit" });
    }

    // Best-effort trust/system event — never blocks the flow.
    try {
      await admin.from("system_events").insert({
        event_type: "agent_cash_deposit.requested",
        user_id: depositor.id,
        metadata: {
          session_id: (session as any).id,
          agent_id: agentProfile.id,
          amount,
        },
      } as any);
    } catch (_e) { /* ignore */ }

    return json(200, {
      ok: true,
      session_id: (session as any).id,
      agent_name: agentProfile.full_name ?? "Welile agent",
      expires_at: (session as any).expires_at,
    });
  } catch (e) {
    console.error("[agent-cash-create] error", e);
    return json(500, { error: "server_error", message: String((e as Error)?.message ?? e) });
  }
});