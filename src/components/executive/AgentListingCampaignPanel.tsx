import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Trophy, UsersRound, Home, Banknote } from 'lucide-react';

/**
 * Ops-wide view of the Weekly Agent Listing Campaign.
 * Shows this week's aggregate progress plus the list of agents who have
 * already been awarded the UGX 70,000 completion bonus.
 */
export function AgentListingCampaignPanel() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  const { data: bonuses, isLoading } = useQuery({
    queryKey: ['agent-listing-campaign-bonuses-week', weekStartIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_listing_campaign_bonuses')
        .select('id, agent_id, amount, invited_count, activated_count, verified_houses_count, awarded_at, week_start')
        .gte('week_start', weekStart.toISOString().slice(0, 10))
        .order('awarded_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const agentIds = [...new Set((bonuses ?? []).map((b) => b.agent_id))];
  const { data: profileMap } = useQuery({
    queryKey: ['agent-listing-campaign-profiles', agentIds.sort().join(',')],
    enabled: agentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', agentIds);
      const map: Record<string, { full_name: string | null; phone: string | null }> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, phone: p.phone }; });
      return map;
    },
    staleTime: 5 * 60_000,
  });

  const { data: weekAggregate } = useQuery({
    queryKey: ['agent-listing-campaign-aggregate', weekStartIso],
    staleTime: 60_000,
    queryFn: async () => {
      const [invites, houses] = await Promise.all([
        supabase
          .from('agent_subagents')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekStartIso)
          .lte('created_at', weekEndIso),
        supabase
          .from('house_listings')
          .select('id', { count: 'exact', head: true })
          .eq('verified', true)
          .eq('is_hidden', false)
          .neq('status', 'rejected')
          .gte('created_at', weekStartIso)
          .lte('created_at', weekEndIso),
      ]);
      return {
        invites: invites.count ?? 0,
        houses: houses.count ?? 0,
      };
    },
  });

  const totalBonusPaid = (bonuses ?? []).reduce((s, b) => s + Number(b.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-bold">Weekly Listing Mission</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')} · UGX 70,000 completion bonus per agent
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Sub-Agents Invited" value={(weekAggregate?.invites ?? 0).toLocaleString()} icon={UsersRound} />
        <KPICard title="Verified Houses" value={(weekAggregate?.houses ?? 0).toLocaleString()} icon={Home} />
        <KPICard title="Bonuses Awarded" value={(bonuses?.length ?? 0).toLocaleString()} icon={Trophy} />
        <KPICard title="Bonus Payout (UGX)" value={totalBonusPaid.toLocaleString()} icon={Banknote} />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h4 className="text-sm font-bold">Agents who completed this week</h4>
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>
        ) : (bonuses ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No agent has completed the mission yet this week.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Agent</th>
                  <th className="text-right px-4 py-2 font-semibold">Invited</th>
                  <th className="text-right px-4 py-2 font-semibold">Activated</th>
                  <th className="text-right px-4 py-2 font-semibold">Verified Houses</th>
                  <th className="text-right px-4 py-2 font-semibold">Bonus (UGX)</th>
                  <th className="text-right px-4 py-2 font-semibold">Awarded</th>
                </tr>
              </thead>
              <tbody>
                {(bonuses ?? []).map((b) => {
                  const p = profileMap?.[b.agent_id];
                  return (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <div className="font-medium">{p?.full_name || b.agent_id.slice(0, 8) + '…'}</div>
                        {p?.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.invited_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.activated_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.verified_houses_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{Number(b.amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {format(new Date(b.awarded_at), 'dd MMM HH:mm')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}