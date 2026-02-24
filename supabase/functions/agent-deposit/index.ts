import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AGENT_COMMISSION_RATE = 0.05; // 5% commission

// Input validation functions
function validateUUID(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  // UUID format validation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) return null;
  return cleaned;
}

function validatePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  // Uganda phone format
  if (!/^(0[7][0-9]{8}|256[7][0-9]{8})$/.test(cleaned)) return null;
  return cleaned;
}

function validateAmount(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return null;
    value = parsed;
  }
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value > 100000000) return null; // Max 100M UGX per transaction
  // Round to whole number (no decimals for UGX)
  return Math.round(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('[agent-deposit] Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = user.id;
    
    // Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id: rawUserId, amount: rawAmount, user_phone: rawPhone } = body as Record<string, unknown>;

    // Validate inputs
    const userId = rawUserId ? validateUUID(rawUserId) : null;
    const userPhone = rawPhone ? validatePhone(rawPhone) : null;
    const amount = validateAmount(rawAmount);

    // Must have either user_id or user_phone
    if (!userId && !userPhone) {
      return new Response(
        JSON.stringify({ error: 'Either user_id or user_phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amount === null) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount. Must be a positive number up to 100,000,000' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[agent-deposit] Agent ${agentId} processing deposit for user ${userId || userPhone}, amount: ${amount}`);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify agent role
    const { data: agentRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'agent')
      .maybeSingle();

    if (!agentRole) {
      return new Response(
        JSON.stringify({ error: 'Only agents can process deposits' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check agent's wallet balance first
    const { data: agentWalletCheck } = await adminClient
      .from('wallets')
      .select('balance')
      .eq('user_id', agentId)
      .maybeSingle();

    const agentBalance = agentWalletCheck?.balance || 0;
    if (agentBalance < amount) {
      return new Response(
        JSON.stringify({ error: `Insufficient wallet balance. You have UGX ${agentBalance.toLocaleString()} but need UGX ${amount.toLocaleString()}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find user by phone if not provided user_id
    let targetUserId = userId;
    if (!targetUserId && userPhone) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('phone', userPhone)
        .maybeSingle();
      
      if (!profile) {
        return new Response(
          JSON.stringify({ error: 'User not found with this phone number' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetUserId = profile.id;
    }

    // Get user's wallet
    let { data: userWallet } = await adminClient
      .from('wallets')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!userWallet) {
      const { data: newWallet, error: createError } = await adminClient
        .from('wallets')
        .insert({ user_id: targetUserId, balance: 0 })
        .select()
        .single();

      if (createError) {
        console.error('[agent-deposit] Create wallet error:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userWallet = newWallet;
    }

    // Check if user has active rent request that needs repayment
    const { data: activeRentRequest } = await adminClient
      .from('rent_requests')
      .select('*, repayments:repayments(amount)')
      .eq('tenant_id', targetUserId)
      .eq('status', 'disbursed')
      .maybeSingle();

    let depositAmount = amount;
    let repaymentAmount = 0;
    let commission = 0;
    let landlordPayment = 0;

    if (activeRentRequest) {
      // Calculate total already repaid
      const totalRepaid = activeRentRequest.repayments?.reduce(
        (sum: number, r: { amount: number }) => sum + r.amount, 0
      ) || 0;
      const remainingBalance = activeRentRequest.total_repayment - totalRepaid;

      if (remainingBalance > 0) {
        // Auto-pay towards rent
        repaymentAmount = Math.min(amount, remainingBalance);
        commission = Math.round(repaymentAmount * AGENT_COMMISSION_RATE);
        landlordPayment = repaymentAmount - commission;
        depositAmount = amount - repaymentAmount;

        console.log(`[agent-deposit] Auto-repayment: ${repaymentAmount}, Commission: ${commission}, To landlord: ${landlordPayment}`);

        // Get landlord wallet
        const landlordId = activeRentRequest.landlord_id;
        let { data: landlordWallet } = await adminClient
          .from('wallets')
          .select('*')
          .eq('user_id', landlordId)
          .maybeSingle();

        // Get agent's wallet for commission
        let { data: agentWallet } = await adminClient
          .from('wallets')
          .select('*')
          .eq('user_id', agentId)
          .maybeSingle();

        if (!agentWallet) {
          const { data: newAgentWallet } = await adminClient
            .from('wallets')
            .insert({ user_id: agentId, balance: 0 })
            .select()
            .single();
          agentWallet = newAgentWallet;
        }

        // Credit agent commission
        await adminClient
          .from('wallets')
          .update({ balance: (agentWallet?.balance || 0) + commission })
          .eq('user_id', agentId);

        // Record agent earning
        await adminClient
          .from('agent_earnings')
          .insert({
            agent_id: agentId,
            amount: commission,
            earning_type: 'commission',
            source_user_id: targetUserId,
            rent_request_id: activeRentRequest.id,
            description: `5% commission on UGX ${repaymentAmount} repayment`,
          });

        // Credit landlord
        if (landlordWallet) {
          await adminClient
            .from('wallets')
            .update({ balance: landlordWallet.balance + landlordPayment })
            .eq('user_id', landlordId);
        } else {
          await adminClient
            .from('wallets')
            .insert({ user_id: landlordId, balance: landlordPayment });
        }

        // Record repayment
        await adminClient
          .from('repayments')
          .insert({
            tenant_id: targetUserId,
            rent_request_id: activeRentRequest.id,
            amount: repaymentAmount,
          });

        // Check if fully repaid
        const newTotalRepaid = totalRepaid + repaymentAmount;
        if (newTotalRepaid >= activeRentRequest.total_repayment) {
          await adminClient
            .from('rent_requests')
            .update({ status: 'completed' })
            .eq('id', activeRentRequest.id);
        }

        // Notify agent of commission earned
        await adminClient
          .from('notifications')
          .insert({
            user_id: agentId,
            title: 'Commission Earned!',
            message: `You earned UGX ${commission.toLocaleString()} from tenant repayment.`,
            type: 'earning',
            metadata: { amount: commission, type: 'commission' },
          });
      }
    }

    // Add remaining amount to user's wallet
    if (depositAmount > 0) {
      await adminClient
        .from('wallets')
        .update({ balance: userWallet!.balance + depositAmount })
        .eq('user_id', targetUserId);
    }

    // DEDUCT from agent's wallet (agent is paying from their balance)
    const { data: freshAgentWallet } = await adminClient
      .from('wallets')
      .select('balance')
      .eq('user_id', agentId)
      .single();

    if (freshAgentWallet) {
      const newAgentBalance = freshAgentWallet.balance - amount + commission; // agent keeps commission
      await adminClient
        .from('wallets')
        .update({ balance: newAgentBalance })
        .eq('user_id', agentId)
        .eq('balance', freshAgentWallet.balance); // optimistic lock

      // Record in general_ledger for auditability
      await adminClient
        .from('general_ledger')
        .insert({
          user_id: agentId,
          amount: amount,
          direction: 'cash_out',
          category: 'rent_payment_for_tenant',
          description: `Paid UGX ${amount.toLocaleString()} rent for tenant (${targetUserId})`,
          source_table: 'wallet_deposits',
          linked_party: targetUserId,
        });
    }

    // Record deposit
    await adminClient
      .from('wallet_deposits')
      .insert({
        user_id: targetUserId,
        agent_id: agentId,
        amount: amount,
        deposit_type: 'cash_deposit',
      });

    // Get user profile for response
    const { data: userProfile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', targetUserId)
      .single();

    console.log(`[agent-deposit] Deposit completed: User ${targetUserId}, Amount: ${amount}, Repayment: ${repaymentAmount}, Commission: ${commission}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Deposit completed successfully',
        details: {
          total_deposited: amount,
          auto_repayment: repaymentAmount,
          agent_commission: commission,
          to_landlord: landlordPayment,
          to_wallet: depositAmount,
          user_name: userProfile?.full_name,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[agent-deposit] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
