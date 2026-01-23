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
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchCounts();
    }
  }, [user]);

  const fetchCounts = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('referrals')
      .select('credited')
      .eq('referrer_id', user.id);

    if (data) {
      setTotalCount(data.length);
      setPendingCount(data.filter(r => !r.credited).length);
    }
  };

  // Don't show if no signups
  if (totalCount === 0) return null;

  return (
    <CollapsibleAgentSection
      icon={Link2}
      label="Link Signups"
      pendingCount={pendingCount}
      totalCount={totalCount}
      pendingLabel="pending"
      iconColor="text-primary"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <LinkSignupsList />
    </CollapsibleAgentSection>
  );
}
