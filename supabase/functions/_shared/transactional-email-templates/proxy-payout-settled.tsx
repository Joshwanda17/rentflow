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

interface ProxyPayoutSettledProps {
  agent_name?: string
  partner_name?: string
  amount?: number
  currency?: string
  reference?: string
  date?: string
  remaining_in_flight?: number
}

const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—')

export function ProxyPayoutSettledEmail({
  agent_name = 'Agent',
  partner_name = 'your partner',
  amount,
  currency = 'UGX',
  reference = '',
  date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
  remaining_in_flight,
}: ProxyPayoutSettledProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {currency} {fmt(amount)} settled for {partner_name} — debited from your wallet
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Proxy Withdrawal Settled</Heading>
          <Text style={text}>Hi {agent_name},</Text>
          <Text style={text}>
            A pending withdrawal for <strong>{partner_name}</strong> has been
            paid out from the bulk bank batch and the matching amount has been
            <strong> debited from your proxy wallet</strong>. The pending
            request has been cleared.
          </Text>
          <Section style={infoBox}>
            <Text style={infoLabel}>Amount Debited</Text>
            <Text style={infoValue}>{currency} {fmt(amount)}</Text>
            <Text style={infoLabel}>On behalf of</Text>
            <Text style={infoValue}>{partner_name}</Text>
            <Text style={infoLabel}>Bank Reference</Text>
            <Text style={infoValue}>{reference || '—'}</Text>
            <Text style={infoLabel}>Date</Text>
            <Text style={infoValue}>{date}</Text>
            {typeof remaining_in_flight === 'number' ? (
              <>
                <Text style={infoLabel}>Remaining in-flight for partner</Text>
                <Text style={infoValue}>{currency} {fmt(remaining_in_flight)}</Text>
              </>
            ) : null}
          </Section>
          <Text style={text}>
            Open your Proxy Partners history to see the full settlement record.
            Every settlement is logged for audit.
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
  component: ProxyPayoutSettledEmail,
  subject: 'Proxy withdrawal settled — wallet debited',
  displayName: 'Proxy Payout Settled',
  previewData: {
    agent_name: 'Lilian Nakato',
    partner_name: 'Joseph Lukoda',
    amount: 250000,
    currency: 'UGX',
    reference: 'SKYBUBBLES-2024XYZ',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    remaining_in_flight: 0,
  },
} satisfies TemplateEntry