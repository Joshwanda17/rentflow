import { LucideIcon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ModernSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'primary' | 'success';
  className?: string;
}

export function ModernSectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  variant = 'default',
  className,
}: ModernSectionHeaderProps) {
  const getIconBg = () => {
    switch (variant) {
      case 'primary':
        return 'bg-primary/10 text-primary';
      case 'success':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-xl', getIconBg())}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-bold text-sm text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <Button
          variant="ghost"
          size="sm"
          onClick={action.onClick}
          className="h-8 text-xs font-semibold text-primary hover:text-primary/80 gap-1 px-2"
        >
          {action.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
