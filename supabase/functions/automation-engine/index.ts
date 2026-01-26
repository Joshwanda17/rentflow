import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SystemEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, any>;
  processed: boolean;
  created_at: string;
}

interface AutomationRule {
  name: string;
  eventTypes: string[];
  condition: (event: SystemEvent, context: RuleContext) => Promise<boolean>;
  action: (event: SystemEvent, context: RuleContext) => Promise<void>;
}

interface RuleContext {
  supabase: any;
  userRiskScore: any;
  userFlags: any[];
  rentRequests: any[];
  repayments: any[];
}

// Rule definitions
const automationRules: AutomationRule[] = [
  // Rule 1: Welcome new tenants
  {
    name: 'welcome_new_tenant',
    eventTypes: ['tenant_created'],
    condition: async () => true,
    action: async (event, { supabase }) => {
      await supabase.from('notifications').insert({
        user_id: event.user_id,
        title: '🎉 Welcome to Welile!',
        message: 'Your account has been activated. You can now request rent assistance through the platform.',
        type: 'success',
        metadata: { automated: true, rule: 'welcome_new_tenant' }
      });
      
      await logAction(supabase, 'send_notification', event, 'welcome_new_tenant', {
        notification_type: 'welcome'
      });
    }
  },
  
  // Rule 2: Missed payment reminder (1 day overdue)
  {
    name: 'missed_payment_day_1',
    eventTypes: ['payment_missed'],
    condition: async (event) => {
      return event.metadata?.days_overdue === 1;
    },
    action: async (event, { supabase }) => {
      const userId = event.user_id;
      
      // Send reminder notification
      await supabase.from('notifications').insert({
        user_id: userId,
        title: '⏰ Payment Reminder',
        message: `Your daily repayment was due yesterday. Please make your payment today to stay on track.`,
        type: 'warning',
        metadata: { 
          automated: true, 
          rule: 'missed_payment_day_1',
          rent_request_id: event.related_entity_id 
        }
      });
      
      // Increase risk score by 3
      await supabase.rpc('update_user_risk_score', {
        p_user_id: userId,
        p_score_change: 3,
        p_reason: 'Missed payment - 1 day overdue'
      });
      
      await logAction(supabase, 'send_reminder', event, 'missed_payment_day_1', {
        risk_score_change: 3
      });
    }
  },
  
  // Rule 3: Missed payment escalation (3+ days overdue)
  {
    name: 'missed_payment_day_3',
    eventTypes: ['payment_missed'],
    condition: async (event) => {
      return event.metadata?.days_overdue >= 3 && event.metadata?.days_overdue < 7;
    },
    action: async (event, { supabase }) => {
      const userId = event.user_id;
      
      await supabase.from('notifications').insert({
        user_id: userId,
        title: '⚠️ Payment Overdue - Action Required',
        message: `You are ${event.metadata?.days_overdue} days behind on your repayment. Please pay immediately to avoid account restrictions.`,
        type: 'warning',
        metadata: { automated: true, rule: 'missed_payment_day_3' }
      });
      
      // Increase risk score by 5
      await supabase.rpc('update_user_risk_score', {
        p_user_id: userId,
        p_score_change: 5,
        p_reason: `Missed payment - ${event.metadata?.days_overdue} days overdue`
      });
      
      await logAction(supabase, 'send_reminder', event, 'missed_payment_day_3', {
        days_overdue: event.metadata?.days_overdue,
        risk_score_change: 5
      });
    }
  },
  
  // Rule 4: Critical overdue - flag account (7+ days)
  {
    name: 'critical_overdue_flag',
    eventTypes: ['payment_missed'],
    condition: async (event, { userFlags }) => {
      const hasActiveFlag = userFlags.some(f => f.flag_type === 'payment_overdue' && !f.resolved);
      return event.metadata?.days_overdue >= 7 && !hasActiveFlag;
    },
    action: async (event, { supabase }) => {
      const userId = event.user_id;
      
      // Flag the account
      await supabase.from('account_flags').insert({
        user_id: userId,
        flag_type: 'payment_overdue',
        severity: event.metadata?.days_overdue >= 14 ? 'critical' : 'high',
        reason: `Payment overdue by ${event.metadata?.days_overdue} days`,
        metadata: { 
          rent_request_id: event.related_entity_id,
          days_overdue: event.metadata?.days_overdue,
          amount_due: event.metadata?.amount_due
        }
      });
      
      // Increase risk score significantly
      await supabase.rpc('update_user_risk_score', {
        p_user_id: userId,
        p_score_change: 15,
        p_reason: `Critical overdue - ${event.metadata?.days_overdue} days`
      });
      
      // Notify managers
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .eq('enabled', true);
      
      if (managers?.length) {
        const managerNotifications = managers.map((m: any) => ({
          user_id: m.user_id,
          title: '🚨 Account Flagged - Critical Overdue',
          message: `A tenant is ${event.metadata?.days_overdue} days overdue on payment. Account has been flagged for review.`,
          type: 'alert',
          metadata: { 
            automated: true, 
            rule: 'critical_overdue_flag',
            flagged_user_id: userId
          }
        }));
        
        await supabase.from('notifications').insert(managerNotifications);
      }
      
      await logAction(supabase, 'flag_account', event, 'critical_overdue_flag', {
        severity: event.metadata?.days_overdue >= 14 ? 'critical' : 'high',
        days_overdue: event.metadata?.days_overdue
      });
    }
  },
  
  // Rule 5: Reward consistent on-time payments
  {
    name: 'on_time_payment_reward',
    eventTypes: ['payment_made'],
    condition: async (event, { userRiskScore }) => {
      return event.metadata?.is_on_time === true && 
             userRiskScore?.consecutive_on_time_payments >= 5 &&
             userRiskScore?.consecutive_on_time_payments % 5 === 0; // Every 5th consecutive payment
    },
    action: async (event, { supabase, userRiskScore }) => {
      const userId = event.user_id;
      const streak = userRiskScore?.consecutive_on_time_payments || 0;
      
      await supabase.from('notifications').insert({
        user_id: userId,
        title: '🌟 Payment Streak!',
        message: `Amazing! You've made ${streak} consecutive on-time payments. Your trust score is improving!`,
        type: 'success',
        metadata: { automated: true, rule: 'on_time_payment_reward', streak }
      });
      
      // Decrease risk score (improve trust)
      await supabase.rpc('update_user_risk_score', {
        p_user_id: userId,
        p_score_change: -5,
        p_reason: `Payment streak reward - ${streak} consecutive payments`
      });
      
      // Remove any payment-related flags if risk is now low
      if (userRiskScore?.risk_score <= 30) {
        await supabase
          .from('account_flags')
          .update({ resolved: true, resolved_at: new Date().toISOString(), resolution_notes: 'Automatically resolved - consistent payments' })
          .eq('user_id', userId)
          .eq('flag_type', 'payment_overdue')
          .eq('resolved', false);
      }
      
      await logAction(supabase, 'send_notification', event, 'on_time_payment_reward', {
        streak,
        risk_score_change: -5
      });
    }
  },
  
  // Rule 6: Funds added confirmation
  {
    name: 'funds_added_confirmation',
    eventTypes: ['funds_added'],
    condition: async (event) => {
      return event.metadata?.amount >= 10000; // Only for deposits >= 10k
    },
    action: async (event, { supabase }) => {
      await supabase.from('notifications').insert({
        user_id: event.user_id,
        title: '💰 Funds Added',
        message: `UGX ${Number(event.metadata?.amount).toLocaleString()} has been added to your wallet. New balance: UGX ${Number(event.metadata?.new_balance).toLocaleString()}`,
        type: 'success',
        metadata: { automated: true, rule: 'funds_added_confirmation' }
      });
      
      await logAction(supabase, 'send_notification', event, 'funds_added_confirmation', {
        amount: event.metadata?.amount
      });
    }
  },
  
  // Rule 7: Rent request funded - notify tenant
  {
    name: 'rent_funded_celebration',
    eventTypes: ['rent_request_funded'],
    condition: async () => true,
    action: async (event, { supabase }) => {
      await supabase.from('notifications').insert({
        user_id: event.user_id,
        title: '🎉 Rent Request Funded!',
        message: 'Great news! Your rent request has been funded. The payment will be processed to your landlord shortly.',
        type: 'success',
        metadata: { 
          automated: true, 
          rule: 'rent_funded_celebration',
          rent_request_id: event.related_entity_id
        }
      });
      
      await logAction(supabase, 'send_notification', event, 'rent_funded_celebration', {});
    }
  },
  
  // Rule 8: Inactivity detection (30+ days)
  {
    name: 'inactivity_alert',
    eventTypes: ['account_inactive'],
    condition: async (event) => {
      return event.metadata?.days_inactive >= 30;
    },
    action: async (event, { supabase }) => {
      const userId = event.user_id;
      
      // Notify managers about inactive user
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .eq('enabled', true);
      
      if (managers?.length) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', userId)
          .single();
        
        const managerNotifications = managers.map((m: any) => ({
          user_id: m.user_id,
          title: '👤 Inactive User Alert',
          message: `${profile?.full_name || 'A user'} (${profile?.phone}) has been inactive for ${event.metadata?.days_inactive} days. Consider reaching out.`,
          type: 'info',
          metadata: { 
            automated: true, 
            rule: 'inactivity_alert',
            inactive_user_id: userId,
            phone: profile?.phone
          }
        }));
        
        await supabase.from('notifications').insert(managerNotifications);
      }
      
      await logAction(supabase, 'escalate_to_manager', event, 'inactivity_alert', {
        days_inactive: event.metadata?.days_inactive
      });
    }
  }
];

async function logAction(
  supabase: any,
  actionType: string,
  event: SystemEvent,
  ruleName: string,
  details: Record<string, any>
) {
  await supabase.from('automation_actions').insert({
    action_type: actionType,
    triggered_by_event_id: event.id,
    target_user_id: event.user_id,
    rule_name: ruleName,
    action_details: details,
    success: true
  });
}

async function processEvent(supabase: any, event: SystemEvent) {
  console.log(`Processing event: ${event.event_type} for user ${event.user_id}`);
  
  // Get context for rules
  let context: RuleContext = {
    supabase,
    userRiskScore: null,
    userFlags: [],
    rentRequests: [],
    repayments: []
  };
  
  if (event.user_id) {
    // Fetch user risk score
    const { data: riskScore } = await supabase
      .from('user_risk_scores')
      .select('*')
      .eq('user_id', event.user_id)
      .maybeSingle();
    context.userRiskScore = riskScore;
    
    // Fetch active flags
    const { data: flags } = await supabase
      .from('account_flags')
      .select('*')
      .eq('user_id', event.user_id)
      .eq('resolved', false);
    context.userFlags = flags || [];
  }
  
  // Find and execute matching rules
  for (const rule of automationRules) {
    if (rule.eventTypes.includes(event.event_type)) {
      try {
        const shouldExecute = await rule.condition(event, context);
        if (shouldExecute) {
          console.log(`Executing rule: ${rule.name}`);
          await rule.action(event, context);
        }
      } catch (error: any) {
        console.error(`Error executing rule ${rule.name}:`, error);
        
        // Log failed action
        await supabase.from('automation_actions').insert({
          action_type: 'send_notification',
          triggered_by_event_id: event.id,
          target_user_id: event.user_id,
          rule_name: rule.name,
          action_details: { error: error.message },
          success: false,
          error_message: error.message
        });
      }
    }
  }
  
  // Mark event as processed
  await supabase
    .from('system_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', event.id);
}

async function checkMissedPayments(supabase: any) {
  console.log('Checking for missed payments...');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find overdue repayment schedules
  const { data: overdueSchedules, error } = await supabase
    .from('repayment_schedules')
    .select(`
      id,
      tenant_id,
      rent_request_id,
      amount,
      due_date,
      payment_number,
      rent_request:rent_requests(daily_repayment, total_repayment)
    `)
    .eq('status', 'pending')
    .lt('due_date', today.toISOString());
  
  if (error) {
    console.error('Error fetching overdue schedules:', error);
    return;
  }
  
  console.log(`Found ${overdueSchedules?.length || 0} overdue schedules`);
  
  for (const schedule of overdueSchedules || []) {
    const dueDate = new Date(schedule.due_date);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if we already logged this event today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { data: existingEvent } = await supabase
      .from('system_events')
      .select('id')
      .eq('event_type', 'payment_missed')
      .eq('user_id', schedule.tenant_id)
      .eq('related_entity_id', schedule.rent_request_id)
      .gte('created_at', todayStart.toISOString())
      .maybeSingle();
    
    if (!existingEvent) {
      // Log missed payment event
      const { data: event } = await supabase
        .from('system_events')
        .insert({
          event_type: 'payment_missed',
          user_id: schedule.tenant_id,
          related_entity_type: 'repayment_schedule',
          related_entity_id: schedule.rent_request_id,
          metadata: {
            schedule_id: schedule.id,
            days_overdue: daysOverdue,
            amount_due: schedule.amount,
            payment_number: schedule.payment_number
          }
        })
        .select()
        .single();
      
      if (event) {
        await processEvent(supabase, event);
      }
      
      // Update user risk score for missed payments
      await supabase
        .from('user_risk_scores')
        .upsert({
          user_id: schedule.tenant_id,
          consecutive_missed_payments: 1,
          total_missed_payments: 1,
          risk_score: 53
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        });
      
      await supabase
        .from('user_risk_scores')
        .update({
          consecutive_missed_payments: supabase.sql`consecutive_missed_payments + 1`,
          total_missed_payments: supabase.sql`total_missed_payments + 1`,
          consecutive_on_time_payments: 0,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', schedule.tenant_id);
    }
  }
}

async function checkInactiveUsers(supabase: any) {
  console.log('Checking for inactive users...');
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Find users who haven't been active in 30 days
  const { data: inactiveUsers, error } = await supabase
    .from('profiles')
    .select('id, full_name, last_active_at')
    .lt('last_active_at', thirtyDaysAgo.toISOString())
    .not('last_active_at', 'is', null);
  
  if (error) {
    console.error('Error fetching inactive users:', error);
    return;
  }
  
  for (const user of inactiveUsers || []) {
    const lastActive = new Date(user.last_active_at);
    const daysInactive = Math.floor((Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if we already logged this event this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const { data: existingEvent } = await supabase
      .from('system_events')
      .select('id')
      .eq('event_type', 'account_inactive')
      .eq('user_id', user.id)
      .gte('created_at', weekAgo.toISOString())
      .maybeSingle();
    
    if (!existingEvent) {
      const { data: event } = await supabase
        .from('system_events')
        .insert({
          event_type: 'account_inactive',
          user_id: user.id,
          related_entity_type: 'profile',
          related_entity_id: user.id,
          metadata: {
            days_inactive: daysInactive,
            last_active_at: user.last_active_at
          }
        })
        .select()
        .single();
      
      if (event) {
        await processEvent(supabase, event);
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results = {
      eventsProcessed: 0,
      missedPaymentsChecked: 0,
      inactiveUsersChecked: 0,
      errors: [] as string[]
    };

    // Process unprocessed events
    const { data: unprocessedEvents, error: fetchError } = await supabase
      .from('system_events')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    console.log(`Found ${unprocessedEvents?.length || 0} unprocessed events`);

    for (const event of unprocessedEvents || []) {
      try {
        await processEvent(supabase, event);
        results.eventsProcessed++;
      } catch (err: any) {
        console.error(`Error processing event ${event.id}:`, err);
        results.errors.push(`Event ${event.id}: ${err.message}`);
      }
    }

    // Run periodic checks
    await checkMissedPayments(supabase);
    await checkInactiveUsers(supabase);

    console.log(`Automation engine complete. Processed ${results.eventsProcessed} events.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.eventsProcessed} events`,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error: any) {
    console.error('Automation engine error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
