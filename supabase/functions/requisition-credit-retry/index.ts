import { createClient } from "npm:@supabase/supabase-js@2";
import { creditRequisitionWallet } from "../_shared/requisitionWalletCredit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = new Set(["cfo", "super_admin", "manager", "ceo"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const actor = userData.user;

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", actor.id).eq("enabled", true);
    if (!(roles || []).some((r: { role: string }) => ALLOWED_ROLES.has(r.role))) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const sourceTable = String(body.source_table || "");
    const requisitionId = String(body.requisition_id || "");
    if (!["director_requisitions", "employee_requisitions"].includes(sourceTable) || !requisitionId) {
      return json({ error: "bad_request" }, 400);
    }

    const { data: row } = await admin.from(sourceTable).select("*").eq("id", requisitionId).maybeSingle();
    if (!row) return json({ error: "Requisition not found" }, 404);

    let userId = row.requester_id as string | undefined;
    if (sourceTable === "employee_requisitions") {
      const { data: profile } = await admin.from("profiles").select("id").ilike("email", row.employee_email).maybeSingle();
      userId = profile?.id;
    }

    const result = await creditRequisitionWallet({
      admin,
      sourceTable: sourceTable as "director_requisitions" | "employee_requisitions",
      requisitionId,
      requisitionCode: row.requisition_code || requisitionId.slice(0, 8).toUpperCase(),
      userId: userId || "",
      approverId: actor.id,
      amount: Number(row.amount),
      currency: row.currency || "UGX",
      purpose: row.title || row.purpose || "Requisition",
      category: row.category || null,
      status: row.status === "paid" ? "approved" : row.status,
      approvedAt: row.approved_at || row.decided_at,
      ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      deviceInfo: req.headers.get("user-agent"),
    });

    return json(result, result.ok ? 200 : 400);
  } catch (e) {
    console.error("requisition-credit-retry error", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
