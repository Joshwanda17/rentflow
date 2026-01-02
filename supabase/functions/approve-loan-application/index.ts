import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the JWT from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is a manager
    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is a manager
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'manager')
      .single();

    if (roleError || !roleData) {
      throw new Error('Only managers can approve loan applications');
    }

    const { applicationId, action, rejectedReason } = await req.json();

    if (!applicationId || !action) {
      throw new Error('Missing required fields');
    }

    if (action !== 'approve' && action !== 'reject') {
      throw new Error('Invalid action');
    }

    // Get the loan application
    const { data: application, error: appError } = await supabase
      .from('loan_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('Application fetch error:', appError);
      throw new Error('Loan application not found');
    }

    if (application.status !== 'pending') {
      throw new Error('This application has already been processed');
    }

    if (action === 'reject') {
      // Update application status to rejected
      const { error: updateError } = await supabase
        .from('loan_applications')
        .update({
          status: 'rejected',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejected_reason: rejectedReason || 'Application rejected by manager',
        })
        .eq('id', applicationId);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error('Failed to reject application');
      }

      // Notify the applicant
      await supabase.from('notifications').insert({
        user_id: application.applicant_id,
        title: 'Loan Application Rejected',
        message: `Your loan application for UGX ${application.amount.toLocaleString()} was rejected. ${rejectedReason || ''}`,
        type: 'warning',
        metadata: { application_id: applicationId },
      });

      return new Response(
        JSON.stringify({ success: true, message: 'Application rejected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For approval, check agent's wallet balance
    const { data: agentWallet, error: walletError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', application.agent_id)
      .single();

    if (walletError || !agentWallet) {
      console.error('Wallet fetch error:', walletError);
      throw new Error('Agent wallet not found');
    }

    if (agentWallet.balance < application.amount) {
      throw new Error(`Insufficient funds in lender's wallet. Available: UGX ${agentWallet.balance.toLocaleString()}, Required: UGX ${application.amount.toLocaleString()}`);
    }

    // Deduct from agent's wallet
    const { error: deductError } = await supabase
      .from('wallets')
      .update({
        balance: agentWallet.balance - application.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', application.agent_id);

    if (deductError) {
      console.error('Deduct error:', deductError);
      throw new Error('Failed to deduct from lender wallet');
    }

    // Get or create borrower's wallet
    let { data: borrowerWallet, error: borrowerWalletError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', application.applicant_id)
      .single();

    if (borrowerWalletError) {
      // Create wallet if not exists
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id: application.applicant_id, balance: 0 })
        .select()
        .single();

      if (createError) {
        // Rollback agent wallet
        await supabase
          .from('wallets')
          .update({
            balance: agentWallet.balance,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', application.agent_id);
        throw new Error('Failed to create borrower wallet');
      }
      borrowerWallet = newWallet;
    }

    // Credit to borrower's wallet
    const { error: creditError } = await supabase
      .from('wallets')
      .update({
        balance: (borrowerWallet?.balance || 0) + application.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', application.applicant_id);

    if (creditError) {
      // Rollback agent wallet
      await supabase
        .from('wallets')
        .update({
          balance: agentWallet.balance,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', application.agent_id);
      console.error('Credit error:', creditError);
      throw new Error('Failed to credit borrower wallet');
    }

    // Create the user_loan record
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + application.duration_days);

    const { error: loanError } = await supabase.from('user_loans').insert({
      borrower_id: application.applicant_id,
      lender_id: application.agent_id,
      amount: application.amount,
      interest_rate: application.interest_rate,
      total_repayment: application.total_repayment,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'active',
    });

    if (loanError) {
      console.error('Loan creation error:', loanError);
      // Note: In production, you'd want proper transaction handling
    }

    // Update application status
    const { error: updateError } = await supabase
      .from('loan_applications')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    // Notify the applicant
    await supabase.from('notifications').insert({
      user_id: application.applicant_id,
      title: 'Loan Approved! 🎉',
      message: `Your loan of UGX ${application.amount.toLocaleString()} has been approved and credited to your wallet.`,
      type: 'success',
      metadata: { application_id: applicationId, amount: application.amount },
    });

    // Notify the agent
    await supabase.from('notifications').insert({
      user_id: application.agent_id,
      title: 'Loan Disbursed',
      message: `UGX ${application.amount.toLocaleString()} has been disbursed from your wallet for an approved loan.`,
      type: 'info',
      metadata: { application_id: applicationId, amount: application.amount },
    });

    console.log('Loan application approved successfully:', applicationId);

    return new Response(
      JSON.stringify({ success: true, message: 'Loan approved and disbursed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    console.error('Error in approve-loan-application:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
