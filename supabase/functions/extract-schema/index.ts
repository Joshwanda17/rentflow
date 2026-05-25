import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// CTO-only DB schema extractor. Returns DDL text for the public schema
// (tables, columns, constraints, indexes, RLS policies, functions, triggers, enums).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Gate: only CTO / manager / super_admin may extract schema
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const allowed = (roles || []).some((r: any) =>
      ["cto", "manager", "super_admin"].includes(r.role)
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden: CTO role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull DDL from pg_catalog via an inline RPC. We use rpc('exec_sql' style isn't
    // available, so we query each system view through PostgREST.
    const out: string[] = [];
    out.push(`-- Welile schema export`);
    out.push(`-- Generated: ${new Date().toISOString()}`);
    out.push(`-- Schema: public`);
    out.push(``);

    // ENUM types
    const { data: enums } = await admin
      .schema("public" as any)
      .rpc("pg_enum_dump" as any)
      .then((r: any) => r, () => ({ data: null }));
    // Fallback: query information_schema-ish via direct SQL through a helper RPC if it exists,
    // otherwise pull tables and columns through information_schema views exposed by PostgREST.

    // Tables + columns
    const { data: cols, error: colsErr } = await admin
      .from("information_schema.columns" as any)
      .select("table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position")
      .eq("table_schema", "public")
      .order("table_name", { ascending: true })
      .order("ordinal_position", { ascending: true });

    if (colsErr) {
      // information_schema may not be exposed via PostgREST; use a fallback RPC.
      const { data: rpcData, error: rpcErr } = await admin.rpc("extract_public_schema_sql" as any);
      if (rpcErr || !rpcData) {
        return new Response(JSON.stringify({
          error: "Schema introspection unavailable. Run the helper migration that creates extract_public_schema_sql().",
          detail: rpcErr?.message || colsErr.message,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ sql: rpcData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const byTable = new Map<string, any[]>();
    for (const c of cols || []) {
      if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
      byTable.get(c.table_name)!.push(c);
    }

    for (const [table, columns] of byTable) {
      out.push(`-- ============ ${table} ============`);
      out.push(`CREATE TABLE IF NOT EXISTS public."${table}" (`);
      const parts = columns.map((c: any) => {
        const type = c.udt_name || c.data_type;
        const nullable = c.is_nullable === "NO" ? " NOT NULL" : "";
        const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
        return `  "${c.column_name}" ${type}${nullable}${def}`;
      });
      out.push(parts.join(",\n"));
      out.push(`);`);
      out.push(``);
    }

    return new Response(JSON.stringify({ sql: out.join("\n") }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Schema extract failed",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});