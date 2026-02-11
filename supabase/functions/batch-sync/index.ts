import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SyncItem {
  id: string;
  type: "create" | "update" | "delete";
  table: string;
  data: Record<string, unknown>;
  createdAt: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT once for the entire batch
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const { items } = await req.json() as { items: SyncItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No items to sync" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap batch size to prevent abuse
    if (items.length > 50) {
      return new Response(
        JSON.stringify({ error: "Batch too large (max 50)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Allowed tables for sync (whitelist to prevent arbitrary table access)
    const allowedTables = new Set([
      "notifications",
      "rent_requests",
      "repayments",
      "platform_transactions",
      "user_activity_log",
    ]);

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Use service role client for validated operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    for (const item of items) {
      try {
        // Validate table is allowed
        if (!allowedTables.has(item.table)) {
          results.push({ id: item.id, success: false, error: `Table '${item.table}' not allowed` });
          continue;
        }

        // Ensure user_id ownership on the data
        const payload = { ...item.data, user_id: userId };

        if (item.type === "create") {
          const { error } = await serviceClient
            .from(item.table)
            .insert(payload);
          if (error) throw error;
        } else if (item.type === "update") {
          const recordId = item.data.id as string;
          if (!recordId) throw new Error("Missing record id for update");
          const { error } = await serviceClient
            .from(item.table)
            .update(payload)
            .eq("id", recordId)
            .eq("user_id", userId); // ownership check
          if (error) throw error;
        } else if (item.type === "delete") {
          const recordId = item.data.id as string;
          if (!recordId) throw new Error("Missing record id for delete");
          const { error } = await serviceClient
            .from(item.table)
            .delete()
            .eq("id", recordId)
            .eq("user_id", userId); // ownership check
          if (error) throw error;
        }

        results.push({ id: item.id, success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.push({ id: item.id, success: false, error: message });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
