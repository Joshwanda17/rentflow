import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface AIAnalysisContext {
  events: any[];
  userRiskScores: any[];
  overduePayments: any[];
  recentPayments: any[];
  accountFlags: any[];
  collectionStrategies: any[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  // Create analysis session
  const { data: session } = await supabase
    .from('ai_analysis_sessions')
    .insert({
      session_type: 'scheduled',
      status: 'running',
    })
    .select()
    .single();

  const sessionId = session?.id;
  const startTime = Date.now();

  try {
    // Gather context data for AI analysis
    const context = await gatherAnalysisContext(supabase);
    
    // Run AI analysis on different domains
    const recommendations: any[] = [];
    
    // 1. Risk Assessment Analysis
    const riskRecommendations = await analyzeRiskPatterns(supabase, context);
    recommendations.push(...riskRecommendations);
    
    // 2. Notification Optimization
    const notificationRecommendations = await analyzeNotificationPatterns(supabase, context);
    recommendations.push(...notificationRecommendations);
    
    // 3. Collection Strategy Optimization
    const collectionRecommendations = await analyzeCollectionStrategies(supabase, context);
    recommendations.push(...collectionRecommendations);
    
    // Process recommendations
    let autoExecuted = 0;
    for (const rec of recommendations) {
      // Auto-execute high-confidence, low-risk recommendations
      if (!rec.requires_approval && rec.confidence_score >= rec.auto_approve_threshold) {
        await executeRecommendation(supabase, rec);
        rec.status = 'auto_executed';
        rec.executed_at = new Date().toISOString();
        autoExecuted++;
      }
      
      // Insert recommendation
      await supabase.from('ai_recommendations').insert(rec);
    }
    
    // Update session
    await supabase
      .from('ai_analysis_sessions')
      .update({
        status: 'completed',
        events_processed: context.events.length,
        recommendations_generated: recommendations.length,
        auto_executed_actions: autoExecuted,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
        analysis_summary: {
          risk_recommendations: riskRecommendations.length,
          notification_recommendations: notificationRecommendations.length,
          collection_recommendations: collectionRecommendations.length,
        }
      })
      .eq('id', sessionId);

    return new Response(JSON.stringify({
      success: true,
      sessionId,
      recommendationsGenerated: recommendations.length,
      autoExecuted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error('AI Brain error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await supabase
      .from('ai_analysis_sessions')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function gatherAnalysisContext(supabase: any): Promise<AIAnalysisContext> {
  const [
    { data: events },
    { data: userRiskScores },
    { data: overduePayments },
    { data: recentPayments },
    { data: accountFlags },
    { data: collectionStrategies },
  ] = await Promise.all([
    // Recent system events
    supabase
      .from('system_events')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
    
    // User risk scores
    supabase
      .from('user_risk_scores')
      .select('*')
      .order('risk_score', { ascending: false })
      .limit(50),
    
    // Overdue payments from repayment_schedules
    supabase
      .from('repayment_schedules')
      .select(`
        *,
        rent_request:rent_requests(
          id, tenant_id, rent_amount, total_repayment,
          tenant:profiles!rent_requests_tenant_id_fkey(id, full_name, phone)
        )
      `)
      .eq('status', 'missed')
      .order('scheduled_date', { ascending: true })
      .limit(50),
    
    // Recent successful payments
    supabase
      .from('repayments')
      .select('*')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
    
    // Active account flags
    supabase
      .from('account_flags')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false }),
    
    // Current collection strategies
    supabase
      .from('ai_collection_strategies')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  return {
    events: events || [],
    userRiskScores: userRiskScores || [],
    overduePayments: overduePayments || [],
    recentPayments: recentPayments || [],
    accountFlags: accountFlags || [],
    collectionStrategies: collectionStrategies || [],
  };
}

async function analyzeRiskPatterns(supabase: any, context: AIAnalysisContext): Promise<any[]> {
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return [];
  }

  const recommendations: any[] = [];
  
  // Prepare data for AI analysis
  const riskData = {
    highRiskUsers: context.userRiskScores.filter(u => u.risk_score >= 60),
    recentMissedPayments: context.overduePayments.slice(0, 20),
    paymentTrends: context.recentPayments.slice(0, 30),
  };

  if (riskData.highRiskUsers.length === 0 && riskData.recentMissedPayments.length === 0) {
    return recommendations;
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI risk analyst for a rent payment platform. Analyze user payment patterns and risk data to identify users who need intervention. 
            
Your job is to:
1. Identify users whose risk scores need adjustment based on recent behavior
2. Flag accounts that need manager attention
3. Predict which users are likely to default

Return structured recommendations using the provided tool.`
          },
          {
            role: "user",
            content: `Analyze these risk patterns and generate recommendations:

High Risk Users (risk_score >= 60):
${JSON.stringify(riskData.highRiskUsers, null, 2)}

Recent Missed Payments:
${JSON.stringify(riskData.recentMissedPayments, null, 2)}

Recent Successful Payments:
${JSON.stringify(riskData.paymentTrends.slice(0, 10), null, 2)}

Generate specific recommendations for risk score adjustments, account flags, or interventions needed.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_risk_recommendations",
              description: "Generate risk-related recommendations for users",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user_id: { type: "string", description: "UUID of the user" },
                        action_type: { type: "string", enum: ["adjust_risk_score", "flag_account", "escalate_to_manager"] },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        title: { type: "string" },
                        description: { type: "string" },
                        reasoning: { type: "string" },
                        suggested_risk_change: { type: "number" },
                        confidence: { type: "number" }
                      },
                      required: ["user_id", "action_type", "priority", "title", "description", "reasoning", "confidence"]
                    }
                  }
                },
                required: ["recommendations"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_risk_recommendations" } }
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', await response.text());
      return recommendations;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      
      for (const rec of parsed.recommendations || []) {
        recommendations.push({
          recommendation_type: 'risk_adjustment',
          priority: rec.priority,
          target_user_id: rec.user_id,
          title: rec.title,
          description: rec.description,
          reasoning: rec.reasoning,
          suggested_action: {
            action_type: rec.action_type,
            risk_change: rec.suggested_risk_change,
          },
          context_data: { source: 'risk_analysis' },
          confidence_score: rec.confidence,
          requires_approval: rec.priority === 'critical' || rec.action_type === 'flag_account',
          auto_approve_threshold: 0.90,
        });
      }
    }
  } catch (error) {
    console.error('Risk analysis error:', error);
  }

  return recommendations;
}

async function analyzeNotificationPatterns(supabase: any, context: AIAnalysisContext): Promise<any[]> {
  if (!LOVABLE_API_KEY) return [];

  const recommendations: any[] = [];
  
  // Find users who need notifications based on missed payments
  const usersNeedingReminders = context.overduePayments
    .filter(p => p.rent_request?.tenant)
    .slice(0, 15);

  if (usersNeedingReminders.length === 0) return recommendations;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI communication specialist for a rent payment platform. Your job is to craft personalized, empathetic notification messages that encourage users to make payments without being aggressive.

Consider:
- User's payment history and current situation
- Days overdue
- Best tone for each user (encouraging, reminder, urgent but supportive)
- Personalization with their name

Return structured notification recommendations.`
          },
          {
            role: "user",
            content: `Generate personalized notification messages for these users with overdue payments:

${JSON.stringify(usersNeedingReminders.map(p => ({
  user_id: p.rent_request?.tenant_id,
  user_name: p.rent_request?.tenant?.full_name,
  days_overdue: Math.floor((Date.now() - new Date(p.scheduled_date).getTime()) / (1000 * 60 * 60 * 24)),
  amount_due: p.amount,
  total_remaining: p.rent_request?.total_repayment,
})), null, 2)}

Generate personalized messages that are warm but clear about the importance of payment.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_notifications",
              description: "Generate personalized notification messages",
              parameters: {
                type: "object",
                properties: {
                  notifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user_id: { type: "string" },
                        title: { type: "string" },
                        message: { type: "string" },
                        tone: { type: "string", enum: ["gentle", "encouraging", "urgent", "final_reminder"] },
                        channel: { type: "string", enum: ["in_app", "push", "whatsapp"] },
                        send_immediately: { type: "boolean" },
                        confidence: { type: "number" }
                      },
                      required: ["user_id", "title", "message", "tone", "channel", "confidence"]
                    }
                  }
                },
                required: ["notifications"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_notifications" } }
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', await response.text());
      return recommendations;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      
      for (const notif of parsed.notifications || []) {
        recommendations.push({
          recommendation_type: 'notification',
          priority: notif.tone === 'final_reminder' ? 'high' : 'medium',
          target_user_id: notif.user_id,
          title: `Send ${notif.tone} notification`,
          description: notif.message,
          reasoning: `AI crafted ${notif.tone} message via ${notif.channel}`,
          suggested_action: {
            action_type: 'send_notification',
            notification_title: notif.title,
            notification_message: notif.message,
            channel: notif.channel,
          },
          context_data: { tone: notif.tone },
          confidence_score: notif.confidence,
          requires_approval: notif.tone === 'final_reminder',
          auto_approve_threshold: 0.85,
        });
      }
    }
  } catch (error) {
    console.error('Notification analysis error:', error);
  }

  return recommendations;
}

async function analyzeCollectionStrategies(supabase: any, context: AIAnalysisContext): Promise<any[]> {
  if (!LOVABLE_API_KEY) return [];

  const recommendations: any[] = [];
  
  // Find users with significant overdue amounts
  const overdueUsers = context.overduePayments
    .filter(p => p.rent_request?.tenant_id)
    .reduce((acc: any, p: any) => {
      const userId = p.rent_request?.tenant_id;
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          user_name: p.rent_request?.tenant?.full_name,
          phone: p.rent_request?.tenant?.phone,
          total_overdue: 0,
          missed_payments: 0,
          oldest_overdue_date: p.scheduled_date,
        };
      }
      acc[userId].total_overdue += Number(p.amount);
      acc[userId].missed_payments++;
      return acc;
    }, {});

  const overdueUsersList = Object.values(overdueUsers);
  if (overdueUsersList.length === 0) return recommendations;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI collection strategy optimizer. Analyze overdue accounts and recommend the best collection approach for each user.

Strategies:
- gentle_reminder: For first-time or minor delays
- escalated: For repeated delays, requires agent follow-up
- final_notice: For severe cases, last warning before account flag
- agent_intervention: Requires personal contact from agent

Consider:
- Total amount overdue
- Number of missed payments
- Duration of delinquency
- Prioritize high-value accounts

Return prioritized collection strategies.`
          },
          {
            role: "user",
            content: `Analyze these overdue accounts and recommend collection strategies:

${JSON.stringify(overdueUsersList, null, 2)}

Prioritize accounts that need immediate attention and suggest the best approach for each.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_collection_strategies",
              description: "Generate collection strategy recommendations",
              parameters: {
                type: "object",
                properties: {
                  strategies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user_id: { type: "string" },
                        priority_rank: { type: "number" },
                        strategy: { type: "string", enum: ["gentle_reminder", "escalated", "final_notice", "agent_intervention"] },
                        recommended_action: { type: "string" },
                        reasoning: { type: "string" },
                        optimal_contact_time: { type: "string" },
                        payment_likelihood: { type: "number" },
                        confidence: { type: "number" }
                      },
                      required: ["user_id", "strategy", "recommended_action", "reasoning", "confidence"]
                    }
                  }
                },
                required: ["strategies"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_collection_strategies" } }
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', await response.text());
      return recommendations;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      
      for (const strat of parsed.strategies || []) {
        const priority = strat.strategy === 'agent_intervention' ? 'critical' :
                        strat.strategy === 'final_notice' ? 'high' :
                        strat.strategy === 'escalated' ? 'medium' : 'low';
        
        recommendations.push({
          recommendation_type: 'collection_action',
          priority,
          target_user_id: strat.user_id,
          title: `${strat.strategy.replace('_', ' ').toUpperCase()}: Collection action needed`,
          description: strat.recommended_action,
          reasoning: strat.reasoning,
          suggested_action: {
            action_type: 'update_collection_strategy',
            strategy: strat.strategy,
            optimal_contact_time: strat.optimal_contact_time,
            payment_likelihood: strat.payment_likelihood,
          },
          context_data: { 
            priority_rank: strat.priority_rank,
          },
          confidence_score: strat.confidence,
          requires_approval: strat.strategy === 'agent_intervention' || strat.strategy === 'final_notice',
          auto_approve_threshold: 0.88,
        });

        // Update collection strategy in database
        await supabase
          .from('ai_collection_strategies')
          .upsert({
            user_id: strat.user_id,
            current_strategy: strat.strategy,
            recommended_approach: strat.recommended_action,
            ai_notes: strat.reasoning,
            optimal_contact_time: strat.optimal_contact_time,
            payment_likelihood: strat.payment_likelihood,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      }
    }
  } catch (error) {
    console.error('Collection analysis error:', error);
  }

  return recommendations;
}

async function executeRecommendation(supabase: any, recommendation: any): Promise<void> {
  const action = recommendation.suggested_action;
  
  switch (action.action_type) {
    case 'send_notification':
      await supabase.from('notifications').insert({
        user_id: recommendation.target_user_id,
        title: action.notification_title,
        message: action.notification_message,
        type: 'ai_generated',
        metadata: { ai_generated: true, confidence: recommendation.confidence_score }
      });
      break;
    
    case 'adjust_risk_score':
      if (action.risk_change) {
        await supabase.rpc('update_user_risk_score', {
          p_user_id: recommendation.target_user_id,
          p_score_change: action.risk_change,
          p_reason: `AI Auto-Adjustment: ${recommendation.reasoning}`,
        });
      }
      break;
    
    case 'update_collection_strategy':
      // Already handled in analyzeCollectionStrategies
      break;
  }
}
