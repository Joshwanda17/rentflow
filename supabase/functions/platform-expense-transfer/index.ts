import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Treasury guard: platform-to-agent transfers move money — block when paused
    const guardBlock = await checkTreasuryGuard(adminClient, "any");
    if (guardBlock) return guardBlock;

    const { data: roles } = await adminClient.from('user_roles').select('role').eq('user_id', user.id);
    const allowedRoles = ['manager', 'cfo', 'coo', 'super_admin'];
    if (!roles?.some(r => allowedRoles.includes(r.role))) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { action } = body;

    // === PLATFORM EXPENSE TRANSFER ===
    if (action === 'transfer') {
      const { financial_agent_id, amount, description, expense_category } = body;

      if (!financial_agent_id || !amount || amount <= 0 || !description || description.length < 5) {
        return new Response(JSON.stringify({ error: 'Invalid parameters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: fa, error: faErr } = await adminClient
        .from('financial_agents')
        .select('*, profiles:agent_id(id, full_name)')
        .eq('id', financial_agent_id)
        .eq('is_active', true)
        .single();

      if (faErr || !fa) {
        return new Response(JSON.stringify({ error: 'Financial agent not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const agentId = fa.agent_id;

      // Ensure wallet exists
      await adminClient.from('wallets')
        .upsert({ user_id: agentId, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });

      // Credit agent wallet via balanced RPC: platform cash_out + wallet cash_in
      const refId = crypto.randomUUID();
      const expTxDate = new Date().toISOString();
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: agentId, ledger_scope: 'platform', direction: 'cash_out',
            amount, category: 'system_balance_correction',
            source_table: 'platform_expense_transfers',
            description: `[${expense_category || fa.expense_category}] ${description}`,
            currency: 'UGX', reference_id: refId, transaction_date: expTxDate,
          },
          {
            user_id: agentId, ledger_scope: 'wallet', direction: 'cash_in',
            amount, category: 'system_balance_correction',
            source_table: 'platform_expense_transfers',
            description: `Platform expense credit: [${expense_category || fa.expense_category}] ${description}`,
            currency: 'UGX', reference_id: refId, transaction_date: expTxDate,
          },
        ],
      });

      if (rpcErr) {
        console.error('[platform-expense-transfer] RPC error:', rpcErr);
        return new Response(JSON.stringify({ error: 'Transaction failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await adminClient.from('platform_expense_transfers').insert({
        financial_agent_id, agent_id: agentId, amount,
        expense_category: expense_category || fa.expense_category,
        description, approved_by: user.id, ledger_reference_id: refId,
      });

      await adminClient.from('audit_logs').insert({
        user_id: user.id, action_type: 'platform_expense_transfer',
        table_name: 'platform_expense_transfers', record_id: refId,
        metadata: { agent_id: agentId, amount, category: expense_category || fa.expense_category, description },
      });

      logSystemEvent(adminClient, 'expense_transfer', user.id, 'platform_expense_transfers', refId, { amount, agent_id: agentId, category: expense_category || fa.expense_category });

      return new Response(JSON.stringify({ success: true, message: `UGX ${amount.toLocaleString()} transferred to ${fa.profiles?.full_name || 'agent'}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === BATCH PAYROLL ===
    if (action === 'process_payroll') {
      const { batch_id } = body;
      if (!batch_id) {
        return new Response(JSON.stringify({ error: 'batch_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: batch, error: bErr } = await adminClient.from('payroll_batches').select('*').eq('id', batch_id).eq('status', 'draft').single();
      if (bErr || !batch) {
        return new Response(JSON.stringify({ error: 'Batch not found or already processed' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await adminClient.from('payroll_batches').update({ status: 'processing' }).eq('id', batch_id);

      const { data: items } = await adminClient.from('payroll_items').select('*').eq('batch_id', batch_id).eq('status', 'pending');
      if (!items || items.length === 0) {
        await adminClient.from('payroll_batches').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', batch_id);
        return new Response(JSON.stringify({ success: true, message: 'No items to process' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let processed = 0;
      for (const item of items) {
        try {
          // Ensure wallet exists
          await adminClient.from('wallets')
            .upsert({ user_id: item.employee_id, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });

          // Credit via balanced RPC: platform cash_out + wallet cash_in
          const refId = crypto.randomUUID();
          const payTxDate = new Date().toISOString();
          const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
            entries: [
              {
                user_id: item.employee_id, ledger_scope: 'platform', direction: 'cash_out',
                amount: item.amount, category: 'system_balance_correction',
                source_table: 'payroll_items',
                description: `${item.category === 'salary' ? 'Salary' : 'Employee advance'} payment`,
                currency: 'UGX', reference_id: refId, transaction_date: payTxDate,
              },
              {
                user_id: item.employee_id, ledger_scope: 'wallet', direction: 'cash_in',
                amount: item.amount, category: 'system_balance_correction',
                source_table: 'payroll_items',
                description: item.description || `${item.category} payment`,
                currency: 'UGX', reference_id: refId, transaction_date: payTxDate,
              },
            ],
          });

          if (rpcErr) {
            console.error(`Payroll RPC error for ${item.id}:`, rpcErr);
            await adminClient.from('payroll_items').update({ status: 'failed' }).eq('id', item.id);
            continue;
          }

          await adminClient.from('payroll_items').update({ status: 'paid', paid_at: new Date().toISOString(), ledger_reference_id: refId }).eq('id', item.id);
          processed++;
        } catch (e) {
          console.error(`Payroll item ${item.id} failed:`, e);
          await adminClient.from('payroll_items').update({ status: 'failed' }).eq('id', item.id);
        }
      }

      await adminClient.from('payroll_batches').update({
        status: 'completed', processed_count: processed, processed_at: new Date().toISOString(),
      }).eq('id', batch_id);

      await adminClient.from('audit_logs').insert({
        user_id: user.id, action_type: 'payroll_batch_processed',
        table_name: 'payroll_batches', record_id: batch_id,
        metadata: { total_items: items.length, processed },
      });

      return new Response(JSON.stringify({ success: true, message: `Processed ${processed}/${items.length} payments` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "💳 Platform Expense", body: "Activity: expense transfer", url: "/dashboard/manager" }),
    }).catch(() => {});

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
