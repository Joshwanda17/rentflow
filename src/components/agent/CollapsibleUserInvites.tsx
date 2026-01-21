import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { AgentInvitesList } from './AgentInvitesList';

interface CollapsibleUserInvitesProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleUserInvites({ isOpen, onToggle }: CollapsibleUserInvitesProps) {
  const { user } = useAuth();
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchCounts();
    }
  }, [user]);

  const fetchCounts = async () => {
    if (!user) return;

    // Fetch total user invites (tenants + landlords)
    const { data } = await supabase
      .from('supporter_invites')
      .select('status')
      .eq('created_by', user.id)
      .in('role', ['tenant', 'landlord']);

    if (data) {
      setTotalCount(data.length);
      setPendingCount(data.filter(i => i.status === 'pending').length);
    }
  };

  // Don't show if no users registered
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
