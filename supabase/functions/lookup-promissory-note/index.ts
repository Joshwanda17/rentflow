import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: note, error } = await supabaseAdmin
      .from('promissory_notes')
      .select('id, partner_name, amount, contribution_type, deduction_day, status, whatsapp_number, email, total_collected, created_at')
      .eq('activation_token', token)
      .single();

    if (error || !note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ note }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
