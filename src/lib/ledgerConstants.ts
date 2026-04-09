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
