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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization')

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) throw new Error('Unauthorized')

    // Verify CFO role
    const serviceClient = createClient(supabaseUrl, serviceKey)
    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['cfo', 'manager', 'super_admin'])
    
    if (!roles || roles.length === 0) throw new Error('Insufficient permissions')

    const { rent_request_id, transaction_reference, payout_method, notes } = await req.json()

    if (!rent_request_id || !transaction_reference) {
      throw new Error('rent_request_id and transaction_reference are required')
    }

    // Fetch the rent request
    const { data: request, error: reqErr } = await serviceClient
      .from('rent_requests')
      .select('id, tenant_id, agent_id, landlord_id, rent_amount, status, payout_method, assigned_agent_id')
      .eq('id', rent_request_id)
      .single()

    if (reqErr || !request) throw new Error('Rent request not found')
    if (request.status !== 'coo_approved') throw new Error(`Invalid status: ${request.status}. Expected coo_approved.`)

    // Determine the agent who should earn commission (assigned > original)
    const commissionAgentId = request.assigned_agent_id || request.agent_id

    // Fetch landlord details
    const { data: landlord } = await serviceClient
      .from('landlords')
      .select('id, name, phone, mobile_money_number')
      .eq('id', request.landlord_id)
      .single()

    const method = payout_method || request.payout_method || 'cash'
    const now = new Date().toISOString()

    // Check if landlord has a wallet (profile exists)
    let landlordHasWallet = false
    if (landlord?.phone) {
      const { data: walletCheck } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('phone', landlord.phone)
        .single()
      landlordHasWallet = !!walletCheck
    }

    // Update the rent request as funded/disbursed
    const { error: updateErr } = await serviceClient
      .from('rent_requests')
      .update({
        status: 'disbursed',
        payout_transaction_reference: transaction_reference,
        payout_method: method,
        cfo_reviewed_by: user.id,
        cfo_reviewed_at: now,
        funded_at: now,
        disbursed_at: now,
        approval_comment: notes || null,
        updated_at: now,
      })
      .eq('id', rent_request_id)

    if (updateErr) throw new Error(`Failed to update request: ${updateErr.message}`)

    // Record in general ledger — landlord payout
    const transactionGroupId = crypto.randomUUID()
    
    await serviceClient.from('general_ledger').insert({
      source_table: 'rent_requests',
      source_id: rent_request_id,
      category: 'rent_disbursement',
      direction: 'cash_out',
      amount: request.rent_amount,
      description: `Rent paid to landlord ${landlord?.name || 'Unknown'} (${method}). Ref: ${transaction_reference}`,
      user_id: request.tenant_id,
      linked_party: request.landlord_id,
      ledger_scope: 'platform',
      transaction_group_id: transactionGroupId,
      transaction_date: now,
    })

    // Update landlord rent tracking
    if (landlord) {
      await serviceClient
        .from('landlords')
        .update({
          rent_last_paid_at: now,
          rent_last_paid_amount: request.rent_amount,
        })
        .eq('id', landlord.id)
    }

    // ============================================================
    // AGENT COMMISSION: 5% of rent amount, queued for approval
    // Only triggers AFTER landlord has been paid (disbursed)
    // ============================================================
    let commissionQueued = false
    const commissionAmount = Math.floor(request.rent_amount * 0.05)

    if (commissionAgentId && commissionAmount > 0) {
      // Fetch agent name for audit trail
      const { data: agentProfile } = await serviceClient
        .from('profiles')
        .select('full_name')
        .eq('id', commissionAgentId)
        .single()

      const agentName = agentProfile?.full_name || 'Agent'

      // Queue commission in pending_wallet_operations for manager approval
      const { error: pendingErr } = await serviceClient
        .from('pending_wallet_operations')
        .insert({
          user_id: commissionAgentId,
          operation_type: 'credit',
          amount: commissionAmount,
          category: 'agent_commission',
          description: `5% commission on rent UGX ${request.rent_amount.toLocaleString()} for tenant ${request.tenant_id} → landlord ${landlord?.name || 'Unknown'}. Ref: ${transaction_reference}`,
          source_table: 'rent_requests',
          source_id: rent_request_id,
          status: 'pending',
          metadata: {
            rent_request_id,
            rent_amount: request.rent_amount,
            commission_rate: 0.05,
            landlord_name: landlord?.name,
            transaction_reference,
            payout_method: method,
          },
        })

      if (pendingErr) {
        console.error('Failed to queue commission:', pendingErr.message)
        // Non-fatal: landlord payout succeeded, commission can be manually processed
      } else {
        commissionQueued = true
      }

      // Record in agent_earnings for tracking (status: pending_approval)
      await serviceClient.from('agent_earnings').insert({
        agent_id: commissionAgentId,
        amount: commissionAmount,
        earning_type: 'commission',
        description: `5% rent commission – ${landlord?.name || 'Unknown'} (UGX ${request.rent_amount.toLocaleString()}) [pending approval]`,
        rent_request_id: rent_request_id,
        source_user_id: request.tenant_id,
      })
    }

    // Record audit log
    await serviceClient.from('audit_logs').insert({
      user_id: user.id,
      action_type: 'rent_disbursement',
      table_name: 'rent_requests',
      record_id: rent_request_id,
      metadata: {
        rent_amount: request.rent_amount,
        landlord_name: landlord?.name,
        payout_method: method,
        transaction_reference,
        landlord_has_wallet: landlordHasWallet,
        commission_agent_id: commissionAgentId,
        commission_amount: commissionAmount,
        commission_queued: commissionQueued,
        notes,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: `Rent of UGX ${request.rent_amount.toLocaleString()} disbursed to ${landlord?.name || 'landlord'} via ${method}`,
        payout_method: method,
        landlord_has_wallet: landlordHasWallet,
        transaction_reference,
        commission: {
          agent_id: commissionAgentId,
          amount: commissionAmount,
          queued_for_approval: commissionQueued,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})