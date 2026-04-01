import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

      // Get the withdrawal record
      const { data: wr, error: fetchErr } = await admin
        .from(table)
        .select('*')
        .eq('id', wId)
        .single();

      if (fetchErr || !wr) {
        results.push({ id: wId, status: 'not_found', refunded: false });
        continue;
      }

      // Check if already rejected/completed
      if (wr.status === 'rejected' || wr.status === 'completed' || wr.status === 'approved') {
        results.push({ id: wId, status: 'already_' + wr.status, refunded: false });
        continue;
      }

      const userId = withdrawal_type === 'float' ? wr.agent_id : wr.user_id;
      let refunded = false;

      // For float withdrawals, the balance was already deducted from agent_landlord_float — restore it
      // We need to restore it
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
      }

      // For wallet withdrawals at manager_approved/cfo_approved stage, 
      // balance was NOT yet deducted (only deducted at COO final approval)
      // So no refund needed for wallet withdrawals

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

      // If refunded, create a reversing ledger entry for float
      if (refunded && withdrawal_type === 'float') {
        await admin.from('general_ledger').insert({
          user_id: userId,
          amount: wr.amount,
          direction: 'cash_in',
          category: 'withdrawal_reversal',
          description: `Float withdrawal rejected – funds restored. Reason: ${reason.substring(0, 100)}`,
          transaction_date: new Date().toISOString(),
          transaction_group_id: `float-reject-${wId}`,
          ledger_scope: 'platform',
        });
      }

      // Send notification to user
      await admin.from('notifications').insert({
        user_id: userId,
        title: 'Cash-out Request Rejected',
        message: `Your ${withdrawal_type === 'float' ? 'landlord float' : 'wallet'} withdrawal of UGX ${Number(wr.amount).toLocaleString()} was rejected. Reason: ${reason}${refunded ? '. Funds have been restored to your balance.' : ''}`,
        type: 'financial',
      }).catch(() => { /* notification table may not exist */ });

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
