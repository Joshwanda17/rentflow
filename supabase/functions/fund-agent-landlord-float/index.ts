import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RENT_FUNDED_BONUS = 5000 // UGX 5,000 flat bonus

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

    // Verify CFO/manager/super_admin role
    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['cfo', 'manager', 'super_admin'])
    if (!roles || roles.length === 0) throw new Error('Insufficient permissions')

    const { rent_request_id, notes, transaction_reference, payout_method } = await req.json()
    if (!rent_request_id) throw new Error('rent_request_id is required')

    // Fetch the rent request
    const { data: request, error: reqErr } = await serviceClient
      .from('rent_requests')
      .select('id, tenant_id, agent_id, landlord_id, rent_amount, daily_repayment, duration_days, status, assigned_agent_id')
      .eq('id', rent_request_id)
      .single()

    if (reqErr || !request) throw new Error('Rent request not found')
    if (!['approved', 'coo_approved', 'funded'].includes(request.status)) {
      throw new Error(`Invalid status: ${request.status}. Expected approved, coo_approved, or funded.`)
    }

    const bonusAgentId = request.assigned_agent_id || request.agent_id
    if (!bonusAgentId) throw new Error('No agent assigned to this rent request')

    // Fetch landlord details
    const { data: landlord } = await serviceClient
      .from('landlords')
      .select('id, name, phone, mobile_money_number')
      .eq('id', request.landlord_id)
      .single()

    const now = new Date().toISOString()

    // ============================================================
    // FUND AGENT'S LANDLORD FLOAT (no TID required at this stage)
    // ============================================================
    const { data: existingFloat } = await serviceClient
      .from('agent_landlord_float')
      .select('id, balance, total_funded')
      .eq('agent_id', bonusAgentId)
      .maybeSingle()

    if (existingFloat) {
      const { error: floatErr } = await serviceClient
        .from('agent_landlord_float')
        .update({
          balance: existingFloat.balance + request.rent_amount,
          total_funded: (existingFloat.total_funded || 0) + request.rent_amount,
          updated_at: now,
        })
        .eq('id', existingFloat.id)

      if (floatErr) throw new Error(`Failed to update agent float: ${floatErr.message}`)
    } else {
      const { error: insertErr } = await serviceClient
        .from('agent_landlord_float')
        .insert({
          agent_id: bonusAgentId,
          balance: request.rent_amount,
          total_funded: request.rent_amount,
          total_paid_out: 0,
        })

      if (insertErr) throw new Error(`Failed to create agent float: ${insertErr.message}`)
    }

    // ============================================================
    // Phase 1: create per-tenant allocation row (idempotent RPC)
    // ============================================================
    try {
      const { error: allocErr } = await serviceClient.rpc(
        'create_landlord_float_allocation' as any,
        {
          p_agent_id: bonusAgentId,
          p_rent_request_id: rent_request_id,
          p_amount: request.rent_amount,
          p_source: 'cfo_disbursement',
        },
      )
      if (allocErr) {
        console.warn('[fund-float] allocation RPC failed (non-fatal):', allocErr.message)
      }
    } catch (e) {
      console.warn('[fund-float] allocation RPC threw (non-fatal):', e)
    }

    // Update rent request status to 'funded'
    const { error: updateErr } = await serviceClient
      .from('rent_requests')
      .update({
        status: 'funded',
        cfo_reviewed_by: user.id,
        cfo_reviewed_at: now,
        funded_at: now,
        approval_comment: notes || null,
        payout_transaction_reference: transaction_reference || null,
        payout_method: payout_method || null,
        updated_at: now,
      })
      .eq('id', rent_request_id)

    if (updateErr) throw new Error(`Failed to update request: ${updateErr.message}`)

    // Record agent_float_funding so it shows in agent's float history
    await serviceClient.from('agent_float_funding').insert({
      agent_id: bonusAgentId,
      amount: request.rent_amount,
      funded_by: user.id,
      notes: `CFO funded rent for landlord ${landlord?.name || 'Unknown'} – Request: ${rent_request_id.slice(0, 8)}`,
    })

    // Record in general ledger via RPC — platform cash out to agent float
    const { data: transactionGroupId, error: floatLedgerErr } = await serviceClient.rpc('create_ledger_transaction', {
      entries: [
        {
          direction: 'cash_out',
          amount: request.rent_amount,
          category: 'rent_disbursement',
          ledger_scope: 'platform',
          source_table: 'rent_requests',
          source_id: rent_request_id,
          description: `Rent float funded for agent to pay landlord ${landlord?.name || 'Unknown'}. Request: ${rent_request_id.slice(0, 8)}`,
          currency: 'UGX',
          user_id: bonusAgentId,
          linked_party: request.landlord_id,
          transaction_date: now,
        },
        {
          direction: 'cash_in',
          amount: request.rent_amount,
          category: 'rent_receivable_created',
          ledger_scope: 'bridge',
          source_table: 'rent_requests',
          source_id: rent_request_id,
          description: `Landlord float credited – ${landlord?.name || 'Unknown'} (UGX ${request.rent_amount.toLocaleString()})`,
          currency: 'UGX',
          user_id: bonusAgentId,
          linked_party: request.landlord_id,
          transaction_date: now,
        },
      ],
    });

    // ============================================================
    // AGENT BONUS: UGX 5,000 flat bonus for rent funded
    // ============================================================
    let bonusPaid = false

    const { data: agentProfile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', bonusAgentId)
      .single()

    const agentName = agentProfile?.full_name || 'Agent'

    const { error: ledgerErr } = await serviceClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: bonusAgentId,
          amount: RENT_FUNDED_BONUS,
          direction: 'cash_in',
          category: 'agent_commission_earned',
          ledger_scope: 'wallet',
          source_table: 'rent_requests',
          source_id: rent_request_id,
          description: `UGX 5,000 rent funded bonus – landlord ${landlord?.name || 'Unknown'}`,
          currency: 'UGX',
          linked_party: request.tenant_id,
          transaction_date: now,
        },
        {
          user_id: bonusAgentId,
          direction: 'cash_out',
          amount: RENT_FUNDED_BONUS,
          category: 'agent_commission_earned',
          ledger_scope: 'platform',
          source_table: 'rent_requests',
          source_id: rent_request_id,
          description: `Platform expense: rent funded bonus`,
          currency: 'UGX',
          transaction_date: now,
        },
      ],
    })

    if (!ledgerErr) {
      bonusPaid = true
      await serviceClient.from('agent_earnings').insert({
        agent_id: bonusAgentId,
        amount: RENT_FUNDED_BONUS,
        earning_type: 'rent_funded_bonus',
        description: `UGX 5,000 bonus – rent funded to ${landlord?.name || 'Unknown'} (UGX ${request.rent_amount.toLocaleString()})`,
      currency: 'UGX',
        rent_request_id: rent_request_id,
        source_user_id: request.tenant_id,
      })

      await serviceClient.from('notifications').insert({
        user_id: bonusAgentId,
        title: 'Rent Funded to Your Float! 🎉',
        message: `UGX ${request.rent_amount.toLocaleString()} has been added to your landlord float to pay ${landlord?.name || 'Unknown'}. You also earned a UGX ${RENT_FUNDED_BONUS.toLocaleString()} bonus! Please pay the landlord and submit TID + receipt.`,
        type: 'earning',
        metadata: {
          amount: RENT_FUNDED_BONUS,
          float_amount: request.rent_amount,
          type: 'rent_funded_bonus',
          rent_request_id,
          landlord_name: landlord?.name,
        },
      })
    }

    // Email notification to agent
    if (agentProfile?.email) {
      const landlordName = landlord?.name || 'the landlord'
      const landlordPhone = landlord?.phone || 'N/A'
      const rentFormatted = `UGX ${request.rent_amount.toLocaleString()}`
      const dailyRepayment = request.daily_repayment ? `UGX ${request.daily_repayment.toLocaleString()}` : 'N/A'
      const durationDays = request.duration_days || 'N/A'

      const emailSubject = `💰 Float Funded – Pay ${landlordName} & Submit Receipt`
      const emailBody = `Hi ${agentName},\n\n${rentFormatted} has been added to your Landlord Float to pay ${landlordName}.\n\n📋 ACTION REQUIRED:\n1. Pay ${landlordName} via Mobile Money\n2. Collect a signed receipt\n3. Submit TID + receipt photos in the app\n\n📞 Landlord Contact: ${landlordPhone}\n\n📊 TENANT REPAYMENT SCHEDULE:\n💵 Daily Repayment: ${dailyRepayment}/day\n📅 Duration: ${durationDays} days\n\n💰 Your Bonus: UGX ${RENT_FUNDED_BONUS.toLocaleString()} (already credited)\n\nRemember: You will also earn 10% commission on every repayment this tenant makes!\n\n— Welile Team`

      try {
        await serviceClient.rpc("enqueue_email" as any, {
          p_queue_name: "transactional_emails",
          p_message: JSON.stringify({
            to: agentProfile.email,
            subject: emailSubject,
            text: emailBody,
            template_name: "agent_float_funded",
          }),
        })
      } catch (emailErr) {
        console.warn('[fund-float] Agent email enqueue failed:', emailErr)
      }
    }

    // Audit log
    await serviceClient.from('audit_logs').insert({
      user_id: user.id,
      action_type: 'rent_float_funding',
      table_name: 'rent_requests',
      record_id: rent_request_id,
      metadata: {
        rent_amount: request.rent_amount,
        landlord_name: landlord?.name,
        agent_id: bonusAgentId,
        agent_name: agentName,
        bonus_amount: RENT_FUNDED_BONUS,
        bonus_paid: bonusPaid,
        notes,
      },
    })


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "🏦 Float Funded", body: "Activity: agent float funded", url: "/dashboard/manager" }),
    }).catch(() => {});


    return new Response(
      JSON.stringify({
        success: true,
        message: `UGX ${request.rent_amount.toLocaleString()} funded to ${agentName}'s landlord float for ${landlord?.name || 'landlord'}`,
        agent_id: bonusAgentId,
        float_funded: request.rent_amount,
        agent_bonus: { amount: RENT_FUNDED_BONUS, paid: bonusPaid },
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
