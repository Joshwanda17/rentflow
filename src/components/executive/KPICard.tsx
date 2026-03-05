import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  color?: string;
  loading?: boolean;
  subtitle?: string;
}

export function KPICard({ title, value, icon: Icon, trend, color = 'bg-primary/10 text-primary', loading, subtitle }: KPICardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3 min-w-0">
      <div className={cn('p-2.5 rounded-xl shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground truncate">{title}</p>
        {loading ? (
          <div className="h-7 w-20 bg-muted animate-pulse rounded mt-1" />
        ) : (
          <p className="text-xl font-bold truncate">{value}</p>
        )}
        {trend && (
          <p className={cn('text-[10px] mt-0.5', trend.value >= 0 ? 'text-green-600' : 'text-red-500')}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
