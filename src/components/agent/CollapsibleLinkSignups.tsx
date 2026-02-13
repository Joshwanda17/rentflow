import { useUserSnapshot } from '@/hooks/useUserSnapshot';
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { LinkSignupsList } from './LinkSignupsList';

interface CollapsibleLinkSignupsProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleLinkSignups({ isOpen, onToggle }: CollapsibleLinkSignupsProps) {
  const { user } = useAuth();
  const { snapshot } = useUserSnapshot(user?.id);

  const signups = snapshot.linkSignups || [];
  const totalCount = signups.length;

  if (totalCount === 0) return null;

  return (
    <CollapsibleAgentSection
      icon={Users}
      label="Link Sign-ups"
      pendingCount={0}
      totalCount={totalCount}
      pendingLabel=""
      iconColor="text-green-500"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <LinkSignupsList />
    </CollapsibleAgentSection>
  );
}
