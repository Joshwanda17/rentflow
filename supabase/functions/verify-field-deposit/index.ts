import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Case-insensitive, whitespace-insensitive exact match. */
const normalizeProof = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, "").toUpperCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization header" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json(401, { error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorise: must be financial-ops staff
    const { data: isStaff, error: staffErr } = await admin.rpc("is_financial_ops_staff", {
      p_user: user.id,
    });
    if (staffErr) {
      console.error("staff check error", staffErr);
      return json(500, { error: "Authorisation check failed" });
    }
    if (!isStaff) return json(403, { error: "Financial Ops only" });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const batchId = String(body.batch_id ?? "");
    if (!batchId) return json(400, { error: "batch_id is required" });

    // Load the batch
    const { data: batch, error: batchErr } = await admin
      .from("field_deposit_batches")
      .select("id, status, proof_reference, declared_total, agent_id")
      .eq("id", batchId)
      .single();
    if (batchErr || !batch) return json(404, { error: "Batch not found" });
    if (batch.status !== "pending_finops_verification") {
      return json(400, { error: `Batch is in status '${batch.status}' and cannot be processed` });
    }

    if (action === "verify") {
      const entered = String(body.proof_entered ?? "").trim();
      if (!entered) return json(400, { error: "proof_entered is required" });

      // Exact match (case/space-insensitive)
      if (normalizeProof(entered) !== normalizeProof(batch.proof_reference)) {
        return json(400, {
          error: "Proof does not match the reference submitted by the agent",
          code: "proof_mismatch",
        });
      }

      const { data: result, error: rpcErr } = await admin.rpc("process_verified_field_deposit", {
        p_batch_id: batchId,
        p_finops_user: user.id,
        p_finops_proof_entered: entered,
      });
      if (rpcErr) {
        console.error("process_verified_field_deposit error", rpcErr);
        return json(500, { error: rpcErr.message || "Verification failed" });
      }
      return json(200, { success: true, action: "verified", result });
    }

    if (action === "reject") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) return json(400, { error: "reason is required" });

      const { error: updErr } = await admin
        .from("field_deposit_batches")
        .update({
          status: "rejected",
          rejection_reason: reason,
          finops_verified_by: user.id,
          finops_verified_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      if (updErr) {
        console.error("reject update error", updErr);
        return json(500, { error: updErr.message });
      }
      return json(200, { success: true, action: "rejected" });
    }

    return json(400, { error: "Unknown action. Use 'verify' or 'reject'." });
  } catch (err) {
    console.error("verify-field-deposit unexpected", err);
    return json(500, { error: "Internal server error" });
  }
});