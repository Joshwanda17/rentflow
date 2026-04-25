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
    // Registration is active
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

    // Check expiration (30 days)
    const createdAt = new Date(invite.created_at).getTime();
    if (Date.now() > createdAt + (30 * 24 * 60 * 60 * 1000)) {
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

    // Use user-provided details if available, fall back to invite data (with validation)
    let finalFullName = invite.full_name;
    if (typeof userFullName === 'string') {
      const cleaned = userFullName.trim();
      if (cleaned.length >= 2 && cleaned.length <= 100 && /^[\p{L}\p{M}\s'.-]+$/u.test(cleaned)) {
        finalFullName = cleaned;
      }
    }
    
    // Use user-provided email if available, otherwise use invite email (with validation)
    let finalEmail = invite.email;
    if (typeof userEmail === 'string') {
      const cleaned = userEmail.trim().toLowerCase();
      if (cleaned.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) && !cleaned.endsWith('@welile.user')) {
        finalEmail = cleaned;
      }
    }

    // Use user's new password if provided, otherwise use the temp password
    const finalPassword = (typeof userNewPassword === 'string' && userNewPassword.trim().length >= 6 && userNewPassword.trim().length <= 128) 
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
    let userId: string;
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
      // If email already exists, look up the existing user and proceed
      if (authError.message?.includes('already been registered') || (authError as any).code === 'email_exists') {
        console.log("[activate-supporter] Email exists, looking up existing user for:", finalEmail);
        const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) {
          console.error("[activate-supporter] Failed to list users:", listError);
          return new Response(JSON.stringify({ error: "Failed to find existing account" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const existingUser = listData.users.find((u: any) => u.email === finalEmail);
        if (!existingUser) {
          return new Response(JSON.stringify({ error: "Email registered but user not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = existingUser.id;
        // Update their password and metadata
        await adminClient.auth.admin.updateUserById(userId, {
          password: finalPassword,
          email_confirm: true,
          user_metadata: {
            full_name: finalFullName,
            phone: invite.phone,
            role: userRole,
            referrer_id: invite.created_by,
          },
        });
        console.log("[activate-supporter] Linked to existing auth user:", userId);
      } else {
        console.error("[activate-supporter] Auth error:", authError);
        return new Response(JSON.stringify({ error: "Failed to create account: " + authError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      userId = authData.user.id;
    }

    // Ensure profile exists (trigger may not fire if auth user already existed)
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: userId,
        full_name: finalFullName,
        phone: invite.phone,
        email: finalEmail,
        verified: true,
      }, { onConflict: 'id' });
    if (profileError) {
      console.error("[activate-supporter] Profile upsert error:", profileError);
    } else {
      console.log("[activate-supporter] Profile ensured for user:", userId);

      if (invite.created_by) {
        const { error: referrerLinkError } = await adminClient
          .from("profiles")
          .update({ referrer_id: invite.created_by })
          .eq("id", userId);

        if (referrerLinkError) {
          console.error("[activate-supporter] Referrer link error:", referrerLinkError);
        }
      }
    }

    // Ensure wallet exists
    const { error: walletError } = await adminClient
      .from("wallets")
      .upsert({ user_id: userId, balance: 0 }, { onConflict: 'user_id' });
    if (walletError) console.error("[activate-supporter] Wallet upsert error:", walletError);

    // Grant ALL 4 public roles so link-onboarded users can access every public dashboard.
    // The intended role from the invite is preserved in user_metadata for landing-page routing.
    const PUBLIC_ROLES = ['tenant', 'agent', 'landlord', 'supporter'] as const;
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert(
        PUBLIC_ROLES.map(role => ({ user_id: userId, role, enabled: true })),
        { onConflict: 'user_id,role' }
      );
    if (roleError) {
      console.error("[activate-supporter] Multi-role upsert error:", roleError);
    } else {
      console.log("[activate-supporter] Granted all 4 public roles to:", userId);
    }
    // Record intended role for default-dashboard routing
    await adminClient.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: finalFullName,
        phone: invite.phone,
        role: userRole,
        intended_role: userRole,
        referrer_id: invite.created_by,
      },
    });

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
        .insert({ parent_agent_id: parentAgentId, sub_agent_id: userId, source: 'invite' });
      if (subAgentError) console.error("[activate-supporter] Sub-agent error:", subAgentError);

      // Sub-agent registration bonus (UGX 10,000) is now awarded automatically
      // by the trg_award_subagent_commission trigger on agent_subagents insert.
      // No manual RPC call needed here.
    }

    // Update invite - store the final email used
    await adminClient
      .from("supporter_invites")
      .update({
        status: "activated",
        activated_at: new Date().toISOString(),
        activated_user_id: userId,
        temp_password: null,
        full_name: finalFullName,
        email: finalEmail,
      })
      .eq("id", invite.id);

    // Link investor portfolios created for this invite to the new user
    if (invite.id) {
      // Get portfolios before updating to capture their IDs
      const { data: linkedPortfolios } = await adminClient
        .from("investor_portfolios")
        .select("id, investment_amount, portfolio_code")
        .eq("invite_id", invite.id)
        .is("investor_id", null);

      const { error: portfolioLinkError } = await adminClient
        .from("investor_portfolios")
        .update({ investor_id: userId })
        .eq("invite_id", invite.id)
        .is("investor_id", null);
      if (portfolioLinkError) {
        console.error("[activate-supporter] Portfolio link error:", portfolioLinkError);
      } else {
        console.log("[activate-supporter] Linked portfolios for invite:", invite.id);
        
        // Link pending_wallet_operations to the new user_id so credits go through approval
        // DO NOT credit wallet directly — all supporter credits must be approved by manager/COO
        if (linkedPortfolios && linkedPortfolios.length > 0) {
          // Update any pending_wallet_operations that were created with null user_id for this invite
          const portfolioIds = linkedPortfolios.map(p => p.id);
          const { error: pendingLinkError } = await adminClient
            .from("pending_wallet_operations")
            .update({ user_id: userId })
            .in("source_id", portfolioIds)
            .is("user_id", null)
            .eq("status", "pending");
          if (pendingLinkError) {
            console.error("[activate-supporter] Failed to link pending ops:", pendingLinkError);
          }

          // Also check for pending ops already assigned to this user (agent pre-set partner_id)
          // No action needed — they already have the correct user_id

          for (const portfolio of linkedPortfolios) {
            console.log("[activate-supporter] Portfolio", portfolio.portfolio_code, "linked. Credit pending manager/COO approval.");
          }
        }
      }
    }

    if (invite.created_by) {
      const referralBonus = isSubAgent ? 0 : 500;

      const { error: referralError } = await adminClient
        .from("referrals")
        .upsert({
          referrer_id: invite.created_by,
          referred_id: userId,
          bonus_amount: referralBonus,
          credited: referralBonus > 0,
        }, { onConflict: 'referred_id' });

      if (referralError) {
        console.error("[activate-supporter] Referral upsert error:", referralError);
      }
    }

    if (userRole === 'supporter') {
      await adminClient.from("supporter_referrals").insert({
        referrer_id: invite.created_by, referred_id: userId, bonus_amount: 500,
      });
    }

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
      metadata: { user_id: userId, invite_id: invite.id, role: userRole, is_sub_agent: isSubAgent },
    });

    console.log(`[activate-supporter] Activated ${isSubAgent ? 'sub-agent' : userRole} account for ${finalEmail}`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "💼 Supporter Activated", body: "Activity: supporter activated", url: "/dashboard/manager" }),
    }).catch(() => {});


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
