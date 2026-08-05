/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Head, Html, Preview } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './types.ts'

/**
 * Partner capital deployment confirmation.
 *
 * Sent to a self-managing partner the moment their capital is deployed to the
 * rent requests of the tenants they selected. Table-based, inline-styled layout
 * for Gmail / Outlook (MSO) / Apple Mail / Yahoo. Fully data-driven — every
 * figure, tenant row and link comes from the payload, nothing hardcoded.
 */
interface TenantAllocation {
  tenant_name?: string
  tenant_initials?: string
  allocated_amount?: string | number
}

interface Props {
  partner_first_name?: string
  total_amount?: string | number
  tenant_count?: number | string
  tenants?: TenantAllocation[]
  portfolio_start_date?: string
  monthly_payout?: string | number
  portfolio_reference?: string
  portfolio_url?: string
  support_email?: string
  current_year?: number | string
  logo_url?: string
  unsubscribe_url?: string
}

const PURPLE = '#8B2CF5'
const NAVY = '#171B2C'
const BODY_TEXT = '#252A3A'
const SECONDARY = '#6B7280'
const PURPLE_BG = '#F7F2FF'
const NEUTRAL_BG = '#F6F7FA'
const BORDER = '#E7E9EF'
const FOOT = '#94a3b8'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** Thousands-separated figure. Accepts a pre-formatted string untouched. */
const money = (value: string | number | undefined) => {
  if (value === undefined || value === null || value === '') return '0'
  if (typeof value === 'string' && /[^0-9.,\s]/.test(value)) return value
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (Number.isNaN(num)) return String(value)
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const initialsOf = (name?: string) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'T'

const clientCss = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  table { border-collapse: collapse !important; }
  body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${NEUTRAL_BG}; }
  a { color: ${PURPLE}; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  @media screen and (max-width: 600px) {
    .responsive-table { width: 100% !important; max-width: 100% !important; }
    .padding-mobile { padding: 20px 20px !important; }
    .td-block { display: block !important; width: 100% !important; text-align: left !important; box-sizing: border-box !important; }
    .text-right-mobile-left { text-align: left !important; margin-top: 6px !important; }
    .hide-mobile { display: none !important; }
    .mobile-cta-btn { width: 100% !important; max-width: 100% !important; }
    .col-stack { display: block !important; width: 100% !important; padding-right: 0 !important; padding-left: 0 !important; padding-bottom: 16px !important; }
    .col-stack-last { display: block !important; width: 100% !important; padding-right: 0 !important; padding-left: 0 !important; padding-bottom: 0 !important; }
  }
`

export function PartnerCapitalDeploymentConfirmation({
  partner_first_name = 'Partner',
  total_amount = 0,
  tenant_count,
  tenants = [],
  portfolio_start_date = '',
  monthly_payout = 0,
  portfolio_reference = '',
  portfolio_url = 'https://welileapp.com/dashboard/funder',
  support_email = 'partnership@welile.com',
  current_year,
  logo_url = 'https://welile.tech/welile-logo.png',
  unsubscribe_url = 'https://welileapp.com/unsubscribe',
}: Props) {
  const rows = Array.isArray(tenants) ? tenants : []
  const count = Number(tenant_count ?? rows.length) || rows.length
  const year = current_year || new Date().getFullYear()
  const totalText = `UGX ${money(total_amount)}`

  const stepText = [
    'Your capital starts earning from the date it is deployed.',
    'Monthly returns will be credited to your withdrawable balance and will not be automatically compounded.',
    'At the end of the portfolio term, your principal will be returned according to the applicable settlement schedule.',
  ]

  return (
    <Html>
      <Head>
        <meta name="x-apple-disable-message-reformatting" />
        <style>{clientCss}</style>
      </Head>
      <Preview>
        {totalText} has been allocated to the rent requests of {count} selected tenant{count === 1 ? '' : 's'}.
      </Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: NEUTRAL_BG, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', color: BODY_TEXT }}>
        <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: NEUTRAL_BG }}>
          <tbody><tr><td align="center" style={{ padding: '32px 12px' }}>

            <table width={640} border={0} cellPadding={0} cellSpacing={0} role="presentation" className="responsive-table" style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <tbody>
                {/* Top accent bar */}
                <tr><td height={4} style={{ backgroundColor: PURPLE, fontSize: 0, lineHeight: 0 }}>&nbsp;</td></tr>

                {/* Header */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '24px 32px', borderBottom: `1px solid ${BORDER}` }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                      <tbody><tr>
                        <td align="left" valign="middle">
                          <img src={logo_url} alt="Welile Technologies Limited" width="130" style={{ display: 'block', maxWidth: '130px', height: 'auto' }} />
                        </td>
                        <td align="right" valign="middle" style={{ fontSize: '13px', color: SECONDARY, fontWeight: 500 }}>
                          Portfolio confirmation
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                {/* Success hero */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '32px 32px 24px 32px' }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: PURPLE_BG, borderRadius: '14px', textAlign: 'center' }}>
                      <tbody><tr>
                        <td align="center" style={{ padding: '28px 24px' }}>
                          <table border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto 16px auto' }}>
                            <tbody><tr>
                              <td align="center" valign="middle" style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: PURPLE, color: '#FFFFFF', fontSize: '20px', fontWeight: 'bold', lineHeight: '44px', textAlign: 'center' }}>
                                &#10003;
                              </td>
                            </tr></tbody>
                          </table>

                          <h1 style={{ margin: '0 0 8px 0', color: NAVY, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: '30px' }}>
                            Your support has been successfully deployed
                          </h1>
                          <p style={{ margin: '0 0 20px 0', color: SECONDARY, fontSize: '14.5px', lineHeight: '22px' }}>
                            Your capital has been allocated to the active rent requests of the tenants you selected.
                          </p>

                          <div style={{ margin: '0 0 10px 0' }}>
                            <span style={{ fontSize: '34px', fontWeight: 800, color: NAVY, letterSpacing: '-0.5px', lineHeight: '40px', display: 'inline-block' }}>
                              {totalText}
                            </span>
                          </div>

                          <table border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto' }}>
                            <tbody><tr>
                              <td style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '4px 16px' }}>
                                <span style={{ color: PURPLE, fontSize: '13.5px', fontWeight: 700 }}>
                                  Supporting {count} tenant{count === 1 ? '' : 's'}
                                </span>
                              </td>
                            </tr></tbody>
                          </table>
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                {/* Greeting */}
                <tr>
                  <td align="left" className="padding-mobile" style={{ padding: '0 32px 24px 32px' }}>
                    <p style={{ margin: '0 0 12px 0', color: NAVY, fontSize: '15px', fontWeight: 700, lineHeight: '22px' }}>
                      Hello {partner_first_name},
                    </p>
                    <p style={{ margin: 0, color: BODY_TEXT, fontSize: '15px', lineHeight: '24px' }}>
                      Thank you for supporting tenants through Welile. The funds you deployed have been
                      allocated to the rent requests of your selected tenants.
                    </p>
                  </td>
                </tr>

                {/* Tenant allocations */}
                {rows.length > 0 ? (
                  <tr>
                    <td className="padding-mobile" style={{ padding: '0 32px 28px 32px' }}>
                      <h2 style={{ margin: '0 0 4px 0', color: NAVY, fontSize: '17px', fontWeight: 700 }}>Your tenant allocations</h2>
                      <p style={{ margin: '0 0 14px 0', color: SECONDARY, fontSize: '14px' }}>Here is how your capital was distributed.</p>

                      <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', overflow: 'hidden' }}>
                        <tbody><tr>
                          <td style={{ padding: '0 20px' }}>
                            <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                              <tbody>
                                {rows.map((t, i) => (
                                  <tr key={i}>
                                    <td className="td-block" style={{ padding: '16px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${BORDER}` }}>
                                      <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                                        <tbody><tr>
                                          <td width="46" align="left" valign="middle">
                                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: PURPLE_BG, border: '1px solid #E9DBFF', color: PURPLE, fontWeight: 700, fontSize: '13px', lineHeight: '38px', textAlign: 'center', display: 'inline-block' }}>
                                              {t?.tenant_initials || initialsOf(t?.tenant_name)}
                                            </div>
                                          </td>
                                          <td align="left" valign="middle" className="td-block" style={{ paddingRight: '12px' }}>
                                            <div style={{ fontSize: '15px', fontWeight: 700, color: NAVY, wordBreak: 'break-word' }}>
                                              {t?.tenant_name || 'Tenant'}
                                            </div>
                                            <div style={{ fontSize: '12.5px', color: SECONDARY, marginTop: '2px' }}>Rent request support</div>
                                          </td>
                                          <td align="right" valign="middle" className="td-block text-right-mobile-left" style={{ whiteSpace: 'nowrap' }}>
                                            <span style={{ fontSize: '15px', fontWeight: 700, color: NAVY }}>UGX {money(t?.allocated_amount)}</span>
                                          </td>
                                        </tr></tbody>
                                      </table>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr></tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}

                {/* Portfolio overview */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '0 32px 28px 32px' }}>
                    <h2 style={{ margin: '0 0 14px 0', color: NAVY, fontSize: '17px', fontWeight: 700 }}>Portfolio overview</h2>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: NEUTRAL_BG, borderRadius: '12px' }}>
                      <tbody><tr>
                        <td style={{ padding: '20px 24px' }}>
                          <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                            <tbody><tr>
                              <td width="48%" valign="top" className="col-stack">
                                <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                                  <tbody>
                                    <tr><td style={{ padding: '10px' }}>
                                      <div style={{ color: SECONDARY, fontSize: '13px', marginBottom: '4px' }}>Total deployed</div>
                                      <div style={{ color: NAVY, fontSize: '16px', fontWeight: 800 }}>{totalText}</div>
                                    </td></tr>
                                    <tr><td style={{ padding: '10px' }}>
                                      <div style={{ color: SECONDARY, fontSize: '13px' }}>Start date</div>
                                      <div style={{ color: NAVY, fontSize: '14.5px', fontWeight: 600 }}>{portfolio_start_date || '—'}</div>
                                    </td></tr>
                                    <tr><td style={{ padding: '10px' }}>
                                      <div style={{ color: SECONDARY, fontSize: '13px' }}>Portfolio reference</div>
                                      <div style={{ color: NAVY, fontSize: '14px', fontWeight: 700, wordBreak: 'break-all', marginBottom: '8px' }}>{portfolio_reference || '—'}</div>
                                    </td></tr>
                                  </tbody>
                                </table>
                              </td>

                              <td width="4%" className="hide-mobile"></td>

                              <td width="48%" valign="top" className="col-stack-last">
                                <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                                  <tbody>
                                    <tr><td style={{ padding: '10px' }}>
                                      <div style={{ color: SECONDARY, fontSize: '13px', marginBottom: '4px' }}>Monthly payout</div>
                                      <div style={{ color: PURPLE, fontSize: '16px', fontWeight: 800 }}>UGX {money(monthly_payout)}</div>
                                    </td></tr>
                                    <tr><td style={{ padding: '10px' }}>
                                      <div style={{ color: SECONDARY, fontSize: '13px', marginBottom: '4px' }}>Tenants supported</div>
                                      <div style={{ color: NAVY, fontSize: '14.5px', fontWeight: 700 }}>{count}</div>
                                    </td></tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr></tbody>
                          </table>
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                {/* What happens next */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '0 32px 32px 32px' }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: PURPLE_BG, borderRadius: '12px' }}>
                      <tbody><tr>
                        <td style={{ padding: '22px 24px' }}>
                          <h3 style={{ margin: '0 0 16px 0', color: NAVY, fontSize: '16px', fontWeight: 700 }}>What happens next</h3>
                          <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                            <tbody>
                              {stepText.map((text, i) => (
                                <tr key={i}>
                                  <td width="30" valign="top" style={{ paddingBottom: i === stepText.length - 1 ? 0 : '14px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: PURPLE, color: '#FFFFFF', fontSize: '12px', fontWeight: 700, lineHeight: '24px', textAlign: 'center', marginLeft: '4px' }}>
                                      {i + 1}
                                    </div>
                                  </td>
                                  <td valign="top" style={{ paddingBottom: i === stepText.length - 1 ? '8px' : '14px', paddingLeft: '8px', color: BODY_TEXT, fontSize: '14px', lineHeight: '22px' }}>
                                    {text}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                {/* CTA */}
                <tr>
                  <td align="center" className="padding-mobile" style={{ padding: '0 32px 32px 32px' }}>
                    <table border={0} cellPadding={0} cellSpacing={0} width="100%" role="presentation" className="mobile-cta-btn" style={{ maxWidth: '320px', margin: '0 auto' }}>
                      <tbody><tr>
                        <td align="center" style={{ backgroundColor: PURPLE, borderRadius: '10px' }}>
                          <a
                            href={portfolio_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-block', width: '100%', padding: '16px 24px', fontSize: '15px', fontWeight: 700, color: '#FFFFFF', textDecoration: 'none', borderRadius: '10px', lineHeight: '20px', textAlign: 'center', boxSizing: 'border-box' }}
                          >
                            View portfolio details
                          </a>
                        </td>
                      </tr></tbody>
                    </table>
                    <p style={{ margin: '12px 0 0 0', color: SECONDARY, fontSize: '13px', lineHeight: '18px', textAlign: 'center' }}>
                      You can review tenant allocations, payouts, and portfolio progress from your partner dashboard.
                    </p>
                  </td>
                </tr>

                {/* Closing */}
                <tr>
                  <td align="left" className="padding-mobile" style={{ padding: '0 32px 32px 32px' }}>
                    <p style={{ margin: '0 0 16px 0', color: BODY_TEXT, fontSize: '15px', lineHeight: '24px' }}>
                      Thank you for helping tenants meet their rent obligations while building a meaningful
                      portfolio with Welile.
                    </p>
                    <p style={{ margin: 0, color: NAVY, fontSize: '15px', fontWeight: 700, lineHeight: '22px' }}>
                      Warm regards,<br />
                      <span style={{ fontWeight: 400, color: '#475569' }}>Partnership Team</span>
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Footer */}
            <table width={640} border={0} cellPadding={0} cellSpacing={0} role="presentation" className="responsive-table" style={{ marginTop: '30px' }}>
              <tbody><tr>
                <td align="center" style={{ padding: '0 20px' }}>
                  <table border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ marginBottom: '25px' }}>
                    <tbody><tr>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://x.com/Welile2025" target="_blank" rel="noreferrer"><img src="https://img.icons8.com/ios-filled/50/94a3b8/twitter.png" alt="Twitter" width="22" style={{ display: 'block', opacity: 0.8 }} /></a>
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://ug.linkedin.com/company/welile" target="_blank" rel="noreferrer"><img src="https://img.icons8.com/ios-filled/50/94a3b8/linkedin.png" alt="LinkedIn" width="22" style={{ display: 'block', opacity: 0.8 }} /></a>
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://www.facebook.com/profile.php?id=61578974799814" target="_blank" rel="noreferrer"><img src="https://img.icons8.com/ios-filled/50/94a3b8/facebook-new.png" alt="Facebook" width="22" style={{ display: 'block', opacity: 0.8 }} /></a>
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <a href="https://www.instagram.com/welile_technologies/" target="_blank" rel="noreferrer"><img src="https://img.icons8.com/ios-filled/50/94a3b8/instagram-new.png" alt="Instagram" width="22" style={{ display: 'block', opacity: 0.8 }} /></a>
                      </td>
                    </tr></tbody>
                  </table>

                  <p style={{ margin: '0 0 12px 0', color: FOOT, fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>WELILE TECHNOLOGIES LTD</p>
                  <p style={{ margin: '0 0 16px 0', fontSize: '13px' }}>
                    <a href="https://maps.app.goo.gl/zfmsP2m2cCXEJXPe9" target="_blank" rel="noreferrer" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Palm Lane Kabaale, Entebbe</a>
                  </p>
                  <p style={{ margin: '0 0 20px 0', color: FOOT, fontSize: '13px', lineHeight: '20px' }}>
                    Support Email: <a href={`mailto:${support_email}`} style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>{support_email}</a>
                  </p>
                  <p style={{ margin: '0 0 20px 0', color: FOOT, fontSize: '12px', lineHeight: '18px' }}>
                    You are receiving this email because you are a registered partner at Welile.<br />
                    This is an automated notification. Please do not reply directly to this email.
                  </p>
                  <p style={{ margin: '0 0 18px 0' }}>
                    <a href="https://welileapp.com/privacy" style={{ color: FOOT, fontSize: '12px', textDecoration: 'underline', margin: '0 10px' }}>Privacy Policy</a>
                    <a href="https://welileapp.com/terms" style={{ color: FOOT, fontSize: '12px', textDecoration: 'underline', margin: '0 10px' }}>Terms of Service</a>
                    <a href={unsubscribe_url} style={{ color: FOOT, fontSize: '12px', textDecoration: 'underline', margin: '0 10px' }}>Unsubscribe</a>
                  </p>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: '12px' }}>© {year} Welile. All rights reserved.</p>
                </td>
              </tr></tbody>
            </table>

          </td></tr></tbody>
        </table>
      </Body>
    </Html>
  )
}

export const template = {
  component: PartnerCapitalDeploymentConfirmation,
  subject: (data: Record<string, any>) =>
    `Welile — UGX ${money(data?.total_amount)} deployed to your portfolio`,
  displayName: 'Partner Capital Deployment Confirmation',
  previewData: {
    partner_first_name: 'David',
    total_amount: 5_000_000,
    tenant_count: 3,
    tenants: [
      { tenant_name: 'Mukasa Gerald', tenant_initials: 'MG', allocated_amount: 2_000_000 },
      { tenant_name: 'Nakato Sarah', tenant_initials: 'NS', allocated_amount: 1_800_000 },
      { tenant_name: 'Ochen Emmanuel', tenant_initials: 'OE', allocated_amount: 1_200_000 },
    ],
    portfolio_start_date: '05 August 2026',
    monthly_payout: 750_000,
    portfolio_reference: 'WEL-PORT-2026-89421',
    portfolio_url: 'https://welileapp.com/dashboard/funder',
    support_email: 'partnership@welile.com',
    current_year: 2026,
  },
} satisfies TemplateEntry
