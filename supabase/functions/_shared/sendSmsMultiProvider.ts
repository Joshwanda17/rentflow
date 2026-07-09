// Shared multi-provider SMS sender: Yoola (primary) -> Africa's Talking -> Lana.
// Mirrors the provider chain used by approve-withdrawal so any flow can send an
// auditable, idempotent SMS without duplicating provider code.
import {
  logSmsDelivery,
  reserveSmsIdempotency,
  finalizeSmsDelivery,
  type SmsAttemptRecord,
} from "./smsDeliveryLog.ts";

export function formatPhoneInternational(phone: string): string {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return digits ? `+${digits}` : "";
}
export function isUgandanPhone(phone: string): boolean {
  const f = formatPhoneInternational(phone);
  return f.startsWith("+256") && f.length >= 13;
}
function toMsisdn(phone: string): string {
  return formatPhoneInternational(phone).replace(/^\+/, "");
}

async function sendViaYoola(phone: string, message: string) {
  const apiKey = Deno.env.get("YOOLA_SMS_API_KEY")?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://yoolasms.com/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone: toMsisdn(phone), message, api_key: apiKey, sender: "ATInfo" }),
    });
    const raw = await res.text();
    let data: any; try { data = JSON.parse(raw); } catch { data = null; }
    const status = String(data?.status ?? "").toLowerCase();
    const ok = res.ok && (status === "success" || status === "ok" || status === "sent" || status === "queued" || (!data?.error && status === ""));
    return { ok, error: ok ? null : `Yoola rejected (HTTP ${res.status} ${status || "no-status"})`, response: data ?? raw?.slice(0, 300) };
  } catch (err) {
    return { ok: false, error: `Yoola network error: ${(err as Error)?.message || err}`, response: null };
  }
}
async function sendViaAT(phone: string, message: string) {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) return null;
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const body = new URLSearchParams({ username, to: formatPhoneInternational(phone), message, from: "WELILE" });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apiKey, Accept: "application/json" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `AT HTTP ${res.status}`, response: text?.slice(0, 300) || null };
    }
    const data = await res.json();
    const recipients = data?.SMSMessageData?.Recipients || [];
    const accepted = recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
    const reason = recipients.map((r: any) => `${r.number}:${r.status}`).join(", ");
    return { ok: accepted, error: accepted ? null : (reason ? `AT rejected (${reason})` : "AT no accepted recipients"), response: data };
  } catch (err) {
    return { ok: false, error: `AT network error: ${(err as Error)?.message || err}`, response: null };
  }
}
async function sendViaLana(phone: string, message: string) {
  const apiKey = Deno.env.get("LANA_SMS_API_KEY")?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.lanasms.com/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ phone: toMsisdn(phone), message }),
    });
    const raw = await res.text();
    let data: any; try { data = JSON.parse(raw); } catch { data = null; }
    const ok = res.ok && data?.status === true;
    return { ok, error: ok ? null : `LANA rejected (${data?.message || `HTTP ${res.status}`})`, response: data ?? raw?.slice(0, 300) };
  } catch (err) {
    return { ok: false, error: `LANA network error: ${(err as Error)?.message || err}`, response: null };
  }
}

export interface SmsLogCtx {
  admin: any;
  source: string;
  reference_id?: string | null;
  recipient_user_id?: string | null;
  recipient_name?: string | null;
  idempotencyKey?: string | null;
}

// Returns true when delivered (or an identical SMS was already delivered before).
export async function sendSMS(phone: string, message: string, logCtx?: SmsLogCtx): Promise<boolean> {
  let reservedLogId: string | null = null;
  if (logCtx?.admin && logCtx.idempotencyKey) {
    const reservation = await reserveSmsIdempotency(logCtx.admin, {
      idempotency_key: logCtx.idempotencyKey,
      recipient_phone: phone || "unknown",
      recipient_user_id: logCtx.recipient_user_id ?? null,
      recipient_name: logCtx.recipient_name ?? null,
      message,
      reference_id: logCtx.reference_id ?? null,
      source: logCtx.source,
    });
    if (!reservation.proceed) return reservation.alreadySent;
    reservedLogId = reservation.logId;
  }

  const providerNames: Record<string, string> = { sendViaYoola: "yoola", sendViaAT: "africastalking", sendViaLana: "lana" };
  const trail: SmsAttemptRecord[] = [];
  let delivered = false;
  let invalid = false;

  if (!isUgandanPhone(phone)) {
    invalid = true;
  } else {
    for (const send of [sendViaYoola, sendViaAT, sendViaLana]) {
      const r = await send(phone, message);
      if (r === null) continue;
      trail.push({ provider: providerNames[send.name] || send.name, ok: r.ok, error: r.error, response: (r as any).response, attempt: 1 });
      if (r.ok) { delivered = true; break; }
    }
  }

  const errorText = delivered
    ? null
    : invalid
      ? "Invalid Ugandan phone/MoMo number"
      : (trail.filter((t) => !t.ok && t.error).map((t) => `${t.provider}: ${t.error}`).join(" | ") || "No SMS provider configured");

  if (reservedLogId) {
    await finalizeSmsDelivery(logCtx!.admin, reservedLogId, { status: delivered ? "sent" : "failed", attempts: trail, retries: 0, error: errorText });
  } else if (logCtx?.admin) {
    await logSmsDelivery(logCtx.admin, {
      recipient_phone: phone || "unknown",
      recipient_user_id: logCtx.recipient_user_id ?? null,
      recipient_name: logCtx.recipient_name ?? null,
      message,
      status: delivered ? "sent" : "failed",
      attempts: trail,
      retries: 0,
      reference_id: logCtx.reference_id ?? null,
      source: logCtx.source,
      error: errorText,
    });
  }

  return delivered;
}
