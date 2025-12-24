import { useState } from 'react';
import { useFinancialEngine } from '@/hooks/useFinancialEngine';
import { MetricCard } from '@/components/MetricCard';
import { TransactionForm } from '@/components/TransactionForm';
import { TransactionList } from '@/components/TransactionList';
import { IncomeStatementView } from '@/components/IncomeStatementView';
import { CashFlowView } from '@/components/CashFlowView';
import { BalanceSheetView } from '@/components/BalanceSheetView';
import { FacilitatedVolumeView } from '@/components/FacilitatedVolumeView';
import { RevenueChart } from '@/components/RevenueChart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Building2, 
  Wallet, 
  Users, 
  UserCheck, 
  TrendingUp, 
  CircleDollarSign,
  LayoutDashboard,
  FileText,
  PieChart,
  Activity
} from 'lucide-react';

export default function Index() {
  const {
    transactions,
    addTransaction,
    cashBalance,
    incomeStatement,
    cashFlowStatement,
    balanceSheet,
    facilitatedVolumeStatement,
    dashboardMetrics,
  } = useFinancialEngine();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">RentAccess Platform</h1>
              <p className="text-xs text-muted-foreground">Real-Time Financial Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right mr-4">
              <p className="text-xs text-muted-foreground">Cash Balance</p>
              <p className="font-mono font-bold text-lg text-primary">
                {new Intl.NumberFormat('en-UG', {
                  style: 'currency',
                  currency: 'UGX',
                  minimumFractionDigits: 0,
                }).format(cashBalance)}
              </p>
            </div>
            <TransactionForm onSubmit={addTransaction} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Dashboard Metrics */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Live Platform Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              label="Facilitated Rent Volume"
              value={dashboardMetrics.facilitatedRentVolume}
              icon={Building2}
              trend={dashboardMetrics.facilitatedRentVolume > 0 ? 'up' : 'neutral'}
            />
            <MetricCard
              label="Utilized Capital"
              value={dashboardMetrics.utilizedCapital}
              icon={Wallet}
              trend={dashboardMetrics.utilizedCapital > 0 ? 'up' : 'neutral'}
            />
            <MetricCard
              label="Active Tenants"
              value={dashboardMetrics.activeTenants}
              icon={Users}
            />
            <MetricCard
              label="Active Agents"
              value={dashboardMetrics.activeAgents}
              icon={UserCheck}
            />
            <MetricCard
              label="Platform Revenue"
              value={dashboardMetrics.platformRevenue}
              icon={TrendingUp}
              trend={dashboardMetrics.platformRevenue > 0 ? 'up' : 'neutral'}
            />
            <MetricCard
              label="Net Operating Income"
              value={dashboardMetrics.netOperatingIncome}
              icon={CircleDollarSign}
              trend={dashboardMetrics.netOperatingIncome > 0 ? 'up' : dashboardMetrics.netOperatingIncome < 0 ? 'down' : 'neutral'}
            />
          </div>
        </section>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Transactions */}
          <div className="lg:col-span-1 space-y-6">
            <TransactionList transactions={transactions} />
            <RevenueChart transactions={transactions} />
          </div>

          {/* Right Column - Financial Statements */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="income" className="w-full">
              <TabsList className="grid grid-cols-4 mb-6 bg-secondary">
                <TabsTrigger value="income" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Income</span>
                </TabsTrigger>
                <TabsTrigger value="cashflow" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Activity className="h-4 w-4" />
                  <span className="hidden sm:inline">Cash Flow</span>
                </TabsTrigger>
                <TabsTrigger value="balance" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <PieChart className="h-4 w-4" />
                  <span className="hidden sm:inline">Balance</span>
                </TabsTrigger>
                <TabsTrigger value="volume" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Volume</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="income" className="animate-slide-up">
                <IncomeStatementView data={incomeStatement} />
              </TabsContent>

              <TabsContent value="cashflow" className="animate-slide-up">
                <CashFlowView data={cashFlowStatement} />
              </TabsContent>

              <TabsContent value="balance" className="animate-slide-up">
                <BalanceSheetView data={balanceSheet} />
              </TabsContent>

              <TabsContent value="volume" className="animate-slide-up">
                <FacilitatedVolumeView data={facilitatedVolumeStatement} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>RentAccess Platform • Technology Marketplace • Not a Financial Institution</p>
          <p className="mt-1 text-xs">All statements use regulator-safe, platform-services terminology</p>
        </div>
      </footer>
    </div>
  );
}
