import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { format } from 'date-fns';
import { Trophy, UsersRound, Home, Banknote } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format as fmtDate } from 'date-fns';

interface BonusRow {
  id: string;
  agent_id: string;
  agent_name: string | null;
  agent_phone: string | null;
  invited_count: number;
  activated_count: number;
  verified_houses_count: number;
  amount: number;
  awarded_at: string;
}

interface TopAgentRow {
  agent_id: string;
  agent_name: string | null;
  agent_phone: string | null;
  verified_houses: number;
  invited: number;
}

interface Overview {
  week_start: string;
  week_end: string;
  invites_this_week: number;
  verified_houses_this_week: number;
  bonuses_awarded_count: number;
  bonuses_awarded_amount: number;
  bonuses: BonusRow[];
  top_agents: TopAgentRow[];
  daily_series?: { day: string; invited: number; verified_houses: number }[];
}

/**
 * Ops-wide view of the Weekly Agent Listing Campaign. Reads the
 * `get_agent_listing_campaign_ops_overview` RPC so ops staff bypass per-row
 * RLS and always see full aggregate + leaderboard for the current week.
 */
export function AgentListingCampaignPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-listing-campaign-ops-overview'],
    staleTime: 60_000,
    queryFn: async (): Promise<Overview | null> => {
      const { data, error } = await (supabase.rpc as any)(
        'get_agent_listing_campaign_ops_overview',
      );
      if (error) throw error;
      return data as Overview;
    },
  });

  const weekStart = data?.week_start ? new Date(data.week_start) : null;
  const weekEnd = data?.week_end ? new Date(new Date(data.week_end).getTime() - 1) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-bold">Weekly Listing Mission</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {weekStart && weekEnd
            ? `${format(weekStart, 'dd MMM')} – ${format(weekEnd, 'dd MMM yyyy')}`
            : 'Current week'}{' '}
          · UGX 3,000 per verified house · UGX 70,000 completion bonus
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Sub-Agents Invited"
          value={(data?.invites_this_week ?? 0).toLocaleString()}
          icon={UsersRound}
          loading={isLoading}
        />
        <KPICard
          title="Verified Houses"
          value={(data?.verified_houses_this_week ?? 0).toLocaleString()}
          icon={Home}
          loading={isLoading}
        />
        <KPICard
          title="Bonuses Awarded"
          value={(data?.bonuses_awarded_count ?? 0).toLocaleString()}
          icon={Trophy}
          loading={isLoading}
        />
        <KPICard
          title="Bonus Payout (UGX)"
          value={Number(data?.bonuses_awarded_amount ?? 0).toLocaleString()}
          icon={Banknote}
          loading={isLoading}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn't load campaign data: {(error as Error).message}
        </div>
      )}

      {/* Daily trend line graph */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-bold">Daily trend this week</h4>
          <span className="text-[11px] text-muted-foreground">Invites vs verified houses</span>
        </div>
        <div className="p-3 h-64">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : (data?.daily_series ?? []).length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No activity recorded yet this week.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={(data?.daily_series ?? []).map(d => ({
                  ...d,
                  label: fmtDate(new Date(d.day), 'EEE dd'),
                }))}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="invited"
                  name="Sub-agents invited"
                  stroke="#9334EB"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="verified_houses"
                  name="Verified houses"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Live leaderboard — top agents by verified houses this week */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-bold">Top agents this week</h4>
          <span className="text-[11px] text-muted-foreground">By verified houses</span>
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>
        ) : (data?.top_agents ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No verified houses recorded yet this week.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold w-12">#</th>
                  <th className="text-left px-4 py-2 font-semibold">Agent</th>
                  <th className="text-right px-4 py-2 font-semibold">Sub-Agents Invited</th>
                  <th className="text-right px-4 py-2 font-semibold">Verified Houses</th>
                  <th className="text-right px-4 py-2 font-semibold">House Commission (UGX)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_agents ?? []).map((row, i) => (
                  <tr key={row.agent_id} className="border-t border-border">
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{row.agent_name || row.agent_id.slice(0, 8) + '…'}</div>
                      {row.agent_phone && (
                        <div className="text-xs text-muted-foreground">{row.agent_phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.invited}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{row.verified_houses}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(row.verified_houses * 3000).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Awarded 70k completion bonuses */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h4 className="text-sm font-bold">Completion bonuses awarded this week</h4>
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>
        ) : (data?.bonuses ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No agent has completed the full mission yet this week.
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
                {(data?.bonuses ?? []).map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="font-medium">{b.agent_name || b.agent_id.slice(0, 8) + '…'}</div>
                      {b.agent_phone && <div className="text-xs text-muted-foreground">{b.agent_phone}</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.invited_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.activated_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.verified_houses_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      {Number(b.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {format(new Date(b.awarded_at), 'dd MMM HH:mm')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}