import { LucideIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

interface QuickLinkItem {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  onClick: () => void;
  badge?: string | number;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

interface ModernQuickLinksProps {
  links: QuickLinkItem[];
  className?: string;
}

export function ModernQuickLinks({ links, className }: ModernQuickLinksProps) {
  const getVariantStyles = (variant: QuickLinkItem['variant']) => {
    switch (variant) {
      case 'primary':
        return 'bg-primary/10 text-primary';
      case 'success':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'warning':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {links.map((link) => (
        <button
          key={link.label}
          onClick={() => {
            hapticTap();
            link.onClick();
          }}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card hover:bg-muted/50 border border-border/50 transition-all duration-200 touch-manipulation active:scale-[0.98] group"
        >
          <div className={cn('p-2.5 rounded-xl', getVariantStyles(link.variant))}>
            <link.icon className="h-5 w-5" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-sm text-foreground">{link.label}</p>
            {link.sublabel && (
              <p className="text-[11px] text-muted-foreground">{link.sublabel}</p>
            )}
          </div>
          {link.badge && (
            <span className="px-2 py-0.5 text-xs font-bold bg-primary/10 text-primary rounded-full">
              {link.badge}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      ))}
    </div>
  );
}
