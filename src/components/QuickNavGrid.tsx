import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface QuickNavItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

interface QuickNavGridProps {
  items: QuickNavItem[];
  title?: string;
}

const variantStyles = {
  default: 'bg-muted/50 text-foreground hover:bg-muted',
  primary: 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20',
  success: 'bg-success/10 text-success hover:bg-success/20 border-success/20',
  warning: 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/20',
};

export function QuickNavGrid({ items, title = "Quick Actions" }: QuickNavGridProps) {
  const handleClick = (onClick: () => void) => {
    hapticTap();
    onClick();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground px-1">{title}</h3>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, index) => {
          const Icon = item.icon;
          const variant = item.variant || 'default';
          
          return (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleClick(item.onClick)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-border/50 transition-all active:scale-95",
                variantStyles[variant]
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
