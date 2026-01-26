import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Gather comprehensive user data
    const [
      { data: profiles },
      { data: userRoles },
      { data: riskScores },
      { data: accountFlags },
      { data: repayments },
      { data: rentRequests },
      { data: deposits },
      { data: notifications },
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, created_at, last_active_at').limit(50),
      supabase.from('user_roles').select('user_id, role, enabled'),
      supabase.from('user_risk_scores').select('*'),
      supabase.from('account_flags').select('*').eq('resolved', false),
      supabase.from('repayments').select('tenant_id, amount, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('rent_requests').select('tenant_id, status, rent_amount, created_at').limit(200),
      supabase.from('deposit_requests').select('user_id, amount, status, created_at').limit(200),
      supabase.from('notifications').select('user_id, read, created_at').limit(500),
    ]);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No users found',
        report: {
          generated_at: new Date().toISOString(),
          total_users_analyzed: 0,
          overall_platform_sentiment: 'unknown',
          user_experiences: [],
          platform_insights: ['No users to analyze'],
          priority_actions: [],
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user context for AI analysis
    const userContexts = profiles.map(profile => {
      const roles = userRoles?.filter(r => r.user_id === profile.id && r.enabled) || [];
      const risk = riskScores?.find(r => r.user_id === profile.id);
      const flags = accountFlags?.filter(f => f.user_id === profile.id) || [];
      const userRepayments = repayments?.filter(r => r.tenant_id === profile.id) || [];
      const userRequests = rentRequests?.filter(r => r.tenant_id === profile.id) || [];
      const userDeposits = deposits?.filter(d => d.user_id === profile.id) || [];
      const userNotifications = notifications?.filter(n => n.user_id === profile.id) || [];

      const totalRepaid = userRepayments.reduce((sum, r) => sum + Number(r.amount), 0);
      const approvedRequests = userRequests.filter(r => r.status === 'funded' || r.status === 'repaying').length;
      const notificationReadRate = userNotifications.length > 0 
        ? userNotifications.filter(n => n.read).length / userNotifications.length 
        : 0;

      return {
        user_id: profile.id,
        user_name: profile.full_name,
        user_phone: profile.phone,
        role: roles.map(r => r.role).join(', ') || 'user',
        days_since_signup: Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        days_since_active: profile.last_active_at 
          ? Math.floor((Date.now() - new Date(profile.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        risk_score: risk?.risk_score || 0,
        risk_level: risk?.risk_level || 'low',
        active_flags: flags.length,
        flag_types: flags.map(f => f.flag_type),
        total_repayments: userRepayments.length,
        total_repaid_amount: totalRepaid,
        approved_rent_requests: approvedRequests,
        total_deposits: userDeposits.length,
        notification_engagement: Math.round(notificationReadRate * 100),
        consecutive_on_time: risk?.consecutive_on_time_payments || 0,
        consecutive_missed: risk?.consecutive_missed_payments || 0,
      };
    });

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Call AI to analyze user experiences
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
            content: `You are an AI user experience analyst for a rent payment platform called Welile. Analyze user data to understand their experience and provide actionable insights.

For each user, determine:
1. Experience score (0-100): Based on engagement, payment behavior, and platform usage
2. Sentiment: positive (happy, engaged), neutral (normal usage), negative (issues/frustration), at_risk (likely to churn)
3. Summary: Brief description of their experience
4. Highlights: Good things about their usage
5. Concerns: Issues or red flags
6. Recommended actions: What managers should do for this user

Also provide:
- Platform-wide insights
- Priority actions for the management team

Be specific and actionable. Focus on user experience, not just metrics.`
          },
          {
            role: "user",
            content: `Analyze these ${userContexts.length} users and generate an experience report:

${JSON.stringify(userContexts, null, 2)}

Generate a comprehensive report with individual user experiences and platform-wide insights.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experience_report",
              description: "Generate a comprehensive user experience report",
              parameters: {
                type: "object",
                properties: {
                  overall_platform_sentiment: { type: "string" },
                  platform_insights: { 
                    type: "array", 
                    items: { type: "string" } 
                  },
                  priority_actions: { 
                    type: "array", 
                    items: { type: "string" } 
                  },
                  user_experiences: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user_id: { type: "string" },
                        experience_score: { type: "number" },
                        sentiment: { type: "string", enum: ["positive", "neutral", "negative", "at_risk"] },
                        summary: { type: "string" },
                        highlights: { type: "array", items: { type: "string" } },
                        concerns: { type: "array", items: { type: "string" } },
                        recommended_actions: { type: "array", items: { type: "string" } }
                      },
                      required: ["user_id", "experience_score", "sentiment", "summary"]
                    }
                  }
                },
                required: ["overall_platform_sentiment", "platform_insights", "priority_actions", "user_experiences"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_experience_report" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error('AI analysis failed');
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error('No AI response received');
    }

    const aiReport = JSON.parse(toolCall.function.arguments);

    // Merge AI analysis with user info
    const enrichedExperiences = aiReport.user_experiences.map((exp: any) => {
      const userContext = userContexts.find(u => u.user_id === exp.user_id);
      return {
        ...exp,
        user_name: userContext?.user_name || 'Unknown',
        user_phone: userContext?.user_phone || 'N/A',
        role: userContext?.role || 'user',
        highlights: exp.highlights || [],
        concerns: exp.concerns || [],
        recommended_actions: exp.recommended_actions || [],
      };
    });

    const report = {
      generated_at: new Date().toISOString(),
      total_users_analyzed: profiles.length,
      overall_platform_sentiment: aiReport.overall_platform_sentiment,
      user_experiences: enrichedExperiences,
      platform_insights: aiReport.platform_insights || [],
      priority_actions: aiReport.priority_actions || [],
    };

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error('Report generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
