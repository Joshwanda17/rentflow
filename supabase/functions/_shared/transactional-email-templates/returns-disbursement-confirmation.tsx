import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './types.ts'

interface ReturnsDisbursementConfirmationProps {
  partner_name?: string
  transaction_id?: string
  amount?: string | number
  currency?: string
  date?: string
  payout_method?: string
  payout_method_last4digit?: string
  company_name?: string
  logo_url?: string
  is_managed_by_agent?: boolean
  agent_name?: string
  unsubscribe_url?: string
  contact_url?: string
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
  payout_method_last4digit = '',
  company_name = 'Welile',
  logo_url = 'https://welilereceipts.com/welile-logo.png',
  is_managed_by_agent = false,
  agent_name = '',
  unsubscribe_url = 'https://welile.com/unsubscribe',
  contact_url = 'https://welile.com/contact',
}: ReturnsDisbursementConfirmationProps) {
  const year = new Date().getFullYear()
  const formattedAmount = formatAmount(amount, currency)

  return (
    <Html>
      <Head>
        <style>{clientOverrides}</style>
      </Head>
      <Preview>
        Returns disbursement of {formattedAmount} processed — Ref {transaction_id}
      </Preview>
      <Body style={main}>
        {/* Main Background Table */}
        <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={bgTable}>
          <tbody><tr><td align="center" style={{ padding: '40px 10px' }}>

            {/* Main Content Container */}
            <table width={600} border={0} cellPadding={0} cellSpacing={0} role="presentation" className="responsive-table" style={contentCard}>
              <tbody>
                {/* Top Accent Gradient Bar */}
                <tr>
                  <td height={6} style={accentBar}></td>
                </tr>

                {/* Header Section */}
                <tr>
                  <td className="padding-mobile" style={headerCell}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                      <tbody><tr>
                        <td align="left" valign="middle">
                          <Img src={logo_url} alt={company_name} width="130" style={logoImg} />
                        </td>
                        <td align="right" valign="middle" className="hide-mobile" style={secureLabel}>
                          Secure Notification
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                {/* Hero Status Section */}
                <tr>
                  <td align="center" className="padding-mobile" style={{ padding: '40px 40px 20px 40px' }}>
                    <div style={iconWrap}>
                      <Img
                        src="https://img.icons8.com/ios-filled/50/7b19d4/checkmark--v1.png"
                        alt="Success"
                        width="32"
                        style={{ verticalAlign: 'middle', marginTop: '16px' }}
                      />
                    </div>
                    <Heading style={heroH1}>Disbursement Confirmed</Heading>
                    <Text style={heroSub}>Dear {partner_name},</Text>
                  </td>
                </tr>

                {/* Introduction Text */}
                <tr>
                  <td align="center" className="padding-mobile" style={{ padding: '0 40px 35px 40px' }}>
                    <Text style={introText}>
                      Great news! Your Support returns have been successfully processed, and the funds have been dispatched to your designated account.
                    </Text>
                  </td>
                </tr>

                {/* Transaction Card Container */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 40px 40px' }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={ledgerCard}>
                      <tbody>
                        {/* Highlighted Amount Header */}
                        <tr>
                          <td align="center" style={ledgerAmountHeader}>
                            <Text style={ledgerAmountLabel}>Total Disbursed</Text>
                            <Text className="amount-text" style={ledgerAmountValue}>{formattedAmount}</Text>
                          </td>
                        </tr>

                        {/* Ledger Rows */}
                        <tr>
                          <td style={{ padding: '10px 30px' }}>
                            <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                              <tbody>
                                <tr>
                                  <td style={ledgerRow}>
                                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation"><tbody><tr>
                                      <td className="td-block" width="40%" style={ledgerKey}>Reference ID</td>
                                      <td className="td-block" width="60%" align="right" style={ledgerValMono}>{transaction_id}</td>
                                    </tr></tbody></table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style={ledgerRow}>
                                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation"><tbody><tr>
                                      <td className="td-block" width="40%" style={ledgerKey}>Processing Date</td>
                                      <td className="td-block" width="60%" align="right" style={ledgerVal}>{date}</td>
                                    </tr></tbody></table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style={ledgerRowLast}>
                                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation"><tbody><tr>
                                      <td className="td-block" width="40%" style={ledgerKey}>Payout Method</td>
                                      <td className="td-block" width="60%" align="right" style={ledgerVal}>
                                        {payout_method}
                                        {payout_method_last4digit ? (
                                          <>
                                            <br />
                                            <span style={ledgerValSub}>{payout_method_last4digit}</span>
                                          </>
                                        ) : null}
                                      </td>
                                    </tr></tbody></table>
                                  </td>
                                </tr>
                                {is_managed_by_agent && agent_name ? (
                                  <tr>
                                    <td style={{ ...ledgerRow, borderBottom: 'none', borderTop: '1px dashed #e2e8f0' }}>
                                      <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation"><tbody><tr>
                                        <td className="td-block" width="40%" style={ledgerKey}>Managed By</td>
                                        <td className="td-block" width="60%" align="right" style={ledgerVal}>{agent_name} <span style={ledgerValSub}>(Proxy Agent)</span></td>
                                      </tr></tbody></table>
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                {/* Outro & Support */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 40px 40px', textAlign: 'center' }}>
                    <Text style={outroText}>
                      The funds should reflect in your receiving account shortly, depending on your provider's processing timelines.
                    </Text>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                      <tbody><tr>
                        <td align="center" style={supportCell}>
                          <Text style={supportText}>
                            Have questions?{' '}
                            <Link href={contact_url} style={supportLink}>Contact Support</Link>
                          </Text>
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Dedicated Footer Section */}
            <table width={600} border={0} cellPadding={0} cellSpacing={0} role="presentation" className="responsive-table" style={{ marginTop: '30px' }}>
              <tbody><tr>
                <td align="center" style={{ padding: '0 20px' }}>
                  {/* Social Icons */}
                  <table border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ marginBottom: '25px' }}>
                    <tbody><tr>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://x.com/Welile2025"><Img src="https://img.icons8.com/ios-filled/50/94a3b8/twitter.png" alt="Twitter" width="22" style={socialIcon} /></a>
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://ug.linkedin.com/company/welile"><Img src="https://img.icons8.com/ios-filled/50/94a3b8/linkedin.png" alt="LinkedIn" width="22" style={socialIcon} /></a>
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://www.facebook.com/profile.php?id=61578974799814"><Img src="https://img.icons8.com/ios-filled/50/94a3b8/facebook-new.png" alt="Facebook" width="22" style={socialIcon} /></a>
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://www.instagram.com/welile_technologies/"><Img src="https://img.icons8.com/ios-filled/50/94a3b8/instagram-new.png" alt="Instagram" width="22" style={socialIcon} /></a>
                      </td>
                    </tr></tbody>
                  </table>

                  <Text style={footerCompanyName}>{company_name} Financial Services</Text>
                  <Text style={footerDisclaimer}>
                    You are receiving this email because you are a registered partner at {company_name}.<br />
                    This is an automated notification. Please do not reply directly to this email.
                  </Text>
                  <Text style={{ margin: '0 0 15px 0' }}>
                    <Link href="https://welile.com/company-profile" style={footerLink}>Privacy Policy</Link>
                    <Link href="https://welile.com/company-profile" style={footerLink}>Terms of Service</Link>
                    <Link href={unsubscribe_url} style={footerLink}>Unsubscribe</Link>
                  </Text>
                  <Text style={footerCopyText}>
                    © {year} {company_name}. All rights reserved.
                  </Text>
                </td>
              </tr></tbody>
            </table>

          </td></tr></tbody>
        </table>
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
