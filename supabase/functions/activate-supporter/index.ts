import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// bcrypt removed - using plaintext password comparison

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiting configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour for activation tokens

// In-memory rate limiting
const activationAttempts = new Map<string, { attempts: number; lastAttempt: number; lockedUntil?: number }>();

function checkRateLimit(token: string): { allowed: boolean; lockedUntil?: number } {
  const now = Date.now();
  const record = activationAttempts.get(token);
  
  if (!record) return { allowed: true };
  
  if (record.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, lockedUntil: record.lockedUntil };
  }
  
  if (record.lockedUntil && now >= record.lockedUntil) {
    activationAttempts.delete(token);
    return { allowed: true };
  }
  
  if (now - record.lastAttempt > LOCKOUT_DURATION_MS) {
    activationAttempts.delete(token);
    return { allowed: true };
  }
  
  return { allowed: record.attempts < MAX_ATTEMPTS };
}

function recordFailedAttempt(token: string): void {
  const now = Date.now();
  const record = activationAttempts.get(token) || { attempts: 0, lastAttempt: now };
  
  record.attempts++;
  record.lastAttempt = now;
  
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  
  activationAttempts.set(token, record);
}

// Input validation
function validateToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const cleaned = token.trim();
  // UUID or similar token format
  if (cleaned.length < 10 || cleaned.length > 100) return null;
  // Only allow alphanumeric and hyphens
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
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token: rawToken, password: rawPassword } = body as Record<string, unknown>;

    // Validate inputs
    const token = validateToken(rawToken);
    const password = validatePassword(rawPassword);

    if (!token || !password) {
      return new Response(JSON.stringify({ error: "Invalid activation link or password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check rate limiting
    const rateCheck = checkRateLimit(token);
    if (!rateCheck.allowed) {
      const remainingMinutes = Math.ceil((rateCheck.lockedUntil! - Date.now()) / 60000);
      console.log(`[activate-supporter] Rate limited token: ${token.substring(0, 8)}...`);
      return new Response(JSON.stringify({ 
        error: `Too many failed attempts. Try again in ${remainingMinutes} minutes.` 
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the invite (pending first)
    const { data: invite, error: inviteError } = await adminClient
      .from("supporter_invites")
      .select("*")
      .eq("activation_token", token)
      .eq("status", "pending")
      .single();

    // If it's not pending, allow idempotent activation (link should keep working)
    if (inviteError || !invite) {
      const { data: activatedInvite } = await adminClient
        .from("supporter_invites")
        .select("id, email, role, status")
        .eq("activation_token", token)
        .eq("status", "activated")
        .single();

      if (activatedInvite) {
        return new Response(
          JSON.stringify({
            success: true,
            alreadyActivated: true,
            message: "Account already activated. You can log in.",
            email: activatedInvite.email,
            role: activatedInvite.role || 'supporter',
            isSubAgent: false,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      recordFailedAttempt(token);
      console.log(`[activate-supporter] Invalid token attempt: ${token.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Invalid or expired activation link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check token expiration (48 hours from creation)
    const createdAt = new Date(invite.created_at).getTime();
    const expiresAt = createdAt + (48 * 60 * 60 * 1000);
    if (Date.now() > expiresAt) {
      console.log(`[activate-supporter] Expired token: ${token.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Activation link has expired. Please request a new invite." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify password - plaintext comparison
    let passwordValid = false;
    
    if (invite.temp_password) {
      passwordValid = password === String(invite.temp_password).trim();
    }
    
    console.log(`[activate-supporter] Password check for invite ${invite.id}: provided="${password}", stored="${invite.temp_password}", valid=${passwordValid}`);

    if (!passwordValid) {
      recordFailedAttempt(token);
      console.log(`[activate-supporter] Invalid password for invite: ${invite.id}`);
      return new Response(JSON.stringify({ error: "Invalid activation credentials" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Create the user account
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: invite.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: invite.full_name,
        phone: invite.phone,
        role: userRole,
        referrer_id: invite.created_by,
      },
    });

    if (authError) {
      console.error("[activate-supporter] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Failed to create account: " + authError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add user role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role: userRole,
      });

    if (roleError) {
      console.error("[activate-supporter] Role error:", roleError);
    }

    // If this is a landlord, create a landlord record with the captured location
    if (userRole === 'landlord') {
      const { error: landlordError } = await adminClient
        .from("landlords")
        .insert({
          name: invite.full_name,
          phone: invite.phone,
          property_address: invite.property_address || 'Address not provided',
          latitude: invite.latitude || null,
          longitude: invite.longitude || null,
          location_captured_at: invite.latitude ? new Date().toISOString() : null,
          location_captured_by: invite.created_by,
          registered_by: invite.created_by,
        });

      if (landlordError) {
        console.error("[activate-supporter] Landlord record creation error:", landlordError);
      } else {
        console.log(`[activate-supporter] Created landlord record for ${invite.full_name} with location: ${invite.latitude ? 'yes' : 'no'}`);
      }
    }

    // If this is a sub-agent, create the sub-agent relationship
    if (isSubAgent && parentAgentId) {
      const { error: subAgentError } = await adminClient
        .from("agent_subagents")
        .insert({
          parent_agent_id: parentAgentId,
          sub_agent_id: authData.user.id,
          source: 'invite',
        });

      if (subAgentError) {
        console.error("[activate-supporter] Sub-agent relationship error:", subAgentError);
      } else {
        console.log(`[activate-supporter] Created sub-agent relationship: ${authData.user.id} under ${parentAgentId}`);
      }
    }

    // Update invite status and clear sensitive data
    await adminClient
      .from("supporter_invites")
      .update({
        status: "activated",
        activated_at: new Date().toISOString(),
        activated_user_id: authData.user.id,
        temp_password: null, // Clear password after use
      })
      .eq("id", invite.id);

    // Create supporter referral record only for supporters
    if (userRole === 'supporter') {
      await adminClient
        .from("supporter_referrals")
        .insert({
          referrer_id: invite.created_by,
          referred_id: authData.user.id,
          bonus_amount: 500,
        });
    }

    // Determine referral bonus
    const referralBonus = 500;

    // Create general referral record for all roles
    // NOTE: Wallet crediting is handled by database triggers (credit_referral_bonus, credit_signup_referral_bonus)
    // DO NOT manually credit wallet here to avoid double/triple crediting
    await adminClient
      .from("referrals")
      .insert({
        referrer_id: invite.created_by,
        referred_id: authData.user.id,
        bonus_amount: referralBonus,
        credited: true,
        credited_at: new Date().toISOString(),
      });

    // NOTE: Agent earnings are handled by database triggers (sync_agent_wallet_on_earning)
    // triggered by credit_signup_referral_bonus which inserts into agent_earnings
    // DO NOT insert into agent_earnings here to avoid double crediting

    const roleLabels: Record<string, string> = {
      tenant: 'Tenant',
      agent: 'Agent', 
      supporter: 'Supporter',
      landlord: 'Landlord',
    };

    // Notify the creator
    await adminClient
      .from("notifications")
      .insert({
        user_id: invite.created_by,
        title: `🎉 ${isSubAgent ? 'Sub-Agent' : roleLabels[userRole]} Activated!`,
        message: isSubAgent 
          ? `${invite.full_name} has joined your team as a sub-agent!`
          : `${invite.full_name} has activated their ${userRole} account! You earned UGX ${referralBonus} referral bonus.`,
        type: "success",
        metadata: { user_id: authData.user.id, invite_id: invite.id, role: userRole, is_sub_agent: isSubAgent },
      });

    console.log(`[activate-supporter] Activated ${isSubAgent ? 'sub-agent' : userRole} account for ${invite.email}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Account activated successfully! You can now log in.",
      email: invite.email,
      role: userRole,
      isSubAgent,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[activate-supporter] Error:", errorMessage);
    return new Response(JSON.stringify({ 
      error: "Service temporarily unavailable"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
