import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ReturnsDisbursementConfirmationProps {
  partner_name?: string
  transaction_id?: string
  amount?: string | number
  currency?: string
  date?: string
  payout_method?: string
  company_name?: string
  logo_url?: string
  is_managed_by_agent?: boolean
  agent_name?: string
}

const formatAmount = (amount: string | number | undefined, currency: string) => {
  if (amount === undefined || amount === null || amount === '') return `${currency} 0`
  const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''))
  if (Number.isNaN(num)) return `${currency} ${amount}`
  return `${currency} ${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function ReturnsDisbursementConfirmation({
  partner_name = 'Partner',
  transaction_id = 'TXN-XXXXXXXX',
  amount = 0,
  currency = 'UGX',
  date = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }),
  payout_method = 'Wallet',
  company_name = 'Welile',
  logo_url = 'https://welilereceipts.com/welile-logo.png',
  is_managed_by_agent = false,
  agent_name = '',
}: ReturnsDisbursementConfirmationProps) {
  const year = new Date().getFullYear()
  const formattedAmount = formatAmount(amount, currency)

  return (
    <Html>
      <Head />
      <Preview>
        Returns disbursement of {formattedAmount} processed — Ref {transaction_id}
      </Preview>
      <Body style={main}>
        <Container style={outerContainer}>
          {/* Header */}
          <Section style={header}>
            <Img
              src={logo_url}
              alt={`${company_name} logo`}
              width="44"
              height="44"
              style={logo}
            />
            <Text style={brandName}>{company_name}</Text>
          </Section>

          {/* Card */}
          <Container style={card}>
            <Section style={titleSection}>
              <Text style={eyebrow}>Returns Notification</Text>
              <Heading style={h1}>Returns Disbursement Confirmation</Heading>
            </Section>

            <Section style={bodySection}>
              <Text style={greeting}>Dear {partner_name},</Text>
              <Text style={paragraph}>
                This is to confirm that your investment returns have been
                successfully processed and disbursed.
              </Text>

              {/* Amount Hero */}
              <Section style={amountHero}>
                <Text style={amountLabel}>Amount Disbursed</Text>
                <Text style={amountValue}>{formattedAmount}</Text>
                <Text style={amountSubtle}>Processed on {date}</Text>
              </Section>

              {/* Details Table */}
              <Section style={detailsCard}>
                <table
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={detailsTable}
                >
                  <tbody>
                    <tr>
                      <td style={detailLabelCell}>Reference ID</td>
                      <td style={detailValueCellMono}>{transaction_id}</td>
                    </tr>
                    <tr>
                      <td style={detailLabelCellBordered}>Processing Date</td>
                      <td style={detailValueCellBordered}>{date}</td>
                    </tr>
                    <tr>
                      <td style={detailLabelCellBordered}>Payout Method</td>
                      <td style={detailValueCellBordered}>{payout_method}</td>
                    </tr>
                    <tr>
                      <td style={detailLabelCellBordered}>Status</td>
                      <td style={detailValueCellBordered}>
                        <span style={statusPill}>Disbursed</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              <Text style={paragraph}>
                The funds have been released and should reflect in your
                receiving account shortly, depending on your provider's
                processing timelines.
              </Text>

              <Section style={helpBox}>
                <Text style={helpText}>
                  If you do not receive the funds within the expected
                  timeframe, please contact support with your reference ID{' '}
                  <strong style={helpStrong}>{transaction_id}</strong> for
                  assistance.
                </Text>
              </Section>

              {is_managed_by_agent && (
                <Section style={managedBox}>
                  <Text style={managedTitle}>Account Managed by Agent</Text>
                  <Text style={managedText}>
                    Your account is currently managed by an authorized proxy
                    agent on your behalf
                    {agent_name ? (
                      <>
                        ,{' '}
                        <strong style={managedStrong}>{agent_name}</strong>
                      </>
                    ) : null}
                    . This disbursement was initiated and will be delivered to
                    you through your agent. Please coordinate with them to
                    receive your funds.
                  </Text>
                </Section>
              )}
            </Section>

            <Hr style={hr} />

            <Section style={footerSection}>
              <Text style={footerCompany}>{company_name}</Text>
              <Text style={footerSystem}>Automated Notification System</Text>
              <Text style={footerCopy}>
                © {year} {company_name}. All rights reserved.
              </Text>
            </Section>
          </Container>

          <Text style={disclaimer}>
            This is a system-generated email. Please do not reply directly to
            this message.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

/* === Styles === */
const BRAND = '#7C19D6'
const BRAND_DARK = '#5D12A1'
const INK = '#0F172A'
const SUB = '#475569'
const MUTED = '#94A3B8'
const BORDER = '#E2E8F0'
const SURFACE = '#F8FAFC'

const main: React.CSSProperties = {
  backgroundColor: '#F1F5F9',
  margin: 0,
  padding: '24px 0',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  WebkitFontSmoothing: 'antialiased',
}

const outerContainer: React.CSSProperties = {
  margin: '0 auto',
  maxWidth: '600px',
  width: '100%',
  padding: '0 12px',
}

const header: React.CSSProperties = {
  textAlign: 'center',
  padding: '8px 0 20px',
}

const logo: React.CSSProperties = {
  display: 'inline-block',
  borderRadius: '10px',
}

const brandName: React.CSSProperties = {
  margin: '8px 0 0',
  color: BRAND,
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  border: `1px solid ${BORDER}`,
  boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
  overflow: 'hidden',
  padding: 0,
}

const titleSection: React.CSSProperties = {
  background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
  padding: '28px 32px 24px',
  textAlign: 'left',
}

const eyebrow: React.CSSProperties = {
  margin: '0 0 6px',
  color: 'rgba(255,255,255,0.85)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const h1: React.CSSProperties = {
  margin: 0,
  color: '#FFFFFF',
  fontSize: '22px',
  lineHeight: '28px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
}

const bodySection: React.CSSProperties = {
  padding: '28px 32px 8px',
}

const greeting: React.CSSProperties = {
  color: INK,
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 12px',
}

const paragraph: React.CSSProperties = {
  color: SUB,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 16px',
}

const amountHero: React.CSSProperties = {
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderLeft: `4px solid ${BRAND}`,
  borderRadius: '10px',
  padding: '20px 22px',
  margin: '20px 0 18px',
  textAlign: 'center',
}

const amountLabel: React.CSSProperties = {
  margin: '0 0 6px',
  color: MUTED,
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const amountValue: React.CSSProperties = {
  margin: '0 0 6px',
  color: INK,
  fontSize: '30px',
  lineHeight: '36px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
}

const amountSubtle: React.CSSProperties = {
  margin: 0,
  color: MUTED,
  fontSize: '12px',
}

const detailsCard: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: '10px',
  overflow: 'hidden',
  margin: '0 0 18px',
}

const detailsTable: React.CSSProperties = {
  borderCollapse: 'collapse',
}

const detailLabelCell: React.CSSProperties = {
  padding: '14px 18px',
  fontSize: '12px',
  color: MUTED,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  width: '40%',
  verticalAlign: 'middle',
}

const detailValueCellMono: React.CSSProperties = {
  padding: '14px 18px',
  fontSize: '13px',
  color: INK,
  fontWeight: 600,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  textAlign: 'right',
  verticalAlign: 'middle',
}

const detailLabelCellBordered: React.CSSProperties = {
  ...detailLabelCell,
  borderTop: `1px solid ${BORDER}`,
}

const detailValueCellBordered: React.CSSProperties = {
  padding: '14px 18px',
  fontSize: '13px',
  color: INK,
  fontWeight: 600,
  textAlign: 'right',
  verticalAlign: 'middle',
  borderTop: `1px solid ${BORDER}`,
}

const statusPill: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '999px',
  backgroundColor: '#DCFCE7',
  color: '#15803D',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const helpBox: React.CSSProperties = {
  backgroundColor: '#FAF5FF',
  border: `1px solid #E9D5FF`,
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '4px 0 8px',
}

const helpText: React.CSSProperties = {
  margin: 0,
  color: '#5B21B6',
  fontSize: '13px',
  lineHeight: '20px',
}

const helpStrong: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  color: '#4C1D95',
}

const managedBox: React.CSSProperties = {
  backgroundColor: '#FFFBEB',
  border: `1px solid #FDE68A`,
  borderLeft: `4px solid #F59E0B`,
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '12px 0 8px',
}

const managedTitle: React.CSSProperties = {
  margin: '0 0 6px',
  color: '#92400E',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const managedText: React.CSSProperties = {
  margin: 0,
  color: '#78350F',
  fontSize: '13px',
  lineHeight: '20px',
}

const managedStrong: React.CSSProperties = {
  color: '#78350F',
  fontWeight: 700,
}

const hr: React.CSSProperties = {
  borderColor: BORDER,
  margin: '8px 0 0',
}

const footerSection: React.CSSProperties = {
  padding: '20px 32px 24px',
  textAlign: 'center',
}

const footerCompany: React.CSSProperties = {
  margin: '0 0 2px',
  color: INK,
  fontSize: '13px',
  fontWeight: 700,
}

const footerSystem: React.CSSProperties = {
  margin: '0 0 8px',
  color: SUB,
  fontSize: '12px',
}

const footerCopy: React.CSSProperties = {
  margin: 0,
  color: MUTED,
  fontSize: '11px',
}

const disclaimer: React.CSSProperties = {
  textAlign: 'center',
  color: MUTED,
  fontSize: '11px',
  margin: '16px 0 8px',
  padding: '0 24px',
}

export const template = {
  component: ReturnsDisbursementConfirmation,
  subject: (data: Record<string, any>) =>
    `Returns Disbursement Confirmation — Ref ${data?.transaction_id ?? ''}`.trim(),
  displayName: 'Returns Disbursement Confirmation',
  previewData: {
    partner_name: 'Sarah Nakato',
    transaction_id: 'TXN-2026-04A8F3D2',
    amount: 1250000,
    currency: 'UGX',
    date: '20 April 2026',
    payout_method: 'Mobile Money (MTN)',
    company_name: 'Welile',
    logo_url: 'https://welilereceipts.com/welile-logo.png',
    is_managed_by_agent: true,
    agent_name: 'James Okello',
  },
} satisfies TemplateEntry
