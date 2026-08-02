/**
 * Ledger Delivery Verification — thin client for the server-side service.
 *
 * All verification logic lives in the database (`verify_ledger_delivery`).
 * The client NEVER matches earnings to wallet credits by amount, source id,
 * timestamp or metadata; it only forwards records and renders the
 * authoritative result returned by the ledger.
 *
 * The service is read-only: it never posts ledger entries, never touches
 * wallet balances and never mutates history.
 */
import { supabase } from '@/integrations/supabase/client';

export type DeliveryStatus = 'credited' | 'pending' | 'failed' | 'not_found';

/** One earning record to verify. Works for any earning type. */
export interface LedgerDeliveryItem {
  /** Caller-defined stable key echoed back in the result. */
  key: string;
  /** Wallet owner the earning was supposed to reach. */
  user_id: string;
  /** Authoritative links — supply whichever the source record carries. */
  ledger_group_id?: string | null;
  idempotency_key?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  /** Optional processing state of the source record (pending/failed/...). */
  state?: string | null;
  error_message?: string | null;
  occurred_at?: string | null;
  /** Optional ledger categories the credit is expected to carry. */
  expected_categories?: string[];
}

export interface LedgerDeliveryResult {
  item_key: string;
  verification_status: DeliveryStatus;
  match_method: string | null;
  wallet_transaction_id: string | null;
  ledger_transaction_group_id: string | null;
  wallet_bucket: string | null;
  ledger_scope: string | null;
  category: string | null;
  credited_amount: number | null;
  credited_at: string | null;
  wallet_user_id: string | null;
  ledger_idempotency_key: string | null;
  failure_reason: string | null;
  processing_state: string | null;
  retry_status: string | null;
}

/**
 * Batch-verify wallet delivery for any list of earning records
 * (agent commissions, recruiter overrides, listing bonuses, referral
 * bonuses, Returns payouts, advance recoveries, merchant settlements, ...).
 */
export async function verifyLedgerDelivery(
  items: LedgerDeliveryItem[],
): Promise<LedgerDeliveryResult[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase.rpc('verify_ledger_delivery', {
    p_items: items as unknown as never,
  });
  if (error) throw error;
  return ((data as unknown as LedgerDeliveryResult[]) || []).map((r) => ({
    ...r,
    credited_amount: r.credited_amount === null ? null : Number(r.credited_amount),
  }));
}
