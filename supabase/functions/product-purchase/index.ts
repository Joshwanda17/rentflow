import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Verify the user
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const body = await req.json().catch(() => ({}));
    const { productId, quantity: rawQuantity = 1 } = body as { productId?: string; quantity?: number };

    // Validate productId
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!productId || typeof productId !== 'string' || !UUID_REGEX.test(productId)) {
      throw new Error('Valid Product ID is required');
    }

    // Validate quantity
    const quantity = Number(rawQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new Error('Quantity must be an integer between 1 and 1000');
    }

    console.log(`Processing purchase: user ${user.id}, product ${productId}, quantity ${quantity}`);

    // Get product details
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('active', true)
      .single();

    if (productError || !product) {
      throw new Error('Product not found or not available');
    }

    // Check stock
    if (product.stock < quantity) {
      throw new Error('Insufficient stock');
    }

    // Check if discount is active
    let effectivePrice = product.price;
    if (product.discount_percentage && product.discount_percentage > 0) {
      const discountActive = !product.discount_ends_at || new Date(product.discount_ends_at) > new Date();
      if (discountActive) {
        effectivePrice = Math.round(product.price * (1 - product.discount_percentage / 100));
      }
    }

    // Calculate prices
    const totalPrice = effectivePrice * quantity;
    const agentCommission = Math.round(totalPrice * 0.01); // 1% commission

    console.log(`Effective price: ${effectivePrice}, Total price: ${totalPrice}, Agent commission: ${agentCommission}`);

    // Get buyer's wallet
    const { data: buyerWallet, error: buyerWalletError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (buyerWalletError || !buyerWallet) {
      throw new Error('Buyer wallet not found');
    }

    if (buyerWallet.balance < totalPrice) {
      throw new Error('Insufficient wallet balance');
    }

    // Get agent's wallet
    const { data: agentWallet, error: agentWalletError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', product.agent_id)
      .single();

    if (agentWalletError || !agentWallet) {
      throw new Error('Agent wallet not found');
    }

    // Perform the transaction
    // 1. Deduct from buyer's wallet
    const { error: deductError } = await supabaseAdmin
      .from('wallets')
      .update({ balance: buyerWallet.balance - totalPrice })
      .eq('user_id', user.id);

    if (deductError) {
      throw new Error('Failed to deduct from buyer wallet');
    }

    // 2. Credit agent's wallet with product price (minus commission kept by platform for income statement tracking)
    const agentReceives = totalPrice - agentCommission;
    const { error: creditAgentError } = await supabaseAdmin
      .from('wallets')
      .update({ balance: agentWallet.balance + agentReceives + agentCommission })
      .eq('user_id', product.agent_id);

    if (creditAgentError) {
      // Rollback buyer deduction
      await supabaseAdmin
        .from('wallets')
        .update({ balance: buyerWallet.balance })
        .eq('user_id', user.id);
      throw new Error('Failed to credit agent wallet');
    }

    // 3. Update product stock
    const { error: stockError } = await supabaseAdmin
      .from('products')
      .update({ stock: product.stock - quantity })
      .eq('id', productId);

    if (stockError) {
      console.error('Failed to update stock:', stockError);
    }

    // 4. Create order record
    const { data: order, error: orderError } = await supabaseAdmin
      .from('product_orders')
      .insert({
        product_id: productId,
        buyer_id: user.id,
        agent_id: product.agent_id,
        quantity,
        unit_price: effectivePrice,
        total_price: totalPrice,
        agent_commission: agentCommission,
        status: 'completed'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Failed to create order record:', orderError);
    }

    // 5. Record agent earning (1% commission)
    const { error: earningError } = await supabaseAdmin
      .from('agent_earnings')
      .insert({
        agent_id: product.agent_id,
        amount: agentCommission,
        earning_type: 'marketplace_commission',
        description: `1% commission on ${product.name} sale (Qty: ${quantity})`,
        source_user_id: user.id
      });

    if (earningError) {
      console.error('Failed to record agent earning:', earningError);
    }

    // 6. Record platform transaction (marketplace expense)
    const { error: transactionError } = await supabaseAdmin
      .from('platform_transactions')
      .insert({
        user_id: product.agent_id,
        amount: agentCommission,
        direction: 'cash_out',
        transaction_type: 'marketplace_commission',
        description: `Marketplace commission to agent for ${product.name} sale`
      });

    if (transactionError) {
      console.error('Failed to record platform transaction:', transactionError);
    }

    // 7. Create notifications
    // Notify buyer
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: user.id,
        title: 'Purchase Successful',
        message: `You purchased ${quantity}x ${product.name} for UGX ${totalPrice.toLocaleString()}`,
        type: 'success',
        metadata: { order_id: order?.id, product_id: productId }
      });

    // Notify agent
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: product.agent_id,
        title: 'New Sale!',
        message: `You sold ${quantity}x ${product.name} and earned UGX ${agentCommission.toLocaleString()} commission`,
        type: 'success',
        metadata: { order_id: order?.id, product_id: productId }
      });

    console.log('Purchase completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        order: order,
        message: 'Purchase completed successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Product purchase error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
