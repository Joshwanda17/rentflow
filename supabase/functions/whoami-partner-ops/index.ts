import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const uc = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: { user } } = await uc.auth.getUser();
  const uid = user?.id ?? null;
  const { data: viaUser, error: e1 } = await uc.rpc("is_partner_ops", { _uid: uid });
  const { data: viaAdmin } = uid ? await admin.rpc("is_partner_ops", { _uid: uid }) : { data: null };
  const { data: whoami, error: e2 } = await uc.rpc("debug_auth_uid_probe").catch?.(() => ({ data: null, error: null })) ?? { data: null, error: null };
  const { data: roles } = uid ? await admin.from("user_roles").select("role").eq("user_id", uid) : { data: null };
  return new Response(JSON.stringify({ uid, viaUser, e1: e1?.message ?? null, viaAdmin, whoami, e2: (e2 as any)?.message ?? null, roles }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
