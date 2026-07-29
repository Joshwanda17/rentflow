import { supabase } from '@/integrations/supabase/client';
import {
  calculateAccessFee,
  calculateRegistrationFee,
  installmentCount,
  type RepaymentFrequency,
} from '@/lib/agentAdvanceCalculations';

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
}) {
  const { req, actorId } = opts;
  const principal = Number(opts.principal ?? req.principal);
  const cycleDays = Number(opts.cycleDays ?? req.cycle_days);
  const monthlyRate = Number(opts.monthlyRate ?? req.monthly_rate);
  const repaymentFrequency: RepaymentFrequency =
    (opts.repaymentFrequency ?? req.repayment_frequency ?? 'daily') as RepaymentFrequency;
  if (!Number.isFinite(principal) || principal <= 0) throw new Error('Principal must be greater than zero');
  if (principal < 10000) throw new Error('Principal must be at least UGX 10,000 — advances below this are not permitted.');
  if (!Number.isFinite(cycleDays) || cycleDays <= 0) throw new Error('Cycle days must be greater than zero');

  const registrationFee = calculateRegistrationFee(principal);
  const accessFee = calculateAccessFee(principal, cycleDays, monthlyRate);
  const totalPayable = principal + accessFee + registrationFee;
  const installments = installmentCount(cycleDays, repaymentFrequency);
  const installment = Math.ceil(totalPayable / installments);
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

  // 2. Start daily deductions.
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
  } as any);
  if (advErr) throw advErr;

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

  // 4. Record registration fee revenue.
  if (registrationFee > 0) {
    await supabase.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: req.agent_id,
          ledger_scope: 'platform',
          direction: 'cash_in',
          amount: registrationFee,
          category: 'registration_fee_collected',
          source_table: 'agent_advance_requests',
          source_id: req.id,
          description: `Registration fee for agent advance`,
          currency: 'UGX',
          transaction_date: nowIso,
        },
        {
          user_id: req.agent_id,
          ledger_scope: 'wallet',
          direction: 'cash_out',
          amount: registrationFee,
          category: 'registration_fee_collected',
          source_table: 'agent_advance_requests',
          source_id: req.id,
          description: `Registration fee deducted`,
          currency: 'UGX',
          transaction_date: nowIso,
        },
      ],
    } as any);
  }

  // 5. Notify the agent by SMS (fire-and-forget).
  supabase.functions.invoke('notify-agent-advance-disbursed', {
    body: { agent_id: req.agent_id, amount: principal, request_id: req.id },
  }).catch((e) => console.error('advance disbursement SMS failed', e));

  return {
    principal, cycleDays, monthlyRate, accessFee, registrationFee,
    totalPayable, daily, installment, installments, repaymentFrequency,
  };
}