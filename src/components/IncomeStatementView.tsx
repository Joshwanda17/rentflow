import { IncomeStatement } from '@/types/financial';
import { cn } from '@/lib/utils';

interface IncomeStatementViewProps {
  data: IncomeStatement;
}

export function IncomeStatementView({ data }: IncomeStatementViewProps) {
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
        <h3 className="text-lg font-semibold">Income Statement</h3>
        <span className="text-sm text-muted-foreground">{data.period}</span>
      </div>

      {/* Revenue Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Platform Revenue</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Access Fees</span>
            <span className="font-mono">{formatCurrency(data.revenue.accessFees)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Request Fees</span>
            <span className="font-mono">{formatCurrency(data.revenue.requestFees)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Other Service Income</span>
            <span className="font-mono">{formatCurrency(data.revenue.otherServiceIncome)}</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Total Revenue</span>
          <span className="font-mono text-success">{formatCurrency(data.revenue.total)}</span>
        </div>
      </div>

      {/* Service Delivery Costs */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Service Delivery Costs</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform Rewards</span>
            <span className="font-mono text-destructive">({formatCurrency(data.serviceDeliveryCosts.platformRewards)})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Agent Commissions</span>
            <span className="font-mono text-destructive">({formatCurrency(data.serviceDeliveryCosts.agentCommissions)})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transaction Expenses</span>
            <span className="font-mono text-destructive">({formatCurrency(data.serviceDeliveryCosts.transactionExpenses)})</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Total Service Costs</span>
          <span className="font-mono text-destructive">({formatCurrency(data.serviceDeliveryCosts.total)})</span>
        </div>
      </div>

      {/* Operating Expenses */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Operating Expenses</span>
        <span className="font-mono text-destructive">({formatCurrency(data.operatingExpenses)})</span>
      </div>

      {/* Net Operating Income */}
      <div className={cn(
        "flex justify-between text-lg font-bold pt-4 border-t-2 border-primary/30",
        data.netOperatingIncome >= 0 ? "text-success" : "text-destructive"
      )}>
        <span>Net Operating Income</span>
        <span className="font-mono">{formatCurrency(data.netOperatingIncome)}</span>
      </div>
    </div>
  );
}
