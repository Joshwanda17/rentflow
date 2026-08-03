import { supabase } from '@/integrations/supabase/client';
import {
  calculateAccessFee,
  calculateRegistrationFee,
  installmentCount,
  type RepaymentFrequency,
} from '@/lib/agentAdvanceCalculations';

/**
 * Merge an approved TOP-UP request into the agent's existing advance.
 * The top-up inherits the parent advance's rate + repayment frequency and
 * extends the schedule by `extend_days`; the DB re-validates eligibility
 * (≥30% repaid, not behind, ≤90% of current principal).
 */
export async function applyAdvanceTopupForRequest(req: any, amount?: number, extendDays?: number) {
  const topupAmount = Number(amount ?? req.principal);
  const days = Number(extendDays ?? req.extend_days);
  if (!Number.isFinite(topupAmount) || topupAmount <= 0) throw new Error('Top-up amount must be greater than zero');
  if (!Number.isFinite(days) || days <= 0) throw new Error('Top-up requires the number of days to extend by');
  if (!req.parent_advance_id) throw new Error('Top-up request is missing the advance it tops up');

  const { data, error } = await supabase.rpc('apply_advance_topup' as any, {
    p_advance_id: req.parent_advance_id,
    p_amount: topupAmount,
    p_extend_days: days,
    p_request_id: req.id,
  } as any);
  if (error) throw error;
  return data as any;
}

/**
 * Disburse an agent advance to the agent's wallet. Mirrors the CFO
 * disbursement flow in `CFOAdvanceRequestPayments.tsx` so Agent Ops can
 * shortcut the CFO stage when needed.
 *
 * - Updates the request to `cfo_paid` (stamps both approval + payout fields).
 * - Creates the `agent_advances` row so daily deductions start.
 * - Posts the wallet + platform ledger legs.
 * - Posts registration-fee revenue if any.
 * - Fires the SMS notification (fire-and-forget).
 */
export async function disburseAgentAdvanceRequest(opts: {
  req: any;
  actorId: string;
  principal?: number;
  cycleDays?: number;
  monthlyRate?: number;
  repaymentFrequency?: RepaymentFrequency;
  notes?: string | null;
  skipReason?: string | null;
  /** 'wallet_daily' (default daily wallet sweep) or 'roi' (recover a % of each ROI payout). */
  recoverySource?: 'wallet_daily' | 'roi';
  /** Percentage of each ROI payout to recover (only used when recoverySource === 'roi'). */
  roiRecoveryPercent?: number;
}) {
  const { req, actorId } = opts;
  const isTopup = (req.request_kind ?? 'new') === 'topup';
  const principal = Number(opts.principal ?? req.principal);
  const cycleDays = isTopup ? Number(req.extend_days ?? req.cycle_days) : Number(opts.cycleDays ?? req.cycle_days);
  const monthlyRate = isTopup ? Number(req.monthly_rate) : Number(opts.monthlyRate ?? req.monthly_rate);
  const repaymentFrequency: RepaymentFrequency =
    (opts.repaymentFrequency ?? req.repayment_frequency ?? 'daily') as RepaymentFrequency;
  if (!Number.isFinite(principal) || principal <= 0) throw new Error('Principal must be greater than zero');
  if (principal < 10000) throw new Error('Principal must be at least UGX 10,000 — advances below this are not permitted.');
  if (!Number.isFinite(cycleDays) || cycleDays <= 0) throw new Error('Cycle days must be greater than zero');

  const registrationFee = isTopup ? 0 : calculateRegistrationFee(principal);
  const accessFee = calculateAccessFee(principal, cycleDays, monthlyRate);
  const totalPayable = principal + accessFee + registrationFee;
  const installments = installmentCount(cycleDays, repaymentFrequency);
  let installment = Math.ceil(totalPayable / installments);
  const daily = installment;
  const nowIso = new Date().toISOString();
  const combinedNotes = [opts.notes || null, opts.skipReason ? `[CFO skipped by Agent Ops] ${opts.skipReason}` : null]
    .filter(Boolean)
    .join(' · ') || null;

  // 1. Approve + mark paid in a single update (guarded on undisbursed statuses).
  const { data: updated, error: updateErr } = await supabase
    .from('agent_advance_requests')
    .update({
      status: 'cfo_paid',
      cfo_approved_by: actorId,
      cfo_approved_at: nowIso,
      paid_by_cfo: actorId,
      cfo_paid_at: nowIso,
      cfo_adjusted_rate: monthlyRate !== Number(req.monthly_rate) ? monthlyRate : null,
      cfo_notes: combinedNotes,
      principal,
      cycle_days: cycleDays,
      registration_fee: registrationFee,
      access_fee: accessFee,
      total_payable: totalPayable,
      daily_payment: daily,
      monthly_rate: monthlyRate,
      repayment_frequency: repaymentFrequency,
    })
    .eq('id', req.id)
    .in('status', ['pending', 'agent_ops_approved', 'cfo_approved'])
    .select('id')
    .maybeSingle();
  if (updateErr) throw updateErr;
  if (!updated) throw new Error('Disbursement blocked — the request status changed or has already been disbursed.');

  // 2. Start (or extend) deductions.
  if (isTopup) {
    const merged = await applyAdvanceTopupForRequest(req, principal, cycleDays);
    installment = Number(merged?.new_installment ?? installment);
  } else {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + cycleDays);
  const { error: advErr } = await supabase.from('agent_advances').insert({
    agent_id: req.agent_id,
    issued_by: actorId,
    principal,
    outstanding_balance: totalPayable,
    cycle_days: cycleDays,
    monthly_rate: monthlyRate,
    daily_rate: monthlyRate,
    access_fee: accessFee,
    registration_fee: registrationFee,
    access_fee_collected: 0,
    access_fee_status: 'unpaid',
    status: 'active',
    repayment_frequency: repaymentFrequency,
    installment_amount: installment,
    expires_at: expiresAt.toISOString(),
    recovery_source: opts.recoverySource ?? 'wallet_daily',
    roi_recovery_percent: opts.recoverySource === 'roi' ? Number(opts.roiRecoveryPercent ?? 0) : 0,
  } as any);
  if (advErr) throw advErr;
  }

  // 3. Credit agent wallet via ledger RPC.
  const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
    entries: [
      {
        user_id: req.agent_id,
        ledger_scope: 'wallet',
        direction: 'cash_in',
        amount: principal,
        category: 'agent_advance_credit',
        recipient_type: 'user',
        wallet_bucket: 'withdrawable',
        source_table: 'agent_advance_requests',
        source_id: req.id,
        description: `Agent advance disbursement - ${cycleDays}d @ ${Math.round(monthlyRate * 100)}%`,
        currency: 'UGX',
        transaction_date: nowIso,
      },
      {
        user_id: req.agent_id,
        ledger_scope: 'platform',
        direction: 'cash_out',
        amount: principal,
        category: 'rent_disbursement',
        source_table: 'agent_advance_requests',
        source_id: req.id,
        description: `Agent advance disbursed to wallet`,
        currency: 'UGX',
        transaction_date: nowIso,
      },
    ],
  } as any);
  if (rpcErr) throw rpcErr;

  // 4. Registration fee is NOT debited from the wallet at disbursement.
  //    It is already baked into `total_payable` / `outstanding_balance`, so it is
  //    recovered through the repayment schedule. Debiting it upfront charged the
  //    agent twice and, on small principals, left them with zero cash to use.

  // 5. Notify the agent by SMS (fire-and-forget).
  supabase.functions.invoke('notify-agent-advance-disbursed', {
    body: { agent_id: req.agent_id, amount: principal, request_id: req.id },
  }).catch((e) => console.error('advance disbursement SMS failed', e));

  return {
    principal, cycleDays, monthlyRate, accessFee, registrationFee,
    totalPayable, daily, installment, installments, repaymentFrequency,
  };
}