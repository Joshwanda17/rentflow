import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

interface QuickAction {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'warning';
  badge?: string;
}

interface ModernQuickActionsProps {
  actions: QuickAction[];
}

export function ModernQuickActions({ actions }: ModernQuickActionsProps) {
  const getVariantStyles = (variant: QuickAction['variant']) => {
    switch (variant) {
      case 'primary':
        return 'bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20';
      case 'success':
        return 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400';
      case 'warning':
        return 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400';
      default:
        return 'bg-muted/50 text-muted-foreground hover:bg-muted';
    }
  };

  const getIconBgStyles = (variant: QuickAction['variant']) => {
    switch (variant) {
      case 'primary':
        return 'bg-primary text-white';
      case 'success':
        return 'bg-emerald-500 text-white';
      case 'warning':
        return 'bg-amber-500 text-white';
      default:
        return 'bg-muted-foreground/20 text-foreground';
    }
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.slice(0, 4).map((action) => (
        <button
          key={action.label}
          onClick={() => {
            hapticTap();
            action.onClick();
          }}
          className={cn(
            'relative flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 touch-manipulation active:scale-[0.96]',
            getVariantStyles(action.variant)
          )}
        >
          {action.badge && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-bold bg-destructive text-destructive-foreground rounded-full">
              {action.badge}
            </span>
          )}
          <div className={cn('p-2.5 rounded-xl', getIconBgStyles(action.variant))}>
            <action.icon className="h-5 w-5" />
          </div>
          <span className="text-[11px] font-semibold text-center leading-tight">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
