import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AgentBalanceRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  territory: string | null;
  withdrawable: number;
  float: number;
  advance: number;
  total: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const [{ data: roles, error: roleError }, { data: perms, error: permError }] = await Promise.all([
      adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["manager", "coo", "super_admin", "cto", "agent_ops", "agent-ops"]),
      adminClient
        .from("staff_permissions")
        .select("permitted_dashboard")
        .eq("user_id", user.id)
        .in("permitted_dashboard", ["agent", "agent-ops", "agent_ops"]),
    ]);

    if (roleError) return json({ error: roleError.message }, 500);
    if (permError) return json({ error: permError.message }, 500);
    if (!(roles?.length || perms?.length)) {
      return json({ error: "Insufficient permissions" }, 403);
    }

    const ROLE_PAGE = 1000;
    const allRoleRows: { user_id: string }[] = [];
    for (let from = 0; from < 50000; from += ROLE_PAGE) {
      const { data, error } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent")
        .range(from, from + ROLE_PAGE - 1);

      if (error) return json({ error: error.message }, 500);
      if (!data?.length) break;
      allRoleRows.push(...data);
      if (data.length < ROLE_PAGE) break;
    }

    const ids = [...new Set(allRoleRows.map((r) => r.user_id))];
    if (!ids.length) {
      return json({ rows: [], totals: { withdrawable: 0, float: 0, advance: 0, total: 0, count: 0, withFloat: 0, withWithdrawable: 0, withAdvance: 0 } }, 200);
    }

    const BATCH = 500;
    const wallets: any[] = [];
    const profiles: any[] = [];

    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const [walletRes, profileRes] = await Promise.all([
        adminClient
          .from("wallets")
          .select("user_id, withdrawable_balance, float_balance, advance_balance, balance")
          .in("user_id", slice),
        adminClient
          .from("profiles")
          .select("id, full_name, phone, territory")
          .in("id", slice),
      ]);

      if (walletRes.error) return json({ error: walletRes.error.message }, 500);
      if (profileRes.error) return json({ error: profileRes.error.message }, 500);
      if (walletRes.data) wallets.push(...walletRes.data);
      if (profileRes.data) profiles.push(...profileRes.data);
    }

    const walletMap = new Map(wallets.map((w) => [w.user_id, w]));
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const rows: AgentBalanceRow[] = ids.map((id) => {
      const w = walletMap.get(id);
      const p = profileMap.get(id);
      const withdrawable = Number(w?.withdrawable_balance ?? 0);
      const floatBal = Number(w?.float_balance ?? 0);
      const advance = Number(w?.advance_balance ?? 0);
      return {
        user_id: id,
        full_name: p?.full_name ?? null,
        phone: p?.phone ?? null,
        territory: p?.territory ?? null,
        withdrawable,
        float: floatBal,
        advance,
        total: withdrawable + floatBal + advance,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.withdrawable += row.withdrawable;
        acc.float += row.float;
        acc.advance += row.advance;
        acc.total += row.total;
        acc.count += 1;
        if (row.float > 0) acc.withFloat += 1;
        if (row.withdrawable > 0) acc.withWithdrawable += 1;
        if (row.advance > 0) acc.withAdvance += 1;
        return acc;
      },
      { withdrawable: 0, float: 0, advance: 0, total: 0, count: 0, withFloat: 0, withWithdrawable: 0, withAdvance: 0 },
    );

    return json({ rows, totals }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
