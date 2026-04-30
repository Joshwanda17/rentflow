import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import COOReportPage from '@/components/coo/COOReportPage';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { Handshake, UserPlus, Clock, CheckCircle2, XCircle, FileWarning, Wallet, Users } from 'lucide-react';

/**
 * COO → Reports → Partner Ops
 *
 * NOTE: Data shown here uses safe placeholder shapes that mirror the
 * production schema. Wire the `activities` array to the existing partner
 * ops sources (e.g. `pending_partner_signups`, `pending_portfolio_topup`,
 * `pending_wallet_operations`) in a follow-up PR — the page is data-shape-
 * compatible.
 */
export default function PartnerOpsReportPage() {
  const [, setActiveTab] = usePersistedActiveTab('coo');

  // TODO(real-data): replace with live queries — see public.partner_signups,
  // public.investor_portfolios, public.pending_portfolio_topup,
  // public.pending_wallet_operations.
  const activities = [
    { id: 'PRT-1041', type: 'New registration',  person: 'Acme Holdings',     amount: null,        status: 'Pending review', statusKind: 'warning' as const, date: new Date(Date.now() - 1*3600e3).toISOString(), staff: 'Joan K.', reference: 'SIGN-1041', details: { department: 'Partner Ops', country: 'UG', signup_source: 'self' }, timeline: [{ at: new Date(Date.now() - 2*3600e3).toISOString(), label: 'Self-registered', by: 'Web' }] },
    { id: 'PRT-1040', type: 'Top-up request',    person: 'Mukasa Ventures',   amount: 25_000_000,  status: 'Pending',        statusKind: 'warning' as const, date: new Date(Date.now() - 4*3600e3).toISOString(), staff: 'Brian O.', reference: 'TOP-9912',  details: { department: 'Partner Ops', method: 'MoMo' } },
    { id: 'PRT-1039', type: 'Deposit',           person: 'Kintu Capital',     amount: 10_000_000,  status: 'Approved',       statusKind: 'success' as const, date: new Date(Date.now() - 26*3600e3).toISOString(), staff: 'Brian O.', reference: 'DEP-7711',  details: { department: 'Financial Ops', method: 'Bank' } },
    { id: 'PRT-1038', type: 'KYC submission',    person: 'Zawadi Group',      amount: null,        status: 'Missing docs',   statusKind: 'destructive' as const, date: new Date(Date.now() - 30*3600e3).toISOString(), staff: 'Joan K.', reference: 'KYC-6620', details: { department: 'Partner Ops', missing: 'National ID' } },
    { id: 'PRT-1037', type: 'Deposit',           person: 'Hope Foundation',   amount: 4_500_000,   status: 'Rejected',       statusKind: 'destructive' as const, date: new Date(Date.now() - 50*3600e3).toISOString(), staff: 'Brian O.', reference: 'DEP-7707',  details: { department: 'Financial Ops', reason: 'Bank ref mismatch' } },
    { id: 'PRT-1036', type: 'Agreement signed',  person: 'Acme Holdings',     amount: null,        status: 'Approved',       statusKind: 'success' as const, date: new Date(Date.now() - 72*3600e3).toISOString(), staff: 'Joan K.', reference: 'AGR-2210', details: { department: 'Partner Ops' } },
  ];

  return (
    <ExecutiveDashboardLayout role="coo" activeTab="reports-partner-ops" onTabChange={setActiveTab}>
      <COOReportPage
        title="Partner Ops Report"
        description="Monitor partner registrations, top-ups, deposits, KYC, and onboarding conversion across the Partner Operations team."
        icon={Handshake}
        statusOptions={['Pending review', 'Pending', 'Approved', 'Rejected', 'Missing docs']}
        activityTypeOptions={['New registration', 'Top-up request', 'Deposit', 'KYC submission', 'Agreement signed']}
        departmentOptions={['Partner Ops', 'Financial Ops']}
        staffOptions={['Joan K.', 'Brian O.']}
        kpis={[
          { label: 'New partners (7d)',   value: '12',  sub: '+3 vs prev. week', icon: UserPlus,     severity: 'info' },
          { label: 'Pending reviews',     value: '8',   sub: 'Awaiting Partner Ops', icon: Clock,    severity: 'warning', urgent: true },
          { label: 'Pending top-ups',     value: '5',   sub: 'UGX 62.4M parked',  icon: Wallet,      severity: 'warning' },
          { label: 'Pending deposits',    value: '3',   sub: 'UGX 9.2M to verify', icon: Wallet,     severity: 'warning' },
          { label: 'Approved deposits',   value: '47',  sub: 'Last 30 days',     icon: CheckCircle2, severity: 'success' },
          { label: 'Rejected deposits',   value: '6',   sub: 'Last 30 days',     icon: XCircle,     severity: 'destructive' },
          { label: 'Missing documents',   value: '4',   sub: 'KYC incomplete',   icon: FileWarning, severity: 'destructive' },
          { label: 'Active portfolios',   value: '128', sub: 'UGX 1.42B AUM',    icon: Users,       severity: 'neutral' },
        ]}
        charts={[
          {
            kind: 'line',
            title: 'Signups vs activations (last 14 days)',
            seriesKeys: ['signups', 'activations'],
            data: Array.from({ length: 14 }, (_, i) => ({
              label: `D${i + 1}`,
              signups: Math.round(2 + Math.random() * 6),
              activations: Math.round(1 + Math.random() * 4),
            })),
          },
          {
            kind: 'bar',
            title: 'Approval vs rejection (deposits)',
            seriesKeys: ['approved', 'rejected'],
            data: ['W-3', 'W-2', 'W-1', 'This wk'].map((label) => ({
              label,
              approved: Math.round(8 + Math.random() * 12),
              rejected: Math.round(0 + Math.random() * 3),
            })),
          },
        ]}
        activities={activities}
        insights={[
          { kind: 'pending',    title: '8 partner registrations awaiting first review', body: 'Median wait time 14h. Target SLA is 4h. Consider re-balancing reviewer load.' },
          { kind: 'bottleneck', title: 'KYC rejections spiking on National ID',         body: '4 of 6 rejected deposits this week missed the National ID step. Re-introduce inline validator on the portal.' },
          { kind: 'trend',      title: 'Self-registered partners up 22% w/w',          body: 'Mostly via WhatsApp share. Worth assigning an ops owner to triage faster.' },
          { kind: 'action',     title: 'Promote 2 partners from pipeline → active',    body: 'Mukasa Ventures + Kintu Capital are both KYC complete and have a 2nd top-up pending.' },
        ]}
      />
    </ExecutiveDashboardLayout>
  );
}