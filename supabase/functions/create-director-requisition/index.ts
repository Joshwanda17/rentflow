import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSMS } from "../_shared/sendSmsMultiProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REVIEW_URL = "https://welileapp.com/director/dashboard";
const STAFF_ROLES = ["ceo","cfo","coo","cto","cmo","crm","hr","manager","super_admin","operations","employee"];
const DIRECTOR_PHONE = "0740834746";

function fmtUGX(n: number) {
  return `UGX ${Math.round(n).toLocaleString("en-US")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const requester = userData.user;

    // Confirm requester is staff
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", requester.id).eq("enabled", true);
    const requesterRoles = (roleRows || []).map((r: any) => r.role);
    if (!requesterRoles.some((r: string) => STAFF_ROLES.includes(r))) {
      return new Response(JSON.stringify({ error: "You are not authorized to raise requisitions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    const amount = Number(body.amount);
    const reason = String(body.reason || "").trim();

    if (!title || title.length < 3) return new Response(JSON.stringify({ error: "Title is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!Number.isFinite(amount) || amount <= 0) return new Response(JSON.stringify({ error: "A valid amount is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!reason || reason.length < 10) return new Response(JSON.stringify({ error: "Please provide a reason (min 10 characters)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: reqProfile } = await admin.from("profiles").select("full_name").eq("id", requester.id).maybeSingle();
    const requesterName = reqProfile?.full_name || requester.email || "Staff";
    const primaryRole = requesterRoles.find((r: string) => STAFF_ROLES.includes(r)) || null;

    // Insert requisition
    const { data: reqRow, error: insErr } = await admin
      .from("director_requisitions")
      .insert({
        title, amount, reason,
        requester_id: requester.id,
        requester_name: requesterName,
        requester_role: primaryRole,
      })
      .select()
      .single();
    if (insErr || !reqRow) throw new Error(insErr?.message || "Failed to create requisition");

    // Audit event
    await admin.from("director_requisition_events").insert({
      requisition_id: reqRow.id,
      actor_id: requester.id,
      actor_name: requesterName,
      action: "created",
      comment: reason,
      metadata: { amount, title },
    });
    await admin.from("audit_logs").insert({
      user_id: requester.id,
      action_type: "director_requisition_created",
      table_name: "director_requisitions",
      record_id: reqRow.id,
      reason: reason.slice(0, 200),
      metadata: { requisition_code: reqRow.requisition_code, amount, title },
    });

    // Find directors (CEO role) to notify
    const { data: directorRoleRows } = await admin.from("user_roles").select("user_id").eq("role", "ceo").eq("enabled", true);
    const directorIds = [...new Set((directorRoleRows || []).map((r: any) => r.user_id))];

    const requestedAt = new Date(reqRow.created_at).toLocaleString("en-GB", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" });
    const notified: string[] = [];

    if (directorIds.length > 0) {
      const { data: directors } = await admin.from("profiles").select("id, full_name, phone, email").in("id", directorIds);
      for (const d of directors || []) {
        // In-app notification
        await admin.from("notifications").insert({
          user_id: d.id,
          type: "director_requisition",
          title: `New requisition: ${reqRow.requisition_code}`,
          message: `${requesterName} requested ${fmtUGX(amount)} — ${title}. Tap to review.`,
          metadata: { requisition_id: reqRow.id, requisition_code: reqRow.requisition_code, review_url: REVIEW_URL, amount },
        });

        // SMS
        if (d.phone) {
          await sendSMS(
            d.phone,
            `Welile: New requisition ${reqRow.requisition_code} from ${requesterName} for ${fmtUGX(amount)} (${title}). Review: ${REVIEW_URL}`,
            { admin, source: "create-director-requisition", reference_id: reqRow.id, recipient_user_id: d.id, recipient_name: d.full_name, idempotencyKey: `req-new-${reqRow.id}-${d.id}` },
          ).catch((e) => console.error("SMS failed", e));
        }

        // Email
        if (d.email) {
          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "director-requisition-new",
              recipientEmail: d.email,
              idempotencyKey: `req-new-${reqRow.id}-${d.id}`,
              templateData: {
                director_name: d.full_name || "Director",
                requisition_code: reqRow.requisition_code,
                title, amount: fmtUGX(amount),
                requester: requesterName,
                requested_at: requestedAt,
                reason,
                review_url: REVIEW_URL,
              },
            },
          }).catch((e) => console.error("Email failed", e));
        }
        notified.push(d.id);
      }
    }

    // Always notify the fixed Director line via SMS, regardless of role/profile setup
    const alreadyTexted = (directorIds.length > 0)
      ? (await admin.from("profiles").select("phone").in("id", directorIds)).data
          ?.some((p: any) => (p.phone || "").replace(/\D/g, "").endsWith("740834746"))
      : false;
    if (!alreadyTexted) {
      await sendSMS(
        DIRECTOR_PHONE,
        `Welile: New requisition ${reqRow.requisition_code} from ${requesterName} for ${fmtUGX(amount)} (${title}). There is a pending requisition to review: ${REVIEW_URL}`,
        { admin, source: "create-director-requisition", reference_id: reqRow.id, recipient_name: "Director", idempotencyKey: `req-new-${reqRow.id}-director-line` },
      ).catch((e) => console.error("Director SMS failed", e));
    }

    return new Response(JSON.stringify({ success: true, requisition: reqRow, directors_notified: notified.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-director-requisition error", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
