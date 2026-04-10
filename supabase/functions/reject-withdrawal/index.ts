import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { withdrawal_ids, reason, withdrawal_type } = await req.json();

    if (!withdrawal_ids?.length || !reason || reason.length < 10) {
      return new Response(JSON.stringify({ error: 'withdrawal_ids and reason (min 10 chars) required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller has operations/manager/cfo role
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const allowedRoles = ['manager', 'super_admin', 'cfo', 'coo', 'operations'];
    const hasRole = roles?.some(r => allowedRoles.includes(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { id: string; status: string; refunded: boolean }[] = [];

    for (const wId of withdrawal_ids) {
      const table = withdrawal_type === 'float' ? 'agent_float_withdrawals' : 'withdrawal_requests';

      const { data: wr, error: fetchErr } = await admin
        .from(table)
        .select('*')
        .eq('id', wId)
        .single();

      if (fetchErr || !wr) {
        results.push({ id: wId, status: 'not_found', refunded: false });
        continue;
      }

      if (wr.status === 'rejected' || wr.status === 'completed' || wr.status === 'approved') {
        results.push({ id: wId, status: 'already_' + wr.status, refunded: false });
        continue;
      }

      const userId = withdrawal_type === 'float' ? wr.agent_id : wr.user_id;

      // Per financial governance: rejection = NO ledger entry.
      // Nothing moved financially. The original withdrawal request's ledger entry
      // (if any deduction happened at request time) should be handled by the
      // deduct_wallet_on_withdrawal_request trigger reversal, NOT here.

      // For float withdrawals, restore float balance (operational, not ledger)
      let refunded = false;
      if (withdrawal_type === 'float') {
        const { error: restoreErr } = await admin
          .from('agent_landlord_float')
          .update({
            balance: (wr as any).amount + ((await admin.from('agent_landlord_float').select('balance').eq('agent_id', userId).single()).data?.balance || 0),
            total_paid_out: Math.max(0, ((await admin.from('agent_landlord_float').select('total_paid_out').eq('agent_id', userId).single()).data?.total_paid_out || 0) - (wr as any).amount),
            updated_at: new Date().toISOString(),
          })
          .eq('agent_id', userId);

        if (!restoreErr) refunded = true;
      } else {
        // For wallet withdrawals: In the new ledger-first flow, no deduction happens at
        // request time — so there's nothing to refund. Check if a prior deduction exists
        // before attempting a reversal (backwards compatibility with old-flow requests).
        const txGroupId = `wallet-reject-${wId}`;
        const { data: existing } = await admin
          .from('general_ledger')
          .select('id')
          .eq('transaction_group_id', txGroupId)
          .limit(1);

        // Check if there was a prior deduction for this withdrawal (old flow)
        const { data: priorDeduction } = await admin
          .from('general_ledger')
          .select('id')
          .eq('source_id', wId)
          .eq('source_table', 'withdrawal_requests')
          .eq('direction', 'cash_out')
          .eq('ledger_scope', 'wallet')
          .limit(1);

        const hasPriorDeduction = priorDeduction && priorDeduction.length > 0;

        if (hasPriorDeduction && (!existing || existing.length === 0)) {
          // Old-flow request: wallet was deducted at request time, so restore via balanced RPC
          const { error: rpcErr } = await admin.rpc('create_ledger_transaction', {
            entries: [
              {
                user_id: userId,
                ledger_scope: 'wallet',
                direction: 'cash_in',
                amount: wr.amount,
                category: 'system_balance_correction',
                description: `Wallet withdrawal rejected – funds restored. Reason: ${reason.substring(0, 100)}`,
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
                source_table: 'withdrawal_requests',
                source_id: wId,
              },
              {
                ledger_scope: 'platform',
                direction: 'cash_out',
                amount: wr.amount,
                category: 'system_balance_correction',
                description: `Platform releases funds for rejected withdrawal`,
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
                source_table: 'withdrawal_requests',
                source_id: wId,
              },
            ],
          });
          if (rpcErr) console.error(`[reject-withdrawal] RPC error for ${wId}:`, rpcErr);
        }
        // New-flow requests: no deduction happened, so no refund needed
        refunded = hasPriorDeduction ? true : false;
      }

      // Update the withdrawal status
      const updateFields: Record<string, unknown> = {
        status: 'rejected',
        updated_at: new Date().toISOString(),
      };

      if (withdrawal_type === 'float') {
        updateFields.agent_ops_notes = reason;
        updateFields.agent_ops_reviewed_at = new Date().toISOString();
        updateFields.agent_ops_reviewed_by = user.id;
      } else {
        updateFields.rejection_reason = reason;
        updateFields.processed_by = user.id;
        updateFields.processed_at = new Date().toISOString();
      }

      const { error: updateErr } = await admin
        .from(table)
        .update(updateFields)
        .eq('id', wId);

      if (updateErr) {
        console.error(`[reject-withdrawal] Failed to update ${wId}:`, updateErr);
        results.push({ id: wId, status: 'update_failed', refunded });
        continue;
      }

      // Send notification to user
      try {
        await admin.from('notifications').insert({
          user_id: userId,
          title: 'Cash-out Request Rejected',
          message: `Your ${withdrawal_type === 'float' ? 'landlord float' : 'wallet'} withdrawal of UGX ${Number(wr.amount).toLocaleString()} was rejected. Reason: ${reason}${refunded ? '. Funds have been restored to your balance.' : ''}`,
          type: 'financial',
        });
      } catch { /* notification table may be suppressed by trigger */ }

      // Audit log
      await admin.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'withdrawal_rejected',
        metadata: {
          withdrawal_id: wId,
          withdrawal_type,
          target_user: userId,
          amount: wr.amount,
          reason,
          refunded,
        },
      });

      logSystemEvent(admin, 'withdrawal_rejected', user.id, withdrawal_type === 'float' ? 'agent_float_withdrawals' : 'withdrawal_requests', wId, { amount: wr.amount, withdrawal_type, refunded });

      results.push({ id: wId, status: 'rejected', refunded });
    }

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "❌ Withdrawal Rejected", body: "Activity: withdrawal rejected", url: "/manager" }),
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[reject-withdrawal] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
