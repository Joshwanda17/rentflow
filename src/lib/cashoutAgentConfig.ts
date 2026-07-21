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
      { id: 'proxy_partner_withdrawal', label: 'Partner Withdrawal (Proxy Initiated)', hint: 'All partner payouts — ROI, capital, profit share — initiated by a Proxy Agent. This is the single unified partner payout channel.', defaultApproval: 'finance_cfo' },
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

// ===========================================================================
// Mapping payout categories → the merchant withdrawal claim queue
// ---------------------------------------------------------------------------
// The CFO authorizes each Cash-Out Agent for specific payout categories. The
// merchant claim queue reads from `withdrawal_requests`, so we translate a
// withdrawal row into one of the config categories (using its `reason`) and
// only surface / allow claiming of the categories the agent is authorized for.
//
// A single queue "category" can map to several config category ids (e.g. the
// Agent Commissions group). `configIds` lists every config id that authorizes
// the queue category; `orPredicates` are the PostgREST predicates that select
// rows of that category server-side.
// ===========================================================================

export interface QueueCategoryDef {
  /** stable queue-category id (not necessarily a config id) */
  id: string;
  label: string;
  /** config category ids that authorize this queue category */
  configIds: string[];
  /** true if a withdrawal_requests row belongs to this category (client-side) */
  match: (w: any) => boolean;
  /** PostgREST predicate fragments that positively select this category */
  orPredicates: string[];
  /** PostgREST predicate fragments that EXCLUDE this category (for the catch-all) */
  notPredicates: string[];
}

const reasonOf = (w: any) => String(w?.reason || '').toLowerCase();

// Ordered, most-specific first. `wallet_withdrawals` is the catch-all.
export const QUEUE_CATEGORY_DEFS: QueueCategoryDef[] = [
  {
    id: 'proxy_partner_withdrawal',
    label: 'Partner Withdrawal (Proxy Initiated)',
    configIds: ['proxy_partner_withdrawal'],
    // Any partner payout — proxy-initiated wallet withdrawal OR legacy ROI/returns
    // rows that predate the unified flow — belongs to this single queue.
    match: (w) => {
      const r = reasonOf(w);
      return r.includes('proxy') || r.includes('roi') || r.includes('return');
    },
    orPredicates: ['reason.ilike.*proxy*', 'reason.ilike.*roi*', 'reason.ilike.*return*'],
    notPredicates: ['reason.not.ilike.*proxy*', 'reason.not.ilike.*roi*', 'reason.not.ilike.*return*'],
  },
  {
    id: 'landlord_payouts',
    label: 'Landlord Payouts',
    configIds: ['landlord_payouts'],
    match: (w) => reasonOf(w).startsWith('landlord float payout'),
    orPredicates: ['reason.ilike.Landlord float payout*'],
    notPredicates: ['reason.not.ilike.Landlord float payout*'],
  },
  {
    id: 'payroll_payments',
    label: 'Payroll Payments',
    configIds: ['payroll_payments'],
    match: (w) => /salary|payroll/.test(reasonOf(w)),
    orPredicates: ['reason.ilike.*salary*', 'reason.ilike.*payroll*'],
    notPredicates: ['reason.not.ilike.*salary*', 'reason.not.ilike.*payroll*'],
  },
  {
    id: 'agent_commissions',
    label: 'Agent Commissions',
    configIds: ['cashout_commission', 'rent_collection_commission', 'partner_commission'],
    match: (w) => reasonOf(w).includes('commission'),
    orPredicates: ['reason.ilike.*commission*'],
    notPredicates: ['reason.not.ilike.*commission*'],
  },
  {
    id: 'wallet_withdrawals',
    label: 'Wallet Withdrawals',
    configIds: ['wallet_withdrawals'],
    match: () => true, // catch-all — any withdrawal that isn't one of the above
    orPredicates: [], // handled specially (negation of every special category)
    notPredicates: [],
  },
];

const SPECIAL_QUEUE_DEFS = QUEUE_CATEGORY_DEFS.filter((d) => d.id !== 'wallet_withdrawals');
const WALLET_QUEUE_DEF = QUEUE_CATEGORY_DEFS.find((d) => d.id === 'wallet_withdrawals')!;

/** Resolve which queue category a withdrawal_requests row belongs to. */
export function getWithdrawalQueueCategory(withdrawal: any): QueueCategoryDef {
  return QUEUE_CATEGORY_DEFS.find((d) => d.match(withdrawal)) || WALLET_QUEUE_DEF;
}

/** Is any config id backing this queue category enabled? */
function isQueueCategoryAuthorized(config: CashoutAgentConfig, def: QueueCategoryDef): boolean {
  return def.configIds.some((id) => !!config.categories[id]);
}

/** Client-side gate: may this agent claim/see this specific withdrawal? */
export function isWithdrawalCategoryAuthorized(config: CashoutAgentConfig | null, withdrawal: any): boolean {
  if (!config) return true; // no matrix loaded yet — don't block
  const def = getWithdrawalQueueCategory(withdrawal);
  return isQueueCategoryAuthorized(config, def);
}

/** Human-readable labels of the queue categories this agent may process. */
export function authorizedQueueCategoryLabels(config: CashoutAgentConfig | null): string[] {
  if (!config) return [];
  return QUEUE_CATEGORY_DEFS.filter((d) => isQueueCategoryAuthorized(config, d)).map((d) => d.label);
}

/**
 * Build a single PostgREST `.or()` clause that restricts a withdrawal_requests
 * query to ONLY the categories this agent is authorized to process.
 * Returns `null` when the agent is authorized for every queue category (no
 * filtering needed) so we avoid an unnecessary predicate.
 */
export function buildQueueCategoryOrClause(config: CashoutAgentConfig | null): string | null {
  if (!config) return null;
  const authorized = QUEUE_CATEGORY_DEFS.filter((d) => isQueueCategoryAuthorized(config, d));
  if (authorized.length === QUEUE_CATEGORY_DEFS.length) return null; // all allowed

  const parts: string[] = [];
  for (const def of authorized) {
    if (def.id === 'wallet_withdrawals') continue; // handled below
    parts.push(...def.orPredicates);
  }

  if (isQueueCategoryAuthorized(config, WALLET_QUEUE_DEF)) {
    // Catch-all: rows with no reason, or a reason that matches none of the
    // special categories.
    const negations = SPECIAL_QUEUE_DEFS.flatMap((d) => d.notPredicates);
    parts.push('reason.is.null');
    parts.push(`and(${negations.join(',')})`);
  }

  if (parts.length === 0) {
    // Authorized for nothing that maps to the queue — match no rows.
    return 'id.eq.00000000-0000-0000-0000-000000000000';
  }
  return parts.join(',');
}

// ===========================================================================
// Withdrawal reason presets (user-facing)
// ---------------------------------------------------------------------------
// When a user initiates a withdrawal they pick a reason. The stored reason
// string is what maps the resulting withdrawal_requests row to a payout
// category (see getWithdrawalQueueCategory) so it reaches a Cash-Out Agent
// authorized for that category. Keep the `value` strings' keywords aligned
// with QUEUE_CATEGORY_DEFS.match().
// ===========================================================================

export interface WithdrawalReasonOption {
  /** stored into withdrawal_requests.reason */
  value: string;
  label: string;
  /** the queue category this reason maps to (for reference) */
  queueCategory: string;
}

export const OTHER_WITHDRAWAL_REASON = '__other__';

export const WITHDRAWAL_REASON_OPTIONS: WithdrawalReasonOption[] = [
  { value: 'Wallet withdrawal', label: 'Personal / wallet withdrawal', queueCategory: 'wallet_withdrawals' },
  { value: 'Commission payout', label: 'Commission earnings', queueCategory: 'agent_commissions' },
  { value: 'Salary / payroll payout', label: 'Salary / payroll', queueCategory: 'payroll_payments' },
];
