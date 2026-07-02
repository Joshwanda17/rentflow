// Shared SMS delivery-status logger for withdrawal claim & payout SMS.
// Writes one auditable row per SMS attempt-chain into `sms_delivery_log`,
// capturing the winning provider, the full per-provider response trail,
// retry count, and any failure reason so Financial Ops has a complete
// delivery audit for every claim and payout text.
//
// The table already exists with:
//   recipient_phone, recipient_user_id, recipient_name, message, status,
//   provider, provider_message_id, provider_response (jsonb), cost,
//   reference_id, source, error
//
// This helper is intentionally fire-and-forget: a logging failure must NEVER
// block or fail the SMS / payout flow.

export interface SmsAttemptRecord {
  provider: string; // 'yoola' | 'africastalking' | 'lana'
  ok: boolean;
  error?: string | null;
  response?: unknown; // raw provider response (parsed JSON or text)
  attempt?: number; // 1-based retry index within the chain
}

export interface SmsDeliveryLogInput {
  recipient_phone: string;
  recipient_user_id?: string | null;
  recipient_name?: string | null;
  message?: string | null;
  status: "sent" | "failed" | "queued";
  provider?: string | null; // winning provider (or last tried)
  provider_message_id?: string | null;
  attempts: SmsAttemptRecord[];
  retries?: number; // number of full-chain retries performed
  cost?: string | null;
  reference_id?: string | null; // e.g. withdrawal_id
  source: string; // 'withdrawal_claim' | 'withdrawal_payout' | 'merchant_commission' | 'proxy_payout'
  error?: string | null;
}

// Minimal shape of the supabase-js client we rely on.
type AdminLike = {
  from: (table: string) => {
    insert: (rows: unknown) => Promise<{ error: unknown }>;
  };
};

export async function logSmsDelivery(
  admin: AdminLike,
  input: SmsDeliveryLogInput,
): Promise<void> {
  try {
    const winning = input.attempts.find((a) => a.ok);
    const provider =
      input.provider ??
      winning?.provider ??
      input.attempts[input.attempts.length - 1]?.provider ??
      "none";
    const combinedError =
      input.error ??
      (input.status === "sent"
        ? null
        : input.attempts
            .filter((a) => !a.ok && a.error)
            .map((a) => `${a.provider}: ${a.error}`)
            .join(" | ") || null);

    await admin.from("sms_delivery_log").insert({
      recipient_phone: input.recipient_phone || "unknown",
      recipient_user_id: input.recipient_user_id ?? null,
      recipient_name: input.recipient_name ?? null,
      message: input.message ?? null,
      status: input.status,
      provider,
      provider_message_id: input.provider_message_id ?? null,
      provider_response: {
        attempts: input.attempts,
        retries: input.retries ?? 0,
        total_provider_calls: input.attempts.length,
      },
      cost: input.cost ?? null,
      reference_id: input.reference_id ?? null,
      source: input.source,
      error: combinedError,
    });
  } catch (e) {
    // Never let auditing break the SMS flow.
    console.warn("[smsDeliveryLog] failed to record delivery status:", e);
  }
}