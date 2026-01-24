import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the function to apply monthly interest
    const { data, error } = await supabase.rpc('apply_welile_homes_monthly_interest')

    if (error) {
      console.error('Error applying interest:', error)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`Applied monthly interest to ${data} subscriptions`)

    // Also log interest contributions
    const { data: subscriptions } = await supabase
      .from('welile_homes_subscriptions')
      .select('id, tenant_id, total_savings')
      .eq('subscription_status', 'active')
      .eq('landlord_registered', true)
      .gt('total_savings', 0)

    if (subscriptions && subscriptions.length > 0) {
      const contributions = subscriptions.map(sub => ({
        subscription_id: sub.id,
        tenant_id: sub.tenant_id,
        contribution_type: 'interest',
        amount: sub.total_savings * 0.05, // 5% of current balance
        balance_after: sub.total_savings,
        notes: 'Monthly 5% compound interest applied'
      }))

      await supabase.from('welile_homes_contributions').insert(contributions)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Applied monthly interest to ${data} subscriptions`,
        updated_count: data
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Unexpected error occurred' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})