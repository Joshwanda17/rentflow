import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { Search, Loader2, UserPlus, UsersRound, CheckCircle2, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserResult {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

interface ExistingLink {
  sub_agent_id: string;
  parent_agent_id: string;
  parent_name: string | null;
  status: string | null;
}

interface AddSubAgentSearchProps {
  onAdded?: () => void;
}

export function AddSubAgentSearch({ onAdded }: AddSubAgentSearchProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const term = query.trim();

  const { data: results, isFetching } = useQuery({
    queryKey: ['add-subagent-search', term],
    enabled: term.length >= 2,
    staleTime: 10_000,
    queryFn: async (): Promise<UserResult[]> => {
      const cleaned = term.replace(/\D/g, '');
      const isPhone = cleaned.length >= 3;
      let q = supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .limit(15);
      if (isPhone) {
        q = q.ilike('phone', `%${cleaned.slice(-9)}%`);
      } else {
        q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).filter((p) => p.id !== user?.id);
    },
  });

  const resultIds = (results || []).map((r) => r.id);

  // Find which of the searched users already have agent_subagents links (any agent)
  const { data: existingLinks } = useQuery({
    queryKey: ['add-subagent-existing-links', resultIds, user?.id],
    enabled: resultIds.length > 0 && !!user?.id,
    staleTime: 10_000,
    queryFn: async (): Promise<Record<string, ExistingLink>> => {
      const { data, error } = await supabase
        .from('agent_subagents')
        .select('sub_agent_id, parent_agent_id, status')
        .in('sub_agent_id', resultIds)
        .not('status', 'in', '("rejected","cancelled")');
      if (error) throw error;
      const rows = data || [];
      const parentIds = Array.from(new Set(rows.map((r) => r.parent_agent_id)));
      let names: Record<string, string | null> = {};
      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', parentIds);
        names = Object.fromEntries((parents || []).map((p) => [p.id, p.full_name]));
      }
      const map: Record<string, ExistingLink> = {};
      for (const r of rows) {
        // keep the first/strongest link per sub-agent (verified wins over pending)
        if (!map[r.sub_agent_id] || r.status === 'verified') {
          map[r.sub_agent_id] = {
            sub_agent_id: r.sub_agent_id,
            parent_agent_id: r.parent_agent_id,
            parent_name: names[r.parent_agent_id] ?? null,
            status: r.status,
          };
        }
      }
      return map;
    },
  });

  const handleAdd = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const response = await supabase.functions.invoke('add-existing-subagent', {
        body: { subAgentId: selected.id, origin: getPublicOrigin() },
      });
      if (response.error || response.data?.error) {
        const msg = await extractEdgeFunctionError(response, 'Could not add sub-agent.');
        throw new Error(msg);
      }
      toast({
        title: response.data?.alreadyLinked ? 'Already your sub-agent' : 'Invitation sent!',
        description: response.data?.alreadyLinked
          ? `${selected.full_name || 'User'} is already your sub-agent.`
          : `${selected.full_name || 'User'} has been sent an email and SMS with a link to accept.`,
      });
      setSelected(null);
      setQuery('');
      onAdded?.();
    } catch (err: any) {
      toast({
        title: 'Failed to add sub-agent',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-500/15 text-orange-600">
            <UsersRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Add an existing user as your sub-agent</h3>
            <p className="text-[11px] text-muted-foreground">
              Search any registered user, then send them an invite to accept.
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="Search by name, phone, or email"
            className="pl-9 h-12"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {term.length >= 2 && !selected && (
          <div className="border border-border rounded-lg max-h-56 overflow-y-auto bg-card">
            {!isFetching && (results?.length || 0) === 0 && (
              <div className="p-3 text-sm text-muted-foreground">No matching users.</div>
            )}
            {(results || []).map((u) => {
              const link = existingLinks?.[u.id];
              const isMine = link?.parent_agent_id === user?.id;
              const isOther = link && !isMine;
              let badge: { label: string; variant: any; icon?: typeof UserCheck } = {
                label: 'Eligible',
                variant: 'success',
              };
              if (isMine && link?.status === 'verified') {
                badge = { label: 'Your sub-agent', variant: 'success' };
              } else if (isMine && link?.status === 'pending') {
                badge = { label: 'Invite pending', variant: 'warning' };
              } else if (isOther && link?.status === 'verified') {
                badge = { label: "Another agent's sub-agent", variant: 'warning', icon: UserCheck };
              } else if (isOther) {
                badge = { label: 'Invite pending', variant: 'warning', icon: UserCheck };
              }
              const tooltipText = (() => {
                if (isMine && link?.status === 'verified') {
                  return 'This user is already linked to you. No invitation will be sent.';
                }
                if (isMine && link?.status === 'pending') {
                  return 'You already sent an invite. Sending again will deliver a fresh SMS and email reminder.';
                }
                if (isOther && link?.status === 'verified') {
                  return 'This user works under another agent. If you send an invite, they can choose to switch to you.';
                }
                if (isOther) {
                  return 'Another agent already invited this user. If you send an invite, they can choose which agent to join.';
                }
                return 'No existing sub-agent link found. Sending an invite will deliver an SMS and email with an acceptance link.';
              })();

              return (
                <button
                  key={u.id}
                  onClick={() => setSelected(u)}
                  className="w-full flex items-center gap-2 p-3 text-left text-sm border-b border-border last:border-b-0 hover:bg-accent transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{u.full_name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.phone || u.email || u.id.slice(0, 8)}
                    </div>
                  </div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={badge.variant}
                          className={cn(
                            'shrink-0 text-[10px] cursor-help',
                            badge.variant === 'warning' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                            badge.variant === 'success' && 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                          )}
                        >
                          {badge.icon && <badge.icon className="h-3 w-3 mr-1" />}
                          {badge.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
                        {tooltipText}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="space-y-3">
            {(() => {
              const link = existingLinks?.[selected.id];
              const isMine = link?.parent_agent_id === user?.id;
              const isOther = link && !isMine;
              if (isMine && link?.status === 'verified') {
                return (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-800 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      This user is already your sub-agent. No need to invite again.
                    </span>
                  </div>
                );
              }
              if (isMine && link?.status === 'pending') {
                return (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
                    <UserCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      You already sent an invite to this user. It is pending their acceptance.
                    </span>
                  </div>
                );
              }
              if (isOther) {
                return (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
                    <UserCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      This user is already
                      {link.status === 'verified' ? ' a sub-agent of ' : ' invited by '}
                      <span className="font-semibold">
                        {link.parent_name || 'another agent'}
                      </span>
                      . You can still send your invitation — they choose which agent to join.
                    </span>
                  </div>
                );
              }
              return null;
            })()}
            <div className={cn('flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm')}>
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{selected.full_name || 'Unnamed'}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selected.phone || selected.email}
                </div>
              </div>
              <Badge variant="outline" className="bg-background shrink-0">Selected</Badge>
            </div>
            <Button
              onClick={handleAdd}
              disabled={submitting || existingLinks?.[selected.id]?.parent_agent_id === user?.id}
              className="w-full h-11 gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Send sub-agent invite
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AddSubAgentSearch;