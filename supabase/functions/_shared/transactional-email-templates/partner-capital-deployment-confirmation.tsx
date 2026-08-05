import * as React from 'npm:react@18.3.1'
import {
  Body,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './types.ts'

/**
 * Partner capital deployment confirmation.
 *
 * Sent to a self-managing partner the moment a deployment succeeds — either a
 * brand-new monthly portfolio or a top-up into the running one. Fully data
 * driven: the tenant allocation rows come from `tenants`, nothing is hardcoded.
 */
interface TenantAllocation {
  name?: string
  amount?: string | number
  location?: string
  status?: string
}

interface PartnerCapitalDeploymentProps {
  partner_name?: string
  deployed_amount?: string | number
  tenants?: TenantAllocation[]
  tenant_count?: number | string
  portfolio_total?: string | number
  monthly_rate?: number | string
  monthly_return?: string | number
  term_months?: number | string
  deployed_on?: string
  next_payout?: string
  term_ends?: string
  is_topup?: boolean
  currency?: string
  company_name?: string
  logo_url?: string
  unsubscribe_url?: string
  dashboard_url?: string
}

const formatAmount = (amount: string | number | undefined, currency: string) => {
  if (amount === undefined || amount === null || amount === '') return `${currency} 0`
  const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''))
  if (Number.isNaN(num)) return `${currency} ${amount}`
  return `${currency} ${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function PartnerCapitalDeploymentConfirmation({
  partner_name = 'Partner',
  deployed_amount = 0,
  tenants = [],
  tenant_count,
  portfolio_total,
  monthly_rate = 15,
  monthly_return,
  term_months = 1,
  deployed_on = '',
  next_payout = '',
  term_ends = '',
  is_topup = false,
  currency = 'UGX',
  company_name = 'Welile',
  logo_url = 'https://welile.tech/welile-logo.png',
  unsubscribe_url = 'https://welile.com/unsubscribe',
  dashboard_url = 'https://welile.tech/auth',
}: PartnerCapitalDeploymentProps) {
  const year = new Date().getFullYear()
  const rows = Array.isArray(tenants) ? tenants : []
  const lines = Number(tenant_count ?? rows.length) || rows.length
  const formattedDeployed = formatAmount(deployed_amount, currency)
  const total = portfolio_total === undefined || portfolio_total === null || portfolio_total === ''
    ? deployed_amount
    : portfolio_total
  const formattedTotal = formatAmount(total, currency)
  const ratePct = Number(monthly_rate) || 0
  const deployedNum = Number(String(deployed_amount).replace(/,/g, '')) || 0
  const monthlyNum = monthly_return === undefined || monthly_return === null || monthly_return === ''
    ? Math.round((deployedNum * ratePct) / 100)
    : Number(String(monthly_return).replace(/,/g, '')) || 0
  const formattedMonthly = formatAmount(monthlyNum, currency)
  const headline = is_topup ? 'Capital Added To Your Portfolio' : 'Capital Deployed'

  return (
    <Html>
      <Head>
        <style>{clientOverrides}</style>
      </Head>
      <Preview>{headline} — {formattedDeployed} supporting {lines} tenant{lines === 1 ? '' : 's'}</Preview>
      <Body style={main}>
        <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={bgTable}>
          <tbody><tr><td align="center" style={{ padding: '40px 10px' }}>

            <table width={600} border={0} cellPadding={0} cellSpacing={0} role="presentation" className="responsive-table" style={contentCard}>
              <tbody>
                <tr><td height={6} style={accentBar}></td></tr>

                <tr>
                  <td className="padding-mobile" style={headerCell}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                      <tbody><tr>
                        <td align="left" valign="middle">
                          <Img src={logo_url} alt={`${company_name} Technologies Limited`} width="130" style={logoImg} />
                        </td>
                        <td align="right" valign="middle" className="hide-mobile" style={secureLabel}>
                          Portfolio Confirmation
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="left" className="padding-mobile" style={{ padding: '40px 40px 20px 40px' }}>
                    <Heading style={heroH1}>{headline}</Heading>
                    <Text style={greetingText}>Dear {partner_name},</Text>
                    <Text style={{ ...introText, margin: 0 }}>
                      Your capital of <strong>{formattedDeployed}</strong> has been deployed and is
                      {' '}earning from today. It now supports <strong>{lines}</strong> tenant rent plan
                      {lines === 1 ? '' : 's'} under {company_name} Technologies Limited. Your principal is
                      never reduced by tenant outcomes.
                    </Text>
                  </td>
                </tr>

                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 30px 40px' }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={highlightCard}>
                      <tbody>
                        <tr>
                          <td align="center" style={highlightInner}>
                            <Text style={highlightEyebrow}>Deployed Now</Text>
                            <Text style={highlightValue}>{formattedDeployed}</Text>
                            <Text style={highlightSub}>
                              {ratePct > 0 ? <>{ratePct}% monthly · approximately {formattedMonthly} per month</> : 'Earning from today'}
                            </Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                {rows.length > 0 ? (
                  <tr>
                    <td className="padding-mobile" style={{ padding: '0 40px 30px 40px' }}>
                      <Text style={sectionLabel}>Tenant allocations</Text>
                      <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={listTable}>
                        <tbody>
                          {rows.map((t, i) => (
                            <tr key={i}>
                              <td style={listCellLeft}>
                                <Text style={tenantName}>{t?.name || 'Tenant'}</Text>
                                {t?.location ? <Text style={tenantMeta}>{t.location}</Text> : null}
                              </td>
                              <td align="right" style={listCellRight}>
                                <Text style={tenantAmount}>{formatAmount(t?.amount, currency)}</Text>
                                {t?.status ? <Text style={tenantMeta}>{t.status}</Text> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}

                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 30px 40px' }}>
                    <Text style={sectionLabel}>Portfolio overview</Text>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={listTable}>
                      <tbody>
                        <tr>
                          <td className="td-block" style={overviewCell}>
                            <Text style={overviewKey}>Portfolio value</Text>
                            <Text style={overviewValue}>{formattedTotal}</Text>
                          </td>
                          <td className="td-block" style={overviewCell}>
                            <Text style={overviewKey}>Monthly return</Text>
                            <Text style={overviewValue}>{formattedMonthly}</Text>
                          </td>
                        </tr>
                        <tr>
                          <td className="td-block" style={overviewCell}>
                            <Text style={overviewKey}>Term</Text>
                            <Text style={overviewValue}>{term_months} month{Number(term_months) === 1 ? '' : 's'}</Text>
                          </td>
                          <td className="td-block" style={overviewCell}>
                            <Text style={overviewKey}>Deployed on</Text>
                            <Text style={overviewValue}>{deployed_on || '—'}</Text>
                          </td>
                        </tr>
                        <tr>
                          <td className="td-block" style={overviewCell}>
                            <Text style={overviewKey}>Next payout</Text>
                            <Text style={overviewValue}>{next_payout || '—'}</Text>
                          </td>
                          <td className="td-block" style={overviewCell}>
                            <Text style={overviewKey}>Term ends</Text>
                            <Text style={overviewValue}>{term_ends || '—'}</Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 40px 40px' }}>
                    <Text style={outroText}>
                      You manage this portfolio yourself — you chose these tenant plans, and you can
                      track every shilling as it accrues.
                    </Text>
                    <Text style={{ ...outroText, margin: '20px 0 0 0' }}>
                      Any questions about this deployment, reach us at{' '}
                      <Link href="mailto:partnership@welile.com" style={inlineLink}>partnership@welile.com</Link>.
                    </Text>
                    <Text style={signatureText}>
                      Warm regards,<br />
                      <span style={signatureSub}>{company_name} Technologies Limited</span>
                    </Text>
                  </td>
                </tr>

                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 40px 40px' }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={ctaCard}>
                      <tbody>
                        <tr>
                          <td align="center" style={ctaInner}>
                            <Text style={ctaEyebrow}>Your Partner Dashboard</Text>
                            <Heading as="h2" style={ctaHeadline}>Track every shilling, in real time.</Heading>
                            <Text style={ctaSubtext}>
                              Sign in to watch returns accrue on this portfolio and download statements anytime.
                            </Text>
                            <table border={0} cellPadding={0} cellSpacing={0} role="presentation" align="center" style={{ margin: '8px auto 0 auto' }}>
                              <tbody><tr>
                                <td align="center" style={ctaButtonCell}>
                                  <Link
                                    href={dashboard_url}
                                    style={ctaButton}
                                    dangerouslySetInnerHTML={{ __html: 'View portfolio details&nbsp;&rarr;' }}
                                  />
                                </td>
                              </tr></tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style={taglineCell}>
                    <Text style={taglineText}>
                      <em>"{company_name} is turning rent into an asset."</em>
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>

            <table width={600} border={0} cellPadding={0} cellSpacing={0} role="presentation" className="responsive-table" style={{ marginTop: '30px' }}>
              <tbody><tr>
                <td align="center" style={{ padding: '0 20px' }}>
                  <Text style={footerCompanyName}>{company_name} Technologies Limited</Text>
                  <Text style={footerDisclaimer}>
                    This is a transactional confirmation of capital you deployed on {company_name}.
                  </Text>
                  <Text style={{ margin: '0 0 15px 0', textAlign: 'center' as const }}>
                    <Link href="https://welile.com/company-profile" style={footerLink}>Privacy Policy</Link>
                    <Link href="https://welile.com/company-profile" style={footerLink}>Terms of Service</Link>
                    <Link href={unsubscribe_url} style={footerLink}>Unsubscribe</Link>
                  </Text>
                  <Text style={footerCopyText}>© {year} {company_name}. All rights reserved.</Text>
                </td>
              </tr></tbody>
            </table>

          </td></tr></tbody>
        </table>
      </Body>
    </Html>
  )
}

const BRAND = '#7b19d4'
const BRAND_DEEP = '#5a129e'
const ACCENT_BG = '#fcf9ff'
const INK = '#0f172a'
const BODY_COLOR = '#475569'
const SUB = '#64748b'
const MUTED = '#94a3b8'
const BORDER = '#e2e8f0'
const HAIRLINE = '#f1f5f9'
const PAGE_BG = '#f4f7f9'
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const clientOverrides = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  table { border-collapse: collapse !important; }
  body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a { color: ${BRAND}; text-decoration: none; font-weight: 600; }
  a:hover { color: ${BRAND_DEEP}; text-decoration: underline; }
  @media screen and (max-width: 600px) {
    .responsive-table { width: 100% !important; max-width: 100% !important; }
    .padding-mobile { padding: 25px 20px !important; }
    .td-block { display: block !important; width: 100% !important; text-align: left !important; }
    .hide-mobile { display: none !important; }
  }
`

const main: React.CSSProperties = { margin: 0, padding: 0, backgroundColor: PAGE_BG, fontFamily: FONT_STACK, WebkitFontSmoothing: 'antialiased' }
const bgTable: React.CSSProperties = { backgroundColor: PAGE_BG }
const contentCard: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }
const accentBar: React.CSSProperties = { backgroundColor: BRAND, backgroundImage: `linear-gradient(90deg, ${BRAND} 0%, #a855f7 100%)` }
const headerCell: React.CSSProperties = { padding: '30px 40px', borderBottom: `1px solid ${HAIRLINE}` }
const logoImg: React.CSSProperties = { display: 'block', maxWidth: '130px', height: 'auto' }
const secureLabel: React.CSSProperties = { fontSize: '11px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }
const heroH1: React.CSSProperties = { margin: '0 0 15px 0', color: INK, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }
const greetingText: React.CSSProperties = { margin: '0 0 15px 0', color: INK, fontSize: '16px', fontWeight: 600 }
const introText: React.CSSProperties = { margin: '0 0 15px 0', color: BODY_COLOR, fontSize: '15px', lineHeight: '24px' }

const highlightCard: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fafaf9' }
const highlightInner: React.CSSProperties = { backgroundColor: ACCENT_BG, padding: '30px 20px' }
const highlightEyebrow: React.CSSProperties = { margin: '0 0 10px 0', color: SUB, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }
const highlightValue: React.CSSProperties = { margin: '0 0 5px 0', color: BRAND, fontSize: '34px', fontWeight: 800, letterSpacing: '-1px' }
const highlightSub: React.CSSProperties = { margin: 0, color: MUTED, fontSize: '13px', fontWeight: 500 }

const sectionLabel: React.CSSProperties = { margin: '0 0 10px 0', color: SUB, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }
const listTable: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }
const listCellLeft: React.CSSProperties = { padding: '14px 16px', borderBottom: `1px solid ${HAIRLINE}` }
const listCellRight: React.CSSProperties = { padding: '14px 16px', borderBottom: `1px solid ${HAIRLINE}`, textAlign: 'right' as const }
const tenantName: React.CSSProperties = { margin: 0, color: INK, fontSize: '14px', fontWeight: 700 }
const tenantAmount: React.CSSProperties = { margin: 0, color: INK, fontSize: '14px', fontWeight: 700 }
const tenantMeta: React.CSSProperties = { margin: '3px 0 0 0', color: MUTED, fontSize: '12px' }

const overviewCell: React.CSSProperties = { padding: '14px 16px', borderBottom: `1px solid ${HAIRLINE}`, width: '50%', verticalAlign: 'top' as const }
const overviewKey: React.CSSProperties = { margin: 0, color: MUTED, fontSize: '12px', fontWeight: 600 }
const overviewValue: React.CSSProperties = { margin: '4px 0 0 0', color: INK, fontSize: '15px', fontWeight: 700 }

const outroText: React.CSSProperties = { margin: 0, color: BODY_COLOR, fontSize: '14px', lineHeight: '24px' }
const inlineLink: React.CSSProperties = { color: BRAND, textDecoration: 'none', fontWeight: 600 }
const signatureText: React.CSSProperties = { margin: '25px 0 0 0', color: INK, fontSize: '15px', fontWeight: 600 }
const signatureSub: React.CSSProperties = { fontWeight: 400, color: BODY_COLOR }

const taglineCell: React.CSSProperties = { padding: '20px 40px', textAlign: 'center' as const, borderTop: '1px solid #e5e7eb' }
const taglineText: React.CSSProperties = { margin: 0, color: MUTED, fontSize: '12px', lineHeight: '18px', fontWeight: 500 }

const ctaCard: React.CSSProperties = {
  borderRadius: '14px',
  overflow: 'hidden',
  backgroundColor: BRAND,
  backgroundImage: `linear-gradient(135deg, #2a0b4d 0%, ${BRAND} 55%, #a855f7 100%)`,
  boxShadow: '0 8px 24px rgba(123, 25, 212, 0.25)',
}
const ctaInner: React.CSSProperties = { padding: '36px 28px' }
const ctaEyebrow: React.CSSProperties = { margin: '0 0 8px 0', color: '#e9d5ff', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }
const ctaHeadline: React.CSSProperties = { margin: '0 0 12px 0', color: '#ffffff', fontSize: '22px', fontWeight: 800, lineHeight: '28px', letterSpacing: '-0.4px' }
const ctaSubtext: React.CSSProperties = { margin: '0 0 22px 0', color: '#f3e8ff', fontSize: '14px', lineHeight: '22px', fontWeight: 400 }
const ctaButtonCell: React.CSSProperties = { borderRadius: '10px', backgroundColor: '#ffffff' }
const ctaButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '14px 26px',
  color: BRAND_DEEP,
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
  borderRadius: '10px',
}

const footerCompanyName: React.CSSProperties = { margin: '0 0 12px 0', color: MUTED, fontSize: '14px', fontWeight: 700, textAlign: 'center' as const }
const footerDisclaimer: React.CSSProperties = { margin: '0 0 20px 0', color: MUTED, fontSize: '12px', lineHeight: '18px', textAlign: 'center' as const }
const footerLink: React.CSSProperties = { color: MUTED, fontSize: '12px', textDecoration: 'underline', margin: '0 10px' }
const footerCopyText: React.CSSProperties = { margin: 0, color: '#cbd5e1', fontSize: '12px', textAlign: 'center' as const }

export const template = {
  component: PartnerCapitalDeploymentConfirmation,
  subject: (data: Record<string, any>) => {
    const formatted = formatAmount(data?.deployed_amount, data?.currency || 'UGX')
    return data?.is_topup
      ? `Welile — ${formatted} added to your portfolio`
      : `Welile — ${formatted} deployed to your portfolio`
  },
  displayName: 'Partner Capital Deployment Confirmation',
  previewData: {
    partner_name: 'Ssenkaali Pius',
    deployed_amount: 5_000_000,
    tenants: [
      { name: 'Mukasa Gerald', amount: 2_000_000, location: 'Kira, Wakiso', status: 'Active' },
      { name: 'Nakato Sarah', amount: 1_500_000, location: 'Nansana, Wakiso', status: 'Active' },
      { name: 'Okello Brian', amount: 1_500_000, location: 'Ntinda, Kampala', status: 'Active' },
    ],
    portfolio_total: 5_000_000,
    monthly_rate: 15,
    monthly_return: 750_000,
    term_months: 1,
    deployed_on: '5 Aug 2026',
    next_payout: '5 Sept 2026',
    term_ends: '5 Sept 2026',
    is_topup: false,
    currency: 'UGX',
    company_name: 'Welile',
    logo_url: 'https://welile.tech/welile-logo.png',
    unsubscribe_url: 'https://welile.com/unsubscribe',
    dashboard_url: 'https://welile.tech/auth',
  },
} satisfies TemplateEntry
