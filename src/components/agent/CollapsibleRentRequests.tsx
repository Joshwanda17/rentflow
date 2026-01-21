import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { AgentRentRequestsManager } from './AgentRentRequestsManager';

interface CollapsibleRentRequestsProps {
  pendingCount?: number;
}

export function CollapsibleRentRequests({ pendingCount = 0 }: CollapsibleRentRequestsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    hapticTap();
    setIsOpen(!isOpen);
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        onClick={toggleOpen}
        className="w-full justify-between h-12 px-4 border-dashed"
      >
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          <span className="font-medium">Rent Requests</span>
          {pendingCount > 0 && (
            <Badge variant="default" className="bg-warning text-warning-foreground text-xs px-1.5 py-0.5">
              {pendingCount} pending
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
            <AgentRentRequestsManager />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
