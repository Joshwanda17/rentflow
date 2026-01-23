import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Link2 } from 'lucide-react';
import { CollapsibleAgentSection } from './CollapsibleAgentSection';
import { LinkSignupsList } from './LinkSignupsList';

interface CollapsibleLinkSignupsProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleLinkSignups({ isOpen, onToggle }: CollapsibleLinkSignupsProps) {
  const { user } = useAuth();
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchCount();
    }
  }, [user]);

  const fetchCount = async () => {
    if (!user) return;

    const { count } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', user.id);

    setTotalCount(count || 0);
  };

  // Don't show if no signups
  if (totalCount === 0) return null;

  return (
    <CollapsibleAgentSection
      icon={Link2}
      label="Link Signups"
      totalCount={totalCount}
      iconColor="text-primary"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <LinkSignupsList />
    </CollapsibleAgentSection>
  );
}
