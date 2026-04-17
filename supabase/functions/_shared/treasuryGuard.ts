// Treasury Guard — Layer-2 defense. Edge functions MUST call this before
// any money movement (credit, debit, transfer, payout, disbursement).
// Returns null if OK, or a Response (403) if the operation is paused.

type GuardOp = "credit" | "debit" | "any";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export async function checkTreasuryGuard(
  adminClient: any,
  op: GuardOp = "any",
): Promise<Response | null> {
  const { data, error } = await adminClient
    .from("treasury_controls")
    .select("control_key, enabled, value")
    .in("control_key", [
      "maintenance_mode",
      "maintenance_until",
      "withdrawals_paused",
      "credits_paused",
    ]);

  if (error) {
    console.error("[treasuryGuard] failed to load controls", error);
    return new Response(
      JSON.stringify({ error: "TREASURY_GUARD_UNAVAILABLE" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const map = new Map<string, { enabled: boolean; value: string | null }>();
  for (const row of data || []) {
    map.set(row.control_key, { enabled: !!row.enabled, value: row.value });
  }

  const maintenance = map.get("maintenance_mode");
  const until = map.get("maintenance_until")?.value;
  const maintenanceActive =
    !!maintenance?.enabled &&
    (!until || new Date(until).getTime() > Date.now());

  if (maintenanceActive) {
    return new Response(
      JSON.stringify({
        error: "MAINTENANCE_MODE",
        message: "Platform is under maintenance. Money movement is temporarily frozen.",
        maintenance_until: until,
      }),
      { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const withdrawalsPaused = !!map.get("withdrawals_paused")?.enabled;
  const creditsPaused = !!map.get("credits_paused")?.enabled;

  if ((op === "debit" || op === "any") && withdrawalsPaused) {
    return new Response(
      JSON.stringify({
        error: "WITHDRAWALS_PAUSED",
        message: "Withdrawals are temporarily paused for reconciliation.",
      }),
      { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if ((op === "credit" || op === "any") && creditsPaused) {
    return new Response(
      JSON.stringify({
        error: "CREDITS_PAUSED",
        message: "Credits are temporarily paused for reconciliation.",
      }),
      { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return null;
}
