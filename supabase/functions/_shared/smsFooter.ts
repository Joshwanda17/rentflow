// Centralized Welile SMS support footer.
//
// Every outbound SMS platform-wide must end with the standard support-contact
// footer. The line is composed from `SUPPORT_PHONE` (env var, single source of
// truth) with a stable default fallback so a missing env var never drops the
// footer.
//
// `appendSupportFooter` is idempotent: if the message already ends with (or
// contains) the footer, it is returned unchanged. This lets us apply it
// centrally in the SMS sender without worrying about callers that composed
// their own footer.

export const DEFAULT_SUPPORT_PHONE = "0748747134";

export function getSupportPhone(): string {
  const v = (Deno.env.get("SUPPORT_PHONE") ?? "").trim();
  return v || DEFAULT_SUPPORT_PHONE;
}

export function getSupportFooter(): string {
  return `For assistance, contact Welile Support on ${getSupportPhone()}.`;
}

export function appendSupportFooter(message: string): string {
  const msg = String(message ?? "");
  const footer = getSupportFooter();
  // Idempotent: any prior "contact Welile Support on <number>" mention wins.
  if (/contact\s+Welile\s+Support\s+on\s+\d/i.test(msg)) return msg.trimEnd();
  const trimmed = msg.replace(/\s+$/g, "");
  if (!trimmed) return footer;
  return `${trimmed}\n\n${footer}`;
}