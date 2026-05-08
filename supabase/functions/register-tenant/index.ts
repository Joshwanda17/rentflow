import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateFullName, FULL_NAME_ERROR } from "../_shared/validateFullName.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function validatePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length < 7 || cleaned.length > 20) return null;
  if (!/^[0-9+\-\s()]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
  return cleaned;
}

function validateNationalId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length < 10 || cleaned.length > 14) return null;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
}

function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  if (cleaned.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[register-tenant] Function invoked");

  // Tracks resources we created so we can roll them back if a later step fails.
  const rollback = {
    authUserId: null as string | null,
    landlordId: null as string | null,
    lc1Id: null as string | null, // only set when WE created it (not reused)
    rentRequestId: null as string | null,
  };

  let supabaseAdmin: ReturnType<typeof createClient> | null = null;

  async function performRollback(reason: string) {
    console.error(`[register-tenant] Rolling back due to: ${reason}`);
    if (!supabaseAdmin) return;
    try {
      if (rollback.rentRequestId) {
        await supabaseAdmin.from("rent_requests").delete().eq("id", rollback.rentRequestId);
      }
      if (rollback.landlordId) {
        await supabaseAdmin.from("landlords").delete().eq("id", rollback.landlordId);
      }
      if (rollback.lc1Id) {
        await supabaseAdmin.from("lc1_chairpersons").delete().eq("id", rollback.lc1Id);
      }
      if (rollback.authUserId) {
        // Profile/role rows cascade or will be ignored if they reference a missing user;
        // we explicitly clean profile to avoid orphan FK rows.
        await supabaseAdmin.from("profiles").delete().eq("id", rollback.authUserId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", rollback.authUserId);
        await supabaseAdmin.auth.admin.deleteUser(rollback.authUserId);
      }
    } catch (cleanupErr) {
      console.error("[register-tenant] Rollback partially failed:", cleanupErr);
    }
  }

  try {
    supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[register-tenant] No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: callingUser }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !callingUser) {
      console.log("[register-tenant] Auth failed:", authErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { full_name: rawName, phone: rawPhone, email: rawEmail, national_id: rawNationalId } = body as Record<string, unknown>;
    const landlordPayload = (body as any)?.landlord ?? null;
    const lc1Payload = (body as any)?.lc1 ?? null;
    const rentRequestPayload = (body as any)?.rent_request ?? null;
    console.log("[register-tenant] Input:", { rawName, rawPhone, rawNationalId, hasLandlord: !!landlordPayload });

    const nameCheck = validateFullName(rawName);
    const full_name = nameCheck.valid ? nameCheck.trimmed : null;
    const phone = validatePhone(rawPhone);
    const national_id = validateNationalId(rawNationalId);

    if (!full_name) {
      return new Response(JSON.stringify({ error: nameCheck.error || FULL_NAME_ERROR }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone) {
      return new Response(JSON.stringify({ error: "Invalid phone number format." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!national_id) {
      return new Response(JSON.stringify({ error: "National ID is required. Must be 10-14 alphanumeric characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.trim();
    const digits = cleanPhone.replace(/[^0-9]/g, '');
    const last9 = digits.slice(-9);
    const virtualEmail = (rawEmail ? validateEmail(rawEmail) : null) || `${digits}@noapp.welile.user`;

    // Check if a profile with this phone already exists before National ID conflict handling.
    // Agents often renew Rent Plans for existing tenants; that must reuse the tenant,
    // not fail as a duplicate National ID.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, national_id")
      .eq("phone", cleanPhone)
      .maybeSingle();

    // Also check by normalized last 9 digits
    const { data: existingByLast9 } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, national_id")
      .ilike("phone", `%${last9}`);

    const existingByPhone = existing ?? existingByLast9?.[0] ?? null;

    // Check for duplicate National ID. Reuse it only when it is the same phone/account.
    const { data: existingNationalId } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .eq("national_id", national_id)
      .maybeSingle();

    if (existingNationalId && (!existingByPhone || existingNationalId.id !== existingByPhone.id)) {
      const nationalDigits = String(existingNationalId.phone ?? '').replace(/\D/g, '');
      if (nationalDigits.slice(-9) !== last9) {
        console.log("[register-tenant] Duplicate national_id found:", existingNationalId.id);
        return new Response(JSON.stringify({ error: `A tenant with this National ID already exists (${existingNationalId.full_name})` }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (existingByPhone) {
      console.log("[register-tenant] Found existing profile by phone:", existingByPhone.id);
      if (!existingByPhone.national_id || existingByPhone.national_id === national_id) {
        await supabaseAdmin.from("profiles").update({ national_id, referrer_id: callingUser.id }).eq("id", existingByPhone.id);
      }
      return new Response(JSON.stringify({ user_id: existingByPhone.id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if auth user with this email already exists
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuth = existingAuthUsers?.users?.find(u => u.email === virtualEmail);
    if (existingAuth) {
      console.log("[register-tenant] Auth user exists with email, reusing:", existingAuth.id);
      // Ensure profile exists
      await supabaseAdmin.from("profiles").upsert({
        id: existingAuth.id,
        full_name,
        phone: cleanPhone,
        email: virtualEmail,
      }, { onConflict: "id" });
      return new Response(JSON.stringify({ user_id: existingAuth.id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with a temp password
    const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";

    console.log("[register-tenant] Creating auth user with email:", virtualEmail);
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: virtualEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, phone: cleanPhone },
    });

    if (createErr) {
      console.error("[register-tenant] Auth create error:", createErr.message);
      return new Response(JSON.stringify({ error: `Failed to create tenant account: ${createErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;
    rollback.authUserId = userId;
    console.log("[register-tenant] Created auth user:", userId);

    // Update profile (trigger should have created it).
    // Also stamp referrer_id so the agent who registered this tenant can see them
    // under "My Tenants" (which filters by profiles.referrer_id).
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name, phone: cleanPhone, national_id, referrer_id: callingUser.id })
      .eq("id", userId);
    
    if (profileErr) {
      console.error("[register-tenant] Profile update error:", profileErr.message);
      await performRollback(`profile update: ${profileErr.message}`);
      return new Response(JSON.stringify({ error: `Failed to write tenant profile: ${profileErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign tenant role
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "tenant", enabled: true }, { onConflict: "user_id,role" });
    
    if (roleErr) {
      console.error("[register-tenant] Role upsert error:", roleErr.message);
      await performRollback(`role assign: ${roleErr.message}`);
      return new Response(JSON.stringify({ error: `Failed to assign tenant role: ${roleErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create referral link between agent and tenant
    await supabaseAdmin
      .from("referrals")
      .upsert({ referrer_id: callingUser.id, referred_id: userId }, { onConflict: "referrer_id,referred_id" })
      .then(({ error }) => {
        if (error) console.log("[register-tenant] Referral upsert (non-critical):", error.message);
      });

    // ---------- Atomic landlord + LC1 + rent_request provisioning ----------
    let createdRentRequestId: string | null = null;

    if (landlordPayload && typeof landlordPayload === 'object') {
      const monthlyRentNum = Number(landlordPayload.monthly_rent);
      if (!Number.isFinite(monthlyRentNum) || monthlyRentNum <= 0) {
        await performRollback('invalid landlord.monthly_rent');
        return new Response(JSON.stringify({ error: 'Invalid monthly rent amount' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: landlordRow, error: landlordErr } = await supabaseAdmin
        .from('landlords')
        .insert({
          tenant_id: userId,
          name: String(landlordPayload.name ?? '').trim(),
          phone: String(landlordPayload.phone ?? '').trim(),
          property_address: String(landlordPayload.property_address ?? '').trim(),
          monthly_rent: monthlyRentNum,
          mobile_money_number: landlordPayload.mobile_money_number ?? null,
          latitude: landlordPayload.latitude ?? null,
          longitude: landlordPayload.longitude ?? null,
          location_captured_at: landlordPayload.latitude ? new Date().toISOString() : null,
          location_captured_by: callingUser.id,
          registered_by: callingUser.id,
        })
        .select('id')
        .single();

      if (landlordErr || !landlordRow) {
        await performRollback(`landlord insert: ${landlordErr?.message}`);
        const msg = landlordErr?.code === '23505'
          ? 'This tenant already has this landlord registered'
          : `Failed to save landlord: ${landlordErr?.message ?? 'unknown'}`;
        return new Response(JSON.stringify({ error: msg }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rollback.landlordId = landlordRow.id;

      // LC1 (optional): reuse existing village row, otherwise create.
      let lc1Id: string | null = null;
      if (lc1Payload && lc1Payload.name && lc1Payload.phone && lc1Payload.village) {
        const village = String(lc1Payload.village).trim();
        const { data: existingLc1 } = await supabaseAdmin
          .from('lc1_chairpersons')
          .select('id')
          .eq('village', village)
          .maybeSingle();
        if (existingLc1) {
          lc1Id = existingLc1.id;
        } else {
          const { data: newLc1, error: lc1Err } = await supabaseAdmin
            .from('lc1_chairpersons')
            .insert({
              name: String(lc1Payload.name).trim(),
              phone: String(lc1Payload.phone).trim(),
              village,
            })
            .select('id')
            .single();
          if (lc1Err || !newLc1) {
            await performRollback(`lc1 insert: ${lc1Err?.message}`);
            return new Response(JSON.stringify({ error: `Failed to save LC1: ${lc1Err?.message ?? 'unknown'}` }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          lc1Id = newLc1.id;
          rollback.lc1Id = newLc1.id;
        }
      }

      // Rent request (the agent earns commission on every payment).
      const rr = rentRequestPayload && typeof rentRequestPayload === 'object' ? rentRequestPayload : {};
      const { data: rentRow, error: rentErr } = await supabaseAdmin
        .from('rent_requests')
        .insert({
          tenant_id: userId,
          agent_id: callingUser.id,
          landlord_id: landlordRow.id,
          lc1_id: lc1Id,
          rent_amount: Number(rr.rent_amount ?? monthlyRentNum),
          duration_days: Number(rr.duration_days ?? 30),
          access_fee: 0,
          request_fee: 0,
          total_repayment: 0,
          daily_repayment: 0,
          status: 'pending',
          house_category: rr.house_category ?? 'single-room',
          request_latitude: rr.request_latitude ?? landlordPayload.latitude ?? null,
          request_longitude: rr.request_longitude ?? landlordPayload.longitude ?? null,
        } as any)
        .select('id')
        .single();

      if (rentErr || !rentRow) {
        await performRollback(`rent_request insert: ${rentErr?.message}`);
        return new Response(JSON.stringify({ error: `Failed to create rent request: ${rentErr?.message ?? 'unknown'}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      createdRentRequestId = rentRow.id;
      rollback.rentRequestId = rentRow.id;

      // Activate rent discount on the tenant profile.
      await supabaseAdmin
        .from('profiles')
        .update({ rent_discount_active: true, monthly_rent: monthlyRentNum })
        .eq('id', userId);
    }

    // Create activation invite so the tenant can claim their account later
    const activationToken = crypto.randomUUID();
    const { error: inviteErr } = await supabaseAdmin
      .from("supporter_invites")
      .insert({
        full_name,
        phone: cleanPhone,
        email: virtualEmail,
        temp_password: tempPassword,
        activation_token: activationToken,
        created_by: callingUser.id,
        role: "tenant",
        status: "pending",
      });

    if (inviteErr) {
      console.error("[register-tenant] Invite insert error:", inviteErr.message);
      // Non-critical: tenant was created, invite is just for claiming
    }

    console.log(`[register-tenant] Successfully created tenant ${userId}`);


    // Notify managers (fire-and-forget)
    const fnUrl = Deno.env.get("SUPABASE_URL");
    const fnKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    fetch(`${fnUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${fnKey}` },
      body: JSON.stringify({ title: "👤 Tenant Registered", body: "Activity: new tenant", url: "/dashboard/manager" }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      user_id: userId,
      existing: false,
      activation_token: activationToken,
      temp_password: tempPassword,
      rent_request_id: createdRentRequestId,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[register-tenant] Unhandled error:", error?.message || error);
    await performRollback(`unhandled: ${error?.message ?? 'unknown'}`);
    return new Response(JSON.stringify({ error: `Service error: ${error?.message || 'Unknown'}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
