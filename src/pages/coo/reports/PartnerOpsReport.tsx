import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import COOReportPage from '@/components/coo/COOReportPage';
import { usePartnerOpsReportData } from '@/components/coo/useCOOReportData';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { useQuery } from '@tanstack/react-query';
import { fetchSupporterSummary } from '@/lib/supabaseBatchUtils';
import { Handshake, UserPlus, Clock, CheckCircle2, XCircle, Wallet, Users, ArrowDownToLine } from 'lucide-react';

const ugx = (n: number) => `UGX ${new Intl.NumberFormat('en-UG').format(Math.round(n || 0))}`;

/**
 * COO → Reports → Partner Ops
 * Live data from `investor_portfolios` + `investment_withdrawal_requests`.
 */
export default function PartnerOpsReportPage() {
  const [, setActiveTab] = usePersistedActiveTab('coo');
  const { data, isLoading, refetch } = usePartnerOpsReportData();

  const k = data?.kpis ?? { totalPortfolios: 0, totalAum: 0, verified: 0, pendingReview: 0, rejected: 0, pendingWithdrawals: 0, pendingWithdrawalAmt: 0 };
  const activities = data?.activities ?? [];
  const trend = data?.trend ?? [];

  return (
    <ExecutiveDashboardLayout role="coo" activeTab="reports-partner-ops" onTabChange={setActiveTab}>
      <COOReportPage
        title="Partner Ops Report"
        description="Live monitor of partner portfolios, CFO verifications, and supporter withdrawal requests across the last 30 days."
        icon={Handshake}
        loading={isLoading}
        onGenerate={async () => { await refetch(); }}
        statusOptions={['Verified', 'Pending', 'Rejected', 'pending', 'approved', 'rejected']}
        activityTypeOptions={['New portfolio', 'Withdrawal request']}
        departmentOptions={['Partner Ops', 'Financial Ops']}
        kpis={[
          { label: 'New portfolios (30d)', value: String(k.totalPortfolios), sub: `${k.verified} CFO-verified`, icon: UserPlus, severity: 'info' },
          { label: 'Total AUM raised',      value: ugx(k.totalAum),           sub: 'Sum of investments',        icon: Wallet,   severity: 'success' },
          { label: 'Pending CFO review',    value: String(k.pendingReview),   sub: 'Portfolios awaiting',       icon: Clock,    severity: 'warning', urgent: k.pendingReview > 0 },
          { label: 'Rejected portfolios',   value: String(k.rejected),        sub: 'CFO rejected',              icon: XCircle,  severity: 'destructive' },
          { label: 'Pending withdrawals',   value: String(k.pendingWithdrawals), sub: 'Awaiting Financial Ops', icon: ArrowDownToLine, severity: 'warning', urgent: k.pendingWithdrawals > 0 },
          { label: 'Pending payout (UGX)',  value: ugx(k.pendingWithdrawalAmt), sub: 'Sum across requests',     icon: Wallet,   severity: 'warning' },
          { label: 'Verified portfolios',   value: String(k.verified),        sub: 'Cleared by CFO',            icon: CheckCircle2, severity: 'success' },
          { label: 'Active partner pool',   value: String(activities.filter(a => a.type === 'New portfolio').length), sub: 'In window', icon: Users, severity: 'neutral' },
        ]}
        charts={[
          {
            kind: 'line',
            title: 'New portfolios per day (last 14 days)',
            seriesKeys: ['count'],
            data: trend,
          },
        ]}
        activities={activities}
        insights={[
          { kind: k.pendingReview > 0 ? 'pending' : 'trend', title: `${k.pendingReview} portfolios pending CFO verification`, body: 'CFO must verify the bank/MoMo proof before AUM is recognised. Long waits stall ROI accrual.' },
          { kind: k.pendingWithdrawals > 0 ? 'priority' : 'trend', title: `${k.pendingWithdrawals} supporter withdrawals awaiting payout`, body: `UGX ${new Intl.NumberFormat('en-UG').format(Math.round(k.pendingWithdrawalAmt))} parked. Confirm 90-day notice has elapsed before clearing.` },
          { kind: 'trend', title: 'AUM raised (last 30 days)', body: `UGX ${new Intl.NumberFormat('en-UG').format(Math.round(k.totalAum))} across ${k.totalPortfolios} portfolios.` },
          { kind: 'action', title: 'Reconcile rejected portfolios', body: `${k.rejected} portfolios have a CFO rejection reason — reach out to investors with corrective steps.` },
        ]}
      />
    </ExecutiveDashboardLayout>
  );
}
