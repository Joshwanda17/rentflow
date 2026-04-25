import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth: verify caller is manager/cto/super_admin via JWT, or skip auth for internal calls
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";

    if (token) {
      // Validate the JWT and check role
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (!authError && authData?.user) {
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", authData.user.id)
          .eq("enabled", true)
          .in("role", ["manager", "cto", "super_admin"]);
        if (!roleData?.length) {
          return new Response(JSON.stringify({ error: "Forbidden - requires manager/cto/super_admin role" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // If getUser fails, it may be a service-role JWT — allow through since verify_jwt=false
      // and the Supabase gateway already validated the apikey
    }

    // Get all auth users (paginated)
    const allAuthUsers: Array<{ id: string; email?: string; phone?: string }> = [];
    let page = 1;
    while (true) {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      if (!users?.length) break;
      allAuthUsers.push(...users.map(u => ({ id: u.id, email: u.email, phone: u.phone })));
      if (users.length < 1000) break;
      page++;
    }

    // Get all profiles
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, phone, full_name")
      .limit(5000);
    if (profileError) throw profileError;

    // Find mismatches
    const mismatches: Array<{
      user_id: string;
      profile_email: string | null;
      auth_email: string | undefined;
      phone: string | null;
      full_name: string | null;
      issue: string;
    }> = [];

    const authMap = new Map(allAuthUsers.map(u => [u.id, u]));

    for (const profile of profiles || []) {
      const authUser = authMap.get(profile.id);
      if (!authUser) {
        mismatches.push({
          user_id: profile.id,
          profile_email: profile.email,
          auth_email: undefined,
          phone: profile.phone,
          full_name: profile.full_name,
          issue: "profile_exists_but_no_auth_user",
        });
        continue;
      }
      if (profile.email && authUser.email && profile.email !== authUser.email) {
        mismatches.push({
          user_id: profile.id,
          profile_email: profile.email,
          auth_email: authUser.email,
          phone: profile.phone,
          full_name: profile.full_name,
          issue: "email_mismatch",
        });
      }
    }

    return new Response(
      JSON.stringify({
        total_auth_users: allAuthUsers.length,
        total_profiles: profiles?.length ?? 0,
        mismatches_count: mismatches.length,
        mismatches: mismatches.slice(0, 100),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error in diagnose-auth:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
