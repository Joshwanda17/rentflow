import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return new Response(
        JSON.stringify({ success: false, message: 'Phone and PIN are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find vendor by phone and verify PIN
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('id, name, phone, location, pin')
      .eq('phone', phone)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ success: false, message: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!vendor) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vendor not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!vendor.pin) {
      return new Response(
        JSON.stringify({ success: false, message: 'PIN not set. Contact manager.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (vendor.pin !== pin) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid PIN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return vendor info (without PIN)
    const { pin: _, ...vendorInfo } = vendor;

    console.log(`Vendor ${vendor.name} logged in successfully`);

    return new Response(
      JSON.stringify({ success: true, vendor: vendorInfo }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
