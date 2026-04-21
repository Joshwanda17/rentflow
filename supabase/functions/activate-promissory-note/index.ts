import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token, user_id } = await req.json();
    if (!token || !user_id) {
      return new Response(JSON.stringify({ error: 'Token and user_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch the note
    const { data: note, error: noteError } = await supabaseAdmin
      .from('promissory_notes')
      .select('*')
      .eq('activation_token', token)
      .single();

    if (noteError || !note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (note.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Note is already ${note.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update note to activated and link partner
    const { error: updateError } = await supabaseAdmin
      .from('promissory_notes')
      .update({
        status: 'activated',
        partner_user_id: user_id,
      })
      .eq('id', note.id);

    if (updateError) throw updateError;

    // Grant all 4 public roles so partners onboarded via promissory-note links
    // can access every public dashboard (tenant, agent, landlord, supporter).
    const PUBLIC_ROLES = ['tenant', 'agent', 'landlord', 'supporter'] as const;
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        PUBLIC_ROLES.map(role => ({ user_id, role, enabled: true })),
        { onConflict: 'user_id,role' }
      );

    if (roleError) {
      console.error('Failed to assign public roles:', roleError);
    }

    // Log system event
    await supabaseAdmin.from('system_events').insert({
      event_type: 'promissory_note_activated',
      description: `Partner ${note.partner_name} activated promissory note for ${note.amount}`,
      metadata: {
        note_id: note.id,
        partner_user_id: user_id,
        agent_id: note.agent_id,
        amount: note.amount,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
