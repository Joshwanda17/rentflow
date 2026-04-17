import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MONTHLY_RATE = 0.33;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Treasury guard: credit draws move money to user wallet
    const guardBlock = await checkTreasuryGuard(supabase, "credit");
    if (guardBlock) return guardBlock;

    const authHeader = req.headers.get('Authorization');
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader?.replace('Bearer ', '') ?? ''
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { amount, duration_months, agent_id } = await req.json();

    if (!amount || amount < 10000 || !duration_months || duration_months < 1 || duration_months > 12) {
      return new Response(JSON.stringify({ error: 'Invalid amount or duration (1-12 months)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: limitData } = await supabase
      .from('credit_access_limits')
      .select('total_limit')
      .eq('user_id', user.id)
      .maybeSingle();

    const creditLimit = Number(limitData?.total_limit) || 30000;
    if (amount > creditLimit) {
      return new Response(JSON.stringify({ error: 'Amount exceeds credit limit' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingDraw } = await supabase
      .from('credit_access_draws')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingDraw) {
      return new Response(JSON.stringify({ error: 'You already have an active credit draw. Repay first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const durationDays = duration_months * 30;
    const accessFee = Math.round(amount * (Math.pow(1 + MONTHLY_RATE, duration_months) - 1));
    const totalPayable = amount + accessFee;
    const dailyCharge = Math.ceil(totalPayable / durationDays);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    const { data: draw, error: drawError } = await supabase
      .from('credit_access_draws')
      .insert({
        user_id: user.id,
        agent_id: agent_id || null,
        amount,
        duration_months,
        monthly_rate: MONTHLY_RATE,
        access_fee: accessFee,
        total_payable: totalPayable,
        daily_charge: dailyCharge,
        outstanding_balance: totalPayable,
        status: 'active',
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (drawError) throw drawError;

    // Credit user's wallet via balanced RPC: platform cash_out + wallet cash_in
    const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
      entries: [
        {
          ledger_scope: 'platform',
          direction: 'cash_out',
          amount,
          category: 'wallet_deposit',
          source_table: 'credit_access_draws',
          source_id: draw.id,
          description: `Credit access disbursement: UGX ${amount.toLocaleString()} for ${duration_months} month(s)`,
          currency: 'UGX',
        },
        {
          user_id: user.id,
          ledger_scope: 'wallet',
          direction: 'cash_in',
          amount,
          category: 'wallet_deposit',
          source_table: 'credit_access_draws',
          source_id: draw.id,
          description: `Credit access: UGX ${amount.toLocaleString()} for ${duration_months} month(s)`,
          currency: 'UGX',
        },
      ],
    });

    if (rpcErr) console.error('[process-credit-draw] RPC error:', rpcErr);

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "📋 Credit Draw", body: "Activity: credit draw", url: "/manager" }),
    }).catch(() => {});

    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [user.id],
        payload: { title: "✅ Credit Draw Processed", body: `UGX ${amount.toLocaleString()} credit draw approved`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      draw_id: draw.id,
      amount,
      access_fee: accessFee,
      total_payable: totalPayable,
      daily_charge: dailyCharge,
      duration_months,
      expires_at: expiresAt.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
