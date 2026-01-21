import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { supabase } from '@/integrations/supabase/client';
import { AgentRentRequestsManager } from './AgentRentRequestsManager';

export function CollapsibleRentRequests() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetchPendingCount();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('rent-requests-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rent_requests' },
        () => fetchPendingCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPendingCount = async () => {
    const { count } = await supabase
      .from('rent_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    setPendingCount(count || 0);
  };

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
