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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for loans due in 1, 2, and 3 days
    const reminderDays = [1, 2, 3];
    let totalReminders = 0;

    for (const daysAhead of reminderDays) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      console.log(`Checking for loans due on ${targetDateStr} (${daysAhead} days ahead)`);

      // Get active loans due on this date
      const { data: loans, error: loansError } = await supabase
        .from('user_loans')
        .select('id, borrower_id, amount, total_repayment, paid_amount, due_date, lender_id')
        .eq('status', 'active')
        .eq('due_date', targetDateStr);

      if (loansError) {
        console.error('Error fetching loans:', loansError);
        continue;
      }

      if (!loans || loans.length === 0) {
        console.log(`No loans due on ${targetDateStr}`);
        continue;
      }

      console.log(`Found ${loans.length} loans due on ${targetDateStr}`);

      for (const loan of loans) {
        const remainingAmount = loan.total_repayment - loan.paid_amount;
        
        // Check if we already sent a reminder for this loan today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const { data: existingNotification } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', loan.borrower_id)
          .gte('created_at', todayStart.toISOString())
          .ilike('title', '%Payment Reminder%')
          .single();

        if (existingNotification) {
          console.log(`Reminder already sent today for loan ${loan.id}`);
          continue;
        }

        // Get borrower name for personalization
        const { data: borrowerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', loan.borrower_id)
          .single();

        const borrowerName = borrowerProfile?.full_name?.split(' ')[0] || 'there';

        // Determine urgency level and message
        let title: string;
        let message: string;
        let notificationType: string;

        if (daysAhead === 1) {
          title = '⚠️ Payment Due Tomorrow!';
          message = `Hi ${borrowerName}, your loan payment of UGX ${remainingAmount.toLocaleString()} is due tomorrow. Please ensure you have sufficient funds in your wallet.`;
          notificationType = 'warning';
        } else if (daysAhead === 2) {
          title = '📅 Payment Reminder';
          message = `Hi ${borrowerName}, your loan payment of UGX ${remainingAmount.toLocaleString()} is due in 2 days. Plan ahead to avoid late fees.`;
          notificationType = 'info';
        } else {
          title = '💡 Upcoming Payment';
          message = `Hi ${borrowerName}, just a friendly reminder that your loan payment of UGX ${remainingAmount.toLocaleString()} is due in 3 days.`;
          notificationType = 'info';
        }

        // Create notification
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: loan.borrower_id,
          title,
          message,
          type: notificationType,
          metadata: {
            loan_id: loan.id,
            days_until_due: daysAhead,
            remaining_amount: remainingAmount,
            due_date: loan.due_date,
          },
        });

        if (notifError) {
          console.error('Error creating notification:', notifError);
        } else {
          console.log(`Reminder sent for loan ${loan.id} to borrower ${loan.borrower_id}`);
          totalReminders++;
        }
      }
    }

    // Also check for overdue loans
    const { data: overdueLoans, error: overdueError } = await supabase
      .from('user_loans')
      .select('id, borrower_id, amount, total_repayment, paid_amount, due_date')
      .eq('status', 'active')
      .lt('due_date', today.toISOString().split('T')[0]);

    if (!overdueError && overdueLoans && overdueLoans.length > 0) {
      console.log(`Found ${overdueLoans.length} overdue loans`);

      for (const loan of overdueLoans) {
        const remainingAmount = loan.total_repayment - loan.paid_amount;
        const dueDate = new Date(loan.due_date);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        // Only send overdue reminder once per day
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: existingOverdueNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', loan.borrower_id)
          .gte('created_at', todayStart.toISOString())
          .ilike('title', '%Overdue%')
          .single();

        if (existingOverdueNotif) {
          continue;
        }

        const { data: borrowerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', loan.borrower_id)
          .single();

        const borrowerName = borrowerProfile?.full_name?.split(' ')[0] || 'there';

        await supabase.from('notifications').insert({
          user_id: loan.borrower_id,
          title: '🚨 Payment Overdue!',
          message: `Hi ${borrowerName}, your loan payment of UGX ${remainingAmount.toLocaleString()} is ${daysOverdue} day(s) overdue. Please make a payment immediately to avoid additional penalties.`,
          type: 'alert',
          metadata: {
            loan_id: loan.id,
            days_overdue: daysOverdue,
            remaining_amount: remainingAmount,
            due_date: loan.due_date,
          },
        });

        totalReminders++;
      }
    }

    console.log(`Total reminders sent: ${totalReminders}`);

    return new Response(
      JSON.stringify({ success: true, reminders_sent: totalReminders }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    console.error('Error in loan-reminders:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
