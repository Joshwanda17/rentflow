import { UsersRound } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { SubAgentsList } from './SubAgentsList';
import { SubAgentInvitesList } from './SubAgentInvitesList';
import { useUserSnapshot } from '@/hooks/useUserSnapshot';
import { useAuth } from '@/hooks/useAuth';
import { useAgentCapabilities } from '@/hooks/useAgentCapabilities';

interface CollapsibleSubAgentsProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleSubAgents({ isOpen, onToggle }: CollapsibleSubAgentsProps) {
  const { user } = useAuth();
  const { snapshot } = useUserSnapshot(user?.id);
  const { has, isLoading: capsLoading } = useAgentCapabilities();

  const activeCount = snapshot.subAgents?.length || 0;
  const pendingCount = snapshot.pendingSubAgentInvites?.length || 0;
  const totalCount = activeCount + pendingCount;

  if (totalCount === 0) return null;
  // Capability gate: only parents with `manage_subagents` (auto-granted via trigger
  // when a verified sub-agent relationship exists) can see the panel.
  if (capsLoading) return null;
  if (!has('manage_subagents')) return null;

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
