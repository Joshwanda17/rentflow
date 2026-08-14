import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shared merchant payout float + per-merchant settlement positions.
 *
 * Both hooks are strictly READ ONLY: they call stable reporting RPCs that
 * derive their figures from the wallet cache, agent landlord float and the
 * extracted MoMo email feed. No wallet or ledger writes happen here — the
 * wallet sole-writer rule (`apply_wallet_movement`) is untouched.
 */

export interface MerchantPayoutFloat {
  withdrawableTotal: number;
  landlordFloatTotal: number;
  claimedUnsettledTotal: number;
  availableFloat: number;
  /** Merchant's OWN float bucket (company money held by them). */
  ownFloatBalance: number;
  /** Committed to payouts they already claimed but have not settled. */
  ownReservedFloat: number;
  /** Own float genuinely free to commit to a new payout. */
  ownAvailableFloat: number;
  /** Float actually consumed by settlements today. */
  ownConsumedToday: number;
  /** Money they fronted personally and the company still owes them. */
  ownOutOfPocketOutstanding: number;
}

export function useMerchantPayoutFloat(enabled = true) {
  return useQuery({
    queryKey: ['merchant-payout-float'],
    enabled,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<MerchantPayoutFloat> => {
      const { data, error } = await supabase.rpc('get_merchant_payout_float' as any);
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        withdrawableTotal: Number(d.withdrawable_total ?? 0),
        landlordFloatTotal: Number(d.landlord_float_total ?? 0),
        claimedUnsettledTotal: Number(d.claimed_unsettled_total ?? 0),
        availableFloat: Number(d.available_float ?? 0),
        ownFloatBalance: Number(d.own_float_balance ?? 0),
        ownReservedFloat: Number(d.own_reserved_float ?? 0),
        ownAvailableFloat: Number(d.own_available_float ?? 0),
        ownConsumedToday: Number(d.own_consumed_today ?? 0),
        ownOutOfPocketOutstanding: Number(d.own_out_of_pocket_outstanding ?? 0),
      };
    },
  });
}

export interface MerchantFloatPosition {
  deskId: string;
  agentId: string | null;
  agentName: string | null;
  agentPhone: string | null;
  label: string | null;
  isActive: boolean;
  paidOut: number;
  reimbursed: number;
  floatCredits: number;
  emailMatched: number;
  adjustments: number;
  owedToAgent: number;
  companyCashWithAgent: number;
  /** Ledger-backed company cash the payout engine can actually spend. */
  ledgerFloatHeld: number;
  /** Finance adjustments recorded off-ledger — NOT spendable float. */
  offledgerAdjustments: number;
  /** Completed payouts with no float evidence (agent's own line). */
  payoutsWithoutFloatEvidence: number;
  lastPayoutAt: string | null;
  lastReimbursedAt: string | null;
}

export function useMerchantFloatPositions(enabled = true) {
  const qc = useQueryClient();

  // Payout claims + settlements move merchant float, so this board follows the
  // same events live instead of waiting for the next poll.
  useEffect(() => {
    if (!enabled) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['merchant-float-positions'] });
      qc.invalidateQueries({ queryKey: ['merchant-payout-float'] });
    };
    const channel = supabase
      .channel('merchant-float-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_payout_funding' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_out_of_pocket_advances' }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);

  return useQuery({
    queryKey: ['merchant-float-positions'],
    enabled,
    retry: false,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async (): Promise<MerchantFloatPosition[]> => {
      const { data, error } = await supabase.rpc('get_merchant_float_positions' as any);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        deskId: String(r.desk_id),
        agentId: r.agent_id ?? null,
        agentName: r.agent_name ?? null,
        agentPhone: r.agent_phone ?? null,
        label: r.label ?? null,
        isActive: !!r.is_active,
        paidOut: Number(r.paid_out_total ?? 0),
        reimbursed: Number(r.reimbursed_total ?? 0),
        floatCredits: Number(r.float_credits_recorded ?? 0),
        emailMatched: Number(r.email_matched_total ?? 0),
        adjustments: Number(r.adjustments_total ?? 0),
        owedToAgent: Number(r.owed_to_agent ?? 0),
        companyCashWithAgent: Number(r.company_cash_with_agent ?? 0),
        ledgerFloatHeld: Number(r.ledger_float_held ?? 0),
        offledgerAdjustments: Number(r.offledger_adjustments ?? 0),
        payoutsWithoutFloatEvidence: Number(r.payouts_without_float_evidence ?? 0),
        lastPayoutAt: r.last_payout_at ?? null,
        lastReimbursedAt: r.last_reimbursed_at ?? null,
      }));
    },
  });
}

/**
 * Money the merchant fronted from their own line beyond the float they held,
 * plus their telecom sending charges. Read-only reporting RPC.
 */
export interface MerchantOutOfPocketSummary {
  /** CONFIRMED money the company owes the merchant. */
  owedToAgent: number;
  /** Float shortfalls filed for review — not yet money owed. */
  underReview: number;
  rejectedTotal: number;
  reimbursedTotal: number;
  telecomToday: number;
  telecomMonth: number;
  telecomTotal: number;
  pendingCount: number;
  underReviewCount: number;
}

export function useMerchantOutOfPocket(enabled = true) {
  return useQuery({
    queryKey: ['merchant-out-of-pocket'],
    enabled,
    retry: false,
    staleTime: 20_000,
    refetchInterval: 45_000,
    queryFn: async (): Promise<MerchantOutOfPocketSummary> => {
      const { data, error } = await supabase.rpc('get_merchant_out_of_pocket_summary' as any, {});
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        owedToAgent: Number(d.owed_to_agent ?? 0),
        underReview: Number(d.under_review ?? 0),
        rejectedTotal: Number(d.rejected_total ?? 0),
        reimbursedTotal: Number(d.reimbursed_total ?? 0),
        telecomToday: Number(d.telecom_today ?? 0),
        telecomMonth: Number(d.telecom_month ?? 0),
        telecomTotal: Number(d.telecom_total ?? 0),
        pendingCount: Number(d.pending_count ?? 0),
        underReviewCount: Number(d.under_review_count ?? 0),
      };
    },
  });
}

export interface MerchantOutOfPocketRow {
  id: string;
  withdrawalId: string | null;
  kind: 'payout' | 'telecom';
  payoutAmount: number;
  telecomCharge: number;
  floatUsed: number;
  shortfallAmount: number;
  status: string;
  note: string | null;
  createdAt: string;
  attestedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export function useMerchantOutOfPocketRows(enabled = true) {
  return useQuery({
    queryKey: ['merchant-out-of-pocket-rows'],
    enabled,
    retry: false,
    staleTime: 20_000,
    queryFn: async (): Promise<MerchantOutOfPocketRow[]> => {
      const { data, error } = await supabase
        .from('merchant_out_of_pocket_advances' as any)
        .select('id, withdrawal_id, kind, payout_amount, telecom_charge, float_used, shortfall_amount, status, note, created_at, attested_at, reviewed_at, review_note')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        withdrawalId: r.withdrawal_id ?? null,
        kind: r.kind,
        payoutAmount: Number(r.payout_amount ?? 0),
        telecomCharge: Number(r.telecom_charge ?? 0),
        floatUsed: Number(r.float_used ?? 0),
        shortfallAmount: Number(r.shortfall_amount ?? 0),
        status: String(r.status),
        note: r.note ?? null,
        createdAt: String(r.created_at),
        attestedAt: r.attested_at ?? null,
        reviewedAt: r.reviewed_at ?? null,
        reviewNote: r.review_note ?? null,
      }));
    },
  });
}

/**
 * A float shortfall alone is not proof the merchant spent their own money.
 * The merchant confirms it here (or Finance confirms/rejects on review) and
 * only then does it count as money the company owes.
 */
export function useReviewMerchantOutOfPocket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: 'confirm' | 'reject'; note?: string }) => {
      if (input.decision === 'reject' && (input.note ?? '').trim().length < 10) {
        throw new Error('Give a reason of at least 10 characters.');
      }
      const { data, error } = await supabase.rpc('review_merchant_out_of_pocket' as any, {
        p_id: input.id,
        p_decision: input.decision,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchant-out-of-pocket'] });
      qc.invalidateQueries({ queryKey: ['merchant-out-of-pocket-rows'] });
      qc.invalidateQueries({ queryKey: ['merchant-float-positions'] });
    },
  });
}

export type MerchantAdjustmentType =
  | 'opening_balance'
  | 'reimbursement_recorded'
  | 'payout_correction'
  | 'write_off';

export const MERCHANT_ADJUSTMENT_LABELS: Record<MerchantAdjustmentType, string> = {
  opening_balance: 'Money already with the agent (starting balance)',
  reimbursement_recorded: 'Money we paid them back outside the system',
  payout_correction: 'Reduce what we count as paid out',
  write_off: 'Agreed to let it go (settled with the agent)',
};

export interface MerchantAdjustmentInput {
  deskId: string;
  agentId: string | null;
  adjustmentType: MerchantAdjustmentType;
  amount: number;
  reason: string;
  evidenceNote?: string;
}

export function useMerchantFloatAdjustments(deskId?: string) {
  return useQuery({
    queryKey: ['merchant-float-adjustments', deskId],
    enabled: !!deskId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merchant_float_reconciliations' as any)
        .select('id, adjustment_type, amount, reason, evidence_note, created_at')
        .eq('desk_id', deskId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function usePostMerchantAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MerchantAdjustmentInput) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error('You must be signed in.');
      if (input.reason.trim().length < 10) throw new Error('Reason must be at least 10 characters.');
      if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error('Enter a non-zero amount.');
      const { error } = await supabase.from('merchant_float_reconciliations' as any).insert({
        desk_id: input.deskId,
        agent_id: input.agentId,
        adjustment_type: input.adjustmentType,
        amount: Math.round(input.amount),
        reason: input.reason.trim(),
        evidence_note: input.evidenceNote?.trim() || null,
        created_by: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['merchant-float-positions'] });
      qc.invalidateQueries({ queryKey: ['merchant-float-adjustments', v.deskId] });
      qc.invalidateQueries({ queryKey: ['merchant-float-ledger-variance'] });
    },
  });
}

/**
 * PHASE 10 — the general ledger is the source of truth for merchant float.
 * `merchant_float_reconciliations` records are display-only narrative fixes,
 * so this comparison exists to prove the stored (cached) float still agrees
 * with the ledger-derived float. A non-zero variance means the books are the
 * thing to fix — not the board.
 */
export interface MerchantFloatLedgerVariance {
  deskId: string;
  agentId: string | null;
  agentName: string | null;
  agentPhone: string | null;
  label: string | null;
  isActive: boolean;
  storedFloat: number;
  ledgerFloat: number;
  variance: number;
  varianceState: 'aligned' | 'stored_above_ledger' | 'stored_below_ledger';
  displayOnlyAdjustments: number;
  adjustmentCount: number;
  lastAdjustmentAt: string | null;
}

export function useMerchantFloatLedgerVariance(enabled = true) {
  return useQuery({
    queryKey: ['merchant-float-ledger-variance'],
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MerchantFloatLedgerVariance[]> => {
      const { data, error } = await supabase.rpc('get_merchant_float_ledger_variance' as any);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        deskId: String(r.desk_id),
        agentId: r.agent_id ?? null,
        agentName: r.agent_name ?? null,
        agentPhone: r.agent_phone ?? null,
        label: r.label ?? null,
        isActive: !!r.is_active,
        storedFloat: Number(r.stored_float ?? 0),
        ledgerFloat: Number(r.ledger_float ?? 0),
        variance: Number(r.variance ?? 0),
        varianceState: (r.variance_state ?? 'aligned') as MerchantFloatLedgerVariance['varianceState'],
        displayOnlyAdjustments: Number(r.display_only_adjustments ?? 0),
        adjustmentCount: Number(r.adjustment_count ?? 0),
        lastAdjustmentAt: r.last_adjustment_at ?? null,
      }));
    },
  });
}

/**
 * Float movement statement for ONE merchant agent — read-only.
 *
 * Reads the agent's `general_ledger` float-bucket legs (money we sent them in,
 * payouts + telecom charges going out) so finance can see exactly how the
 * float they hold moved over time. No writes anywhere.
 */
export interface MerchantFloatStatementRow {
  id: string;
  date: string;
  description: string | null;
  category: string;
  direction: 'cash_in' | 'cash_out';
  amount: number;
  referenceId: string | null;
  runningBalance: number;
}

export function useMerchantFloatStatement(agentId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['merchant-float-statement', agentId],
    enabled: !!agentId && enabled,
    retry: false,
    staleTime: 20_000,
    queryFn: async (): Promise<MerchantFloatStatementRow[]> => {
      const { data, error } = await supabase
        .from('general_ledger')
        .select('id, transaction_date, created_at, description, category, direction, amount, reference_id')
        .eq('user_id', agentId!)
        .eq('wallet_bucket', 'float')
        .neq('classification', 'admin_correction')
        .order('transaction_date', { ascending: true })
        .limit(500);
      if (error) throw error;
      let bal = 0;
      const rows = ((data ?? []) as any[]).map((r) => {
        const amount = Number(r.amount ?? 0);
        bal += r.direction === 'cash_in' ? amount : -amount;
        return {
          id: String(r.id),
          date: String(r.transaction_date ?? r.created_at),
          description: r.description ?? null,
          category: String(r.category ?? ''),
          direction: r.direction as 'cash_in' | 'cash_out',
          amount,
          referenceId: r.reference_id ?? null,
          runningBalance: bal,
        };
      });
      return rows.reverse();
    },
  });
}

/**
 * Most recent float movement on each merchant agent's line — read-only.
 *
 * Inbound (`cash_in`) = company money landing on their phone.
 * Outbound (`cash_out`) = money leaving their float (customer payout / charge).
 * Purely for display; no balances are derived from this.
 */
export interface LatestFloatMovement {
  agentId: string;
  date: string;
  amount: number;
  direction: 'cash_in' | 'cash_out';
  description: string | null;
  category: string;
}

export function useLatestMerchantFloatMovements(agentIds: string[], enabled = true) {
  const ids = Array.from(new Set(agentIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['merchant-latest-float-movement', ids],
    enabled: enabled && ids.length > 0,
    retry: false,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Map<string, LatestFloatMovement>> => {
      const { data, error } = await supabase
        .from('general_ledger')
        .select('user_id, transaction_date, created_at, description, category, direction, amount')
        .in('user_id', ids)
        .eq('wallet_bucket', 'float')
        .neq('classification', 'admin_correction')
        .order('transaction_date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const latest = new Map<string, LatestFloatMovement>();
      for (const r of (data ?? []) as any[]) {
        const agentId = String(r.user_id);
        if (latest.has(agentId)) continue;
        latest.set(agentId, {
          agentId,
          date: String(r.transaction_date ?? r.created_at),
          amount: Number(r.amount ?? 0),
          direction: r.direction === 'cash_in' ? 'cash_in' : 'cash_out',
          description: r.description ?? null,
          category: String(r.category ?? ''),
        });
      }
      return latest;
    },
  });
}
