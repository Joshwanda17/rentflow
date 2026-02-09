import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiting
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000;
const activationAttempts = new Map<string, { attempts: number; lastAttempt: number; lockedUntil?: number }>();

function checkRateLimit(token: string): { allowed: boolean; lockedUntil?: number } {
  const now = Date.now();
  const record = activationAttempts.get(token);
  if (!record) return { allowed: true };
  if (record.lockedUntil && now < record.lockedUntil) return { allowed: false, lockedUntil: record.lockedUntil };
  if (record.lockedUntil && now >= record.lockedUntil) { activationAttempts.delete(token); return { allowed: true }; }
  if (now - record.lastAttempt > LOCKOUT_DURATION_MS) { activationAttempts.delete(token); return { allowed: true }; }
  return { allowed: record.attempts < MAX_ATTEMPTS };
}

function recordFailedAttempt(token: string): void {
  const now = Date.now();
  const record = activationAttempts.get(token) || { attempts: 0, lastAttempt: now };
  record.attempts++;
  record.lastAttempt = now;
  if (record.attempts >= MAX_ATTEMPTS) record.lockedUntil = now + LOCKOUT_DURATION_MS;
  activationAttempts.set(token, record);
}

function validateToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const cleaned = token.trim();
  if (cleaned.length < 10 || cleaned.length > 100) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(cleaned)) return null;
  return cleaned;
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return null;
  const cleaned = password.trim();
  if (cleaned.length < 4 || cleaned.length > 100) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      token: rawToken, 
      password: rawPassword,
      // New fields the user provides during activation
      fullName: userFullName,
      email: userEmail,
      newPassword: userNewPassword,
    } = body as Record<string, unknown>;

    const token = validateToken(rawToken);
    const password = validatePassword(rawPassword);

    if (!token || !password) {
      return new Response(JSON.stringify({ error: "Invalid activation link or password" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(token);
    if (!rateCheck.allowed) {
      const remainingMinutes = Math.ceil((rateCheck.lockedUntil! - Date.now()) / 60000);
      return new Response(JSON.stringify({ error: `Too many failed attempts. Try again in ${remainingMinutes} minutes.` }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the invite
    const { data: invite, error: inviteError } = await adminClient
      .from("supporter_invites")
      .select("*")
      .eq("activation_token", token)
      .eq("status", "pending")
      .single();

    if (inviteError || !invite) {
      // Check if already activated
      const { data: activatedInvite } = await adminClient
        .from("supporter_invites")
        .select("id, email, role, status")
        .eq("activation_token", token)
        .eq("status", "activated")
        .single();

      if (activatedInvite) {
        return new Response(JSON.stringify({
          success: true, alreadyActivated: true,
          message: "Account already activated. You can log in.",
          email: activatedInvite.email, role: activatedInvite.role || 'supporter', isSubAgent: false,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      recordFailedAttempt(token);
      return new Response(JSON.stringify({ error: "Invalid or expired activation link" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiration (48h)
    const createdAt = new Date(invite.created_at).getTime();
    if (Date.now() > createdAt + (48 * 60 * 60 * 1000)) {
      return new Response(JSON.stringify({ error: "Activation link has expired. Please request a new invite." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify temp password
    const passwordValid = invite.temp_password && password === String(invite.temp_password).trim();
    if (!passwordValid) {
      recordFailedAttempt(token);
      return new Response(JSON.stringify({ error: "Invalid activation credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use user-provided details if available, fall back to invite data
    const finalFullName = (typeof userFullName === 'string' && userFullName.trim()) 
      ? userFullName.trim() 
      : invite.full_name;
    
    // Use user-provided email if available, otherwise use invite email
    let finalEmail = invite.email;
    if (typeof userEmail === 'string' && userEmail.trim() && userEmail.includes('@') && !userEmail.endsWith('@welile.user')) {
      finalEmail = userEmail.trim().toLowerCase();
    }

    // Use user's new password if provided, otherwise use the temp password
    const finalPassword = (typeof userNewPassword === 'string' && userNewPassword.trim().length >= 6) 
      ? userNewPassword.trim() 
      : password;

    const userRole = invite.role || 'supporter';

    // Check if the creator is an agent (for sub-agent creation)
    let isSubAgent = false;
    let parentAgentId: string | null = null;
    
    if (userRole === 'agent') {
      const { data: creatorRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", invite.created_by)
        .eq("role", "agent")
        .single();
      
      if (creatorRoles) {
        isSubAgent = true;
        parentAgentId = invite.created_by;
      }
    }

    // Create the user account with final details
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: finalEmail,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        full_name: finalFullName,
        phone: invite.phone,
        role: userRole,
        referrer_id: invite.created_by,
      },
    });

    if (authError) {
      console.error("[activate-supporter] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Failed to create account: " + authError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add user role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: authData.user.id, role: userRole });
    if (roleError) console.error("[activate-supporter] Role error:", roleError);

    // If landlord, create landlord record
    if (userRole === 'landlord') {
      const { error: landlordError } = await adminClient
        .from("landlords")
        .insert({
          name: finalFullName,
          phone: invite.phone,
          property_address: invite.property_address || 'Address not provided',
          latitude: invite.latitude || null,
          longitude: invite.longitude || null,
          location_captured_at: invite.latitude ? new Date().toISOString() : null,
          location_captured_by: invite.created_by,
          registered_by: invite.created_by,
        });
      if (landlordError) console.error("[activate-supporter] Landlord error:", landlordError);
    }

    // If sub-agent, create relationship
    if (isSubAgent && parentAgentId) {
      const { error: subAgentError } = await adminClient
        .from("agent_subagents")
        .insert({ parent_agent_id: parentAgentId, sub_agent_id: authData.user.id, source: 'invite' });
      if (subAgentError) console.error("[activate-supporter] Sub-agent error:", subAgentError);
    }

    // Update invite - store the final email used
    await adminClient
      .from("supporter_invites")
      .update({
        status: "activated",
        activated_at: new Date().toISOString(),
        activated_user_id: authData.user.id,
        temp_password: null,
        full_name: finalFullName,
        email: finalEmail,
      })
      .eq("id", invite.id);

    // Supporter referral
    if (userRole === 'supporter') {
      await adminClient.from("supporter_referrals").insert({
        referrer_id: invite.created_by, referred_id: authData.user.id, bonus_amount: 500,
      });
    }

    // General referral
    await adminClient.from("referrals").insert({
      referrer_id: invite.created_by, referred_id: authData.user.id,
      bonus_amount: 500, credited: true, credited_at: new Date().toISOString(),
    });

    const roleLabels: Record<string, string> = {
      tenant: 'Tenant', agent: 'Agent', supporter: 'Supporter', landlord: 'Landlord',
    };

    // Notify creator
    await adminClient.from("notifications").insert({
      user_id: invite.created_by,
      title: `🎉 ${isSubAgent ? 'Sub-Agent' : roleLabels[userRole]} Activated!`,
      message: isSubAgent 
        ? `${finalFullName} has joined your team as a sub-agent!`
        : `${finalFullName} has activated their ${userRole} account! You earned UGX 500 referral bonus.`,
      type: "success",
      metadata: { user_id: authData.user.id, invite_id: invite.id, role: userRole, is_sub_agent: isSubAgent },
    });

    console.log(`[activate-supporter] Activated ${isSubAgent ? 'sub-agent' : userRole} account for ${finalEmail}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Account activated successfully!",
      email: finalEmail,
      role: userRole,
      isSubAgent,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[activate-supporter] Error:", errorMessage);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
