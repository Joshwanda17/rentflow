import { FacilitatedVolumeStatement } from '@/types/financial';
import { Progress } from '@/components/ui/progress';

interface FacilitatedVolumeViewProps {
  data: FacilitatedVolumeStatement;
}

export function FacilitatedVolumeView({ data }: FacilitatedVolumeViewProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalCapital = data.utilizedCapital + data.unutilizedCapital;
  const utilizationRate = totalCapital > 0 ? (data.utilizedCapital / totalCapital) * 100 : 0;

  return (
    <div className="glass-card rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="text-lg font-semibold">Statement of Facilitated Volume</h3>
        <span className="text-sm text-muted-foreground">Current Period</span>
      </div>

      {/* Total Facilitated Volume */}
      <div className="text-center py-4">
        <p className="metric-label mb-2">Total Facilitated Rent Volume</p>
        <p className="text-4xl font-bold font-mono text-primary">
          {formatCurrency(data.totalFacilitatedRentVolume)}
        </p>
      </div>

      {/* Capital Utilization */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Capital Utilization</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Utilization Rate</span>
            <span className="font-mono font-semibold">{utilizationRate.toFixed(1)}%</span>
          </div>
          <Progress value={utilizationRate} className="h-3" />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-lg bg-success/10 border border-success/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Utilized</p>
            <p className="font-mono font-semibold text-success">{formatCurrency(data.utilizedCapital)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted border border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Unutilized</p>
            <p className="font-mono font-semibold">{formatCurrency(data.unutilizedCapital)}</p>
          </div>
        </div>
      </div>

      {/* Activity Metrics */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Activity Metrics</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-secondary">
            <p className="text-2xl font-bold font-mono text-primary">{data.activeTenants}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active Tenants</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-secondary">
            <p className="text-2xl font-bold font-mono text-primary">{data.activeAgents}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active Agents</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-secondary">
            <p className="text-lg font-bold font-mono text-primary">{formatCurrency(data.averageAccessPerTenant)}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Avg per Tenant</p>
          </div>
        </div>
      </div>
    </div>
  );
}
