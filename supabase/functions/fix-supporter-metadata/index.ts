import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with supporter role
    const { data: supporters } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "supporter")
      .or("enabled.is.null,enabled.eq.true");

    if (!supporters || supporters.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "No supporters found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const s of supporters) {
      const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(s.user_id);
      if (!authUser) { skipped++; continue; }

      if (authUser.user_metadata?.intended_role === 'supporter') {
        skipped++;
        continue;
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(s.user_id, {
        user_metadata: { ...authUser.user_metadata, intended_role: 'supporter' },
      });

      if (updateErr) {
        errors.push(`${s.user_id}: ${updateErr.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    return new Response(JSON.stringify({ updated, skipped, total: supporters.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fix-supporter-metadata error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
