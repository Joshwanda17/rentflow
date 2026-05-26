// Shared partnership email helpers used by every staff-driven (and self-service)
// portfolio flow. Centralising the payload shape avoids drift between
// fund-rent-pool, portfolio-topup, coo-create-portfolio, agent-invest-for-partner,
// approve-portfolio-topup, etc.
//
// All emails are sent via send-transactional-email which handles the unsubscribe
// token and suppression list. These helpers build the request body only.

const LOGO_URL = "https://welilereceipts.com/welile-logo.png";
const DASHBOARD_URL = "https://welilereceipts.com/auth";
const UNSUBSCRIBE_URL = "https://welile.com/unsubscribe";
const CONTACT_URL = "https://welile.com/contact";
const COMPANY_NAME = "Welile";
const CURRENCY = "UGX";

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export interface PartnershipAgreementInput {
  recipientEmail: string;
  partnerName: string | null | undefined;
  partnerId: string;            // for idempotency key scoping
  portfolioId: string;          // for idempotency key scoping
  amount: number;
  monthlyReward: number;
  contributionDateIso: string;
  firstPayoutDateIso: string;
  payoutDay: number;
  /**
   * Agreed monthly ROI % for THIS portfolio (e.g. 15, 12.5, 10).
   * Optional — when omitted the template derives it from monthlyReward/amount.
   * Pass the actual investor_portfolios.roi_percentage so partners on
   * non-15% rates see their real rate in the email.
   */
  roiPercentage?: number;
}

export function buildPartnershipAgreementRequest(input: PartnershipAgreementInput) {
  const derivedPct = input.amount > 0
    ? Math.round((input.monthlyReward / input.amount) * 10000) / 100
    : 0;
  const pct = typeof input.roiPercentage === 'number' && input.roiPercentage > 0
    ? input.roiPercentage
    : derivedPct;
  return {
    templateName: "partnership-agreement",
    recipientEmail: input.recipientEmail,
    idempotencyKey: `partnership-agreement-${input.partnerId}-${input.portfolioId}`,
    templateData: {
      partner_name: input.partnerName || "Partner",
      partnership_amount: input.amount,
      contribution_date: formatLongDate(input.contributionDateIso),
      monthly_return_amount: input.monthlyReward,
      total_projected_return: input.monthlyReward * 12,
      roi_percentage: pct,
      first_payment_date: formatLongDate(input.firstPayoutDateIso),
      roi_payment_day: input.payoutDay,
      currency: CURRENCY,
      company_name: COMPANY_NAME,
      logo_url: LOGO_URL,
      dashboard_url: DASHBOARD_URL,
    },
  };
}

export interface PartnershipTopupInput {
  recipientEmail: string;
  partnerName: string | null | undefined;
  partnerId: string;             // idempotency scoping
  txGroupId: string;             // idempotency scoping (one email per top-up tx)
  topupAmount: number;
  previousPortfolioValue: number;
  newTotalPartnershipValue: number;
  /** Agreed monthly ROI % for the portfolio receiving this top-up. */
  roiPercentage?: number;
  /** Optional: monthly reward AMOUNT after top-up (UGX). Derived from roiPercentage * newTotal when omitted. */
  monthlyReturnAmount?: number;
}

export function buildPartnershipTopupRequest(input: PartnershipTopupInput) {
  return {
    templateName: "partnership-topup",
    recipientEmail: input.recipientEmail,
    idempotencyKey: `partnership-topup-${input.partnerId}-${input.txGroupId}`,
    templateData: {
      partner_name: input.partnerName || "Partner",
      topup_amount: input.topupAmount,
      previous_portfolio_value: input.previousPortfolioValue,
      new_total_partnership_value: input.newTotalPartnershipValue,
      roi_percentage: typeof input.roiPercentage === 'number' && input.roiPercentage > 0
        ? input.roiPercentage
        : undefined,
      monthly_return_amount: typeof input.monthlyReturnAmount === 'number' && input.monthlyReturnAmount > 0
        ? input.monthlyReturnAmount
        : undefined,
      currency: CURRENCY,
      company_name: COMPANY_NAME,
      logo_url: LOGO_URL,
      unsubscribe_url: UNSUBSCRIBE_URL,
      dashboard_url: DASHBOARD_URL,
    },
  };
}

export interface PartnerCompoundInput {
  recipientEmail: string;
  partnerName: string | null | undefined;
  partnerId: string;             // idempotency scoping
  portfolioId: string;           // idempotency scoping + shown in email
  paymentNumber: number;         // idempotency scoping (one email per cycle)
  initialAmount: number;         // portfolio value before compounding
  roiPercentage?: number;        // e.g. 15 for "15%"; derived from amounts when omitted
  returnAmount: number;          // monetary amount earned this cycle
  newTotal: number;              // portfolio value after compounding
  compoundDateIso?: string;      // defaults to now
}

function ordinalDay(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

function formatOrdinalDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `${ordinalDay(day)} of ${month}, ${year}`;
}

function shortPortfolioId(portfolioId: string): string {
  // Render UUID as PF-XXXXXXXX (first 8 chars of the hex, uppercased)
  const compact = portfolioId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `PF-${compact}`;
}

export function buildPartnerCompoundRequest(input: PartnerCompoundInput) {
  const compoundIso = input.compoundDateIso || new Date().toISOString();
  const derivedPct = input.initialAmount > 0
    ? Math.round((input.returnAmount / input.initialAmount) * 10000) / 100
    : 0;
  const pct = typeof input.roiPercentage === 'number' && input.roiPercentage > 0
    ? input.roiPercentage
    : derivedPct;
  return {
    // Existing partners (auto cron compound on a live portfolio).
    // First-time partners who choose compound at portfolio creation
    // still use the original `partner-compound` template.
    templateName: "partner-portfolio-compounded",
    recipientEmail: input.recipientEmail,
    idempotencyKey: `partner-portfolio-compounded-${input.partnerId}-${input.portfolioId}-${input.paymentNumber}`,
    templateData: {
      partner_name: input.partnerName || "Partner",
      portfolio_id: shortPortfolioId(input.portfolioId),
      compound_date: formatOrdinalDate(compoundIso),
      initial_partnership_amount: input.initialAmount,
      roi_return: `${pct}%`,
      roi_percentage: pct,
      return_amount: input.returnAmount,
      new_total_partnership_value: input.newTotal,
      // Cycle index for this compounding event (1-based). The template
      // uses this to reconstruct a per-cycle breakdown that adds up to
      // the new total partnership value.
      payment_number: input.paymentNumber,
      currency: CURRENCY,
      company_name: COMPANY_NAME,
      logo_url: LOGO_URL,
      unsubscribe_url: UNSUBSCRIBE_URL,
      dashboard_url: DASHBOARD_URL,
    },
  };
}

export interface ReturnsDisbursementInput {
  recipientEmail: string;
  partnerName: string | null | undefined;
  partnerId: string;
  txGroupId: string;             // idempotency scoping
  amount: number;
  transactionId: string;         // human-readable ref shown in email
  portfolioCode?: string;
  walletIdLast4?: string;
  payoutMethod?: string;         // e.g. "Wallet" / "Mobile Money"
  isManagedByAgent?: boolean;
  agentName?: string;
  /** Agreed monthly ROI % of the source portfolio (e.g. 15, 12, 10). */
  roiPercentage?: number;
  /** Source portfolio principal (UGX). Enables % derivation if roiPercentage is omitted. */
  principalAmount?: number;
}

export function buildReturnsDisbursementRequest(input: ReturnsDisbursementInput) {
  return {
    templateName: "returns-disbursement-confirmation",
    recipientEmail: input.recipientEmail,
    idempotencyKey: `returns-disbursement-${input.partnerId}-${input.txGroupId}`,
    templateData: {
      partner_name: input.partnerName || "Partner",
      transaction_id: input.transactionId,
      portfolio_code: input.portfolioCode || "",
      amount: input.amount,
      currency: CURRENCY,
      date: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      payout_method: input.payoutMethod || "Wallet",
      payout_method_last4digit: input.walletIdLast4 || "",
      company_name: COMPANY_NAME,
      logo_url: LOGO_URL,
      is_managed_by_agent: !!input.isManagedByAgent,
      agent_name: input.agentName || "",
      roi_percentage: typeof input.roiPercentage === 'number' && input.roiPercentage > 0
        ? input.roiPercentage
        : undefined,
      principal_amount: typeof input.principalAmount === 'number' && input.principalAmount > 0
        ? input.principalAmount
        : undefined,
      unsubscribe_url: UNSUBSCRIBE_URL,
      contact_url: CONTACT_URL,
    },
  };
}

/**
 * Fire-and-forget POST to the send-transactional-email edge function.
 * Never throws — failures are logged to console only so the calling flow
 * is unaffected.
 */
export function dispatchTransactionalEmail(
  supabaseUrl: string,
  serviceKey: string,
  request: Record<string, unknown>,
  logTag = "partnership-emails",
) {
  fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(request),
  }).catch((err) =>
    console.warn(`[${logTag}] transactional email enqueue failed:`, err),
  );
}

/**
 * Look up the active, approved, MANAGED proxy assignment for a partner.
 * Returns the agent's profile when the partner is "managed by a proxy
 * agent" (is_managed_account=true). Otherwise returns null.
 *
 * When a managed proxy exists, wallet-bound payouts MUST be routed to the
 * agent's wallet, and the partner gets a notification email naming the
 * agent. The agent gets a separate "proxy payout received" email.
 */
export async function resolveManagedProxy(
  supabase: any,
  partnerId: string,
): Promise<null | {
  assignmentId: string;
  agentId: string;
  agentName: string | null;
  agentEmail: string | null;
}> {
  if (!partnerId) return null;
  const { data: assignment, error } = await supabase
    .from('proxy_agent_assignments')
    .select('id, agent_id, is_managed_account, is_active, approval_status')
    .eq('beneficiary_id', partnerId)
    .eq('is_active', true)
    .eq('is_managed_account', true)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !assignment) return null;

  const { data: agentProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', assignment.agent_id)
    .maybeSingle();

  return {
    assignmentId: assignment.id,
    agentId: assignment.agent_id,
    agentName: agentProfile?.full_name ?? null,
    agentEmail: agentProfile?.email ?? null,
  };
}

export interface ProxyManagedPayoutInput {
  recipientEmail: string;
  agentName: string | null | undefined;
  agentId: string;
  partnerName: string | null | undefined;
  partnerId: string;
  amount: number;
  transactionId: string;
  txGroupId: string;            // idempotency scoping
  payoutKind?: string;          // e.g. "Monthly Returns"
  reason?: string;
}

export function buildProxyManagedPayoutRequest(input: ProxyManagedPayoutInput) {
  return {
    templateName: 'proxy-managed-payout-notice',
    recipientEmail: input.recipientEmail,
    idempotencyKey: `proxy-managed-payout-${input.agentId}-${input.partnerId}-${input.txGroupId}`,
    templateData: {
      agent_name: input.agentName || 'Agent',
      partner_name: input.partnerName || 'your partner',
      amount: input.amount,
      currency: CURRENCY,
      transaction_id: input.transactionId,
      payout_kind: input.payoutKind || 'Returns Payout',
      date: formatLongDate(new Date().toISOString()),
      reason: input.reason || 'Managed Proxy Account',
    },
  };
}