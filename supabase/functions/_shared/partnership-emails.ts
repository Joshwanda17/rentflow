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
}

export function buildPartnershipAgreementRequest(input: PartnershipAgreementInput) {
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