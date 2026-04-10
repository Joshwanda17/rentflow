import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LANDLORD_VERIFICATION_BONUS = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization')

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) throw new Error('Unauthorized')

    const serviceClient = createClient(supabaseUrl, serviceKey)

    // Verify caller has appropriate role
    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['manager', 'operations', 'coo', 'super_admin', 'employee'])
    if (!roles || roles.length === 0) throw new Error('Insufficient permissions')

    const { rent_request_id } = await req.json()
    if (!rent_request_id) throw new Error('rent_request_id is required')

    // Fetch the rent request to get the agent
    const { data: request, error: reqErr } = await serviceClient
      .from('rent_requests')
      .select('id, agent_id, assigned_agent_id, landlord_id, tenant_id, rent_amount')
      .eq('id', rent_request_id)
      .single()

    if (reqErr || !request) throw new Error('Rent request not found')

    const agentId = request.assigned_agent_id || request.agent_id
    if (!agentId) {
      return new Response(JSON.stringify({ success: false, reason: 'no_agent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch landlord name
    const { data: landlord } = await serviceClient
      .from('landlords')
      .select('name')
      .eq('id', request.landlord_id)
      .single()

    const now = new Date().toISOString()
    const landlordName = landlord?.name || 'Unknown'

    // Credit UGX 5,000 landlord verification bonus via RPC
    const { data: txGroupId, error: ledgerErr } = await serviceClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: agentId,
          amount: LANDLORD_VERIFICATION_BONUS,
          direction: 'cash_in',
          category: 'agent_commission_earned',
          ledger_scope: 'wallet',
          source_table: 'rent_requests',
          source_id: rent_request_id,
          description: `UGX 5,000 landlord verification bonus – ${landlordName}`,
          currency: 'UGX',
          linked_party: request.tenant_id,
          transaction_date: now,
        },
        {
          direction: 'cash_out',
          amount: LANDLORD_VERIFICATION_BONUS,
          category: 'agent_commission_earned',
          ledger_scope: 'platform',
          source_table: 'rent_requests',
          source_id: rent_request_id,
          description: `Platform expense: verification bonus – ${landlordName}`,
          currency: 'UGX',
          transaction_date: now,
        },
      ],
    })

    if (ledgerErr) throw new Error(`Ledger error: ${ledgerErr.message}`)

    // Record in agent_earnings
    await serviceClient.from('agent_earnings').insert({
      agent_id: agentId,
      amount: LANDLORD_VERIFICATION_BONUS,
      earning_type: 'verification_bonus',
      source_user_id: user.id,
      rent_request_id,
      description: `UGX 5,000 landlord location verification bonus – ${landlordName}`,
      currency: 'UGX',
    })

    // Notify agent
    await serviceClient.from('notifications').insert({
      user_id: agentId,
      title: 'Verification Bonus! 🎉',
      message: `You earned UGX ${LANDLORD_VERIFICATION_BONUS.toLocaleString()} for verifying landlord ${landlordName}'s property location.`,
      type: 'earning',
      metadata: {
        amount: LANDLORD_VERIFICATION_BONUS,
        type: 'verification_bonus',
        rent_request_id,
        landlord_name: landlordName,
      },
    })

    // Audit log
    await serviceClient.from('audit_logs').insert({
      user_id: user.id,
      action_type: 'landlord_verification_bonus',
      table_name: 'rent_requests',
      record_id: rent_request_id,
      metadata: {
        agent_id: agentId,
        bonus_amount: LANDLORD_VERIFICATION_BONUS,
        landlord_name: landlordName,
      },
    })

    return new Response(JSON.stringify({
      success: true,
      agent_id: agentId,
      bonus: LANDLORD_VERIFICATION_BONUS,
      landlord_name: landlordName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
