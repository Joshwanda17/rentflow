import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}

export function MetricCard({ 
  label, 
  value, 
  icon: Icon, 
  trend = 'neutral', 
  trendValue,
  className,
  variant = 'default'
}: MetricCardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-UG', {
        style: 'currency',
        currency: 'UGX',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    }
    return val;
  };

  const iconColors = {
    default: 'bg-muted text-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4 transition-all duration-150",
      className
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", iconColors[variant])}>
          <Icon className="h-4 w-4" />
        </div>
        {trend !== 'neutral' && trendValue && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-md",
            trend === 'up' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            <span>{trend === 'up' ? '↑' : '↓'}</span>
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold tracking-tight font-mono tabular-nums">
          {formatValue(value)}
        </p>
      </div>
    </div>
  );
}