import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, BarChart3, Shield, Banknote, ClipboardList, 
  BookOpen, AlertTriangle, TrendingUp, Loader2, Scale, ArrowDownToLine,
  Receipt, Wallet, Bell, Layers, DollarSign, FileText, HandCoins
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { FinancialStatementsPanel } from '@/components/manager/FinancialStatementsPanel';
import { BufferAccountPanel } from '@/components/manager/BufferAccountPanel';
import { SupporterROITrigger } from '@/components/manager/SupporterROITrigger';
import { AgentCommissionPayoutsManager } from '@/components/manager/AgentCommissionPayoutsManager';
import { WithdrawalRequestsManager } from '@/components/manager/WithdrawalRequestsManager';
import { GeneralLedger } from '@/components/manager/GeneralLedger';
import { FinancialOverview } from '@/components/manager/FinancialOverview';
import CFOReconciliationPanel from '@/components/cfo/CFOReconciliationPanel';

import { CFOPartnerPayoutProcessing } from '@/components/cfo/CFOPartnerPayoutProcessing';
import { DisbursementRegistry } from '@/components/cfo/DisbursementRegistry';
import { DailyCashPositionReport } from '@/components/cfo/DailyCashPositionReport';
import { PlatformCashBreakdown } from '@/components/cfo/PlatformCashBreakdown';
import { RevenueExpenseDashboard } from '@/components/cfo/RevenueExpenseDashboard';
import { ThresholdAlerts } from '@/components/cfo/ThresholdAlerts';
import { BatchPayoutProcessor } from '@/components/cfo/BatchPayoutProcessor';
import { ChannelBalanceTracker } from '@/components/cfo/ChannelBalanceTracker';
import { DirectCreditTool } from '@/components/cfo/DirectCreditTool';
import { ServiceCentrePayoutApproval } from '@/components/cfo/ServiceCentrePayoutApproval';
import { CFOROIRequests } from '@/components/cfo/CFOROIRequests';
import { CFOAgentRequisitions } from '@/components/cfo/CFOAgentRequisitions';
import { RentCollectionsFeed } from '@/components/cfo/RentCollectionsFeed';
import { AgentPerformanceRankings } from '@/components/cfo/AgentPerformanceRankings';
import { CFOPartnerInvestments } from '@/components/cfo/CFOPartnerInvestments';
export default function CFODashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: isManager, isLoading: roleLoading } = useQuery({
    queryKey: ['is-manager', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'manager')
        .single();
      return !!data;
    },
    enabled: !!user?.id,
  });

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) { navigate('/auth'); return null; }
  if (isManager === false) { navigate('/dashboard'); return null; }

  const tabs = [
    { id: 'overview', label: 'Pending Approvals', icon: Bell },
    { id: 'wallet-payout', label: 'Pay to Wallet', icon: Wallet },
    { id: 'roi', label: 'ROI Requests', icon: TrendingUp },
    { id: 'payouts', label: 'Rent Payouts', icon: Banknote },
    { id: 'requisitions', label: 'Financial Agents', icon: FileText },
    { id: 'statements', label: 'Statements', icon: BookOpen },
    { id: 'solvency', label: 'Solvency', icon: Shield },
    { id: 'reconciliation', label: 'Reconcile', icon: Scale },
    { id: 'ledger', label: 'Ledger', icon: ClipboardList },
    { id: 'investments', label: 'Investments', icon: HandCoins },
    { id: 'collections', label: 'Collections', icon: Receipt },
    { id: 'rankings', label: 'Rankings', icon: TrendingUp },
    { id: 'cash', label: 'Cash Position', icon: Wallet },
    { id: 'channels', label: 'Channels', icon: Receipt },
    { id: 'revenue', label: 'P&L', icon: DollarSign },
    { id: 'disbursements', label: 'Disbursements', icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b">
        <div className="flex items-center gap-3 p-4 max-w-7xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-10 w-10 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              CFO Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">Financial governance & oversight</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap gap-1 bg-muted/50 p-1 rounded-xl">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={`flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground ${
                  tab.id === 'wallet-payout' ? 'ring-2 ring-primary/40 font-bold bg-primary/10' : ''
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.slice(0, 4)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <ThresholdAlerts />
            <FinancialOverview />
          </TabsContent>

          {/* Pay to Wallet Tab */}
          <TabsContent value="wallet-payout" className="space-y-6">
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                <Wallet className="h-5 w-5 text-primary" />
                💳 Pay Out to Any User's Wallet
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Search a user by name or phone number, enter the amount, and credit or debit their wallet instantly.
              </p>
              <DirectCreditTool />
            </div>
          </TabsContent>

          {/* ROI Requests Tab */}
          <TabsContent value="roi" className="space-y-6">
            <CFOROIRequests />
          </TabsContent>

          {/* Cash Position Tab */}
          <TabsContent value="cash" className="space-y-6">
            <DailyCashPositionReport />
            <PlatformCashBreakdown />
          </TabsContent>

          {/* Channel Balances & Direct Credit Tab */}
          <TabsContent value="channels" className="space-y-6">
            <ChannelBalanceTracker />
            <DirectCreditTool />
          </TabsContent>

          {/* Revenue vs Expense (P&L) Tab */}
          <TabsContent value="revenue" className="space-y-6">
            <RevenueExpenseDashboard />
          </TabsContent>

          {/* Disbursement Registry Tab */}
          <TabsContent value="disbursements" className="space-y-6">
            <DisbursementRegistry />
          </TabsContent>

          {/* Financial Statements Tab */}
          <TabsContent value="statements" className="space-y-6">
            <FinancialStatementsPanel />
          </TabsContent>

          {/* Solvency Monitoring Tab */}
          <TabsContent value="solvency" className="space-y-6">
            <BufferAccountPanel />
          </TabsContent>

          {/* Payout Authorization Tab */}
          <TabsContent value="payouts" className="space-y-6">
            <ServiceCentrePayoutApproval />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Batch Payout Processing
                </h3>
                <BatchPayoutProcessor />
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Payout Authorization Gates
                </h3>
                <SupporterROITrigger />
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" />
                  Commission Disbursements
                </h3>
                <AgentCommissionPayoutsManager />
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-primary" />
                  Withdrawal Approvals
                </h3>
                <CFOPartnerPayoutProcessing />
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" />
                All Withdrawal Requests
              </h3>
              <WithdrawalRequestsManager />
            </div>
          </TabsContent>

          {/* Requisitions Tab */}
          <TabsContent value="requisitions" className="space-y-6">
            <CFOAgentRequisitions />
          </TabsContent>

          {/* Collections Tab */}
          <TabsContent value="collections" className="space-y-6">
            <RentCollectionsFeed />
          </TabsContent>

          {/* Rankings Tab */}
          <TabsContent value="rankings" className="space-y-6">
            <AgentPerformanceRankings />
          </TabsContent>

          {/* Investments Tab */}
          <TabsContent value="investments" className="space-y-6">
            <CFOPartnerInvestments />
          </TabsContent>

          {/* Reconciliation Tab */}
          <TabsContent value="reconciliation" className="space-y-6">
            <CFOReconciliationPanel />
          </TabsContent>

          {/* Ledger Tab */}
          <TabsContent value="ledger" className="space-y-6">
            <GeneralLedger />
          </TabsContent>
        </Tabs>
      </div>

      
    </div>
  );
}
