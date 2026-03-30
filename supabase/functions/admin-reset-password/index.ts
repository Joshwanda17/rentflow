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

    // 1. Verify caller is authenticated (supports service-role key or user JWT)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";
    const isServiceRole = token === supabaseServiceKey;

    let callerId = "service-role";
    if (!isServiceRole) {
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      const user = authData?.user;

      if (authError || !user) {
        console.error("Auth validation failed:", authError?.message ?? "No user found");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      callerId = user.id;
    }

    // 2. Verify caller is a manager (skip for service-role)

    if (!isServiceRole) {
      const { data: roleData, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("role", "manager")
        .eq("enabled", true)
        .maybeSingle();

      if (roleError || !roleData) {
        return new Response(JSON.stringify({ error: "Only managers can reset passwords" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3. Validate input
    const { user_id, new_password } = await req.json();

    if (!user_id || !new_password) {
      throw new Error("user_id and new_password are required");
    }

    // Validate user_id is a valid UUID
    if (typeof user_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)) {
      throw new Error("Invalid user ID format");
    }

    if (typeof new_password !== "string" || new_password.length < 6 || new_password.length > 128) {
      throw new Error("Password must be 6-128 characters");
    }

    // 4. Reset the password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (error) {
      throw error;
    }

    console.log(`Password reset by ${callerId} for user: ${user_id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Password reset successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error resetting password:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
