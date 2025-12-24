import { CashFlowStatement } from '@/types/financial';
import { cn } from '@/lib/utils';

interface CashFlowViewProps {
  data: CashFlowStatement;
}

export function CashFlowView({ data }: CashFlowViewProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="glass-card rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="text-lg font-semibold">Cash Flow Statement</h3>
        <span className="text-sm text-muted-foreground">{data.period}</span>
      </div>

      {/* Operating Activities */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Operating Activities</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tenant Fees Received</span>
            <span className="font-mono text-success">{formatCurrency(data.operatingActivities.tenantFeesReceived)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rent Repayments</span>
            <span className="font-mono text-success">{formatCurrency(data.operatingActivities.rentRepayments)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform Rewards Paid</span>
            <span className="font-mono text-destructive">({formatCurrency(data.operatingActivities.platformRewardsPaid)})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Agent Commissions Paid</span>
            <span className="font-mono text-destructive">({formatCurrency(data.operatingActivities.agentCommissionsPaid)})</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Net Operating Cash</span>
          <span className={cn(
            "font-mono",
            data.operatingActivities.netOperating >= 0 ? "text-success" : "text-destructive"
          )}>
            {formatCurrency(data.operatingActivities.netOperating)}
          </span>
        </div>
      </div>

      {/* Investing Activities */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Investing Activities</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">System Infrastructure</span>
            <span className="font-mono">{formatCurrency(data.investingActivities.systemInfrastructure)}</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Net Investing Cash</span>
          <span className="font-mono">{formatCurrency(data.investingActivities.netInvesting)}</span>
        </div>
      </div>

      {/* Financing Activities */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Financing Activities</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Supporter Capital Inflows</span>
            <span className="font-mono text-success">{formatCurrency(data.financingActivities.supporterCapitalInflows)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Supporter Capital Withdrawals</span>
            <span className="font-mono text-destructive">({formatCurrency(data.financingActivities.supporterCapitalWithdrawals)})</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Net Financing Cash</span>
          <span className={cn(
            "font-mono",
            data.financingActivities.netFinancing >= 0 ? "text-success" : "text-destructive"
          )}>
            {formatCurrency(data.financingActivities.netFinancing)}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-2 pt-4 border-t-2 border-primary/30">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Opening Balance</span>
          <span className="font-mono">{formatCurrency(data.openingBalance)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net Cash Movement</span>
          <span className={cn(
            "font-mono",
            data.netCashMovement >= 0 ? "text-success" : "text-destructive"
          )}>
            {data.netCashMovement >= 0 ? '+' : ''}{formatCurrency(data.netCashMovement)}
          </span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Closing Balance</span>
          <span className="font-mono text-primary">{formatCurrency(data.closingBalance)}</span>
        </div>
      </div>
    </div>
  );
}
