import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Resolve the calling user
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Gate: only super_admin or cfo
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const allowed = (roles ?? []).some(
      (r: { role: string }) => r.role === "super_admin" || r.role === "cfo",
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin or CFO only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Run the in-DB test (all writes rolled back inside the function)
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const startedAt = Date.now();
    const { data, error } = await userClient.rpc("test_wallet_drift_fix");
    const durationMs = Date.now() - startedAt;

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message, duration_ms: durationMs }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allPassed = Boolean((data as { summary?: { all_passed?: boolean } })?.summary?.all_passed);

    return new Response(
      JSON.stringify({
        ok: allPassed,
        duration_ms: durationMs,
        report: data,
        notes: [
          "All operations executed against a synthetic UUID inside a SAVEPOINT.",
          "Nothing is persisted — wallets, ledger row, overdraw event, and unrouted-movement row are all rolled back / cleaned up.",
        ],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});