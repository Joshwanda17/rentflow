import { logSystemEvent } from "../_shared/eventLogger.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runShadowAudit } from "../_shared/shadowLogger.ts";
import { shadowValidateWalletTransfer } from "../_shared/shadowValidation.ts";
import { fetchShadowConfig, shouldSample } from "../_shared/shadowConfig.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Treasury guard: block any money movement when paused
  const guardBlock = await checkTreasuryGuard(adminClient, "any");
  if (guardBlock) return guardBlock;

  const shadowConfig = await fetchShadowConfig(adminClient);

  try {
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
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const senderId = user.id;
    const body = await req.json().catch(() => ({}));
    const { recipient_id, recipient_phone, amount, description } = body as { 
      recipient_id?: string; 
      recipient_phone?: string;
      amount?: number; 
      description?: string 
    };

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // Resolve recipient by ID or phone number
    let resolvedRecipientId = recipient_id;
    
    if (!resolvedRecipientId && recipient_phone) {
      const cleaned = recipient_phone.replace(/\D/g, '');
      const last9 = cleaned.slice(-9);
      
      if (last9.length < 9) {
        if (shouldSample(shadowConfig)) {
          runShadowAudit('wallet-transfer', { senderId, amount }, false,
            () => shadowValidateWalletTransfer({ senderId, recipientId: '', amount: amount ?? 0, description: '' }), adminClient);
        }
        return new Response(
          JSON.stringify({ error: 'Invalid phone number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: profiles, error: lookupError } = await adminClient
        .from('profiles')
        .select('id, full_name')
        .ilike('phone', `%${last9}`)
        .limit(1);

      if (lookupError || !profiles || profiles.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Recipient not found. They must have a Welile account.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      resolvedRecipientId = profiles[0].id;
    }

    if (!resolvedRecipientId || !UUID_REGEX.test(resolvedRecipientId)) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('wallet-transfer', { senderId, amount }, false,
          () => shadowValidateWalletTransfer({ senderId, recipientId: resolvedRecipientId ?? '', amount: amount ?? 0, description: '' }), adminClient);
      }
      return new Response(
        JSON.stringify({ error: 'Invalid recipient' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('wallet-transfer', { senderId, resolvedRecipientId, amount }, false,
          () => shadowValidateWalletTransfer({ senderId, recipientId: resolvedRecipientId, amount: amount ?? 0, description: '' }), adminClient);
      }
      return new Response(
        JSON.stringify({ error: 'Amount must be between 1 and 100,000,000' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safeDescription = typeof description === 'string' ? description.trim().slice(0, 500) : 'Wallet transfer';

    // Debug log removed for cost optimization

    if (senderId === resolvedRecipientId) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('wallet-transfer', { senderId, resolvedRecipientId, amount }, false,
          () => shadowValidateWalletTransfer({ senderId, recipientId: resolvedRecipientId, amount, description: safeDescription }), adminClient);
      }
      return new Response(
        JSON.stringify({ error: 'Cannot transfer to yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Shadow audit on success path — sampled
    if (shouldSample(shadowConfig)) {
      runShadowAudit('wallet-transfer', { senderId, resolvedRecipientId, amount },
        true, () => shadowValidateWalletTransfer({ senderId, recipientId: resolvedRecipientId, amount, description: safeDescription }), adminClient);
    }

    // Pre-check sender balance
    const { data: senderWallet, error: senderError } = await adminClient
      .from('wallets')
      .select('balance')
      .eq('user_id', senderId)
      .single();

    if (senderError || !senderWallet) {
      return new Response(
        JSON.stringify({ error: 'Sender wallet not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (senderWallet.balance < amount) {
      return new Response(
        JSON.stringify({ error: 'Insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure recipient wallet exists
    await adminClient
      .from('wallets')
      .upsert({ user_id: resolvedRecipientId, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });

    // === SINGLE-WRITER: Route through create_ledger_transaction RPC ===
    const { data: txGroupId, error: ledgerError } = await adminClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: senderId,
          amount,
          direction: 'cash_out',
          category: 'wallet_transfer',
          ledger_scope: 'wallet',
          source_table: 'wallet_transactions',
          description: `Transfer to user: ${safeDescription}`,
          currency: 'UGX',
          transaction_date: new Date().toISOString(),
        },
        {
          user_id: resolvedRecipientId,
          amount,
          direction: 'cash_in',
          category: 'wallet_transfer',
          ledger_scope: 'wallet',
          source_table: 'wallet_transactions',
          description: `Transfer from user: ${safeDescription}`,
          currency: 'UGX',
          transaction_date: new Date().toISOString(),
        },
      ],
    });

    if (ledgerError) {
      console.error('Ledger RPC error:', ledgerError);
      return new Response(
        JSON.stringify({ error: 'Transfer failed. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Post-check: verify sender balance didn't go negative (trigger enforces CHECK >= 0)
    const { data: senderAfter } = await adminClient
      .from('wallets')
      .select('balance')
      .eq('user_id', senderId)
      .single();

    if (senderAfter && senderAfter.balance < 0) {
      // This shouldn't happen due to CHECK constraint, but defensive rollback
      console.error(`Sender balance went negative after transfer: ${senderAfter.balance}`);
      return new Response(
        JSON.stringify({ error: 'Transfer failed due to insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success logged via system event only

    // Log system event
    logSystemEvent(adminClient, 'wallet_transfer', senderId, 'wallets', txGroupId, { amount, recipient_id: resolvedRecipientId });


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "💳 Wallet Transfer", body: "Activity: wallet transfer", url: "/manager" }),
    }).catch(() => {});

    // Push notification to sender & recipient (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        userIds: [senderId],
        payload: { title: "✅ Transfer Sent", body: `UGX ${amount.toLocaleString()} sent successfully`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        userIds: [resolvedRecipientId],
        payload: { title: "💰 Transfer Received", body: `UGX ${amount.toLocaleString()} received in your wallet`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});


    return new Response(
      JSON.stringify({ success: true, message: 'Transfer completed successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
