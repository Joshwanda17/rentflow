import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { AdvanceRequestsQueue } from '@/components/ops/AdvanceRequestsQueue';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { COOWithdrawalApprovals } from '@/components/coo/COOWithdrawalApprovals';
import { COOPartnerWithdrawalApprovals } from '@/components/coo/COOPartnerWithdrawalApprovals';
import { COOROIApprovals } from '@/components/coo/COOROIApprovals';
import { CancelledProxyWithdrawals } from '@/components/coo/CancelledProxyWithdrawals';
import FinancialMetricsCards from '@/components/coo/FinancialMetricsCards';
import FinancialTransactionsTable from '@/components/coo/FinancialTransactionsTable';
import AgentCollectionsOverview from '@/components/coo/AgentCollectionsOverview';
import PaymentModeAnalytics from '@/components/coo/PaymentModeAnalytics';
import FinancialReportsPanel from '@/components/coo/FinancialReportsPanel';
import FinancialAlertsPanel from '@/components/coo/FinancialAlertsPanel';
import COOPartnersPage from '@/components/coo/COOPartnersPage';
import { StaffPerformancePanel } from '@/components/executive/StaffPerformancePanel';
import HRInternshipApplications from '@/components/hr/HRInternshipApplications';
import { RentPipelineQueue } from '@/components/executive/RentPipelineQueue';
import { FinancialOpsCommandCenter } from '@/components/financial-ops/FinancialOpsCommandCenter';
import { ShareSupporterRecruit } from '@/components/shared/ShareSupporterRecruit';
import { COOAgentHub } from '@/components/coo/COOAgentHub';
import { MissedDaysTracker } from '@/components/executive/MissedDaysTracker';
import { PendingPortfolioTopUps } from '@/components/cfo/PendingPortfolioTopUps';
import { PartnerFinancialActivity } from '@/components/executive/PartnerFinancialActivity';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Activity, ClipboardList, Users, Wallet, BarChart3,
  FileText, AlertTriangle, Banknote, Handshake, UserCheck,
  TrendingUp, ArrowLeft, ChevronRight, Receipt, Home
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickNavItem {
  id: string;
  label: string;
  icon: typeof Activity;
  color: string;
  description: string;
}

const quickNavItems: QuickNavItem[] = [
  { id: 'rent-approvals', label: 'Rent Approvals', icon: ClipboardList, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', description: 'Review & approve' },
  { id: 'tenants', label: 'Tenants', icon: Home, color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20', description: 'Repayment tracker' },
  { id: 'wallets', label: 'Wallets & Ops', icon: Wallet, color: 'bg-primary/10 text-primary border-primary/20', description: 'Deposits & payouts' },
  { id: 'transactions', label: 'Transactions', icon: BarChart3, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', description: 'Monitor activity' },
  { id: 'collections', label: 'Collections', icon: Users, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', description: 'Agent reports' },
  { id: 'withdrawals', label: 'Withdrawals', icon: Banknote, color: 'bg-red-500/10 text-red-600 border-red-500/20', description: 'Approve payouts' },
  { id: 'agent-activity', label: 'Agent Activity', icon: Activity, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', description: 'Live tracking' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, color: 'bg-teal-500/10 text-teal-600 border-teal-500/20', description: 'Payment modes' },
  { id: 'partners', label: 'Partners', icon: Handshake, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20', description: 'Manage partners' },
  { id: 'reports', label: 'Reports', icon: FileText, color: 'bg-sky-500/10 text-sky-600 border-sky-500/20', description: 'Financial reports' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', description: 'Risk & flags' },
  { id: 'partner-topups', label: 'Partner Top-ups', icon: TrendingUp, color: 'bg-green-500/10 text-green-600 border-green-500/20', description: 'Pending top-ups' },
  { id: 'partner-finance', label: 'Partner Finance', icon: Receipt, color: 'bg-violet-500/10 text-violet-600 border-violet-500/20', description: 'All activity' },
  { id: 'staff-performance', label: 'Staff', icon: UserCheck, color: 'bg-pink-500/10 text-pink-600 border-pink-500/20', description: 'Team metrics' },
  { id: 'advance-requests', label: 'Agent Advances', icon: Banknote, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', description: 'Approve advances' },
];

export default function COODashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('coo');
  const isMobile = useIsMobile();

  const handleNavTo = (tab: string) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderBackButton = (label: string) => (
    <button
      onClick={() => handleNavTo('overview')}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 active:scale-95"
    >
      <ArrowLeft className="h-4 w-4" />
      <span>Back to Overview</span>
    </button>
  );

  const renderSectionHeader = (title: string, icon: typeof Activity) => {
    const Icon = icon;
    return (
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'rent-approvals':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Rent Approvals', ClipboardList)}
            <p className="text-sm text-muted-foreground -mt-2">Review rent requests approved by Landlord Ops. Your sign-off forwards to CFO for payout.</p>
            <RentPipelineQueue stage="landlord_ops_approved" />
          </div>
        );
      case 'tenants':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Tenant Repayment Tracker', Home)}
            <p className="text-sm text-muted-foreground -mt-2">Track tenant repayment progress, overdue accounts, and assigned agent contacts.</p>
            <MissedDaysTracker />
          </div>
        );
      case 'transactions':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Transactions', BarChart3)}
            <FinancialTransactionsTable />
          </div>
        );
      case 'collections':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Agent Collections', Users)}
            <AgentCollectionsOverview />
          </div>
        );
      case 'wallets':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            <FinancialOpsCommandCenter requirePaymentRef={false} />
          </div>
        );
      case 'agent-activity':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Agent Activity', Activity)}
            <COOAgentHub />
          </div>
        );
      case 'analytics':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Payment Analytics', BarChart3)}
            <PaymentModeAnalytics />
          </div>
        );
      case 'reports':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Financial Reports', FileText)}
            <FinancialReportsPanel />
          </div>
        );
      case 'alerts':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Risk & Alerts', AlertTriangle)}
            <FinancialAlertsPanel />
          </div>
        );
      case 'withdrawals':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Withdrawal Approvals', Banknote)}
            <COOWithdrawalApprovals />
            <COOPartnerWithdrawalApprovals />
          </div>
        );
      case 'roi-approvals':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('ROI Return Approvals', TrendingUp)}
            <p className="text-sm text-muted-foreground -mt-2">Approve partner ROI payouts before they go to CFO for disbursement.</p>
            <COOROIApprovals />
            <CancelledProxyWithdrawals />
          </div>
        );
      case 'partners':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Partners', Handshake)}
            <COOPartnersPage />
          </div>
        );
      case 'partner-topups':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Partner Top-ups', TrendingUp)}
            <p className="text-sm text-muted-foreground -mt-2">Pending portfolio top-up requests awaiting verification.</p>
            <PendingPortfolioTopUps />
          </div>
        );
      case 'partner-finance':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Partner Financial Activity', Receipt)}
            <p className="text-sm text-muted-foreground -mt-2">All partner payouts, withdrawals, top-ups & retractions in one view.</p>
            <PartnerFinancialActivity />
          </div>
        );
      case 'staff-performance':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Staff Performance', UserCheck)}
            <StaffPerformancePanel />
          </div>
        );
      case 'internships':
        return (
          <div className="space-y-3">
            {isMobile && renderBackButton('Overview')}
            <HRInternshipApplications />
          </div>
        );
      case 'advance-requests':
        return (
          <div className="space-y-6">
            {isMobile && renderBackButton('Overview')}
            {renderSectionHeader('Agent Advance Approvals', Banknote)}
            <p className="text-sm text-muted-foreground -mt-2">Final operational approval before CFO payment.</p>
            <AdvanceRequestsQueue stage="coo" />
            <BusinessAdvanceQueue stage="coo" />
          </div>
        );
      default:
        return (
          <div className="space-y-5">
            {/* Priority: Rent Approval Queue */}
            <RentPipelineQueue stage="landlord_ops_approved" />

            {/* Financial Metrics */}
            <FinancialMetricsCards />

            {/* Quick Navigation Grid */}
            <div>
              <div className="flex items-center justify-between mb-3 px-0.5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Quick Actions
                </p>
                <ShareSupporterRecruit />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {quickNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavTo(item.id)}
                    className={cn(
                      'flex flex-col items-start gap-1.5 p-3.5 rounded-xl border transition-all text-left',
                      'hover:shadow-md active:scale-[0.97] active:shadow-none',
                      item.color
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <item.icon className="h-5 w-5" />
                      <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{item.label}</p>
                      <p className="text-[10px] opacity-60 leading-tight mt-0.5">{item.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PaymentModeAnalytics />
              <FinancialAlertsPanel />
            </div>
          </div>
        );
    }
  };

  return (
    <ExecutiveDashboardLayout role="coo" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
