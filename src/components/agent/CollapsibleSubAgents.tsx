import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UsersRound } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { SubAgentsList } from './SubAgentsList';
import { SubAgentInvitesList } from './SubAgentInvitesList';

interface CollapsibleSubAgentsProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleSubAgents({ isOpen, onToggle }: CollapsibleSubAgentsProps) {
  const { user } = useAuth();
  const [activeCount, setActiveCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchCounts();
    }
  }, [user]);

  const fetchCounts = async () => {
    if (!user) return;

    // Fetch active sub-agents count
    const { count: activeSubAgents } = await supabase
      .from('agent_subagents')
      .select('*', { count: 'exact', head: true })
      .eq('parent_agent_id', user.id);

    // Fetch pending sub-agent invites count
    const { count: pendingInvites } = await supabase
      .from('supporter_invites')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .eq('role', 'agent')
      .eq('status', 'pending');

    setActiveCount(activeSubAgents || 0);
    setPendingCount(pendingInvites || 0);
  };

  const totalCount = activeCount + pendingCount;

  // Don't show if no sub-agents at all
  if (totalCount === 0) return null;

  return (
    <CollapsibleAgentSection
      icon={UsersRound}
      label="My Sub-Agents"
      pendingCount={pendingCount}
      totalCount={totalCount}
      pendingLabel="pending"
      iconColor="text-orange-500"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <SubAgentInvitesList />
        <SubAgentsList />
      </div>
    </CollapsibleAgentSection>
  );
}
