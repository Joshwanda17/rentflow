import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './types.ts'

interface WithdrawalSuccessProps {
  user_name?: string
  amount?: number
  currency?: string
  provider?: string // "MTN MoMo" | "Airtel Money" | "Bank"
  mobile_money_number?: string
  transaction_id?: string
  date?: string
  new_balance?: number
}

const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—')

export function WithdrawalSuccessEmail({
  user_name = 'there',
  amount,
  currency = 'UGX',
  provider = 'Mobile Money',
  mobile_money_number = '',
  transaction_id = '',
  date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
  new_balance,
}: WithdrawalSuccessProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {currency} {fmt(amount)} sent to your {provider} — withdrawal completed
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Withdrawal Successful</Heading>
          <Text style={text}>Hi {user_name},</Text>
          <Text style={text}>
            Your withdrawal of <strong>{currency} {fmt(amount)}</strong> has
            been paid out to your <strong>{provider}</strong> number and the
            matching amount has been deducted from your Welile wallet.
          </Text>
          <Section style={infoBox}>
            <Text style={infoLabel}>Amount</Text>
            <Text style={infoValue}>{currency} {fmt(amount)}</Text>
            <Text style={infoLabel}>Sent to</Text>
            <Text style={infoValue}>{provider}{mobile_money_number ? ` · ${mobile_money_number}` : ''}</Text>
            <Text style={infoLabel}>Transaction ID</Text>
            <Text style={infoValue}>{transaction_id || '—'}</Text>
            <Text style={infoLabel}>Date</Text>
            <Text style={infoValue}>{date}</Text>
            {typeof new_balance === 'number' ? (
              <>
                <Text style={infoLabel}>New Wallet Balance</Text>
                <Text style={infoValue}>{currency} {fmt(new_balance)}</Text>
              </>
            ) : null}
          </Section>
          <Text style={text}>
            If you did not request this withdrawal, contact Welile Support
            immediately. Every withdrawal is logged for audit.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Welile · Trusted rent & receipts for Uganda</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}
const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '32px 24px',
  maxWidth: '560px',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
}
const h1: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 16px',
}
const text: React.CSSProperties = {
  color: '#334155',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 12px',
}
const infoBox: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  borderRadius: '8px',
  padding: '16px',
  margin: '20px 0',
}
const infoLabel: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 2px',
  fontWeight: 600,
}
const infoValue: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '14px',
  margin: '0 0 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const hr: React.CSSProperties = {
  borderColor: '#e2e8f0',
  margin: '24px 0 16px',
}
const footer: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: 0,
}

export const template = {
  component: WithdrawalSuccessEmail,
  subject: 'Withdrawal successful — funds sent to your mobile money',
  displayName: 'Withdrawal Success',
  previewData: {
    user_name: 'Joseph Lukoda',
    amount: 50000,
    currency: 'UGX',
    provider: 'MTN MoMo',
    mobile_money_number: '0780123456',
    transaction_id: '24052800123456',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    new_balance: 0,
  },
} satisfies TemplateEntry