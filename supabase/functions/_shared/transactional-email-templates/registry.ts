import { template as testTemplate } from './test-email.tsx'
import { template as returnsDisbursementTemplate } from './returns-disbursement-confirmation.tsx'
import { template as partnerWalletDepositTemplate } from './partner-wallet-deposit.tsx'
import type { TemplateEntry } from './types.ts'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-email': testTemplate,
  'returns-disbursement-confirmation': returnsDisbursementTemplate,
  'partner-wallet-deposit': partnerWalletDepositTemplate,
}