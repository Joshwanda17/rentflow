import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, Menu, X } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface QuickNavItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

interface CollapsibleQuickNavProps {
  items: QuickNavItem[];
  title?: string;
  buttonLabel?: string;
}

const variantStyles = {
  default: 'bg-muted/50 text-foreground hover:bg-muted',
  primary: 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20',
  success: 'bg-success/10 text-success hover:bg-success/20 border-success/20',
  warning: 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/20',
};

export function CollapsibleQuickNav({ 
  items, 
  title = "Quick Actions",
  buttonLabel = "Quick Actions"
}: CollapsibleQuickNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    hapticTap();
    setIsOpen(!isOpen);
  };

  const handleClick = (onClick: () => void) => {
    hapticTap();
    onClick();
    setIsOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Toggle Button */}
      <motion.button
        onClick={handleToggle}
        className={cn(
          "w-full flex items-center justify-between gap-3 p-4 rounded-2xl border-2 transition-all active:scale-[0.98]",
          isOpen 
            ? "bg-primary/10 border-primary/30 text-primary" 
            : "bg-card border-border hover:border-primary/30 hover:bg-accent/30"
        )}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-xl transition-colors",
            isOpen ? "bg-primary/20" : "bg-muted"
          )}>
            {isOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">{buttonLabel}</p>
            <p className="text-xs text-muted-foreground">
              {isOpen ? 'Tap to close' : `${items.length} actions available`}
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center",
            isOpen ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          <span className="text-xs font-bold">{items.length}</span>
        </motion.div>
      </motion.button>

      {/* Expandable Grid */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              <h3 className="text-sm font-medium text-muted-foreground px-1">{title}</h3>
              <div className="grid grid-cols-4 gap-2">
                {items.map((item, index) => {
                  const Icon = item.icon;
                  const variant = item.variant || 'default';
                  
                  return (
                    <motion.button
                      key={item.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.03 }}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
