// Single source of truth for who may receive an INTERNAL copy of a
// withdrawal-approval ("payout paid") receipt.
//
// Policy (locked): the ONLY internal recipient of a withdrawal approval
// receipt copy is the shared records archive mailbox below. No staff, manager,
// CFO, Financial Ops, or agent address may ever receive a copy. The customer
// still receives their own primary receipt separately; this guard governs the
// internal copy fan-out only.
//
// This module is intentionally pure (no I/O) so it can be unit tested — see
// receipt-copy-guard.test.ts.

export const RECEIPT_ARCHIVE_EMAIL = "weliletenants@gmail.com";

export type ReceiptCopyRecipient = { email: string; role: string };

/** The complete, approved list of internal receipt-copy recipients. */
export function buildReceiptCopyRecipients(): ReceiptCopyRecipient[] {
  return [{ email: RECEIPT_ARCHIVE_EMAIL, role: "Records Archive" }];
}

/**
 * Defensive runtime guard. Filters any recipient list down to the approved
 * archive address, returning the allowed list plus any rejected addresses so
 * callers can log/alert. Guarantees no receipt copy is ever dispatched to an
 * address other than the archive — even if future edits reintroduce fan-out.
 */
export function enforceArchiveOnly(
  recipients: ReceiptCopyRecipient[],
): { allowed: ReceiptCopyRecipient[]; rejected: ReceiptCopyRecipient[] } {
  const allowed: ReceiptCopyRecipient[] = [];
  const rejected: ReceiptCopyRecipient[] = [];
  for (const r of recipients) {
    if ((r.email ?? "").trim().toLowerCase() === RECEIPT_ARCHIVE_EMAIL) {
      allowed.push(r);
    } else {
      rejected.push(r);
    }
  }
  return { allowed, rejected };
}
