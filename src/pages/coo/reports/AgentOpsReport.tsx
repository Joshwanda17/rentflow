import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import COOReportPage from '@/components/coo/COOReportPage';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { Users, UserPlus, Clock, Wallet, Banknote, TrendingUp, FileWarning, ShieldCheck } from 'lucide-react';

/**
 * COO → Reports → Agent Ops
 *
 * Wire `activities` to: agent_collections, wallets (agent), pending_wallet_operations,
 * agent_advance_requests, user_roles (agent).
 */
export default function AgentOpsReportPage() {
  const [, setActiveTab] = usePersistedActiveTab('coo');

  const activities = [
    { id: 'AGT-2210', type: 'New agent',         person: 'Patrick S.',  amount: null,        status: 'Pending approval', statusKind: 'warning' as const, date: new Date(Date.now() - 2*3600e3).toISOString(),  staff: 'Sarah M.', reference: 'REG-2210', details: { department: 'Agent Ops', region: 'Kampala' } },
    { id: 'AGT-2209', type: 'Float deposit',     person: 'Joseph N.',   amount: 8_000_000,   status: 'Pending',          statusKind: 'warning' as const, date: new Date(Date.now() - 5*3600e3).toISOString(),  staff: 'Sarah M.', reference: 'FLT-1108', details: { department: 'Agent Ops', region: 'Wakiso' } },
    { id: 'AGT-2208', type: 'Personal deposit',  person: 'Joseph N.',   amount: 1_200_000,   status: 'Approved',         statusKind: 'success' as const, date: new Date(Date.now() - 8*3600e3).toISOString(),  staff: 'Brian O.', reference: 'WAL-9942', details: { department: 'Financial Ops' } },
    { id: 'AGT-2207', type: 'Commission paid',   person: 'Esther A.',   amount: 350_000,     status: 'Approved',         statusKind: 'success' as const, date: new Date(Date.now() - 24*3600e3).toISOString(), staff: 'System',   reference: 'COM-7710', details: { department: 'Financial Ops', tenants_paid: 7 } },
    { id: 'AGT-2206', type: 'KYC submission',    person: 'Patrick S.',  amount: null,        status: 'Missing docs',     statusKind: 'destructive' as const, date: new Date(Date.now() - 48*3600e3).toISOString(), staff: 'Sarah M.', reference: 'KYC-3320', details: { department: 'Agent Ops', missing: 'AI ID photo' } },
    { id: 'AGT-2205', type: 'Sub-agent added',   person: 'Esther A.',   amount: null,        status: 'Approved',         statusKind: 'success' as const, date: new Date(Date.now() - 70*3600e3).toISOString(), staff: 'Esther A.', reference: 'SUB-1180', details: { department: 'Agent Ops', sub_agent: 'Henry W.' } },
  ];

  return (
    <ExecutiveDashboardLayout role="coo" activeTab="reports-agent-ops" onTabChange={setActiveTab}>
      <COOReportPage
        title="Agent Ops Report"
        description="Track agent registrations, float and personal deposits, commissions, wallet movements, and field performance."
        icon={Users}
        statusOptions={['Pending approval', 'Pending', 'Approved', 'Rejected', 'Missing docs']}
        activityTypeOptions={['New agent', 'Float deposit', 'Personal deposit', 'Commission paid', 'KYC submission', 'Sub-agent added']}
        departmentOptions={['Agent Ops', 'Financial Ops']}
        staffOptions={['Sarah M.', 'Brian O.', 'Esther A.', 'System']}
        kpis={[
          { label: 'Active agents',          value: '342', sub: '+9 this week',         icon: Users,       severity: 'info' },
          { label: 'Pending approvals',      value: '7',   sub: 'Median wait 18h',      icon: Clock,       severity: 'warning', urgent: true },
          { label: 'Float deposits (7d)',    value: 'UGX 142M', sub: '23 transactions', icon: Wallet,      severity: 'success' },
          { label: 'Personal deposits (7d)', value: 'UGX 28M',  sub: '64 transactions', icon: Wallet,      severity: 'neutral' },
          { label: 'Commissions (30d)',     value: 'UGX 18.4M', sub: 'Avg UGX 53K/agent', icon: Banknote,  severity: 'success' },
          { label: 'Pending agent deposits', value: '4',   sub: 'UGX 6.1M to verify',  icon: Wallet,      severity: 'warning' },
          { label: 'KYC incomplete',        value: '11',   sub: 'Out of 342 active',   icon: FileWarning, severity: 'destructive' },
          { label: 'Top performer',         value: 'Esther A.', sub: '47 collections this week', icon: TrendingUp, severity: 'success' },
        ]}
        charts={[
          {
            kind: 'bar',
            title: 'Agent activity volume (last 7 days)',
            seriesKeys: ['collections', 'deposits'],
            data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({
              label: d,
              collections: Math.round(40 + Math.random() * 80),
              deposits:    Math.round(15 + Math.random() * 35),
            })),
          },
          {
            kind: 'pie',
            title: 'Agents by region',
            data: [
              { label: 'Kampala', value: 142 },
              { label: 'Wakiso',  value: 87 },
              { label: 'Mukono',  value: 41 },
              { label: 'Jinja',   value: 38 },
              { label: 'Other',   value: 34 },
            ],
          },
        ]}
        activities={activities}
        insights={[
          { kind: 'priority',   title: '7 agents waiting approval over 24h', body: 'Field team is blocked on cash collections. Approve or escalate today.' },
          { kind: 'trend',      title: 'Float deposits trending up 18% w/w', body: 'Driven by Wakiso & Mukono regions — consider moving more inventory there.' },
          { kind: 'bottleneck', title: 'KYC rejections concentrated on AI ID photo', body: 'Most KYC fails are blurry AI ID uploads. Add an in-app camera quality hint.' },
          { kind: 'action',     title: 'Promote Esther A. to Senior Agent', body: 'Top of the leaderboard 3 weeks running with zero collection disputes.' },
        ]}
      />
    </ExecutiveDashboardLayout>
  );
}