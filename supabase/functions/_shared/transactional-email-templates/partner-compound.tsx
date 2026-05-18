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

interface PartnerCompoundProps {
  partner_name?: string
  portfolio_id?: string
  compound_date?: string
  initial_partnership_amount?: string | number
  roi_return?: string
  roi_percentage?: number | string
  return_amount?: string | number
  new_total_partnership_value?: string | number
  currency?: string
  company_name?: string
  logo_url?: string
  unsubscribe_url?: string
  dashboard_url?: string
  /**
   * Index of THIS compounding cycle (1-based). When >= 2 the template
   * synthesises a per-cycle breakdown working backwards from
   * new_total_partnership_value using roi_percentage.
   */
  payment_number?: number | string
  /**
   * Optional explicit history. When provided, takes precedence over the
   * synthesised breakdown. Each entry represents one compounding cycle.
   */
  compound_history?: Array<{
    cycle?: number | string
    date?: string
    balance_before?: number | string
    return_amount?: number | string
    balance_after?: number | string
  }>
}

const formatAmount = (amount: string | number | undefined, currency: string) => {
  if (amount === undefined || amount === null || amount === '') return `${currency} 0`
  const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''))
  if (Number.isNaN(num)) return `${currency} ${amount}`
  return `${currency} ${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function PartnerCompound({
  partner_name = 'Partner',
  portfolio_id = 'PF-XXXXXXXX',
  compound_date = '',
  initial_partnership_amount = 0,
  roi_return,
  roi_percentage,
  return_amount = 0,
  new_total_partnership_value = 0,
  currency = 'UGX',
  company_name = 'Welile',
  logo_url = 'https://welilereceipts.com/welile-logo.png',
  unsubscribe_url = 'https://welile.com/unsubscribe',
  dashboard_url = 'https://welilereceipts.com/auth',
  payment_number,
  compound_history,
}: PartnerCompoundProps) {
  const year = new Date().getFullYear()
  const formattedInitial = formatAmount(initial_partnership_amount, currency)
  const formattedReturn = formatAmount(return_amount, currency)
  const formattedNewTotal = formatAmount(new_total_partnership_value, currency)

  // Resolve actual ROI % for this portfolio. Priority:
  //   1. explicit roi_percentage prop (numeric, sourced from portfolio config)
  //   2. legacy roi_return string (back-compat with older payloads)
  //   3. derived from return_amount / initial_partnership_amount
  // This guarantees the email shows the partner's REAL rate, not a hardcoded 15%.
  const initNum = Number(String(initial_partnership_amount).replace(/,/g, '')) || 0
  const retNum = Number(String(return_amount).replace(/,/g, '')) || 0
  const explicitPct = roi_percentage === undefined || roi_percentage === null || roi_percentage === ''
    ? NaN
    : Number(roi_percentage)
  let resolvedRoiLabel: string
  if (Number.isFinite(explicitPct) && explicitPct > 0) {
    const r = Math.round(explicitPct * 100) / 100
    resolvedRoiLabel = `${r}%`
  } else if (typeof roi_return === 'string' && roi_return.trim().length > 0) {
    resolvedRoiLabel = roi_return
  } else if (initNum > 0) {
    const r = Math.round((retNum / initNum) * 10000) / 100
    resolvedRoiLabel = `${r}%`
  } else {
    resolvedRoiLabel = '0%'
  }
  const roiLabel = resolvedRoiLabel

  // Build a timeline of cycles that compose the New Total Partnership Value.
  // Priority:
  //   1. Explicit compound_history (truth from the caller).
  //   2. Synthesised backwards from newTotal using payment_number + roi%.
  //   3. Single-cycle fallback (initial → return → new total).
  const newTotalNum = Number(String(new_total_partnership_value).replace(/,/g, '')) || 0
  const cyclesDone = Math.max(0, Math.floor(Number(payment_number) || 0))
  const ratePct = Number.isFinite(explicitPct) && explicitPct > 0
    ? explicitPct
    : (initNum > 0 ? (retNum / initNum) * 100 : 0)
  const r = ratePct / 100

  type TimelineRow = {
    cycleLabel: string
    dateLabel?: string
    before: number
    earned: number
    after: number
    isCurrent: boolean
  }
  let timeline: TimelineRow[] = []

  if (Array.isArray(compound_history) && compound_history.length > 0) {
    timeline = compound_history.map((h, idx) => {
      const before = Number(String(h.balance_before ?? '').replace(/,/g, '')) || 0
      const earned = Number(String(h.return_amount ?? '').replace(/,/g, '')) || 0
      const after = Number(String(h.balance_after ?? '').replace(/,/g, '')) || (before + earned)
      return {
        cycleLabel: `Cycle ${h.cycle ?? idx + 1}`,
        dateLabel: h.date,
        before, earned, after,
        isCurrent: idx === compound_history.length - 1,
      }
    })
  } else if (cyclesDone >= 2 && r > 0 && newTotalNum > 0) {
    // Walk backwards: this cycle ended at newTotalNum, prior cycle ended at newTotalNum/(1+r), etc.
    const endings: number[] = []
    let bal = newTotalNum
    for (let i = 0; i < cyclesDone; i++) {
      endings.unshift(bal)
      bal = bal / (1 + r)
    }
    // bal now ≈ original principal before any compounding
    timeline = endings.map((after, idx) => {
      const before = idx === 0 ? bal : endings[idx - 1]
      return {
        cycleLabel: `Cycle ${idx + 1}`,
        dateLabel: idx === endings.length - 1 ? compound_date : undefined,
        before,
        earned: after - before,
        after,
        isCurrent: idx === endings.length - 1,
      }
    })
  } else {
    // Single-cycle fallback
    timeline = [{
      cycleLabel: cyclesDone > 0 ? `Cycle ${cyclesDone}` : 'This cycle',
      dateLabel: compound_date,
      before: initNum,
      earned: retNum,
      after: newTotalNum || (initNum + retNum),
      isCurrent: true,
    }]
  }

  return (
    <Html>
      <Head>
        <style>{clientOverrides}</style>
      </Head>
      <Preview>Portfolio Compounded — New Value {formattedNewTotal}</Preview>
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
                          Compounding Confirmation
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="center" className="padding-mobile" style={{ padding: '40px 40px 20px 40px' }}>
                    <Heading style={heroH1}>Portfolio Successfully Compounded</Heading>
                  </td>
                </tr>

                <tr>
                  <td align="left" className="padding-mobile" style={{ padding: '0 40px 30px 40px' }}>
                    <Text style={greetingText}>Dear {partner_name},</Text>
                    <Text style={introText}>I hope this message finds you well.</Text>
                    <Text style={introText}>
                      We are pleased to confirm the successful compounding of your portfolio (<span style={{ color: '#a855f7' }}>{portfolio_id}</span>) with {company_name} Technologies Limited.
                    </Text>
                    <Text style={{ ...introText, margin: 0 }}>
                      On the <strong>{compound_date}</strong>, in accordance with your existing agreement, your portfolio of <strong>{formattedInitial}</strong> earned a {roiLabel} return (<strong>{formattedReturn}</strong>). This brings your new total portfolio value to <strong>{formattedNewTotal}</strong>.
                    </Text>
                  </td>
                </tr>

                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 40px 40px' }}>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={highlightCard}>
                      <tbody>
                        <tr>
                          <td align="center" style={returnInner}>
                            <Text style={returnEyebrow}>Return Earned ({roiLabel})</Text>
                            <Text style={returnValue}>+{formattedReturn}</Text>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style={highlightInner}>
                            <Text style={highlightEyebrow}>New Total Partnership Value</Text>
                            <Text style={highlightValue}>{formattedNewTotal}</Text>
                            <Text style={highlightSub}>Your portfolio has been compounded accordingly.</Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                {/* Compounding timeline — breakdown of how we arrived at the New Total */}
                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 30px 40px' }}>
                    <Text style={timelineTitle}>How your New Total was built</Text>
                    <Text style={timelineSubtitle}>
                      A cycle-by-cycle breakdown of the compounding that produced {formattedNewTotal}.
                    </Text>
                    <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={timelineCard}>
                      <tbody>
                        {timeline.map((row, i) => {
                          const isLast = i === timeline.length - 1
                          return (
                            <tr key={i}>
                              <td width={28} valign="top" style={timelineRailCell}>
                                <div style={{ ...timelineDot, ...(row.isCurrent ? timelineDotCurrent : {}) }} />
                                {!isLast && <div style={timelineLine} />}
                              </td>
                              <td valign="top" style={{
                                ...timelineRowCell,
                                ...(isLast ? { paddingBottom: 4 } : {}),
                              }}>
                                <Text style={timelineCycleLabel}>
                                  {row.cycleLabel}
                                  {row.isCurrent && <span style={timelineCurrentTag}>&nbsp;· This cycle</span>}
                                  {row.dateLabel && <span style={timelineDateLabel}>&nbsp;· {row.dateLabel}</span>}
                                </Text>
                                <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ marginTop: 6 }}>
                                  <tbody>
                                    <tr>
                                      <td style={timelineKvLabel}>Start of cycle</td>
                                      <td align="right" style={timelineKvValue}>{formatAmount(row.before, currency)}</td>
                                    </tr>
                                    <tr>
                                      <td style={timelineKvLabel}>Return earned ({roiLabel})</td>
                                      <td align="right" style={timelineKvEarned}>+{formatAmount(row.earned, currency)}</td>
                                    </tr>
                                    <tr>
                                      <td style={timelineKvLabelStrong}>Balance after</td>
                                      <td align="right" style={timelineKvAfter}>{formatAmount(row.after, currency)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {cyclesDone >= 2 && !(Array.isArray(compound_history) && compound_history.length > 0) && (
                      <Text style={timelineFootnote}>
                        Cycle balances are reconstructed from your portfolio's compounding rate ({roiLabel} per cycle).
                      </Text>
                    )}
                  </td>
                </tr>

                <tr>
                  <td className="padding-mobile" style={{ padding: '0 40px 40px 40px' }}>
                    <Text style={outroText}>
                      We appreciate your continued trust and are excited about the growth ahead. Our team remains committed to supporting your partnership journey with consistent value and transparency.
                    </Text>
                    <Text style={{ ...outroText, margin: '25px 0 0 0' }}>
                      Should you require any further clarification or a detailed update on your partnership performance, please feel free to reach out to us at{' '}
                      <Link href="mailto:partnership@welile.com" style={inlineLink}>partnership@welile.com</Link>.
                    </Text>
                    <Text style={{ ...outroText, margin: '25px 0 0 0' }}>
                      Thank you once again for choosing {company_name} Technologies Limited.
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
                            <Text style={ctaEyebrow}>Your Partner Dashboard Awaits</Text>
                            <Heading as="h2" style={ctaHeadline}>Track every shilling, in real time.</Heading>
                            <Text style={ctaSubtext}>
                              Sign in to monitor your portfolio, watch monthly returns accrue, and download your statements — anytime, from anywhere.
                            </Text>
                            <table border={0} cellPadding={0} cellSpacing={0} role="presentation" align="center" style={{ margin: '8px auto 0 auto' }}>
                              <tbody><tr>
                                <td align="center" style={ctaButtonCell}>
                                  <Link
                                    href={dashboard_url}
                                    style={ctaButton}
                                    dangerouslySetInnerHTML={{ __html: 'Access Your Dashboard&nbsp;&rarr;' }}
                                  />
                                </td>
                              </tr></tbody>
                            </table>
                            <Text style={ctaFinePrint}>
                              Or paste this into your browser:{' '}
                              <Link href={dashboard_url} style={ctaFineLink}>{dashboard_url}</Link>
                            </Text>
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

                  <Text style={footerCompanyName}>WELILE TECHNOLOGIES LTD</Text>
                  <Text style={{ margin: '0 0 20px 0', fontSize: '13px', textAlign: 'center' as const }}>
                    <Link href="https://maps.app.goo.gl/zfmsP2m2cCXEJXPe9" style={{ color: '#a855f7', textDecoration: 'none' }}>
                      Palm Lane Kabaale, Entebbe
                    </Link>
                  </Text>
                  <Text style={footerDisclaimer}>
                    You are receiving this email because you are a registered partner at {company_name}.<br />
                    This is an automated notification. Please do not reply directly to this email.
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
const SUCCESS_BG = '#f0fdf4'
const SUCCESS = '#059669'
const INK = '#0f172a'
const BODY = '#475569'
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
const heroH1: React.CSSProperties = { margin: '0 0 15px 0', color: INK, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', textAlign: 'center' as const }
const greetingText: React.CSSProperties = { margin: '0 0 15px 0', color: INK, fontSize: '16px', fontWeight: 600 }
const introText: React.CSSProperties = { margin: '0 0 15px 0', color: BODY, fontSize: '15px', lineHeight: '24px' }

const highlightCard: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fafaf9' }
const returnInner: React.CSSProperties = { backgroundColor: SUCCESS_BG, padding: '30px 20px', borderBottom: `1px solid ${BORDER}` }
const returnEyebrow: React.CSSProperties = { margin: '0 0 10px 0', color: SUCCESS, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }
const returnValue: React.CSSProperties = { margin: '0 0 5px 0', color: SUCCESS, fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }
const highlightInner: React.CSSProperties = { backgroundColor: ACCENT_BG, padding: '30px 20px' }
const highlightEyebrow: React.CSSProperties = { margin: '0 0 10px 0', color: SUB, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }
const highlightValue: React.CSSProperties = { margin: '0 0 5px 0', color: BRAND, fontSize: '34px', fontWeight: 800, letterSpacing: '-1px' }
const highlightSub: React.CSSProperties = { margin: 0, color: MUTED, fontSize: '13px', fontWeight: 500 }

const outroText: React.CSSProperties = { margin: 0, color: BODY, fontSize: '15px', lineHeight: '24px' }
const inlineLink: React.CSSProperties = { color: BRAND, textDecoration: 'none', fontWeight: 600 }
const signatureText: React.CSSProperties = { margin: '25px 0 0 0', color: INK, fontSize: '15px', fontWeight: 600 }
const signatureSub: React.CSSProperties = { fontWeight: 400, color: BODY }

const taglineCell: React.CSSProperties = { padding: '20px 40px', textAlign: 'center', borderTop: `1px solid #e5e7eb` }
const taglineText: React.CSSProperties = { margin: 0, color: MUTED, fontSize: '12px', lineHeight: '18px', fontWeight: 500 }

const ctaCard: React.CSSProperties = {
  borderRadius: '14px',
  overflow: 'hidden',
  backgroundColor: BRAND,
  backgroundImage: `linear-gradient(135deg, #2a0b4d 0%, ${BRAND} 55%, #a855f7 100%)`,
  boxShadow: '0 8px 24px rgba(123, 25, 212, 0.25)',
}
const ctaInner: React.CSSProperties = { padding: '36px 28px' }
const ctaEyebrow: React.CSSProperties = {
  margin: '0 0 8px 0',
  color: '#e9d5ff',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '2px',
}
const ctaHeadline: React.CSSProperties = {
  margin: '0 0 12px 0',
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: 800,
  lineHeight: '28px',
  letterSpacing: '-0.4px',
}
const ctaSubtext: React.CSSProperties = {
  margin: '0 0 22px 0',
  color: '#f3e8ff',
  fontSize: '14px',
  lineHeight: '22px',
  fontWeight: 400,
}
const ctaButtonCell: React.CSSProperties = {
  borderRadius: '999px',
  backgroundColor: '#ffffff',
}
const ctaButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '14px 32px',
  color: BRAND_DEEP,
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
  letterSpacing: '0.2px',
  borderRadius: '999px',
}
const ctaFinePrint: React.CSSProperties = {
  margin: '20px 0 0 0',
  color: '#e9d5ff',
  fontSize: '12px',
  lineHeight: '18px',
}
const ctaFineLink: React.CSSProperties = {
  color: '#ffffff',
  textDecoration: 'underline',
  fontWeight: 600,
  wordBreak: 'break-all',
}

const socialIcon: React.CSSProperties = { display: 'block', opacity: 0.8 }

// Compounding timeline styles
const timelineTitle: React.CSSProperties = { margin: '0 0 4px 0', color: INK, fontSize: '15px', fontWeight: 700 }
const timelineSubtitle: React.CSSProperties = { margin: '0 0 14px 0', color: SUB, fontSize: '12px', lineHeight: '18px' }
const timelineCard: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: '12px', backgroundColor: '#ffffff', padding: '14px 14px 6px 14px' }
const timelineRailCell: React.CSSProperties = { paddingTop: 6, paddingRight: 10, position: 'relative' as const }
const timelineDot: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, backgroundColor: BORDER, marginLeft: 4, marginTop: 4 }
const timelineDotCurrent: React.CSSProperties = { backgroundColor: BRAND, boxShadow: `0 0 0 3px ${ACCENT_BG}` }
const timelineLine: React.CSSProperties = { width: 2, minHeight: 28, backgroundColor: HAIRLINE, marginLeft: 8, marginTop: 4 }
const timelineRowCell: React.CSSProperties = { paddingBottom: 14 }
const timelineCycleLabel: React.CSSProperties = { margin: 0, color: INK, fontSize: '13px', fontWeight: 700 }
const timelineCurrentTag: React.CSSProperties = { color: BRAND, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const timelineDateLabel: React.CSSProperties = { color: SUB, fontWeight: 500, fontSize: '12px' }
const timelineKvLabel: React.CSSProperties = { color: BODY, fontSize: '12px', padding: '3px 0' }
const timelineKvLabelStrong: React.CSSProperties = { color: INK, fontSize: '12px', fontWeight: 700, padding: '6px 0 0 0', borderTop: `1px dashed ${HAIRLINE}` }
const timelineKvValue: React.CSSProperties = { color: INK, fontSize: '12px', fontWeight: 600, padding: '3px 0', fontVariantNumeric: 'tabular-nums' as any }
const timelineKvEarned: React.CSSProperties = { color: SUCCESS, fontSize: '12px', fontWeight: 700, padding: '3px 0', fontVariantNumeric: 'tabular-nums' as any }
const timelineKvAfter: React.CSSProperties = { color: BRAND, fontSize: '13px', fontWeight: 800, padding: '6px 0 0 0', borderTop: `1px dashed ${HAIRLINE}`, fontVariantNumeric: 'tabular-nums' as any }
const timelineFootnote: React.CSSProperties = { margin: '10px 0 0 0', color: MUTED, fontSize: '11px', lineHeight: '16px', fontStyle: 'italic' as const }

const footerCompanyName: React.CSSProperties = { margin: '0 0 12px 0', color: MUTED, fontSize: '14px', fontWeight: 700, textAlign: 'center' as const }
const footerDisclaimer: React.CSSProperties = { margin: '0 0 20px 0', color: MUTED, fontSize: '12px', lineHeight: '18px', textAlign: 'center' as const }
const footerLink: React.CSSProperties = { color: MUTED, fontSize: '12px', textDecoration: 'underline', margin: '0 10px' }
const footerCopyText: React.CSSProperties = { margin: 0, color: '#cbd5e1', fontSize: '12px', textAlign: 'center' as const }

export const template = {
  component: PartnerCompound,
  subject: (data: Record<string, any>) => {
    const formatted = formatAmount(data?.new_total_partnership_value, data?.currency || 'UGX')
    return `Portfolio Compounded — New Value ${formatted}`
  },
  displayName: 'Partner Portfolio Compounding Confirmation',
  previewData: {
    partner_name: 'Sarah Nakato',
    portfolio_id: 'PF-1A2B3C4D',
    compound_date: '20th of April, 2026',
    initial_partnership_amount: 6_272_000,
    roi_percentage: 12,
    return_amount: 752_640,
    new_total_partnership_value: 7_024_640,
    payment_number: 4,
    currency: 'UGX',
    company_name: 'Welile',
    logo_url: 'https://welilereceipts.com/welile-logo.png',
    unsubscribe_url: 'https://welile.com/unsubscribe',
    dashboard_url: 'https://welilereceipts.com/auth',
  },
} satisfies TemplateEntry
