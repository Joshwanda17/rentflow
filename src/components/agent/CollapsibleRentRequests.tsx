import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Home } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { AgentRentRequestsManager } from './AgentRentRequestsManager';

export function CollapsibleRentRequests() {
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

  return (
    <CollapsibleAgentSection
      icon={Home}
      label="Rent Requests"
      pendingCount={pendingCount}
      pendingLabel="pending"
      iconColor="text-primary"
    >
      <AgentRentRequestsManager />
    </CollapsibleAgentSection>
  );
}
