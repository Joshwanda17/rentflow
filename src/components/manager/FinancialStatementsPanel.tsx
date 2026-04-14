import { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { FileText, TrendingUp, Wallet, BarChart3, Download, FileSpreadsheet, RefreshCw, Loader2, Calendar, ArrowUpRight, ArrowDownRight, Minus, GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { exportToCSV } from '@/lib/exportUtils';
import { useFinancialStatements, type StatementPeriod, type FinancialStatementsData, type ComparisonMode, type ComparisonMetrics, type DeltaValue } from '@/hooks/useFinancialStatements';
import { Progress } from '@/components/ui/progress';

import { formatDynamic as formatUGX } from '@/lib/currencyFormat';

const PERIODS: { value: StatementPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: '7 Days' },
  { value: '30days', label: '30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

const COMPARISON_MODES: { value: ComparisonMode; label: string; short: string }[] = [
  { value: 'none', label: 'No Comparison', short: 'Off' },
  { value: 'dod', label: 'Day over Day', short: 'DoD' },
  { value: 'wow', label: 'Week over Week', short: 'WoW' },
  { value: 'mom', label: 'Month over Month', short: 'MoM' },
  { value: 'yoy', label: 'Year over Year', short: 'YoY' },
];

function DeltaBadge({ delta }: { delta: DeltaValue | undefined }) {
  if (!delta || (delta.change === 0 && delta.changePercent === null)) return null;
  const isPositive = delta.change > 0;
  const isNegative = delta.change < 0;
  const isNeutral = delta.change === 0;
  const pct = delta.changePercent !== null ? `${delta.changePercent > 0 ? '+' : ''}${delta.changePercent.toFixed(1)}%` : '';
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium rounded-full px-1.5 py-0.5 ml-1',
      isPositive && 'bg-success/10 text-success',
      isNegative && 'bg-destructive/10 text-destructive',
      isNeutral && 'bg-muted text-muted-foreground',
    )}>
      {isPositive && <ArrowUpRight className="h-2.5 w-2.5" />}
      {isNegative && <ArrowDownRight className="h-2.5 w-2.5" />}
      {isNeutral && <Minus className="h-2.5 w-2.5" />}
      {pct || formatUGX(Math.abs(delta.change))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function LineItem({ label, value, negative, bold, indent, delta }: { label: string; value: number; negative?: boolean; bold?: boolean; indent?: boolean; delta?: DeltaValue }) {
  const colored = negative
    ? value > 0 ? 'text-destructive' : 'text-muted-foreground'
    : value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-muted-foreground';
  return (
    <div className={cn('flex justify-between items-center', indent && 'pl-4', bold ? 'font-semibold border-t border-border/50 pt-2 mt-1' : 'text-sm')}>
      <span className={cn(bold ? '' : 'text-muted-foreground', 'flex items-center')}>
        {label}
        {delta && <DeltaBadge delta={delta} />}
      </span>
      <span className={cn('font-mono', colored)}>
        {negative && value > 0 ? `(${formatUGX(value)})` : formatUGX(value)}
      </span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mt-4 mb-2">{children}</h4>;
}

function IncomeStatementSection({ d, cm }: { d: FinancialStatementsData['incomeStatement']; cm?: ComparisonMetrics | null }) {
  return (
    <div className="space-y-1">
      <SectionHeader>Revenue Recognition</SectionHeader>
      <p className="text-[10px] text-muted-foreground pl-4 -mt-1 mb-1">Expected revenue from active rent requests vs. collected (realized) through ledger</p>
      <LineItem label="Expected Access Fees" value={d.revenueRecognition.expectedAccessFees} indent />
      <LineItem label="Expected Request Fees" value={d.revenueRecognition.expectedRequestFees} indent />
      <LineItem label="Total Expected Revenue" value={d.revenueRecognition.totalExpectedRevenue} bold />
      <LineItem label="Realized Access Fees" value={d.revenueRecognition.realizedAccessFees} indent />
      <LineItem label="Realized Request Fees" value={d.revenueRecognition.realizedRequestFees} indent />
      <LineItem label="Total Realized Revenue" value={d.revenueRecognition.totalRealizedRevenue} bold />
      <div className="flex justify-between items-center text-xs pl-4 pr-2">
        <span className="text-warning font-medium">Deferred Revenue (Not Yet Collected)</span>
        <span className="font-mono text-warning font-medium">{formatUGX(d.revenueRecognition.deferredRevenue)}</span>
      </div>
      <div className="flex justify-between items-center text-xs pl-4 pr-2">
        <span className="text-muted-foreground">Recognition Rate</span>
        <span className="font-mono text-muted-foreground">{d.revenueRecognition.recognitionRate.toFixed(1)}%</span>
      </div>

      <SectionHeader>Realized Revenue (Ledger-Confirmed)</SectionHeader>
      <LineItem label="Tenant Access Fees" value={d.revenue.accessFees} indent delta={cm?.accessFees} />
      <LineItem label="Tenant Request Fees" value={d.revenue.requestFees} indent delta={cm?.requestFees} />
      <LineItem label="Other Service Income" value={d.revenue.otherServiceIncome} indent delta={cm?.otherServiceIncome} />
      <LineItem label="Advance Access Fees Collected" value={d.revenue.advanceAccessFeesCollected} indent delta={cm?.advanceAccessFeesCollected} />
      <LineItem label="Total Revenue" value={d.revenue.total} bold delta={cm?.totalRevenue} />

      <SectionHeader>Cost of Revenue (Service Delivery)</SectionHeader>
      <LineItem label="Platform Rewards (Supporters)" value={d.serviceDeliveryCosts.platformRewards} negative indent />
      <LineItem label="Agent Commissions" value={d.serviceDeliveryCosts.agentCommissions} negative indent />
      <LineItem label="Referral Bonuses" value={d.serviceDeliveryCosts.referralBonuses} negative indent />
      <LineItem label="Agent Bonuses" value={d.serviceDeliveryCosts.agentBonuses} negative indent />
      <LineItem label="Transaction Expenses" value={d.serviceDeliveryCosts.transactionExpenses} negative indent />
      <LineItem label="Total Cost of Revenue" value={d.serviceDeliveryCosts.total} negative bold delta={cm?.totalServiceCosts} />

      {/* GAAP: Gross Profit */}
      <div className={cn(
        'flex justify-between items-center font-semibold pt-2 mt-1 border-t border-primary/20',
        d.grossProfit >= 0 ? 'text-success' : 'text-destructive'
      )}>
        <span className="flex items-center">Gross Profit{cm && <DeltaBadge delta={cm.grossProfit} />}</span>
        <span className="font-mono">{formatUGX(d.grossProfit)}</span>
      </div>
      <div className="flex justify-between items-center text-xs pl-4 pr-2">
        <span className="text-muted-foreground">Gross Margin</span>
        <span className="font-mono text-muted-foreground">{d.grossMargin.toFixed(1)}%</span>
      </div>

      <SectionHeader>Operating Expenses</SectionHeader>
      <LineItem label="Payroll & Staff Costs" value={d.operatingExpenses.payrollExpenses} negative indent />
      <LineItem label="Agent Requisitions" value={d.operatingExpenses.agentRequisitions} negative indent />
      <LineItem label="Financial Agent Expenses" value={d.operatingExpenses.financialAgentExpenses} negative indent />
      <LineItem label="Marketing Expenses" value={d.operatingExpenses.marketingExpenses} negative indent />
      <LineItem label="Research & Development" value={d.operatingExpenses.researchDevelopment} negative indent />
      <LineItem label="Tax Expense" value={d.operatingExpenses.taxExpense} negative indent />
      <LineItem label="Interest Expense" value={d.operatingExpenses.interestExpense} negative indent />
      <LineItem label="Equipment & Depreciation" value={d.operatingExpenses.equipmentExpense} negative indent />
      {(d.operatingExpenses.operationalSubcategories.salaries > 0 ||
        d.operatingExpenses.operationalSubcategories.transport > 0 ||
        d.operatingExpenses.operationalSubcategories.food > 0 ||
        d.operatingExpenses.operationalSubcategories.officeRent > 0 ||
        d.operatingExpenses.operationalSubcategories.internet > 0 ||
        d.operatingExpenses.operationalSubcategories.airtime > 0 ||
        d.operatingExpenses.operationalSubcategories.stationery > 0) && (
        <>
          <p className="text-[10px] text-muted-foreground pl-4 mt-1 font-medium">Operational Breakdown:</p>
          {d.operatingExpenses.operationalSubcategories.salaries > 0 && <LineItem label="  Salaries" value={d.operatingExpenses.operationalSubcategories.salaries} negative indent />}
          {d.operatingExpenses.operationalSubcategories.transport > 0 && <LineItem label="  Transport" value={d.operatingExpenses.operationalSubcategories.transport} negative indent />}
          {d.operatingExpenses.operationalSubcategories.food > 0 && <LineItem label="  Food" value={d.operatingExpenses.operationalSubcategories.food} negative indent />}
          {d.operatingExpenses.operationalSubcategories.officeRent > 0 && <LineItem label="  Office Rent" value={d.operatingExpenses.operationalSubcategories.officeRent} negative indent />}
          {d.operatingExpenses.operationalSubcategories.internet > 0 && <LineItem label="  Internet" value={d.operatingExpenses.operationalSubcategories.internet} negative indent />}
          {d.operatingExpenses.operationalSubcategories.airtime > 0 && <LineItem label="  Airtime" value={d.operatingExpenses.operationalSubcategories.airtime} negative indent />}
          {d.operatingExpenses.operationalSubcategories.stationery > 0 && <LineItem label="  Stationery" value={d.operatingExpenses.operationalSubcategories.stationery} negative indent />}
        </>
      )}
      <LineItem label="General & Admin Expenses" value={d.operatingExpenses.generalOperating} negative indent />
      <LineItem label="Total Operating Expenses" value={d.operatingExpenses.total} negative bold delta={cm?.totalOperatingExpenses} />

      {/* GAAP: Operating Income (EBIT before D&A) */}
      <div className={cn(
        'flex justify-between items-center font-semibold pt-2 mt-1 border-t border-primary/20',
        d.operatingIncome >= 0 ? 'text-success' : 'text-destructive'
      )}>
        <span className="flex items-center">Operating Income (EBIT){cm && <DeltaBadge delta={cm.operatingIncome} />}</span>
        <span className="font-mono">{formatUGX(d.operatingIncome)}</span>
      </div>
      <div className="flex justify-between items-center text-xs pl-4 pr-2">
        <span className="text-muted-foreground">Operating Margin</span>
        <span className="font-mono text-muted-foreground">{d.operatingMargin.toFixed(1)}%</span>
      </div>

      {/* GAAP: D&A Schedule */}
      {(d.depreciation > 0 || d.amortization > 0) && (
        <>
          <SectionHeader>Depreciation & Amortization</SectionHeader>
          {d.depreciation > 0 && <LineItem label="Depreciation (Property & Equipment)" value={d.depreciation} negative indent />}
          {d.amortization > 0 && <LineItem label="Amortization (Software & IP)" value={d.amortization} negative indent />}
        </>
      )}

      {/* GAAP: EBITDA */}
      <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex justify-between items-center font-bold">
          <span className="flex items-center text-primary">EBITDA{cm && <DeltaBadge delta={cm.ebitda} />}</span>
          <span className="font-mono text-primary">{formatUGX(d.ebitda)}</span>
        </div>
        <div className="flex justify-between items-center text-xs mt-1">
          <span className="text-muted-foreground">EBITDA Margin</span>
          <span className="font-mono text-muted-foreground">{d.ebitdaMargin.toFixed(1)}%</span>
        </div>
      </div>

      {/* GAAP: Below-the-Line (Interest & Tax) */}
      <SectionHeader>Interest & Tax</SectionHeader>
      <LineItem label="Interest Income" value={d.interestIncome} indent />
      <LineItem label="Interest Expense" value={d.interestExpense} negative indent />
      <LineItem label="Tax Provision" value={d.taxProvision} negative indent />

      {(d.adjustments.walletDeductions > 0 || d.adjustments.systemCorrections > 0 || d.adjustments.orphanReassignments > 0 || d.adjustments.orphanReversals > 0) && (
        <>
          <SectionHeader>Adjustments & Corrections</SectionHeader>
          {d.adjustments.walletDeductions > 0 && <LineItem label="Wallet Deductions (Recoveries)" value={d.adjustments.walletDeductions} indent />}
          {d.adjustments.systemCorrections > 0 && <LineItem label="System Balance Corrections" value={d.adjustments.systemCorrections} indent />}
          {d.adjustments.orphanReassignments > 0 && <LineItem label="Orphan Reassignments" value={d.adjustments.orphanReassignments} indent />}
          {d.adjustments.orphanReversals > 0 && <LineItem label="Orphan Reversals" value={d.adjustments.orphanReversals} negative indent />}
          <LineItem label="Net Adjustments" value={d.adjustments.total} bold />
        </>
      )}

      <div className={cn(
        'flex justify-between items-center text-base font-bold pt-3 border-t-2 border-primary/30 mt-2',
        d.netOperatingIncome >= 0 ? 'text-success' : 'text-destructive'
      )}>
        <span className="flex items-center">Net Income{cm && <DeltaBadge delta={cm.netOperatingIncome} />}</span>
        <span className="font-mono">{formatUGX(d.netOperatingIncome)}</span>
      </div>
    </div>
  );
}

function CashFlowSection({ d, cm }: { d: FinancialStatementsData['cashFlow']; cm?: ComparisonMetrics | null }) {
  return (
    <div className="space-y-1">
      <SectionHeader>Platform Operating Activities</SectionHeader>
      <LineItem label="Tenant Fees Received" value={d.operatingActivities.tenantFeesReceived} indent />
      <LineItem label="Other Platform Income" value={d.operatingActivities.otherServiceIncome} indent />
      <LineItem label="Platform Rewards Paid" value={d.operatingActivities.platformRewardsPaid} negative indent />
      <LineItem label="Agent Commissions Paid" value={d.operatingActivities.agentCommissionsPaid} negative indent />
      {d.operatingActivities.agentCommissionWithdrawals > 0 && (
        <LineItem label="Agent Commission Withdrawals" value={d.operatingActivities.agentCommissionWithdrawals} negative indent />
      )}
      {d.operatingActivities.agentCommissionUsedForRent > 0 && (
        <LineItem label="Agent Commission Used for Rent" value={d.operatingActivities.agentCommissionUsedForRent} negative indent />
      )}
      <LineItem label="Payroll Paid" value={d.operatingActivities.payrollPaid} negative indent />
      <LineItem label="Agent Requisitions Paid" value={d.operatingActivities.agentRequisitionsPaid} negative indent />
      <LineItem label="Financial Agent Expenses Paid" value={d.operatingActivities.financialAgentExpensesPaid} negative indent />
      <LineItem label="Marketing Expenses Paid" value={d.operatingActivities.marketingPaid} negative indent />
      <LineItem label="R&D Expenses Paid" value={d.operatingActivities.rdPaid} negative indent />
      <LineItem label="Operational Expenses Paid" value={d.operatingActivities.operationalSubcatPaid} negative indent />
      <LineItem label="General Operating Expenses Paid" value={d.operatingActivities.withdrawalsPaid} negative indent />
      <LineItem label="Net Platform Operating Cash" value={d.operatingActivities.netOperating} bold delta={cm?.netOperatingCash} />

      <SectionHeader>Rent Facilitation (Capital Pass-Through)</SectionHeader>
      <p className="text-[10px] text-muted-foreground pl-4 -mt-1 mb-1">Tenant repayments received and rent deployed to landlords</p>
      <LineItem label="Rent Repayments Received" value={d.facilitationActivities.rentRepayments} indent />
      {d.facilitationActivities.rentPrincipalCollected > 0 && (
        <LineItem label="Rent Principal Collected" value={d.facilitationActivities.rentPrincipalCollected} indent />
      )}
      {d.facilitationActivities.agentRepayments > 0 && (
        <LineItem label="Agent Repayments" value={d.facilitationActivities.agentRepayments} indent />
      )}
      {d.facilitationActivities.advanceRepayments > 0 && (
        <LineItem label="Advance & Credit Repayments" value={d.facilitationActivities.advanceRepayments} indent />
      )}
      <LineItem label="Rent Deployed to Landlords" value={d.facilitationActivities.rentDeployments} negative indent />
      {d.facilitationActivities.rentDisbursements > 0 && (
        <LineItem label="Rent Disbursements" value={d.facilitationActivities.rentDisbursements} negative indent />
      )}
      <LineItem label="Net Facilitation" value={d.facilitationActivities.netFacilitation} bold delta={cm?.netFacilitation} />

      <SectionHeader>User Custody Flows (Not Platform Revenue)</SectionHeader>
      <p className="text-[10px] text-muted-foreground pl-4 -mt-1 mb-1">Funds held in trust — deposits, withdrawals, and wallet movements</p>
      <LineItem label="User Deposits Received" value={d.custodialActivities.userDeposits} indent />
      {d.custodialActivities.roiWalletCredits > 0 && (
        <LineItem label="ROI Wallet Credits" value={d.custodialActivities.roiWalletCredits} indent />
      )}
      {d.custodialActivities.walletCommissionCredits > 0 && (
        <LineItem label="Commission & Bonus Credits" value={d.custodialActivities.walletCommissionCredits} indent />
      )}
      {d.custodialActivities.walletCorrectionCredits > 0 && (
        <LineItem label="CFO Credits (Corrections)" value={d.custodialActivities.walletCorrectionCredits} indent />
      )}
      {d.custodialActivities.rentFloatFunding > 0 && (
        <LineItem label="Rent Float Funding" value={d.custodialActivities.rentFloatFunding} indent />
      )}
      <LineItem label="User Withdrawals Processed" value={d.custodialActivities.userWithdrawals} negative indent />
      {d.custodialActivities.userTransfers > 0 && (
        <LineItem label="Wallet Transfers" value={d.custodialActivities.userTransfers} negative indent />
      )}
      {d.custodialActivities.walletDeductions > 0 && (
        <LineItem label="Wallet Deductions" value={d.custodialActivities.walletDeductions} negative indent />
      )}
      {d.custodialActivities.agentFloatUsedForRent > 0 && (
        <LineItem label="Agent Float Used for Rent" value={d.custodialActivities.agentFloatUsedForRent} negative indent />
      )}
      {d.custodialActivities.walletCorrectionDebits > 0 && (
        <LineItem label="CFO Debits (Corrections)" value={d.custodialActivities.walletCorrectionDebits} negative indent />
      )}
      <LineItem label="Net Change in Custody" value={d.custodialActivities.netCustodial} bold delta={cm?.netCustodial} />

      <SectionHeader>Financing Activities</SectionHeader>
      <LineItem label="Supporter Capital Inflows" value={d.financingActivities.supporterCapitalInflows} indent />
      {d.financingActivities.partnerFunding > 0 && (
        <LineItem label="Partner Funding" value={d.financingActivities.partnerFunding} indent />
      )}
      {d.financingActivities.shareCapital > 0 && (
        <LineItem label="Share Capital" value={d.financingActivities.shareCapital} indent />
      )}
      {d.financingActivities.roiReinvestment > 0 && (
        <LineItem label="ROI Reinvestment" value={d.financingActivities.roiReinvestment} indent />
      )}
      <LineItem label="Supporter Capital Withdrawals" value={d.financingActivities.supporterCapitalWithdrawals} negative indent />
      <LineItem label="Net Financing Cash" value={d.financingActivities.netFinancing} bold delta={cm?.netFinancing} />

      <div className="pt-3 mt-2 border-t-2 border-primary/30 space-y-1">
        <LineItem label="Opening Platform Balance" value={d.openingBalance} />
        <div className={cn('flex justify-between items-center text-sm font-semibold', d.netCashMovement >= 0 ? 'text-success' : 'text-destructive')}>
          <span className="flex items-center">Net Platform Cash Movement{cm && <DeltaBadge delta={cm.netCashMovement} />}</span>
          <span className="font-mono">{d.netCashMovement >= 0 ? '+' : ''}{formatUGX(d.netCashMovement)}</span>
        </div>
        <div className="flex justify-between items-center text-base font-bold">
          <span className="flex items-center">Closing Platform Balance{cm && <DeltaBadge delta={cm.closingBalance} />}</span>
          <span className="font-mono text-primary">{formatUGX(d.closingBalance)}</span>
        </div>
      </div>
    </div>
  );
}

function BalanceSheetSection({ d }: { d: FinancialStatementsData['balanceSheet'] }) {
  const balanced = Math.abs(d.assets.totalAssets - (d.platformObligations.totalObligations + d.platformEquity.totalEquity)) < 1;
  return (
    <div className="space-y-1">
      <SectionHeader>Assets</SectionHeader>
      <LineItem label="Platform Cash (Earned Revenue)" value={d.assets.platformCash} indent />
      <LineItem label="User Funds Held in Custody" value={d.assets.userFundsHeld} indent />
      <LineItem label="Rent Receivables (Funded)" value={d.assets.receivables} indent />
      {d.assets.rentReceivablesCreated > 0 && (
        <LineItem label="Rent Receivables Created" value={d.assets.rentReceivablesCreated} indent />
      )}
      <LineItem label="Advance Access Fee Receivables" value={d.assets.advanceAccessFeeReceivables} indent />
      <LineItem label="Promissory Notes Receivable" value={d.assets.promissoryNotesReceivable} indent />
      <LineItem label="Total Assets" value={d.assets.totalAssets} bold />

      <SectionHeader>Obligations (Liabilities)</SectionHeader>
      <p className="text-[10px] text-muted-foreground pl-4 -mt-1 mb-1">User wallets are custodial — these funds belong to users, not the platform</p>
      <LineItem label="User Wallet Balances (Custody)" value={d.platformObligations.userWalletCustody} negative indent />
      <LineItem label="Pending Withdrawal Provisions" value={d.platformObligations.pendingWithdrawals} negative indent />
      <LineItem label="Accrued Platform Rewards" value={d.platformObligations.accruedPlatformRewards} negative indent />
      <LineItem label="Agent Commissions Payable" value={d.platformObligations.agentCommissionsPayable} negative indent />
      {d.platformObligations.deferredRevenue > 0 && (
        <LineItem label="Deferred Revenue (Unrecognized Fees)" value={d.platformObligations.deferredRevenue} negative indent />
      )}
      <LineItem label="Total Obligations" value={d.platformObligations.totalObligations} negative bold />

      <SectionHeader>Platform Equity</SectionHeader>
      <LineItem label="Retained Operating Surplus" value={d.platformEquity.retainedOperatingSurplus} indent />
      <LineItem label="Total Equity" value={d.platformEquity.totalEquity} bold />

      {/* GAAP: AR Aging Schedule */}
      {d.arAging.total > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Accounts Receivable Aging</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Current (0–30 days)</span>
            <span className="font-mono text-right text-success">{formatUGX(d.arAging.current)}</span>
            <span className="text-muted-foreground">31–60 days</span>
            <span className="font-mono text-right text-warning">{formatUGX(d.arAging.days31to60)}</span>
            <span className="text-muted-foreground">61–90 days</span>
            <span className="font-mono text-right text-warning">{formatUGX(d.arAging.days61to90)}</span>
            <span className="text-muted-foreground">90+ days (At Risk)</span>
            <span className="font-mono text-right text-destructive">{formatUGX(d.arAging.over90)}</span>
            <span className="font-medium">Total Receivables</span>
            <span className="font-mono text-right font-medium">{formatUGX(d.arAging.total)}</span>
            <span className="text-muted-foreground">Bad Debt Provision (Est.)</span>
            <span className="font-mono text-right text-destructive">{formatUGX(d.arAging.badDebtProvision)}</span>
          </div>
        </div>
      )}

      {/* GAAP: Working Capital */}
      <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Working Capital Analysis</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">Current Assets</span>
          <span className="font-mono text-right">{formatUGX(d.workingCapital.currentAssets)}</span>
          <span className="text-muted-foreground">Current Liabilities</span>
          <span className="font-mono text-right">{formatUGX(d.workingCapital.currentLiabilities)}</span>
          <span className="font-medium">Net Working Capital</span>
          <span className={cn('font-mono text-right font-medium', d.workingCapital.workingCapital >= 0 ? 'text-success' : 'text-destructive')}>
            {formatUGX(d.workingCapital.workingCapital)}
          </span>
          <span className="text-muted-foreground">Current Ratio</span>
          <span className="font-mono text-right">{d.workingCapital.currentRatio.toFixed(2)}x</span>
        </div>
      </div>

      {/* GAAP: Statement of Changes in Equity */}
      <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Statement of Changes in Equity</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">Opening Equity</span>
          <span className="font-mono text-right">{formatUGX(d.equityChanges.openingEquity)}</span>
          <span className="text-muted-foreground">Net Income for Period</span>
          <span className={cn('font-mono text-right', d.equityChanges.netIncome >= 0 ? 'text-success' : 'text-destructive')}>
            {formatUGX(d.equityChanges.netIncome)}
          </span>
          {d.equityChanges.otherChanges !== 0 && (
            <>
              <span className="text-muted-foreground">Other Changes</span>
              <span className="font-mono text-right">{formatUGX(d.equityChanges.otherChanges)}</span>
            </>
          )}
          <span className="font-medium">Closing Equity</span>
          <span className="font-mono text-right font-medium">{formatUGX(d.equityChanges.closingEquity)}</span>
        </div>
      </div>

      {/* Revenue Recognition Summary */}
      {d.revenueRecognition.expectedRevenue > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-warning/5 border border-warning/20 space-y-1">
          <p className="text-xs font-semibold text-warning uppercase tracking-wider">Revenue Recognition (ASC 606)</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Expected Revenue</span>
            <span className="font-mono text-right">{formatUGX(d.revenueRecognition.expectedRevenue)}</span>
            <span className="text-muted-foreground">Realized Revenue</span>
            <span className="font-mono text-right text-success">{formatUGX(d.revenueRecognition.realizedRevenue)}</span>
            <span className="text-muted-foreground">Deferred Revenue</span>
            <span className="font-mono text-right text-warning">{formatUGX(d.revenueRecognition.deferredRevenue)}</span>
            <span className="text-muted-foreground">Recognition Rate</span>
            <span className="font-mono text-right">{d.revenueRecognition.recognitionRate.toFixed(1)}%</span>
          </div>
        </div>
      )}

      <p className={cn('text-xs text-center pt-2 mt-1', balanced ? 'text-success' : 'text-destructive')}>
        {balanced ? '✓ Balance sheet is balanced (Assets = Obligations + Equity)' : '⚠ Requires reconciliation'}
      </p>
    </div>
  );
}

function FacilitatedVolumeSection({ d, cm }: { d: FinancialStatementsData['facilitatedVolume']; cm?: ComparisonMetrics | null }) {
  const utilizationRate = d.supporterCapitalDeployed > 0 ? Math.min(100, (d.totalFacilitatedRentVolume / d.supporterCapitalDeployed) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="text-center py-3 rounded-xl bg-primary/5 border border-primary/20">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Facilitated Rent Volume</p>
        <p className="text-3xl font-bold font-mono text-primary">{formatUGX(d.totalFacilitatedRentVolume)}</p>
        {cm && <DeltaBadge delta={cm.totalFacilitatedRentVolume} />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-center">
          <p className="text-xl font-bold text-success">{d.approvedRequests}</p>
          <p className="text-xs text-muted-foreground">Approved Requests</p>
        </div>
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-center">
          <p className="text-xl font-bold text-warning">{d.pendingRequests}</p>
          <p className="text-xs text-muted-foreground">Pending Requests</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary text-center">
          <p className="text-xl font-bold font-mono text-primary">{d.activeTenants}</p>
          <p className="text-xs text-muted-foreground">Unique Tenants</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary text-center">
          <p className="text-xl font-bold font-mono text-primary">{d.activeAgents}</p>
          <p className="text-xs text-muted-foreground">Active Agents</p>
        </div>
      </div>

      <div className="space-y-1">
        <SectionHeader>Fee Income Breakdown</SectionHeader>
        <LineItem label="Access Fee Income" value={d.totalAccessFeeIncome} indent />
        <LineItem label="Request Fee Income" value={d.totalRequestFeeIncome} indent />
        <LineItem label="Average Rent Amount" value={d.averageRentAmount} indent />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Capital Utilization Rate</span>
          <span className="font-mono font-semibold">{utilizationRate.toFixed(1)}%</span>
        </div>
        <Progress value={utilizationRate} className="h-2" />
        <div className="grid grid-cols-2 gap-2 text-xs text-center text-muted-foreground">
          <span>Deployed: {formatUGX(d.supporterCapitalDeployed)}</span>
          <span>Facilitated: {formatUGX(d.totalFacilitatedRentVolume)}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────

type Tab = 'income' | 'cashflow' | 'balance' | 'volume';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'income', label: 'Income', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'cashflow', label: 'Cash Flow', icon: <Wallet className="h-3.5 w-3.5" /> },
  { id: 'balance', label: 'Balance Sheet', icon: <FileText className="h-3.5 w-3.5" /> },
  { id: 'volume', label: 'Facilitated Volume', icon: <BarChart3 className="h-3.5 w-3.5" /> },
];

export function FinancialStatementsPanel() {
  const { data, loading, filters, generate, updatePeriod, comparisonMode, updateComparisonMode, comparisonMetrics, loadingComparison } = useFinancialStatements();
  const [activeTab, setActiveTab] = useState<Tab>('income');
  const [sharing, setSharing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    generate();
  }, []);

  const handleGenerate = async () => {
    try {
      await generate();
      toast.success('Financial statements generated');
    } catch {
      toast.error('Failed to generate statements');
    }
  };

  const handleChangePeriod = (period: StatementPeriod) => {
    updatePeriod(period);
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case 'income': return 'Income Statement';
      case 'cashflow': return 'Cash Flow Statement';
      case 'balance': return 'Balance Sheet';
      case 'volume': return 'Facilitated Volume Report';
    }
  };

  const handleExportCSV = () => {
    if (!data) { toast.error('Generate statements first'); return; }

    const rows: (string | number)[][] = [];
    const period = data.incomeStatement.period;

    if (activeTab === 'income') {
      const d = data.incomeStatement;
      rows.push(['WELILE — Income Statement', '', period]);
      rows.push(['', '', '']);
      rows.push(['REVENUE RECOGNITION', '', '']);
      rows.push(['Expected Access Fees', '', d.revenueRecognition.expectedAccessFees]);
      rows.push(['Expected Request Fees', '', d.revenueRecognition.expectedRequestFees]);
      rows.push(['Total Expected Revenue', '', d.revenueRecognition.totalExpectedRevenue]);
      rows.push(['Realized Access Fees', '', d.revenueRecognition.realizedAccessFees]);
      rows.push(['Realized Request Fees', '', d.revenueRecognition.realizedRequestFees]);
      rows.push(['Total Realized Revenue', '', d.revenueRecognition.totalRealizedRevenue]);
      rows.push(['Deferred Revenue', '', d.revenueRecognition.deferredRevenue]);
      rows.push(['Recognition Rate (%)', '', d.revenueRecognition.recognitionRate.toFixed(1)]);
      rows.push(['', '', '']);
      rows.push(['REALIZED REVENUE (LEDGER)', '', '']);
      rows.push(['Access Fees', '', d.revenue.accessFees]);
      rows.push(['Request Fees', '', d.revenue.requestFees]);
      rows.push(['Other Service Income', '', d.revenue.otherServiceIncome]);
      rows.push(['Advance Access Fees Collected', '', d.revenue.advanceAccessFeesCollected]);
      rows.push(['Total Revenue', '', d.revenue.total]);
      rows.push(['', '', '']);
      rows.push(['SERVICE DELIVERY COSTS', '', '']);
      rows.push(['Platform Rewards', '', -d.serviceDeliveryCosts.platformRewards]);
      rows.push(['Agent Commissions', '', -d.serviceDeliveryCosts.agentCommissions]);
      rows.push(['Referral Bonuses', '', -d.serviceDeliveryCosts.referralBonuses]);
      rows.push(['Agent Bonuses', '', -d.serviceDeliveryCosts.agentBonuses]);
      rows.push(['Transaction Expenses', '', -d.serviceDeliveryCosts.transactionExpenses]);
      rows.push(['Total Service Costs', '', -d.serviceDeliveryCosts.total]);
      rows.push(['Payroll & Staff Costs', '', -d.operatingExpenses.payrollExpenses]);
      rows.push(['Agent Requisitions', '', -d.operatingExpenses.agentRequisitions]);
      rows.push(['Financial Agent Expenses', '', -d.operatingExpenses.financialAgentExpenses]);
      rows.push(['Marketing Expenses', '', -d.operatingExpenses.marketingExpenses]);
      rows.push(['Research & Development', '', -d.operatingExpenses.researchDevelopment]);
      rows.push(['Tax Expense', '', -d.operatingExpenses.taxExpense]);
      rows.push(['Interest Expense', '', -d.operatingExpenses.interestExpense]);
      rows.push(['Equipment & Depreciation', '', -d.operatingExpenses.equipmentExpense]);
      if (d.operatingExpenses.operationalSubcategories.salaries) rows.push(['  Salaries', '', -d.operatingExpenses.operationalSubcategories.salaries]);
      if (d.operatingExpenses.operationalSubcategories.transport) rows.push(['  Transport', '', -d.operatingExpenses.operationalSubcategories.transport]);
      if (d.operatingExpenses.operationalSubcategories.food) rows.push(['  Food', '', -d.operatingExpenses.operationalSubcategories.food]);
      if (d.operatingExpenses.operationalSubcategories.officeRent) rows.push(['  Office Rent', '', -d.operatingExpenses.operationalSubcategories.officeRent]);
      if (d.operatingExpenses.operationalSubcategories.internet) rows.push(['  Internet', '', -d.operatingExpenses.operationalSubcategories.internet]);
      if (d.operatingExpenses.operationalSubcategories.airtime) rows.push(['  Airtime', '', -d.operatingExpenses.operationalSubcategories.airtime]);
      if (d.operatingExpenses.operationalSubcategories.stationery) rows.push(['  Stationery', '', -d.operatingExpenses.operationalSubcategories.stationery]);
      if (d.operatingExpenses.operationalSubcategories.propertyEquipment) rows.push(['  Property & Equipment', '', -d.operatingExpenses.operationalSubcategories.propertyEquipment]);
      if (d.operatingExpenses.operationalSubcategories.taxes) rows.push(['  Taxes (legacy)', '', -d.operatingExpenses.operationalSubcategories.taxes]);
      if (d.operatingExpenses.operationalSubcategories.interests) rows.push(['  Interests (legacy)', '', -d.operatingExpenses.operationalSubcategories.interests]);
      rows.push(['General & Admin Expenses', '', -d.operatingExpenses.generalOperating]);
      rows.push(['Total Operating Expenses', '', -d.operatingExpenses.total]);
      rows.push(['', '', '']);
      rows.push(['ADJUSTMENTS & CORRECTIONS', '', '']);
      if (d.adjustments.walletDeductions) rows.push(['Wallet Deductions (Recoveries)', '', d.adjustments.walletDeductions]);
      if (d.adjustments.systemCorrections) rows.push(['System Balance Corrections', '', d.adjustments.systemCorrections]);
      if (d.adjustments.orphanReassignments) rows.push(['Orphan Reassignments', '', d.adjustments.orphanReassignments]);
      if (d.adjustments.orphanReversals) rows.push(['Orphan Reversals', '', -d.adjustments.orphanReversals]);
      rows.push(['Net Adjustments', '', d.adjustments.total]);
      rows.push(['NET OPERATING INCOME', '', d.netOperatingIncome]);
    } else if (activeTab === 'cashflow') {
      const d = data.cashFlow;
      rows.push(['WELILE — Cash Flow Statement', '', period]);
      rows.push(['', '', '']);
      rows.push(['OPERATING ACTIVITIES', '', '']);
      rows.push(['Tenant Fees Received', '', d.operatingActivities.tenantFeesReceived]);
      rows.push(['Other Platform Income', '', d.operatingActivities.otherServiceIncome]);
      rows.push(['Platform Rewards Paid', '', -d.operatingActivities.platformRewardsPaid]);
      rows.push(['Agent Commissions Paid', '', -d.operatingActivities.agentCommissionsPaid]);
      if (d.operatingActivities.agentCommissionWithdrawals) rows.push(['Agent Commission Withdrawals', '', -d.operatingActivities.agentCommissionWithdrawals]);
      if (d.operatingActivities.agentCommissionUsedForRent) rows.push(['Agent Commission Used for Rent', '', -d.operatingActivities.agentCommissionUsedForRent]);
      rows.push(['Payroll Paid', '', -d.operatingActivities.payrollPaid]);
      rows.push(['Agent Requisitions Paid', '', -d.operatingActivities.agentRequisitionsPaid]);
      rows.push(['Financial Agent Expenses Paid', '', -d.operatingActivities.financialAgentExpensesPaid]);
      rows.push(['Marketing Expenses Paid', '', -d.operatingActivities.marketingPaid]);
      rows.push(['R&D Expenses Paid', '', -d.operatingActivities.rdPaid]);
      rows.push(['Operational Expenses Paid', '', -d.operatingActivities.operationalSubcatPaid]);
      rows.push(['General Operating Expenses Paid', '', -d.operatingActivities.withdrawalsPaid]);
      rows.push(['Net Operating Cash', '', d.operatingActivities.netOperating]);
      rows.push(['', '', '']);
      rows.push(['RENT FACILITATION (PASS-THROUGH)', '', '']);
      rows.push(['Rent Repayments Received', '', d.facilitationActivities.rentRepayments]);
      if (d.facilitationActivities.rentPrincipalCollected) rows.push(['Rent Principal Collected', '', d.facilitationActivities.rentPrincipalCollected]);
      if (d.facilitationActivities.agentRepayments) rows.push(['Agent Repayments', '', d.facilitationActivities.agentRepayments]);
      if (d.facilitationActivities.advanceRepayments) rows.push(['Advance & Credit Repayments', '', d.facilitationActivities.advanceRepayments]);
      rows.push(['Rent Deployed to Landlords', '', -d.facilitationActivities.rentDeployments]);
      if (d.facilitationActivities.rentDisbursements) rows.push(['Rent Disbursements', '', -d.facilitationActivities.rentDisbursements]);
      rows.push(['Net Facilitation', '', d.facilitationActivities.netFacilitation]);
      rows.push(['', '', '']);
      rows.push(['CUSTODIAL ACTIVITIES (Not Platform Revenue)', '', '']);
      rows.push(['User Deposits Received', '', d.custodialActivities.userDeposits]);
      if (d.custodialActivities.roiWalletCredits) rows.push(['ROI Wallet Credits', '', d.custodialActivities.roiWalletCredits]);
      if (d.custodialActivities.walletCommissionCredits) rows.push(['Commission & Bonus Credits', '', d.custodialActivities.walletCommissionCredits]);
      if (d.custodialActivities.walletCorrectionCredits) rows.push(['CFO Credits (Corrections)', '', d.custodialActivities.walletCorrectionCredits]);
      if (d.custodialActivities.rentFloatFunding) rows.push(['Rent Float Funding', '', d.custodialActivities.rentFloatFunding]);
      rows.push(['User Withdrawals Processed', '', -d.custodialActivities.userWithdrawals]);
      if (d.custodialActivities.userTransfers) rows.push(['Wallet Transfers', '', -d.custodialActivities.userTransfers]);
      if (d.custodialActivities.walletDeductions) rows.push(['Wallet Deductions', '', -d.custodialActivities.walletDeductions]);
      if (d.custodialActivities.agentFloatUsedForRent) rows.push(['Agent Float Used for Rent', '', -d.custodialActivities.agentFloatUsedForRent]);
      if (d.custodialActivities.walletCorrectionDebits) rows.push(['CFO Debits (Corrections)', '', -d.custodialActivities.walletCorrectionDebits]);
      rows.push(['Net Change in Custody', '', d.custodialActivities.netCustodial]);
      rows.push(['', '', '']);
      rows.push(['FINANCING ACTIVITIES', '', '']);
      rows.push(['Supporter Capital Inflows', '', d.financingActivities.supporterCapitalInflows]);
      if (d.financingActivities.partnerFunding) rows.push(['Partner Funding', '', d.financingActivities.partnerFunding]);
      if (d.financingActivities.shareCapital) rows.push(['Share Capital', '', d.financingActivities.shareCapital]);
      if (d.financingActivities.roiReinvestment) rows.push(['ROI Reinvestment', '', d.financingActivities.roiReinvestment]);
      rows.push(['Supporter Capital Withdrawals', '', -d.financingActivities.supporterCapitalWithdrawals]);
      rows.push(['Net Financing Cash', '', d.financingActivities.netFinancing]);
      rows.push(['', '', '']);
      rows.push(['Opening Platform Balance', '', d.openingBalance]);
      rows.push(['Net Platform Cash Movement', '', d.netCashMovement]);
      rows.push(['CLOSING PLATFORM BALANCE', '', d.closingBalance]);
    } else if (activeTab === 'balance') {
      const d = data.balanceSheet;
      rows.push(['WELILE — Balance Sheet', '', period]);
      rows.push(['', '', '']);
      rows.push(['ASSETS', '', '']);
      rows.push(['Platform Cash (Earned Revenue)', '', d.assets.platformCash]);
      rows.push(['User Funds Held in Custody', '', d.assets.userFundsHeld]);
      rows.push(['Rent Receivables (Funded)', '', d.assets.receivables]);
      if (d.assets.rentReceivablesCreated) rows.push(['Rent Receivables Created', '', d.assets.rentReceivablesCreated]);
      rows.push(['Advance Access Fee Receivables', '', d.assets.advanceAccessFeeReceivables]);
      rows.push(['Promissory Notes Receivable', '', d.assets.promissoryNotesReceivable]);
      rows.push(['Total Assets', '', d.assets.totalAssets]);
      rows.push(['', '', '']);
      rows.push(['OBLIGATIONS (LIABILITIES)', '', '']);
      rows.push(['User Wallet Balances (Custody)', '', d.platformObligations.userWalletCustody]);
      rows.push(['Pending Withdrawal Provisions', '', d.platformObligations.pendingWithdrawals]);
      rows.push(['Accrued Platform Rewards', '', d.platformObligations.accruedPlatformRewards]);
      rows.push(['Agent Commissions Payable', '', d.platformObligations.agentCommissionsPayable]);
      if (d.platformObligations.deferredRevenue > 0) rows.push(['Deferred Revenue (Unrecognized Fees)', '', d.platformObligations.deferredRevenue]);
      rows.push(['Total Obligations', '', d.platformObligations.totalObligations]);
      rows.push(['', '', '']);
      rows.push(['PLATFORM EQUITY', '', '']);
      rows.push(['Retained Operating Surplus', '', d.platformEquity.retainedOperatingSurplus]);
      rows.push(['Total Equity', '', d.platformEquity.totalEquity]);
      rows.push(['', '', '']);
      rows.push(['REVENUE RECOGNITION (ASC 606)', '', '']);
      rows.push(['Expected Revenue', '', d.revenueRecognition.expectedRevenue]);
      rows.push(['Realized Revenue', '', d.revenueRecognition.realizedRevenue]);
      rows.push(['Deferred Revenue', '', d.revenueRecognition.deferredRevenue]);
      rows.push(['Recognition Rate (%)', '', d.revenueRecognition.recognitionRate]);
    } else {
      const d = data.facilitatedVolume;
      rows.push(['WELILE — Facilitated Volume Report', '', period]);
      rows.push(['Total Facilitated Rent Volume', '', d.totalFacilitatedRentVolume]);
      rows.push(['Total Rent Requests', '', d.totalRentRequests]);
      rows.push(['Approved Requests', '', d.approvedRequests]);
      rows.push(['Pending Requests', '', d.pendingRequests]);
      rows.push(['Active Tenants', '', d.activeTenants]);
      rows.push(['Active Agents', '', d.activeAgents]);
      rows.push(['Average Rent Amount', '', d.averageRentAmount]);
      rows.push(['Supporter Capital Deployed', '', d.supporterCapitalDeployed]);
      rows.push(['Access Fee Income', '', d.totalAccessFeeIncome]);
      rows.push(['Request Fee Income', '', d.totalRequestFeeIncome]);
    }

    exportToCSV({ headers: ['Item', 'Sub-item', 'Amount (UGX)'], rows }, `welile-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}`);
    toast.success('CSV exported');
  };

  const handleExportPDF = async () => {
    if (!data) { toast.error('Generate statements first'); return; }
    setSharing(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const margin = 15;
      let y = 20;

      // Header
      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, 0, pw, 12, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('WELILE TECHNOLOGIES LIMITED', margin, 8);
      pdf.text('CONFIDENTIAL', pw - margin - 25, 8);

      y = 22;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(getTabLabel(), margin, y);
      y += 7;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Period: ${data.incomeStatement.period}`, margin, y);
      pdf.text(`Generated: ${format(data.generatedAt, 'dd MMM yyyy, HH:mm')}`, pw - margin - 60, y);
      y += 6;
      pdf.setDrawColor(220, 220, 220);
      pdf.line(margin, y, pw - margin, y);
      y += 8;

      const addSection = (title: string) => {
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(37, 99, 235);
        pdf.text(title.toUpperCase(), margin, y);
        y += 5;
        pdf.setTextColor(0, 0, 0);
      };

      const addRow = (label: string, value: number, bold = false, negative = false, indent = false) => {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.setFontSize(bold ? 9 : 8);
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setTextColor(bold ? 0 : 80, bold ? 0 : 80, bold ? 0 : 80);
        pdf.text(label, indent ? margin + 6 : margin, y);
        const valStr = negative && value > 0 ? `(${formatUGX(value)})` : formatUGX(value);
        if (negative && value > 0) pdf.setTextColor(220, 38, 38);
        else if (!negative && value > 0) pdf.setTextColor(22, 163, 74);
        else pdf.setTextColor(0, 0, 0);
        pdf.text(valStr, pw - margin, y, { align: 'right' });
        pdf.setTextColor(0, 0, 0);
        if (bold) { pdf.setDrawColor(200, 200, 200); pdf.line(margin, y + 1, pw - margin, y + 1); }
        y += bold ? 6 : 5;
      };

      if (activeTab === 'income') {
        const d = data.incomeStatement;
        addSection('Revenue Recognition');
        addRow('Expected Access Fees', d.revenueRecognition.expectedAccessFees, false, false, true);
        addRow('Expected Request Fees', d.revenueRecognition.expectedRequestFees, false, false, true);
        addRow('Total Expected Revenue', d.revenueRecognition.totalExpectedRevenue, true);
        addRow('Realized Access Fees', d.revenueRecognition.realizedAccessFees, false, false, true);
        addRow('Realized Request Fees', d.revenueRecognition.realizedRequestFees, false, false, true);
        addRow('Total Realized Revenue', d.revenueRecognition.totalRealizedRevenue, true);
        addRow('Deferred Revenue', d.revenueRecognition.deferredRevenue, true, false, true);
        y += 3;
        addSection('Realized Revenue (Ledger-Confirmed)');
        addRow('Tenant Access Fees', d.revenue.accessFees, false, false, true);
        addRow('Tenant Request Fees', d.revenue.requestFees, false, false, true);
        addRow('Other Service Income', d.revenue.otherServiceIncome, false, false, true);
        addRow('Total Revenue', d.revenue.total, true);
        y += 3;
        addSection('Service Delivery Costs');
        addRow('Platform Rewards', d.serviceDeliveryCosts.platformRewards, false, true, true);
        addRow('Agent Commissions', d.serviceDeliveryCosts.agentCommissions, false, true, true);
        addRow('Referral Bonuses', d.serviceDeliveryCosts.referralBonuses, false, true, true);
        addRow('Agent Bonuses', d.serviceDeliveryCosts.agentBonuses, false, true, true);
        addRow('Transaction Expenses', d.serviceDeliveryCosts.transactionExpenses, false, true, true);
        addRow('Total Service Costs', d.serviceDeliveryCosts.total, true, true);
        y += 3;
        addSection('Operating Expenses');
        addRow('Payroll & Staff Costs', d.operatingExpenses.payrollExpenses, false, true, true);
        addRow('Agent Requisitions', d.operatingExpenses.agentRequisitions, false, true, true);
        addRow('Financial Agent Expenses', d.operatingExpenses.financialAgentExpenses, false, true, true);
        addRow('Marketing Expenses', d.operatingExpenses.marketingExpenses, false, true, true);
        addRow('Research & Development', d.operatingExpenses.researchDevelopment, false, true, true);
        addRow('Tax Expense', d.operatingExpenses.taxExpense, false, true, true);
        addRow('Interest Expense', d.operatingExpenses.interestExpense, false, true, true);
        addRow('Equipment & Depreciation', d.operatingExpenses.equipmentExpense, false, true, true);
        addRow('General & Admin', d.operatingExpenses.generalOperating, false, true, true);
        addRow('Total Operating Expenses', d.operatingExpenses.total, true, true);
        y += 3;
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(d.netOperatingIncome >= 0 ? 22 : 220, d.netOperatingIncome >= 0 ? 163 : 38, d.netOperatingIncome >= 0 ? 74 : 38);
        pdf.text('NET OPERATING INCOME', margin, y);
        pdf.text(formatUGX(d.netOperatingIncome), pw - margin, y, { align: 'right' });
      } else if (activeTab === 'cashflow') {
        const d = data.cashFlow;
        addSection('Platform Operating Activities');
        addRow('Tenant Fees Received', d.operatingActivities.tenantFeesReceived, false, false, true);
        addRow('Other Platform Income', d.operatingActivities.otherServiceIncome, false, false, true);
        addRow('Platform Rewards Paid', d.operatingActivities.platformRewardsPaid, false, true, true);
        addRow('Agent Commissions Paid', d.operatingActivities.agentCommissionsPaid, false, true, true);
        addRow('Marketing Expenses Paid', d.operatingActivities.marketingPaid, false, true, true);
        addRow('R&D Expenses Paid', d.operatingActivities.rdPaid, false, true, true);
        addRow('Operational Expenses Paid', d.operatingActivities.operationalSubcatPaid, false, true, true);
        addRow('Operating Expenses Paid', d.operatingActivities.withdrawalsPaid, false, true, true);
        addRow('Net Platform Operating Cash', d.operatingActivities.netOperating, true);
        y += 3;
        addSection('Rent Facilitation (Pass-Through)');
        addRow('Rent Repayments Received', d.facilitationActivities.rentRepayments, false, false, true);
        addRow('Rent Deployed to Landlords', d.facilitationActivities.rentDeployments, false, true, true);
        addRow('Net Facilitation', d.facilitationActivities.netFacilitation, true);
        y += 3;
        addSection('User Custody Flows (Not Revenue)');
        addRow('User Deposits Received', d.custodialActivities.userDeposits, false, false, true);
        addRow('User Withdrawals Processed', d.custodialActivities.userWithdrawals, false, true, true);
        addRow('Net Change in Custody', d.custodialActivities.netCustodial, true);
        y += 3;
        addSection('Financing Activities');
        addRow('Supporter Capital Inflows', d.financingActivities.supporterCapitalInflows, false, false, true);
        addRow('Supporter Capital Withdrawals', d.financingActivities.supporterCapitalWithdrawals, false, true, true);
        addRow('Net Financing Cash', d.financingActivities.netFinancing, true);
        y += 5;
        pdf.setDrawColor(37, 99, 235);
        pdf.line(margin, y, pw - margin, y);
        y += 5;
        addRow('Opening Platform Balance', d.openingBalance);
        addRow('Net Platform Cash Movement', d.netCashMovement);
        addRow('CLOSING PLATFORM BALANCE', d.closingBalance, true);
      } else if (activeTab === 'balance') {
        const d = data.balanceSheet;
        addSection('Assets');
        addRow('Platform Cash (Earned Revenue)', d.assets.platformCash, false, false, true);
        addRow('User Funds Held in Custody', d.assets.userFundsHeld, false, false, true);
        addRow('Rent Receivables (Funded)', d.assets.receivables, false, false, true);
        addRow('Advance Access Fee Receivables', d.assets.advanceAccessFeeReceivables, false, false, true);
        addRow('Promissory Notes Receivable', d.assets.promissoryNotesReceivable, false, false, true);
        addRow('Total Assets', d.assets.totalAssets, true);
        y += 3;
        addSection('Obligations (Liabilities)');
        addRow('User Wallet Balances (Custody)', d.platformObligations.userWalletCustody, false, true, true);
        addRow('Pending Withdrawal Provisions', d.platformObligations.pendingWithdrawals, false, true, true);
        addRow('Accrued Platform Rewards', d.platformObligations.accruedPlatformRewards, false, true, true);
        addRow('Agent Commissions Payable', d.platformObligations.agentCommissionsPayable, false, true, true);
        if (d.platformObligations.deferredRevenue > 0) {
          addRow('Deferred Revenue (Unrecognized Fees)', d.platformObligations.deferredRevenue, false, true, true);
        }
        addRow('Total Obligations', d.platformObligations.totalObligations, true, true);
        y += 3;
        addSection('Platform Equity');
        addRow('Retained Operating Surplus', d.platformEquity.retainedOperatingSurplus, false, false, true);
        addRow('Total Equity', d.platformEquity.totalEquity, true);
        y += 3;
        addSection('Revenue Recognition (ASC 606)');
        addRow('Expected Revenue', d.revenueRecognition.expectedRevenue, false, false, true);
        addRow('Realized Revenue', d.revenueRecognition.realizedRevenue, false, false, true);
        addRow('Deferred Revenue', d.revenueRecognition.deferredRevenue, false, true, true);
        addRow(`Recognition Rate: ${d.revenueRecognition.recognitionRate.toFixed(1)}%`, 0, false, false, true);
      } else {
        const d = data.facilitatedVolume;
        addSection('Facilitated Volume');
        addRow('Total Facilitated Rent Volume', d.totalFacilitatedRentVolume, true);
        y += 3;
        addSection('Request Activity');
        addRow('Total Rent Requests', d.totalRentRequests);
        addRow('Approved Requests', d.approvedRequests);
        addRow('Pending Requests', d.pendingRequests);
        y += 3;
        addSection('Network Activity');
        addRow('Active Tenants', d.activeTenants);
        addRow('Active Agents', d.activeAgents);
        addRow('Average Rent Amount', d.averageRentAmount);
        y += 3;
        addSection('Capital & Fees');
        addRow('Supporter Capital Deployed', d.supporterCapitalDeployed);
        addRow('Access Fee Income', d.totalAccessFeeIncome);
        addRow('Request Fee Income', d.totalRequestFeeIncome);
      }

      // Footer
      const ph = pdf.internal.pageSize.getHeight();
      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, ph - 8, pw, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.text('Welile Technologies Limited — welile.com — Confidential Financial Report', pw / 2, ph - 3, { align: 'center' });

      const fileName = `welile-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      const blob = pdf.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `Welile ${getTabLabel()}`, files: [file] });
        toast.success('Shared successfully!');
      } else {
        pdf.save(fileName);
        toast.success('PDF downloaded!');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') { toast.error('PDF export failed'); console.error(err); }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        {PERIODS.map(p => (
          <Button
            key={p.value}
            size="sm"
            variant={filters.period === p.value ? 'default' : 'outline'}
            className="text-xs h-7"
            onClick={() => handleChangePeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Comparison Mode Selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <GitCompareArrows className="h-4 w-4 text-muted-foreground shrink-0" />
        {COMPARISON_MODES.map(m => (
          <Button
            key={m.value}
            size="sm"
            variant={comparisonMode === m.value ? 'default' : 'outline'}
            className="text-xs h-7"
            onClick={() => updateComparisonMode(m.value)}
          >
            {m.short}
          </Button>
        ))}
        {loadingComparison && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full gap-2"
        size="lg"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {loading ? 'Generating Statements…' : data ? 'Regenerate Statements' : 'Generate Financial Statements'}
      </Button>

      {/* Generated Timestamp */}
      {data && (
        <p className="text-xs text-center text-muted-foreground">
          Generated {format(data.generatedAt, 'dd MMM yyyy, HH:mm')} · Period: {data.incomeStatement.period}
        </p>
      )}

      {/* Statement Tabs + Content */}
      {data && (
        <Card ref={contentRef}>
          <CardContent className="pt-4 pb-6">
            {/* Tab Switcher */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Statement Title */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <h3 className="text-sm font-semibold">{getTabLabel()}</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{data.incomeStatement.period}</Badge>
                {comparisonMode !== 'none' && comparisonMetrics && (
                  <Badge variant="secondary" className="text-[10px]">
                    vs {COMPARISON_MODES.find(m => m.value === comparisonMode)?.label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Active Statement */}
            {activeTab === 'income' && <IncomeStatementSection d={data.incomeStatement} cm={comparisonMetrics} />}
            {activeTab === 'cashflow' && <CashFlowSection d={data.cashFlow} cm={comparisonMetrics} />}
            {activeTab === 'balance' && <BalanceSheetSection d={data.balanceSheet} />}
            {activeTab === 'volume' && <FacilitatedVolumeSection d={data.facilitatedVolume} cm={comparisonMetrics} />}

            {/* Export Actions */}
            <div className="flex gap-2 mt-6 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={handleExportCSV}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={handleExportPDF} disabled={sharing}>
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                PDF / Share
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!data && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a period and generate statements</p>
          <p className="text-xs mt-1">Data is pulled live from the financial ledger</p>
        </div>
      )}
    </div>
  );
}
