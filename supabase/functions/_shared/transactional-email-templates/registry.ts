import { template as testTemplate } from './test-email.tsx'
import { template as returnsDisbursementTemplate } from './returns-disbursement-confirmation.tsx'
import { template as partnerWalletDepositTemplate } from './partner-wallet-deposit.tsx'
import { template as partnershipAgreementTemplate } from './partnership-agreement.tsx'
import { template as partnershipTopupTemplate } from './partnership-topup.tsx'
import { template as partnershipSplitAllocationTemplate } from './partnership-split-allocation.tsx'
import { template as partnerCompoundTemplate } from './partner-compound.tsx'
import { template as portfolioRenewalTemplate } from './portfolio-renewal.tsx'
import { template as portfolioMaturityTemplate } from './portfolio-maturity.tsx'
import { template as partnerAccountCreatedTemplate } from './partner-account-created.tsx'
import { template as databaseBackupReadyTemplate } from './database-backup-ready.tsx'
import type { TemplateEntry } from './types.ts'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-email': testTemplate,
  'returns-disbursement-confirmation': returnsDisbursementTemplate,
  'partner-wallet-deposit': partnerWalletDepositTemplate,
  'partnership-agreement': partnershipAgreementTemplate,
  'partnership-topup': partnershipTopupTemplate,
  'partnership-split-allocation': partnershipSplitAllocationTemplate,
  'partner-compound': partnerCompoundTemplate,
  'portfolio-renewal': portfolioRenewalTemplate,
  'portfolio-maturity': portfolioMaturityTemplate,
  'partner-account-created': partnerAccountCreatedTemplate,
  'database-backup-ready': databaseBackupReadyTemplate,
}