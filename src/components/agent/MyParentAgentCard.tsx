import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/UserAvatar';
import { UsersRound, Clock } from 'lucide-react';

interface MyParentAgentCardProps {
  agentId: string;
}

function fmtInviteDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/**
 * Shows the invited (sub-)agent who recruited them — i.e. their parent agent.
 * Renders nothing if the current agent was not invited by anyone.
 */
export function MyParentAgentCard({ agentId }: MyParentAgentCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-parent-agent', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data: link } = await supabase
        .from('agent_subagents')
        .select('parent_agent_id, status, accepted_at, created_at')
        .eq('sub_agent_id', agentId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!link?.parent_agent_id) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, phone')
        .eq('id', link.parent_agent_id)
        .maybeSingle();

      return {
        parentId: link.parent_agent_id,
        status: link.status as string,
        acceptedAt: link.accepted_at as string | null,
        createdAt: link.created_at as string | null,
        fullName: (profile?.full_name as string) || 'Your agent',
        avatarUrl: (profile?.avatar_url as string) || null,
        phone: (profile?.phone as string) || null,
      };
    },
  });

  if (isLoading || !data) return null;

  const inviteDateLabel = fmtInviteDate(data.createdAt);

  return (
    <Card className="border border-primary/20 bg-primary/[0.03]">
      <CardContent className="p-4 flex items-center gap-3">
        <UserAvatar
          fullName={data.fullName}
          avatarUrl={data.avatarUrl}
          className="h-11 w-11 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <UsersRound className="h-3 w-3" /> Invited you to Welile
          </p>
          <p className="font-semibold text-foreground truncate">{data.fullName}</p>
          {data.phone && (
            <p className="text-xs text-muted-foreground truncate">{data.phone}</p>
          )}
          {inviteDateLabel && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" />
              {data.status === 'approved' || data.status === 'verified'
                ? `Recruited on ${inviteDateLabel}`
                : `Invited on ${inviteDateLabel}`}
            </p>
          )}
        </div>
        <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary capitalize shrink-0">
          {data.status === 'approved' || data.status === 'verified' ? 'Your agent' : data.status}
        </span>
      </CardContent>
    </Card>
  );
}
