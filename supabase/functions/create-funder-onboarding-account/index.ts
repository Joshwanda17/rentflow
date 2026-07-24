// Create a funder-onboarding account without sending the generic auth
// confirmation email. This flow is vetted through /partner-onboarding and the
// only user-facing email should be the partnership agreement email generated
// after the client signs in and stores the agreement details.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanText = (value: string) => value.replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(160).transform(cleanText),
  phone: z.string().min(7).max(32).transform(cleanText),
  referrerId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().regex(UUID_RE).optional(),
  ),
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { email, password, fullName, phone, referrerId } = parsed.data;
    const metadata: Record<string, unknown> = {
      full_name: fullName,
      phone,
      role: "supporter",
      signup_source: "funder-onboarding",
    };
    if (referrerId) metadata.referrer_id = referrerId.toLowerCase();

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      const message = error.message || "Could not create account";
      if (/already|registered|exists/i.test(message)) {
        return json({ error: "This email is already registered. Please sign in or use another email." }, 409);
      }
      console.error("[create-funder-onboarding-account] create failed:", JSON.stringify({
        message,
        status: (error as any).status,
        code: (error as any).code,
        name: (error as any).name,
      }));
      return json({ error: message || "Could not create funder account", code: (error as any).code }, 400);
    }

    const userId = data.user?.id;
    if (!userId) return json({ error: "Account was not created" }, 500);

    return json({ ok: true, userId, user: { id: userId, email } });
  } catch (e) {
    console.error("[create-funder-onboarding-account] error:", (e as Error)?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});