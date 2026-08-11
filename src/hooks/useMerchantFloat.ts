import { useQuery } from '@tanstack/react-query';
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
  lastPayoutAt: string | null;
  lastReimbursedAt: string | null;
}

export function useMerchantFloatPositions(enabled = true) {
  return useQuery({
    queryKey: ['merchant-float-positions'],
    enabled,
    retry: false,
    staleTime: 20_000,
    refetchInterval: 45_000,
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
        lastPayoutAt: r.last_payout_at ?? null,
        lastReimbursedAt: r.last_reimbursed_at ?? null,
      }));
    },
  });
}

export type MerchantAdjustmentType =
  | 'opening_balance'
  | 'reimbursement_recorded'
  | 'payout_correction'
  | 'write_off';

export const MERCHANT_ADJUSTMENT_LABELS: Record<MerchantAdjustmentType, string> = {
  opening_balance: 'Opening balance (money already with the agent)',
  reimbursement_recorded: 'Reimbursement we sent outside the system',
  payout_correction: 'Payout correction (reduce what we recognise as paid out)',
  write_off: 'Write-off / settlement agreed with the agent',
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
    },
  });
}
