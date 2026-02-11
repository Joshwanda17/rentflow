import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let totalDeleted = 0;
    const batchSize = 500;
    const maxBatches = 20;

    for (let i = 0; i < maxBatches; i++) {
      const { data, error } = await supabase
        .from("system_events")
        .delete()
        .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(batchSize)
        .select("id");

      if (error) {
        console.error(`Batch ${i + 1} error:`, error.message);
        break;
      }

      const deleted = data?.length ?? 0;
      totalDeleted += deleted;
      console.log(`Batch ${i + 1}: deleted ${deleted} rows`);

      if (deleted < batchSize) break; // No more old rows
    }

    return new Response(
      JSON.stringify({ success: true, totalDeleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
