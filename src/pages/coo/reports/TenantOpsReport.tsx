import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import COOReportPage from '@/components/coo/COOReportPage';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { Home, UserPlus, Clock, ShieldCheck, FileWarning, HeartHandshake, AlertTriangle } from 'lucide-react';

/**
 * COO → Reports → Tenant Ops
 * Wire `activities` to: tenants, rent_requests, support_tickets, tenant_kyc.
 */
export default function TenantOpsReportPage() {
  const [, setActiveTab] = usePersistedActiveTab('coo');

  const activities = [
    { id: 'TEN-3320', type: 'New tenant',         person: 'Ruth N.',     amount: null,      status: 'Pending review',  statusKind: 'warning' as const,     date: new Date(Date.now() - 2*3600e3).toISOString(),  staff: 'Linda M.', reference: 'REG-3320', details: { department: 'Tenant Ops', assigned_partner: 'Mukasa Ventures' } },
    { id: 'TEN-3319', type: 'Rent payment',       person: 'David K.',    amount: 450_000,   status: 'Approved',         statusKind: 'success' as const,     date: new Date(Date.now() - 5*3600e3).toISOString(),  staff: 'System',   reference: 'PAY-7711', details: { department: 'Financial Ops' } },
    { id: 'TEN-3318', type: 'Support request',    person: 'Grace A.',    amount: null,      status: 'Pending',          statusKind: 'warning' as const,     date: new Date(Date.now() - 8*3600e3).toISOString(),  staff: 'Linda M.', reference: 'TKT-2210', details: { department: 'Tenant Ops', topic: 'Late payment grace' } },
    { id: 'TEN-3317', type: 'KYC submission',     person: 'Ruth N.',     amount: null,      status: 'Missing docs',     statusKind: 'destructive' as const, date: new Date(Date.now() - 26*3600e3).toISOString(), staff: 'Linda M.', reference: 'KYC-7720', details: { department: 'Tenant Ops', missing: 'National ID' } },
    { id: 'TEN-3316', type: 'Rent support',       person: 'Peter O.',    amount: 220_000,   status: 'Approved',         statusKind: 'success' as const,     date: new Date(Date.now() - 50*3600e3).toISOString(), staff: 'Linda M.', reference: 'SUP-1180', details: { department: 'Tenant Ops', supporter: 'Hope Foundation' } },
    { id: 'TEN-3315', type: 'COO escalation',     person: 'David K.',    amount: 950_000,   status: 'Pending',          statusKind: 'destructive' as const, date: new Date(Date.now() - 72*3600e3).toISOString(), staff: 'COO',      reference: 'ESC-0091', details: { department: 'Tenant Ops', reason: 'Repeat default' } },
  ];

  return (
    <ExecutiveDashboardLayout role="coo" activeTab="reports-tenant-ops" onTabChange={setActiveTab}>
      <COOReportPage
        title="Tenant Ops Report"
        description="Track tenant onboarding, support tickets, rent support, verification status, and cases needing COO attention."
        icon={Home}
        statusOptions={['Pending review', 'Pending', 'Approved', 'Rejected', 'Missing docs']}
        activityTypeOptions={['New tenant', 'Rent payment', 'Support request', 'KYC submission', 'Rent support', 'COO escalation']}
        departmentOptions={['Tenant Ops', 'Financial Ops']}
        staffOptions={['Linda M.', 'System', 'COO']}
        kpis={[
          { label: 'New tenants (7d)',      value: '38',   sub: '+11 vs prev. week',     icon: UserPlus,     severity: 'info' },
          { label: 'Pending tenant reviews', value: '6',   sub: 'Awaiting Tenant Ops',   icon: Clock,        severity: 'warning', urgent: true },
          { label: 'Supported tenants',     value: '214',  sub: 'Active rent plans',     icon: HeartHandshake, severity: 'success' },
          { label: 'Active tenant cases',   value: '17',   sub: 'Open with Tenant Ops',  icon: AlertTriangle, severity: 'warning' },
          { label: 'Pending verifications', value: '9',    sub: 'KYC incomplete',        icon: FileWarning,   severity: 'destructive' },
          { label: 'Rent support requests', value: '12',   sub: 'New this week',         icon: HeartHandshake, severity: 'info' },
          { label: 'KYC verified',          value: '92%',  sub: 'Of active tenants',     icon: ShieldCheck,   severity: 'success' },
          { label: 'COO escalations',       value: '3',    sub: 'Awaiting decision',     icon: AlertTriangle, severity: 'destructive', urgent: true },
        ]}
        charts={[
          {
            kind: 'line',
            title: 'New tenants vs verified (last 14 days)',
            seriesKeys: ['new', 'verified'],
            data: Array.from({ length: 14 }, (_, i) => ({
              label: `D${i + 1}`,
              new: Math.round(3 + Math.random() * 8),
              verified: Math.round(2 + Math.random() * 6),
            })),
          },
          {
            kind: 'pie',
            title: 'Open cases by category',
            data: [
              { label: 'Late payment',  value: 9 },
              { label: 'Verification',  value: 4 },
              { label: 'Plan change',   value: 2 },
              { label: 'Dispute',       value: 2 },
            ],
          },
        ]}
        activities={activities}
        insights={[
          { kind: 'priority',   title: '3 escalations need COO sign-off', body: 'Repeat-default case for David K. flagged twice — coordinate with Financial Ops before next billing cycle.' },
          { kind: 'pending',    title: '9 KYC packs incomplete > 48h',     body: 'National ID is the most common missing item. Re-trigger SMS prompts.' },
          { kind: 'trend',      title: 'New tenants up 41% w/w',           body: 'Largely from Hope Foundation supporter pool. Brief Tenant Ops on capacity.' },
          { kind: 'action',     title: 'Reassign 4 stale support tickets',  body: 'All sit with Linda M. and are >24h old. Spread to next available agent.' },
        ]}
      />
    </ExecutiveDashboardLayout>
  );
}