import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to get user info
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
    const { recipient_id, amount, description } = await req.json();

    console.log(`Processing transfer: ${senderId} -> ${recipient_id}, amount: ${amount}`);

    if (!recipient_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (senderId === recipient_id) {
      return new Response(
        JSON.stringify({ error: 'Cannot transfer to yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for database operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get sender's wallet
    const { data: senderWallet, error: senderError } = await adminClient
      .from('wallets')
      .select('*')
      .eq('user_id', senderId)
      .single();

    if (senderError || !senderWallet) {
      console.error('Sender wallet error:', senderError);
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
      .eq('user_id', recipient_id)
      .single();

    if (recipientError || !recipientWallet) {
      // Create wallet for recipient
      const { data: newWallet, error: createError } = await adminClient
        .from('wallets')
        .insert({ user_id: recipient_id, balance: 0 })
        .select()
        .single();

      if (createError) {
        console.error('Create recipient wallet error:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create recipient wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      recipientWallet = newWallet;
    }

    // Update sender balance using optimistic locking to prevent race conditions
    const { data: senderUpdateResult, error: updateSenderError } = await adminClient
      .from('wallets')
      .update({ balance: senderWallet.balance - amount, updated_at: new Date().toISOString() })
      .eq('user_id', senderId)
      .eq('balance', senderWallet.balance) // Optimistic lock - only update if balance unchanged
      .select()
      .maybeSingle();

    if (updateSenderError) {
      console.error('Update sender error:', updateSenderError);
      return new Response(
        JSON.stringify({ error: 'Failed to debit sender' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no rows were updated, balance changed during transaction (race condition)
    if (!senderUpdateResult) {
      console.error('Race condition detected: sender balance changed during transaction');
      return new Response(
        JSON.stringify({ error: 'Transaction conflict. Please try again.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update recipient balance using optimistic locking
    const { data: recipientUpdateResult, error: updateRecipientError } = await adminClient
      .from('wallets')
      .update({ balance: recipientWallet.balance + amount, updated_at: new Date().toISOString() })
      .eq('user_id', recipient_id)
      .eq('balance', recipientWallet.balance)
      .select()
      .maybeSingle();

    if (updateRecipientError || !recipientUpdateResult) {
      console.error('Update recipient error:', updateRecipientError || 'Race condition');
      // Rollback sender update to original balance
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
        recipient_id: recipient_id,
        amount: amount,
        description: description || 'Wallet transfer',
      });

    if (txError) {
      console.error('Transaction record error:', txError);
      // Note: Transfer already completed, just log the error
    }

    console.log(`Transfer successful: ${senderId} -> ${recipient_id}, amount: ${amount}`);

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
