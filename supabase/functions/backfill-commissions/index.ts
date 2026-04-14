import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const backfills = [
    {
      rent_request_id: "3fae669e-1336-4cfd-a401-aa49f88d238a",
      repayment_amount: 20000,
      tenant_id: "3b293a8d-6046-429b-8295-0eb121e88577",
      event_ref: "backfill-deposit-8dbfe350",
    },
    {
      rent_request_id: "08907aab-dad3-4bb5-a277-a228dfcbd300",
      repayment_amount: 10000,
      tenant_id: "ab1b190e-4fb5-499c-96c7-edae09bac030",
      event_ref: "backfill-deposit-95f71625",
    },
  ];

  const results = [];
  for (const b of backfills) {
    const { data, error } = await supabaseAdmin.rpc("credit_agent_rent_commission", {
      p_rent_request_id: b.rent_request_id,
      p_repayment_amount: b.repayment_amount,
      p_tenant_id: b.tenant_id,
      p_event_reference_id: b.event_ref,
    });
    results.push({ ...b, result: data, error: error?.message });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
