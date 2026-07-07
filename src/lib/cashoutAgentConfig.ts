/**
 * Cash-Out (merchant) Agent permission matrix.
 *
 * The CFO configures, per Cash-Out Agent, not just HOW they pay (channels) but
 * WHAT categories of payouts they may process, WHICH approval workflow applies,
 * HOW MUCH they can move, and WHAT security controls are enforced.
 *
 * The whole matrix is persisted in `cashout_agents.config` (jsonb). The legacy
 * boolean columns (`handles_cash/bank/mtn/airtel`) are kept in sync from
 * `channels`/`networks` so existing routing & filters keep working.
 */

export type ApprovalRule =
  | 'none'
  | 'finance'
  | 'finance_cfo'
  | 'cfo_only'
  | 'operations_cfo'
  | 'credit_committee';

export const APPROVAL_RULES: { value: ApprovalRule; label: string }[] = [
  { value: 'none', label: 'No approval' },
  { value: 'finance', label: 'Finance Approval' },
  { value: 'finance_cfo', label: 'Finance + CFO' },
  { value: 'cfo_only', label: 'CFO Only' },
  { value: 'operations_cfo', label: 'Operations + CFO' },
  { value: 'credit_committee', label: 'Credit Committee' },
];

export type AgentStatus = 'active' | 'suspended' | 'blocked' | 'under_review' | 'on_leave';

export const AGENT_STATUSES: { value: AgentStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'on_leave', label: 'On Leave' },
];

/** Authorized payout categories, grouped for the UI. */
export interface PayoutCategory {
  id: string;
  label: string;
  hint?: string;
  /** default approval rule when the category is first enabled */
  defaultApproval: ApprovalRule;
}

export interface PayoutCategoryGroup {
  group: string;
  items: PayoutCategory[];
}

export const PAYOUT_CATEGORY_GROUPS: PayoutCategoryGroup[] = [
  {
    group: 'Customer Withdrawals',
    items: [
      { id: 'wallet_withdrawals', label: 'Wallet Withdrawals', hint: 'Users withdrawing money from their wallets.', defaultApproval: 'finance' },
    ],
  },
  {
    group: 'Merchant Settlements',
    items: [
      { id: 'merchant_settlement', label: 'Merchant Settlement', hint: 'Reimburse cash-out merchants after they pay customers.', defaultApproval: 'finance_cfo' },
    ],
  },
  {
    group: 'Proxy Partner Withdrawals',
    items: [
      { id: 'proxy_partner_withdrawal', label: 'Proxy Partner Withdrawal', hint: 'Withdrawals routed through proxy / managed partners.', defaultApproval: 'finance_cfo' },
    ],
  },
  {
    group: 'Rent Disbursements',
    items: [
      { id: 'landlord_payouts', label: 'Landlord Payouts', hint: 'Monthly landlord rent disbursements.', defaultApproval: 'operations_cfo' },
    ],
  },
  {
    group: 'Welile Homes Payouts',
    items: [
      { id: 'welile_homes_settlement', label: 'Welile Homes Settlement', hint: 'Property-related landlord payouts.', defaultApproval: 'operations_cfo' },
    ],
  },
  {
    group: 'Agent Commissions',
    items: [
      { id: 'cashout_commission', label: 'Cash-Out Commission', defaultApproval: 'none' },
      { id: 'rent_collection_commission', label: 'Rent Collection Commission', defaultApproval: 'none' },
      { id: 'partner_commission', label: 'Partner Commission', defaultApproval: 'none' },
    ],
  },
  {
    group: 'Rewards & Bonuses',
    items: [
      { id: 'referral_bonuses', label: 'Referral Bonuses', defaultApproval: 'none' },
      { id: 'recruiter_bonuses', label: 'Recruiter Bonuses', defaultApproval: 'none' },
      { id: 'tenant_placement_bonuses', label: 'Tenant Placement Bonuses', defaultApproval: 'none' },
      { id: 'listing_bonuses', label: 'Listing Bonuses', defaultApproval: 'none' },
      { id: 'verification_bonuses', label: 'Verification Bonuses', defaultApproval: 'none' },
    ],
  },
  {
    group: 'ROI / Supporter Returns',
    items: [
      { id: 'roi_payments', label: 'ROI Payments', hint: 'Supporter earnings and scheduled ROI disbursements.', defaultApproval: 'cfo_only' },
    ],
  },
  {
    group: 'Credit & Advances',
    items: [
      { id: 'business_advances', label: 'Business Advances', defaultApproval: 'credit_committee' },
      { id: 'credit_access', label: 'Credit Access', defaultApproval: 'credit_committee' },
      { id: 'agent_advance', label: 'Agent Advance', defaultApproval: 'cfo_only' },
    ],
  },
  {
    group: 'Payroll',
    items: [
      { id: 'payroll_payments', label: 'Payroll Payments', hint: 'Employee salary processing.', defaultApproval: 'cfo_only' },
    ],
  },
  {
    group: 'Internal Finance',
    items: [
      { id: 'cfo_direct_credit', label: 'CFO Direct Credit', defaultApproval: 'cfo_only' },
      { id: 'internal_wallet_transfers', label: 'Internal Wallet Transfers', defaultApproval: 'cfo_only' },
      { id: 'float_transfers', label: 'Float Transfers', defaultApproval: 'cfo_only' },
    ],
  },
  {
    group: 'Scheduled Payments',
    items: [
      { id: 'scheduled_payouts', label: 'Scheduled Payouts', defaultApproval: 'finance' },
      { id: 'auto_recoveries', label: 'Auto Recoveries', defaultApproval: 'none' },
      { id: 'bulk_bank_settlements', label: 'Bulk Bank Settlements', defaultApproval: 'finance_cfo' },
    ],
  },
];

export const ALL_PAYOUT_CATEGORIES: PayoutCategory[] = PAYOUT_CATEGORY_GROUPS.flatMap((g) => g.items);

export const SUPPORTED_BANKS: { id: string; label: string }[] = [
  { id: 'stanbic', label: 'Stanbic' },
  { id: 'centenary', label: 'Centenary' },
  { id: 'dfcu', label: 'DFCU' },
  { id: 'equity', label: 'Equity' },
  { id: 'postbank', label: 'PostBank' },
  { id: 'housing_finance', label: 'Housing Finance' },
];

export interface CashoutAgentConfig {
  channels: { momo: boolean; bank: boolean; cash: boolean };
  networks: { mtn: boolean; airtel: boolean };
  banks: Record<string, boolean>;
  categories: Record<string, boolean>;
  approvals: Record<string, ApprovalRule>;
  float: {
    request: boolean;
    receive: boolean;
    distribute: boolean;
    emergency: boolean;
    max: number | null;
  };
  limits: {
    daily: number | null;
    single: number | null;
    monthly: number | null;
    maxCashout: number | null;
    minCashout: number | null;
  };
  security: {
    otp: boolean;
    twoFactor: boolean;
    deviceRestriction: boolean;
    highValueVerification: boolean;
  };
  status: AgentStatus;
  ops: {
    region: string;
    district: string;
    branch: string;
    cluster: string;
    supervisor: string;
    team: string;
  };
}

export function defaultCashoutAgentConfig(): CashoutAgentConfig {
  const categories: Record<string, boolean> = {};
  const approvals: Record<string, ApprovalRule> = {};
  for (const c of ALL_PAYOUT_CATEGORIES) {
    // Sensible default: only enable the core customer-facing cash-out categories.
    categories[c.id] = ['wallet_withdrawals', 'merchant_settlement', 'cashout_commission'].includes(c.id);
    approvals[c.id] = c.defaultApproval;
  }
  const banks: Record<string, boolean> = {};
  for (const b of SUPPORTED_BANKS) banks[b.id] = false;
  return {
    channels: { momo: true, bank: true, cash: true },
    networks: { mtn: true, airtel: true },
    banks,
    categories,
    approvals,
    float: { request: false, receive: false, distribute: false, emergency: false, max: null },
    limits: { daily: null, single: null, monthly: null, maxCashout: null, minCashout: null },
    security: { otp: true, twoFactor: false, deviceRestriction: false, highValueVerification: false },
    status: 'active',
    ops: { region: '', district: '', branch: '', cluster: '', supervisor: '', team: '' },
  };
}

/** Merge a persisted config (possibly partial / legacy) with the full default shape. */
export function normalizeCashoutAgentConfig(
  raw: unknown,
  legacy?: { handles_cash?: boolean; handles_bank?: boolean; handles_mtn?: boolean; handles_airtel?: boolean; label?: string | null },
): CashoutAgentConfig {
  const def = defaultCashoutAgentConfig();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CashoutAgentConfig>;

  const merged: CashoutAgentConfig = {
    channels: { ...def.channels, ...(r.channels || {}) },
    networks: { ...def.networks, ...(r.networks || {}) },
    banks: { ...def.banks, ...(r.banks || {}) },
    categories: { ...def.categories, ...(r.categories || {}) },
    approvals: { ...def.approvals, ...(r.approvals || {}) },
    float: { ...def.float, ...(r.float || {}) },
    limits: { ...def.limits, ...(r.limits || {}) },
    security: { ...def.security, ...(r.security || {}) },
    status: (r.status as AgentStatus) || def.status,
    ops: { ...def.ops, ...(r.ops || {}) },
  };

  // If no config was ever saved, seed channels/networks from legacy boolean columns.
  if (!raw || Object.keys(raw as object).length === 0) {
    if (legacy) {
      merged.channels = {
        momo: !!(legacy.handles_mtn || legacy.handles_airtel),
        bank: !!legacy.handles_bank,
        cash: !!legacy.handles_cash,
      };
      merged.networks = { mtn: !!legacy.handles_mtn, airtel: !!legacy.handles_airtel };
    }
  }
  return merged;
}
