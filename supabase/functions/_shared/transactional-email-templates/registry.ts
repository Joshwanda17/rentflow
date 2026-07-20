import { template as testTemplate } from './test-email.tsx'
import { template as returnsDisbursementTemplate } from './returns-disbursement-confirmation.tsx'
import { template as partnershipReturnsProcessingTemplate } from './partnership-returns-processing.tsx'
import { template as partnerWalletDepositTemplate } from './partner-wallet-deposit.tsx'
import { template as partnershipAgreementTemplate } from './partnership-agreement.tsx'
import { template as partnershipTopupTemplate } from './partnership-topup.tsx'
import { template as partnershipSplitAllocationTemplate } from './partnership-split-allocation.tsx'
import { template as partnerCompoundTemplate } from './partner-compound.tsx'
import { template as partnerPortfolioCompoundedTemplate } from './partner-portfolio-compounded.tsx'
import { template as portfolioRenewalTemplate } from './portfolio-renewal.tsx'
import { template as portfolioMaturityTemplate } from './portfolio-maturity.tsx'
import { template as partnershipMaturityNoticeTemplate } from './partnership-maturity-notice.tsx'
import { template as partnerAccountCreatedTemplate } from './partner-account-created.tsx'
import { template as databaseBackupReadyTemplate } from './database-backup-ready.tsx'
import { template as databaseBackupLinkTemplate } from './database-backup-link.tsx'
import { template as angelPoolSharePurchaseTemplate } from './angel-pool-share-purchase.tsx'
import { template as proxyManagedPayoutNoticeTemplate } from './proxy-managed-payout-notice.tsx'
import { template as operationalFloatCreditTemplate } from './operational-float-credit.tsx'
import { template as agentLandlordFloatFundedTemplate } from './agent-landlord-float-funded.tsx'
import { template as walletTransferReceivedTemplate } from './wallet-transfer-received.tsx'
import { template as walletTransferSentTemplate } from './wallet-transfer-sent.tsx'
import { template as agentTenantPaymentReceiptTemplate } from './agent-tenant-payment-receipt.tsx'
import { template as cashWithdrawalCodeTemplate } from './cash-withdrawal-code.tsx'
import { template as smsFailureAlertTemplate } from './sms-failure-alert.tsx'
import { template as dailyAgentCardTemplate } from './daily-agent-card.tsx'
import { template as subAgentInviteTemplate } from './sub-agent-invite.tsx'
import { template as residenceVerificationStatusTemplate } from './residence-verification-status.tsx'
import { template as portfolioRequestConfirmationTemplate } from './portfolio-request-confirmation.tsx'
import { template as portfolioRequestTeamAlertTemplate } from './portfolio-request-team-alert.tsx'
import { template as standingOrderCreatedTemplate } from './standing-order-created.tsx'
import { template as newWithdrawalMerchantAlertTemplate } from './new-withdrawal-merchant-alert.tsx'
import { template as withdrawalPaidReceiptTemplate } from './withdrawal-paid-receipt.tsx'
import { template as tenantPartnershipAgreementTemplate } from './tenant-partnership-agreement.tsx'
import { template as jobApplicationReceivedTemplate } from './job-application-received.tsx'
import { template as directorRequisitionNewTemplate } from './director-requisition-new.tsx'
import { template as directorRequisitionStatusTemplate } from './director-requisition-status.tsx'
import { template as redirectMonitorAlertTemplate } from './redirect-monitor-alert.tsx'
import { template as smartphoneOrderReceiptTemplate } from './smartphone-order-receipt.tsx'
import type { TemplateEntry } from './types.ts'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-email': testTemplate,
  'director-requisition-new': directorRequisitionNewTemplate,
  'director-requisition-status': directorRequisitionStatusTemplate,
  'returns-disbursement-confirmation': returnsDisbursementTemplate,
  'partnership-returns-processing': partnershipReturnsProcessingTemplate,
  'partner-wallet-deposit': partnerWalletDepositTemplate,
  'partnership-agreement': partnershipAgreementTemplate,
  'partnership-topup': partnershipTopupTemplate,
  'partnership-split-allocation': partnershipSplitAllocationTemplate,
  'partner-compound': partnerCompoundTemplate,
  'partner-portfolio-compounded': partnerPortfolioCompoundedTemplate,
  'portfolio-renewal': portfolioRenewalTemplate,
  'portfolio-maturity': portfolioMaturityTemplate,
  'partnership-maturity-notice': partnershipMaturityNoticeTemplate,
  'partner-account-created': partnerAccountCreatedTemplate,
  'database-backup-ready': databaseBackupReadyTemplate,
  'database-backup-link': databaseBackupLinkTemplate,
  'angel-pool-share-purchase': angelPoolSharePurchaseTemplate,
  'proxy-managed-payout-notice': proxyManagedPayoutNoticeTemplate,
  'operational-float-credit': operationalFloatCreditTemplate,
  'agent-landlord-float-funded': agentLandlordFloatFundedTemplate,
  'wallet-transfer-received': walletTransferReceivedTemplate,
  'wallet-transfer-sent': walletTransferSentTemplate,
  'agent-tenant-payment-receipt': agentTenantPaymentReceiptTemplate,
  'cash-withdrawal-code': cashWithdrawalCodeTemplate,
  'sms-failure-alert': smsFailureAlertTemplate,
  'daily-agent-card': dailyAgentCardTemplate,
  'sub-agent-invite': subAgentInviteTemplate,
  'residence-verification-status': residenceVerificationStatusTemplate,
  'portfolio-request-confirmation': portfolioRequestConfirmationTemplate,
  'portfolio-request-team-alert': portfolioRequestTeamAlertTemplate,
  'standing-order-created': standingOrderCreatedTemplate,
  'new-withdrawal-merchant-alert': newWithdrawalMerchantAlertTemplate,
  'withdrawal-paid-receipt': withdrawalPaidReceiptTemplate,
  'tenant-partnership-agreement': tenantPartnershipAgreementTemplate,
  'job-application-received': jobApplicationReceivedTemplate,
  'redirect-monitor-alert': redirectMonitorAlertTemplate,
  'smartphone-order-receipt': smartphoneOrderReceiptTemplate,
}