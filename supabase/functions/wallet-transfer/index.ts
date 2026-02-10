import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // P2P transfers are currently disabled
  return new Response(
    JSON.stringify({ error: 'P2P transfers are currently disabled by the platform' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
