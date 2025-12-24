import { BalanceSheet } from '@/types/financial';
import { cn } from '@/lib/utils';

interface BalanceSheetViewProps {
  data: BalanceSheet;
}

export function BalanceSheetView({ data }: BalanceSheetViewProps) {
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
        <h3 className="text-lg font-semibold">Platform Balance Sheet</h3>
        <span className="text-sm text-muted-foreground">Current Period</span>
      </div>

      {/* Assets */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Assets</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cash & Equivalents</span>
            <span className="font-mono">{formatCurrency(data.assets.cashAndEquivalents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receivables (Service-related)</span>
            <span className="font-mono">{formatCurrency(data.assets.receivables)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform Infrastructure</span>
            <span className="font-mono">{formatCurrency(data.assets.platformInfrastructure)}</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Total Assets</span>
          <span className="font-mono text-primary">{formatCurrency(data.assets.totalAssets)}</span>
        </div>
      </div>

      {/* Platform Obligations */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-warning uppercase tracking-wider">Platform Obligations</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pending Rent Facilitation</span>
            <span className="font-mono">{formatCurrency(data.platformObligations.pendingRentFacilitation)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Accrued Platform Rewards</span>
            <span className="font-mono">{formatCurrency(data.platformObligations.accruedPlatformRewards)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Agent Commissions Payable</span>
            <span className="font-mono">{formatCurrency(data.platformObligations.agentCommissionsPayable)}</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Total Obligations</span>
          <span className="font-mono text-warning">{formatCurrency(data.platformObligations.totalObligations)}</span>
        </div>
      </div>

      {/* Platform Equity */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-success uppercase tracking-wider">Platform Equity</h4>
        <div className="space-y-2 pl-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Retained Operating Surplus</span>
            <span className="font-mono">{formatCurrency(data.platformEquity.retainedOperatingSurplus)}</span>
          </div>
        </div>
        <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
          <span>Total Equity</span>
          <span className="font-mono text-success">{formatCurrency(data.platformEquity.totalEquity)}</span>
        </div>
      </div>

      {/* Balance Check */}
      <div className="pt-4 border-t-2 border-primary/30">
        <div className="flex justify-between text-lg font-bold">
          <span>Total Obligations + Equity</span>
          <span className="font-mono text-primary">
            {formatCurrency(data.platformObligations.totalObligations + data.platformEquity.totalEquity)}
          </span>
        </div>
        <p className={cn(
          "text-sm mt-2 text-center",
          Math.abs(data.assets.totalAssets - (data.platformObligations.totalObligations + data.platformEquity.totalEquity)) < 1
            ? "text-success"
            : "text-destructive"
        )}>
          {Math.abs(data.assets.totalAssets - (data.platformObligations.totalObligations + data.platformEquity.totalEquity)) < 1
            ? "✓ Balance sheet is balanced"
            : "⚠ Balance sheet requires reconciliation"}
        </p>
      </div>
    </div>
  );
}
