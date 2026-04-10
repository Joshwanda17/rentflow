export const LEDGER_SCOPE = {
  PLATFORM: 'platform',
  WALLET: 'wallet',
  BRIDGE: 'bridge',
} as const;

export const FINAL_WITHDRAWAL_STATUSES = ['approved', 'fin_ops_approved'];

// Agent wallet segmentation categories
export const AGENT_FLOAT_CATEGORIES = {
  DEPOSIT: 'agent_float_deposit',
  USED_FOR_RENT: 'agent_float_used_for_rent',
} as const;

export const AGENT_COMMISSION_CATEGORIES = {
  EARNED: 'agent_commission_earned',
  WITHDRAWAL: 'agent_commission_withdrawal',
  USED_FOR_RENT: 'agent_commission_used_for_rent',
} as const;

/**
 * LOCKED CATEGORIES — the ONLY categories allowed in production.
 * Matches the allowlist in create_ledger_transaction() and validate_ledger_category().
 * When strict_mode is enabled in treasury_controls, any category NOT in this list
 * will be hard-rejected by the database.
 */
export const LOCKED_CATEGORIES = [
  // Revenue (platform earns)
  'access_fee_collected',
  'registration_fee_collected',
  // Cash in (real money entering)
  'wallet_deposit',
  'tenant_repayment',
  'agent_repayment',
  'partner_funding',
  'share_capital',
  // Rent engine
  'rent_disbursement',
  'rent_receivable_created',
  'rent_principal_collected',
  // ROI system
  'roi_expense',
  'roi_wallet_credit',
  'roi_reinvestment',
  // Commissions
  'agent_commission_earned',
  'agent_commission_withdrawal',
  'agent_commission_used_for_rent',
  // Wallet operations
  'wallet_withdrawal',
  'wallet_transfer',
  'wallet_deduction',
  // System
  'system_balance_correction',
  'orphan_reassignment',
  'orphan_reversal',
  // Agent float
  'agent_float_deposit',
  'agent_float_used_for_rent',
  // Portfolio
  'pending_portfolio_topup',
] as const;

export type LockedCategory = typeof LOCKED_CATEGORIES[number];
