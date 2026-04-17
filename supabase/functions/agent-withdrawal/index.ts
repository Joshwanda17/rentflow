import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Input validation helpers ──
function validateUUID(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) return null;
  return cleaned;
}

function validatePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length < 7 || cleaned.length > 20) return null;
  if (!/^[0-9+\-\s()]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
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
  if (value > 100000000) return null;
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
      console.error('[agent-withdrawal] Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = user.id;

    // Parse and validate body
    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id: rawUserId, amount: rawAmount, user_phone: rawPhone } = body as Record<string, unknown>;

    const userId = rawUserId ? validateUUID(rawUserId) : null;
    const userPhone = rawPhone ? validatePhone(rawPhone) : null;
    const amount = validateAmount(rawAmount);

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

    console.log(`[agent-withdrawal] Agent ${agentId} processing withdrawal, amount: ${amount}`);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Treasury guard: agent withdrawals debit user wallets — block when paused
    const guardBlock = await checkTreasuryGuard(adminClient, "debit");
    if (guardBlock) return guardBlock;

    // ── Verify agent role ──
    const { data: agentRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'agent')
      .maybeSingle();

    if (!agentRole) {
      return new Response(
        JSON.stringify({ error: 'Only agents can process withdrawals' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Find user by phone if needed ──
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

    // ── Balance check (ledger-derived via sync trigger) ──
    const { data: userWallet } = await adminClient
      .from('wallets')
      .select('balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!userWallet) {
      return new Response(
        JSON.stringify({ error: 'User wallet not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userWallet.balance < amount) {
      return new Response(
        JSON.stringify({ error: 'Insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Execute atomic ledger transaction (double-entry withdrawal) ──
    const now = new Date().toISOString();

    const { error: ledgerError } = await adminClient.rpc(
      'create_ledger_transaction',
      {
        entries: [
          {
            user_id: targetUserId,
            ledger_scope: 'wallet',
            direction: 'cash_out',
            category: 'wallet_withdrawal',
            amount: amount,
            currency: 'UGX',
            description: `Agent-processed withdrawal by ${agentId}`,
            source_table: 'wallet_withdrawals',
            source_id: targetUserId,
            transaction_date: now,
          },
          {
            user_id: targetUserId,
            ledger_scope: 'platform',
            direction: 'cash_in',
            category: 'wallet_withdrawal',
            amount: amount,
            currency: 'UGX',
            description: `Platform cash-in for agent withdrawal`,
            source_table: 'wallet_withdrawals',
            source_id: targetUserId,
            transaction_date: now,
          },
        ],
      }
    );

    if (ledgerError) {
      console.error('[agent-withdrawal] Ledger RPC error:', ledgerError);
      return new Response(
        JSON.stringify({ error: ledgerError.message || 'Financial transaction failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[agent-withdrawal] Ledger OK`);

    // ── Record withdrawal ──
    const { error: withdrawalRecordError } = await adminClient
      .from('wallet_withdrawals')
      .insert({
        user_id: targetUserId,
        agent_id: agentId,
        amount: amount,
      });

    if (withdrawalRecordError) {
      console.error('[agent-withdrawal] Failed to record withdrawal:', withdrawalRecordError);
    }

    // ── Get updated balance (now synced by trigger) and user profile ──
    const [{ data: freshWallet }, { data: userProfile }] = await Promise.all([
      adminClient.from('wallets').select('balance').eq('user_id', targetUserId).single(),
      adminClient.from('profiles').select('full_name').eq('id', targetUserId!).single(),
    ]);

    const newBalance = freshWallet?.balance ?? 0;
    console.log(`[agent-withdrawal] Completed: Amount: ${amount}, New balance: ${newBalance}`);

    // ── Notifications (fire-and-forget) ──
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "💸 Agent Withdrawal", body: "Activity: withdrawal", url: "/manager" }),
    }).catch(() => {});

    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        userIds: [agentId],
        payload: { title: "✅ Withdrawal Processed", body: `UGX ${amount.toLocaleString()} withdrawal completed`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Withdrawal completed successfully',
        details: {
          amount: amount,
          user_name: userProfile?.full_name,
          new_balance: newBalance,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[agent-withdrawal] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
