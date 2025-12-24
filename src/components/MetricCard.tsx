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
    default: 'bg-primary/10 text-primary',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-card p-5 shadow-soft transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5 group",
      className
    )}>
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className={cn("p-2.5 rounded-xl transition-transform duration-300 group-hover:scale-110", iconColors[variant])}>
            <Icon className="h-5 w-5" />
          </div>
          {trend !== 'neutral' && trendValue && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trend === 'up' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              <span className="text-sm">{trend === 'up' ? '↑' : '↓'}</span>
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight font-mono tabular-nums animate-fade-in">
            {formatValue(value)}
          </p>
        </div>
      </div>
    </div>
  );
}