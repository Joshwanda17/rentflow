import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { UserDrilldownDrawer } from '@/components/ops/UserDrilldownDrawer';
import {
  useMissionSummary, useMissionLeaderboard, type CounterWindow,
  type MissionSummary, type MissionAgentRow,
} from '@/hooks/useWelileOpsCounters';
import { useMissionEmptyHouses, type MissionEmptyHouseRow } from '@/hooks/useWelileOpsCounters';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import {
  Target, Home, Users, Handshake, RefreshCw, ChevronRight, Phone,
  Search, Lightbulb, TrendingUp, ArrowRight, Building2, MapPin, ListChecks,
  ShieldCheck, BedDouble, UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const WINDOWS: { id: CounterWindow; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
}

type PriorityKey = 'list' | 'place' | 'fund';

const PRIORITIES: {
  key: PriorityKey; rank: number; label: string; sub: string; icon: React.ElementType; tone: string; bar: string;
}[] = [
  { key: 'list', rank: 1, label: 'List empty houses', sub: 'Agents register landlords with vacant houses', icon: Home, tone: 'text-[#9234EA] bg-[#9234EA]/10', bar: 'bg-[#9234EA]' },
  { key: 'place', rank: 2, label: 'Place tenants', sub: 'Move tenants into listed empty houses', icon: Users, tone: 'text-emerald-600 bg-emerald-500/10', bar: 'bg-emerald-500' },
  { key: 'fund', rank: 3, label: 'Onboard funders', sub: 'Sign up funders & promissory notes', icon: Handshake, tone: 'text-amber-600 bg-amber-500/10', bar: 'bg-amber-500' },
];

function recommend(s: MissionSummary): { key: PriorityKey; text: string; severity: 'good' | 'watch' | 'act' } {
  const placementRate = pct(s.placements_total, s.placements_total + s.empty_houses_total);
  // Priority order: surface the most blocking gap first.
  if (s.empty_houses_total > 0 && placementRate < 50) {
    return {
      key: 'place',
      severity: s.empty_houses_total > s.placements_total ? 'act' : 'watch',
      text: `${s.empty_houses_total.toLocaleString()} listed houses are still empty (${placementRate}% placed). Push agents to move tenants in — every vacant house is lost rent.`,
    };
  }
  if (s.listings_new === 0) {
    return { key: 'list', severity: 'act', text: 'No new houses listed in this window. Re-activate agents to register landlords with vacant houses before placement can grow.' };
  }
  if (s.empty_houses_total < 10) {
    return { key: 'list', severity: 'watch', text: `Only ${s.empty_houses_total.toLocaleString()} empty houses in inventory. Drive agents to list more landlords so there is supply to place tenants into.` };
  }
  const fundActivation = pct(s.promissory_activated, s.promissory_total);
  if (s.promissory_total > 0 && fundActivation < 60) {
    return { key: 'fund', severity: 'watch', text: `${s.promissory_total - s.promissory_activated} promissory notes are not yet activated (${fundActivation}% active). Follow up funders to confirm and activate their notes.` };
  }
  return { key: 'list', severity: 'good', text: 'Supply, placement and funding are all moving. Keep agents listing fresh inventory to sustain the funnel.' };
}

export function WelileMissionBoard() {
  const [win, setWin] = useState<CounterWindow>('7d');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showAgents, setShowAgents] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PriorityKey>('list');
  const [drawer, setDrawer] = useState<{ agentId?: string | null; landlordId?: string | null; tab: 'agent' | 'landlord' } | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const intervalMs = autoRefresh ? 15_000 : false;
  const { data: summary, isLoading, isFetching, refetch } = useMissionSummary(win, intervalMs);
  const { data: agentData, isLoading: agentsLoading } = useMissionLeaderboard(win, showAgents, intervalMs);
  const agents: MissionAgentRow[] = agentData ?? [];

  const searchLower = search.trim().toLowerCase();
  const filteredAgents = useMemo(() => {
    let r = [...agents];
    if (searchLower) {
      r = r.filter((a) =>
        (a.agent_name?.toLowerCase().includes(searchLower) ?? false) ||
        (a.agent_phone?.toLowerCase().includes(searchLower) ?? false));
    }
    r.sort((a, b) => {
      if (sort === 'list') return b.listings_count - a.listings_count;
      if (sort === 'place') return b.placements_count - a.placements_count;
      return b.promissory_count - a.promissory_count;
    });
    return r;
  }, [agents, searchLower, sort]);

  const rec = summary ? recommend(summary) : null;
  const placementRate = summary ? pct(summary.placements_total, summary.placements_total + summary.empty_houses_total) : 0;
  const fundActivation = summary ? pct(summary.promissory_activated, summary.promissory_total) : 0;

  const metricFor = (s: MissionSummary, key: PriorityKey) => {
    if (key === 'list') return { big: s.listings_new, label: 'new houses listed', extra: `${s.empty_houses_total.toLocaleString()} empty in stock · ${s.listing_agents} agents` };
    if (key === 'place') return { big: s.placements_new, label: 'tenants placed', extra: `${placementRate}% of listed houses occupied` };
    return { big: s.promissory_new, label: 'new promissory notes', extra: `${formatUGX(s.promissory_amount)} committed · ${fundActivation}% active` };
  };

  const recSeverityCls = rec?.severity === 'act'
    ? 'border-red-500/40 bg-red-500/5'
    : rec?.severity === 'watch'
      ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-emerald-500/40 bg-emerald-500/5';

  return (
    <Card className="p-3 sm:p-4 border-border">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold leading-tight flex items-center gap-1.5">
            <Target className="h-4 w-4 text-primary" /> Mission Priorities
          </h3>
          <p className="text-[11px] text-muted-foreground">
            List empty houses → place tenants → onboard funders. Progress &amp; live recommendations.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-0.5 bg-card">
            <span className={cn('text-[10px] font-semibold', autoRefresh ? 'text-emerald-600' : 'text-muted-foreground')}>
              {autoRefresh ? 'Live' : 'Auto'}
            </span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWin(w.id)}
                className={cn('px-2.5 py-1 text-[11px] font-semibold transition',
                  win === w.id ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/40')}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
            <RefreshCw className={cn('h-4 w-4', (isFetching || isLoading) && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Priority cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        {PRIORITIES.map((p) => {
          const Icon = p.icon;
          const m = summary ? metricFor(summary, p.key) : null;
          const isFocus = rec?.key === p.key;
          return (
            <div
              key={p.key}
              className={cn('rounded-xl border bg-card p-3 relative', isFocus ? 'border-primary ring-1 ring-primary/40' : 'border-border')}
            >
              <div className="flex items-center gap-2">
                <div className={cn('p-1.5 rounded-lg shrink-0', p.tone)}><Icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-none">Priority {p.rank}</p>
                  <p className="text-sm font-bold leading-tight truncate">{p.label}</p>
                </div>
                {isFocus && <Badge className="text-[9px] shrink-0">Focus now</Badge>}
              </div>
              {isLoading || !m ? (
                <Skeleton className="h-9 w-full mt-2" />
              ) : (
                <div className="mt-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold leading-none">{m.big.toLocaleString()}</span>
                    <span className="text-[11px] text-muted-foreground">{m.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{m.extra}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Supply → placement funnel */}
      {summary && !isLoading && (
        <div className="rounded-xl border border-border bg-card p-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Supply &amp; placement funnel
            </span>
            <Badge variant="outline" className="text-[10px]">{placementRate}% occupied</Badge>
          </div>
          <div className="flex items-center gap-2 text-center">
            <div className="flex-1 rounded-lg bg-[#9234EA]/10 py-2">
              <p className="text-lg font-bold leading-none text-[#9234EA]">{(summary.empty_houses_total + summary.placements_total).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Houses listed</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 rounded-lg bg-amber-500/10 py-2">
              <p className="text-lg font-bold leading-none text-amber-600">{summary.empty_houses_total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Still empty</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 rounded-lg bg-emerald-500/10 py-2">
              <p className="text-lg font-bold leading-none text-emerald-600">{summary.placements_total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Tenants placed</p>
            </div>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {rec && (
        <div className={cn('rounded-xl border p-3 mt-2 flex items-start gap-2', recSeverityCls)}>
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Recommended next move</p>
            <p className="text-xs font-medium leading-snug mt-0.5">{rec.text}</p>
          </div>
        </div>
      )}

      {/* Agent leaderboard */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Agent leaderboard</span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setShowAgents((v) => !v)}>
            {showAgents ? 'Hide' : 'Show'}
          </Button>
        </div>

        {showAgents && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agents…"
                  className="pl-7 h-8 text-xs"
                />
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSort(p.key)}
                    className={cn('px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap',
                      sort === p.key ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/40')}
                  >
                    {p.key === 'list' ? 'Listed' : p.key === 'place' ? 'Placed' : 'Funders'}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="max-h-[360px] pr-1">
              {agentsLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : filteredAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {agents.length === 0 ? 'No agent activity in this window.' : 'No agents match your search.'}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {filteredAgents.map((a) => (
                    <li
                      key={a.agent_id}
                      onClick={() => setDrawer({ agentId: a.agent_id, tab: 'agent' })}
                      className="rounded-lg border border-border bg-card p-3 hover:bg-muted/40 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate flex-1">{a.agent_name || 'Unknown agent'}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                      {a.agent_phone && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {a.agent_phone}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-border text-[#9234EA] bg-[#9234EA]/10">
                          <Home className="h-3 w-3" /> Listed: {a.listings_count.toLocaleString()}
                          {a.empty_listings > 0 && <span className="text-muted-foreground font-normal">({a.empty_listings} empty)</span>}
                        </span>
                        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-border text-emerald-600 bg-emerald-500/10">
                          <Users className="h-3 w-3" /> Placed: {a.placements_count.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-border text-amber-600 bg-amber-500/10">
                          <Handshake className="h-3 w-3" /> Funders: {a.promissory_count.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {a.promissory_amount > 0 && <>Committed {formatUGX(a.promissory_amount)} · </>}
                        Last activity {fmtDate(a.last_activity)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      <UserDrilldownDrawer
        open={!!drawer}
        onOpenChange={(v) => { if (!v) setDrawer(null); }}
        tenantId={null}
        agentId={drawer?.agentId ?? null}
        landlordId={drawer?.landlordId ?? null}
        defaultTab={drawer?.tab ?? 'agent'}
      />

      <EmptyHousesDialog
        open={emptyOpen}
        win={win}
        refetchIntervalMs={intervalMs}
        onClose={() => setEmptyOpen(false)}
        onOpenLandlord={(id) => { setEmptyOpen(false); setDrawer({ landlordId: id, tab: 'landlord' }); }}
        onOpenAgent={(id) => { setEmptyOpen(false); setDrawer({ agentId: id, tab: 'agent' }); }}
      />
    </Card>
  );
}
