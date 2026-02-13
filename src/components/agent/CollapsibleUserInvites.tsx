import { Users } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { AgentInvitesList } from './AgentInvitesList';
import { useUserSnapshot } from '@/hooks/useUserSnapshot';
import { useAuth } from '@/hooks/useAuth';

interface CollapsibleUserInvitesProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleUserInvites({ isOpen, onToggle }: CollapsibleUserInvitesProps) {
  const { user } = useAuth();
  const { snapshot } = useUserSnapshot(user?.id);

  const invites = snapshot.userInvites || [];
  const totalCount = invites.length;
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length;

  if (totalCount === 0) return null;

  return (
    <CollapsibleAgentSection
      icon={Users}
      label="Registered Users"
      pendingCount={pendingCount}
      totalCount={totalCount}
      pendingLabel="pending"
      iconColor="text-blue-500"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <AgentInvitesList />
    </CollapsibleAgentSection>
  );
}
