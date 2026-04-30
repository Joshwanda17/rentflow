import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import COOReportPage from '@/components/coo/COOReportPage';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { Wallet, Banknote, ArrowDownToLine, ArrowUpFromLine, Scale, AlertTriangle, Receipt, TrendingUp, ShieldCheck } from 'lucide-react';

/**
 * COO → Reports → Financial Ops
 * Wire `activities` to: general_ledger, withdrawals, deposits, wallet_movements,
 * cfo_direct_credits, supporter_payouts. Numbers are placeholders for the
 * COO operational view — CFO retains the authoritative financial reports.
 */
export default function FinancialOpsReportPage() {
  const [, setActiveTab] = usePersistedActiveTab('coo');

  const ugx = (n: number) => `UGX ${n.toLocaleString()}`;

  const activities = [
    { id: 'FIN-9120', type: 'Withdrawal',         person: 'Agent — Joseph M.', amount: 1_200_000, status: 'Pending approval', statusKind: 'warning' as const,     date: new Date(Date.now() - 1*3600e3).toISOString(),  staff: 'FinOps',  reference: 'WD-9120',  details: { department: 'Financial Ops', bucket: 'withdrawable' } },
    { id: 'FIN-9119', type: 'Deposit',            person: 'Tenant — Grace A.', amount: 450_000,   status: 'Approved',         statusKind: 'success' as const,     date: new Date(Date.now() - 3*3600e3).toISOString(),  staff: 'System',  reference: 'RCT-7711', details: { department: 'Financial Ops', channel: 'MoMo' } },
    { id: 'FIN-9118', type: 'CFO direct credit',  person: 'Operational Wallet', amount: 5_000_000, status: 'Approved',         statusKind: 'success' as const,     date: new Date(Date.now() - 6*3600e3).toISOString(),  staff: 'CFO',     reference: 'CDC-3320', details: { department: 'Financial Ops', recipient_type: 'operational_wallet' } },
    { id: 'FIN-9117', type: 'Supporter payout',   person: 'Hope Foundation',    amount: 2_400_000, status: 'Pending approval', statusKind: 'warning' as const,     date: new Date(Date.now() - 10*3600e3).toISOString(), staff: 'FinOps',  reference: 'PAY-1180', details: { department: 'Financial Ops', cycle: '2026-04' } },
    { id: 'FIN-9116', type: 'Reconciliation',     person: 'System',             amount: null,      status: 'Drift detected',   statusKind: 'destructive' as const, date: new Date(Date.now() - 24*3600e3).toISOString(), staff: 'System',  reference: 'REC-0091', details: { department: 'Financial Ops', delta: 'UGX 18,500 cached vs ledger' } },
    { id: 'FIN-9115', type: 'Withdrawal',         person: 'Supporter — Peter O.', amount: 800_000, status: 'Approved',         statusKind: 'success' as const,     date: new Date(Date.now() - 30*3600e3).toISOString(), staff: 'FinOps',  reference: 'WD-9115',  details: { department: 'Financial Ops', bucket: 'withdrawable' } },
  ];

  return (
    <ExecutiveDashboardLayout role="coo" activeTab="reports-financial-ops" onTabChange={setActiveTab}>
      <COOReportPage
        title="Financial Ops Report"
        description="COO operational visibility into deposits, withdrawals, CFO direct credits, supporter payouts, and reconciliation drift across the platform."
        icon={Wallet}
        statusOptions={['Pending approval', 'Approved', 'Rejected', 'Drift detected']}
        activityTypeOptions={['Deposit', 'Withdrawal', 'CFO direct credit', 'Supporter payout', 'Reconciliation']}
        departmentOptions={['Financial Ops']}
        staffOptions={['FinOps', 'CFO', 'System']}
        kpis={[
          { label: 'Deposits (7d)',          value: ugx(48_200_000), sub: '+12% vs prev. week',         icon: ArrowDownToLine, severity: 'success' },
          { label: 'Withdrawals (7d)',       value: ugx(31_700_000), sub: 'Across all roles',           icon: ArrowUpFromLine, severity: 'info' },
          { label: 'Pending approvals',      value: '7',             sub: 'Awaiting FinOps / CFO',      icon: Receipt,         severity: 'warning', urgent: true },
          { label: 'CFO direct credits (7d)', value: ugx(12_000_000), sub: '4 operational top-ups',     icon: Banknote,        severity: 'info' },
          { label: 'Supporter payouts due',  value: ugx(9_400_000),  sub: 'Cycle 2026-04',              icon: TrendingUp,      severity: 'warning' },
          { label: 'Reconciliation drift',   value: '2',             sub: 'Wallets vs ledger',          icon: AlertTriangle,   severity: 'destructive', urgent: true },
          { label: 'Float coverage',         value: '118%',          sub: 'Operational vs obligations', icon: Scale,           severity: 'success' },
          { label: 'Ledger health',          value: 'OK',            sub: 'Strict mode active',         icon: ShieldCheck,     severity: 'success' },
        ]}
        charts={[
          {
            kind: 'bar',
            title: 'Deposits vs withdrawals (last 14 days, UGX m)',
            seriesKeys: ['deposits', 'withdrawals'],
            data: Array.from({ length: 14 }, (_, i) => ({
              label: `D${i + 1}`,
              deposits:    Math.round(4 + Math.random() * 9),
              withdrawals: Math.round(2 + Math.random() * 7),
            })),
          },
          {
            kind: 'pie',
            title: 'Outflows by category',
            data: [
              { label: 'Agent withdrawals',     value: 38 },
              { label: 'Supporter payouts',     value: 27 },
              { label: 'Operational top-ups',   value: 21 },
              { label: 'Tenant refunds',        value: 9 },
              { label: 'Other',                 value: 5 },
            ],
          },
        ]}
        activities={activities}
        insights={[
          { kind: 'priority', title: '2 reconciliation drifts open',     body: 'Cached withdrawable diverges from ledger baseline. Coordinate with CFO before next payout batch.' },
          { kind: 'pending',  title: '7 approvals waiting on FinOps',     body: 'Includes 1 large agent withdrawal (>UGX 1m). Confirm trust score and float bucket before signing off.' },
          { kind: 'trend',    title: 'Deposits up 12% week-over-week',    body: 'MoMo channel leads. Ensure agent float capacity matches inflow.' },
          { kind: 'action',   title: 'Review supporter payout cycle',     body: 'UGX 9.4m queued for 2026-04. Confirm ROI accrual completed before release.' },
        ]}
      />
    </ExecutiveDashboardLayout>
  );
}