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
  default: 'bg-muted/40 text-foreground hover:bg-muted/70',
  primary: 'bg-primary/10 text-primary hover:bg-primary/15 border-primary/20',
  success: 'bg-success/10 text-success hover:bg-success/15 border-success/20',
  warning: 'bg-warning/10 text-warning hover:bg-warning/15 border-warning/20',
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
          "w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all active:scale-[0.98] shadow-sm",
          isOpen 
            ? "bg-primary/8 border-primary/25 text-primary shadow-md" 
            : "bg-card border-border/60 hover:border-primary/25 hover:bg-accent/20"
        )}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-xl transition-all duration-200",
            isOpen ? "bg-primary/15 shadow-inner" : "bg-muted/60"
          )}>
            {isOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm tracking-tight">{buttonLabel}</p>
            <p className="text-[11px] text-muted-foreground font-medium">
              {isOpen ? 'Tap to close' : `${items.length} actions available`}
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
            isOpen ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/60"
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
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">{title}</h3>
              <div className="grid grid-cols-4 gap-2.5">
                {items.map((item, index) => {
                  const Icon = item.icon;
                  const variant = item.variant || 'default';
                  
                  return (
                    <motion.button
                      key={item.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.025, type: 'spring', stiffness: 300, damping: 25 }}
                      onClick={() => handleClick(item.onClick)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-border/40 transition-all active:scale-95 shadow-sm hover:shadow-md",
                        variantStyles[variant]
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px] font-semibold text-center leading-tight line-clamp-2 tracking-wide">
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
