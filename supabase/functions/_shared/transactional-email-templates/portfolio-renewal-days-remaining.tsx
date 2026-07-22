import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './types.ts'

interface PortfolioRenewalDaysRemainingProps {
  partner_name?: string
  days_remaining?: number | string
  days_remaining_label?: string
  effective_date?: string
  company_name?: string
}

const resolveDays = (value: number | string | undefined) => {
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

const labelFor = (days: number, custom?: string) => {
  if (custom?.trim()) return custom.trim()
  if (days <= 0) return 'Applied today'
  return `${days} day${days === 1 ? '' : 's'} remaining`
}

export function PortfolioRenewalDaysRemaining({
  partner_name = 'Partner',
  days_remaining = 0,
  days_remaining_label,
  effective_date,
  company_name = 'Welile',
}: PortfolioRenewalDaysRemainingProps) {
  const days = resolveDays(days_remaining)
  const label = labelFor(days, days_remaining_label)
  const preview = `Portfolio renewal: ${label}`

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>{company_name}</Text>
          <Heading style={heading}>Portfolio Renewal Countdown</Heading>
          <Text style={greeting}>Dear {partner_name},</Text>
          <Section style={countdownBox}>
            <Text style={countdownNumber}>{days}</Text>
            <Text style={countdownLabel}>{label}</Text>
          </Section>
          {effective_date && (
            <Text style={detailText}>Renewal applies on {effective_date}.</Text>
          )}
          <Text style={footer}>Partnership Team · {company_name}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: '#f6f7fb',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

const container: React.CSSProperties = {
  margin: '0 auto',
  maxWidth: '560px',
  padding: '40px 28px',
  backgroundColor: '#ffffff',
  borderRadius: '14px',
}

const brand: React.CSSProperties = {
  margin: '0 0 14px',
  color: '#7b19d4',
  fontSize: '13px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const heading: React.CSSProperties = {
  margin: '0 0 18px',
  color: '#111827',
  fontSize: '24px',
  fontWeight: 800,
}

const greeting: React.CSSProperties = {
  margin: '0 0 22px',
  color: '#334155',
  fontSize: '16px',
  lineHeight: '24px',
}

const countdownBox: React.CSSProperties = {
  margin: '0 0 22px',
  padding: '28px 18px',
  backgroundColor: '#f3e8ff',
  border: '1px solid #d8b4fe',
  borderRadius: '14px',
  textAlign: 'center',
}

const countdownNumber: React.CSSProperties = {
  margin: '0 0 6px',
  color: '#5a129e',
  fontSize: '56px',
  lineHeight: '62px',
  fontWeight: 900,
}

const countdownLabel: React.CSSProperties = {
  margin: 0,
  color: '#5a129e',
  fontSize: '18px',
  fontWeight: 800,
}

const detailText: React.CSSProperties = {
  margin: '0 0 22px',
  color: '#475569',
  fontSize: '15px',
  lineHeight: '24px',
  textAlign: 'center',
}

const footer: React.CSSProperties = {
  margin: '28px 0 0',
  color: '#94a3b8',
  fontSize: '12px',
  textAlign: 'center',
}

export const template = {
  component: PortfolioRenewalDaysRemaining,
  subject: (data: Record<string, any>) => {
    const days = resolveDays(data?.days_remaining)
    return `Portfolio Renewal Countdown — ${labelFor(days, data?.days_remaining_label)}`
  },
  displayName: 'Portfolio Renewal Countdown',
  previewData: {
    partner_name: 'SSENKAALI PIUS',
    days_remaining: 7,
    days_remaining_label: '7 days remaining',
    effective_date: '29 July 2026',
    company_name: 'Welile',
  },
} satisfies TemplateEntry