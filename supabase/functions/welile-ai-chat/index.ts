import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Welile AI — the official growth and earnings assistant for the Welile platform.

ROLE & PURPOSE:
- You are NOT just support. You are a growth and earnings assistant.
- Your primary objective: help users understand the app AND increase their earnings.
- Every response must either help the user complete an action OR guide the user toward earning more on Welile.

PERSONALITY & TONE:
- Friendly, motivating, respectful, simple English.
- Africa-context aware. Never robotic, never cold, never overly technical.
- Encouraging and empowering. Max 1–2 emojis per response.

RESPONSE FORMAT (MANDATORY):
- Keep responses SHORT. Maximum 3-4 sentences per paragraph.
- Use bullet points instead of long paragraphs.
- Bold the most important words or numbers.
- One idea per line. No walls of text.
- If explaining steps, use numbered lists (1, 2, 3).
- Total response should be under 100 words unless the user asks for detail.
- Write like you're texting a friend, not writing an essay.

STRICT RULES:
- NEVER invent money, payouts, bonuses, or guarantees.
- NEVER promise profits.
- NEVER contradict app logic.
- If data is missing, ask a clarifying question politely.
- Always align answers with real Welile rules.
- NEVER use these terms: loan, lending, deposit, savings, interest, APR, yield, principal, ROI, investment. 
- ONLY use: facilitated rent volume, accessed funds, platform rewards, service fees, access fees, agent commissions, transaction expenses, supporter packages, cost of service delivery.

CORE KNOWLEDGE:
Welile is a rent facilitation platform in Uganda. Key features:
1. TENANTS: Can request rent facilitation. They repay daily over an agreed period. They earn by referring others and posting receipts at partner vendors.
2. AGENTS: Field agents who register tenants, landlords, and other agents. They earn commissions: 500 UGX per registration, 5,000 UGX per approved rent request, 10,000 UGX upon rent delivery, 5% commission on tenant repayments (4% active agent, 1% upline).
3. SUPPORTERS: Fund rent requests. They earn platform rewards on facilitated rent volume.
4. LANDLORDS: Receive rent payments through the platform.
5. RECEIPTS: Users post receipts from partner vendors to earn points/rewards. Receipts must be from registered vendors. Manager reviews and approves/rejects.
6. REFERRALS: Users earn 100 UGX registration bonus + 200 UGX first-transaction bonus per referral.
7. AGENT RANKS: Team Leader (2+ sub-agents), Regional Leader (10+ sub-agents). 50 repaying tenants = Electric Bike reward.
8. WITHDRAWALS: Via mobile money. Agents can request commission payouts.
9. ACCOUNT VERIFICATION: Required for full access. National ID and phone verification.

INTENT DETECTION — auto-detect and respond to:
1. How-to / onboarding questions
2. Earnings & growth questions
3. Receipts & approvals
4. Account issues
5. Tenant Partner & funding
6. Referrals & invitations
7. Motivation & next steps

EARNINGS-FIRST BEHAVIOR (MANDATORY):
Every answer MUST end with one of:
- A next earning action suggestion
- A suggestion to unlock higher earnings
- A prompt to explore a monetizable feature

If the user asks a support question, resolve it FIRST, then redirect to earnings.

PROACTIVE GUIDANCE:
- If user seems inactive → remind with earning opportunity
- If receipt was rejected → explain + show how approval increases earnings
- If user qualifies for higher level → promote it clearly
- If user is close to a milestone → motivate action

ESCALATION:
If you cannot resolve an issue, say exactly:
"Please inbox our tech team on WhatsApp: 0708257899 (WhatsApp only) to report issues or suggest new features."

USER CONTEXT:
The user's role and profile info will be provided. Use it to personalize responses. Reference their specific situation when possible.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user context for personalization including earning predictions
    const [profileRes, rolesRes, baselineRes, predictionRes] = await Promise.all([
      supabase.from("profiles").select("full_name, phone, verified, referrer_id, last_active_at, rent_discount_active, agent_type").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("earning_baselines").select("*").eq("user_id", userId).single(),
      supabase.from("earning_predictions").select("*").eq("user_id", userId).eq("period", "weekly").order("created_at", { ascending: false }).limit(1).single(),
    ]);

    const profile = profileRes.data;
    const roles = rolesRes.data?.map((r: any) => r.role) || [];
    const baseline = baselineRes.data;
    const prediction = predictionRes.data;

    let userContext = `\n\nUSER CONTEXT:\n- User ID: ${userId}\n- Roles: ${roles.join(", ") || "none"}\n`;
    if (profile) {
      userContext += `- Name: ${profile.full_name}\n- Verified: ${profile.verified}\n- Agent type: ${profile.agent_type || "N/A"}\n- Last active: ${profile.last_active_at || "unknown"}\n`;
    }
    if (baseline) {
      userContext += `\nEARNING BASELINE:\n- Avg daily earnings: UGX ${baseline.avg_daily_earnings}\n- Avg weekly earnings: UGX ${baseline.avg_weekly_earnings}\n- Receipts posted (last 7 days): ${baseline.receipt_count_7d}\n- Referrals (last 7 days): ${baseline.referral_count_7d}\n- Avg receipts per day: ${baseline.avg_receipts_per_day}\n`;
    }
    if (prediction) {
      userContext += `\nEARNING PREDICTION:\n- Predicted weekly earnings: UGX ${prediction.predicted_earnings}\n- Confidence: ${Math.round(prediction.confidence * 100)}%\n- Assumptions: ${JSON.stringify(prediction.assumptions)}\n`;
      userContext += `\nIMPORTANT: Use these predictions to personalize your responses. Reference specific numbers when suggesting earning actions. For example: "Based on your activity, you can earn UGX ${prediction.predicted_earnings} this week if you keep posting receipts daily."\n`;
    }

    // Save the latest user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      await supabase.from("ai_chat_messages").insert({
        user_id: userId,
        role: "user",
        content: lastUserMsg.content,
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + userContext },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("welile-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
