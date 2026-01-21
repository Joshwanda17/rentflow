import { useState, useEffect, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';

interface CollapsibleAgentSectionProps {
  icon: LucideIcon;
  label: string;
  pendingCount?: number;
  totalCount?: number;
  pendingLabel?: string;
  iconColor?: string;
  children: ReactNode;
}

export function CollapsibleAgentSection({
  icon: Icon,
  label,
  pendingCount = 0,
  totalCount,
  pendingLabel = 'pending',
  iconColor = 'text-primary',
  children,
}: CollapsibleAgentSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    hapticTap();
    setIsOpen(!isOpen);
  };

  const displayCount = totalCount !== undefined ? totalCount : pendingCount;

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        onClick={toggleOpen}
        className="w-full justify-between h-12 px-4 border-dashed"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className="font-medium">{label}</span>
          {displayCount > 0 && (
            <Badge 
              variant="outline" 
              className={pendingCount > 0 
                ? "bg-warning/10 text-warning border-warning/30 text-xs px-1.5 py-0.5"
                : "bg-muted text-muted-foreground text-xs px-1.5 py-0.5"
              }
            >
              {pendingCount > 0 ? `${pendingCount} ${pendingLabel}` : displayCount}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
