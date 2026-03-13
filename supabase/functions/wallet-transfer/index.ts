import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
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

    // UUID validation
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Resolve recipient by ID or phone number
    let resolvedRecipientId = recipient_id;
    
    if (!resolvedRecipientId && recipient_phone) {
      // Normalize phone to last 9 digits
      const cleaned = recipient_phone.replace(/\D/g, '');
      const last9 = cleaned.slice(-9);
      
      if (last9.length < 9) {
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
      return new Response(
        JSON.stringify({ error: 'Invalid recipient' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
      return new Response(
        JSON.stringify({ error: 'Amount must be between 1 and 100,000,000' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safeDescription = typeof description === 'string' ? description.trim().slice(0, 500) : 'Wallet transfer';

    console.log(`Processing transfer: ${senderId} -> ${resolvedRecipientId}, amount: ${amount}`);

    if (senderId === resolvedRecipientId) {
      return new Response(
        JSON.stringify({ error: 'Cannot transfer to yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get sender's wallet
    const { data: senderWallet, error: senderError } = await adminClient
      .from('wallets')
      .select('*')
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

    // Get or create recipient's wallet
    let { data: recipientWallet, error: recipientError } = await adminClient
      .from('wallets')
      .select('*')
      .eq('user_id', resolvedRecipientId)
      .single();

    if (recipientError || !recipientWallet) {
      const { data: newWallet, error: createError } = await adminClient
        .from('wallets')
        .insert({ user_id: resolvedRecipientId, balance: 0 })
        .select()
        .single();

      if (createError) {
        return new Response(
          JSON.stringify({ error: 'Failed to create recipient wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      recipientWallet = newWallet;
    }

    // Optimistic lock — debit sender
    const { data: senderUpdateResult, error: updateSenderError } = await adminClient
      .from('wallets')
      .update({ balance: senderWallet.balance - amount, updated_at: new Date().toISOString() })
      .eq('user_id', senderId)
      .eq('balance', senderWallet.balance)
      .select()
      .maybeSingle();

    if (updateSenderError || !senderUpdateResult) {
      return new Response(
        JSON.stringify({ error: updateSenderError ? 'Failed to debit sender' : 'Transaction conflict. Please try again.' }),
        { status: updateSenderError ? 500 : 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optimistic lock — credit recipient
    const { data: recipientUpdateResult, error: updateRecipientError } = await adminClient
      .from('wallets')
      .update({ balance: recipientWallet.balance + amount, updated_at: new Date().toISOString() })
      .eq('user_id', resolvedRecipientId)
      .eq('balance', recipientWallet.balance)
      .select()
      .maybeSingle();

    if (updateRecipientError || !recipientUpdateResult) {
      // Rollback sender
      await adminClient
        .from('wallets')
        .update({ balance: senderWallet.balance, updated_at: new Date().toISOString() })
        .eq('user_id', senderId);
      
      return new Response(
        JSON.stringify({ error: 'Failed to credit recipient. Please try again.' }),
        { status: updateRecipientError ? 500 : 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record transaction
    const { error: txError } = await adminClient
      .from('wallet_transactions')
      .insert({
        sender_id: senderId,
        recipient_id: resolvedRecipientId,
        amount: amount,
        description: safeDescription,
      });

    if (txError) {
      console.error('Transaction record error:', txError);
    }

    // Record in general ledger
    const refId = crypto.randomUUID();
    await adminClient.from('general_ledger').insert([
      {
        user_id: senderId,
        amount,
        direction: 'out',
        category: 'wallet_transfer',
        source_table: 'wallet_transactions',
        description: `Transfer to user: ${safeDescription}`,
        reference_id: refId,
      },
      {
        user_id: resolvedRecipientId,
        amount,
        direction: 'in',
        category: 'wallet_transfer',
        source_table: 'wallet_transactions',
        description: `Transfer from user: ${safeDescription}`,
        reference_id: refId,
      },
    ]);

    console.log(`Transfer successful: ${senderId} -> ${resolvedRecipientId}, amount: ${amount}`);

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
