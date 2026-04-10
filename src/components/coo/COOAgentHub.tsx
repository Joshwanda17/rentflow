import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Search, Users, UserCheck, UserX, Clock, Star, AlertTriangle,
  ChevronRight, Building2, Loader2
} from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'inactive' | 'pending' | 'top' | 'at_risk';

interface AgentRow {
  id: string;
  full_name: string;
  phone: string;
  territory: string | null;
  last_active_at: string | null;
  tenants_count: number;
  landlords_count: number;
  total_commission: number;
  wallet_balance: number;
  status: StatusFilter;
}

const PAGE_SIZE = 50;

const STATUS_META: Record<StatusFilter, { label: string; icon: typeof Users; dotClass: string }> = {
  all: { label: 'All Agents', icon: Users, dotClass: '' },
  active: { label: 'Active', icon: UserCheck, dotClass: 'bg-emerald-500' },
  inactive: { label: 'Inactive', icon: UserX, dotClass: 'bg-muted-foreground' },
  pending: { label: 'Pending', icon: Clock, dotClass: 'bg-amber-500' },
  top: { label: 'Top Performers', icon: Star, dotClass: 'bg-yellow-500' },
  at_risk: { label: 'At Risk', icon: AlertTriangle, dotClass: 'bg-destructive' },
};

function classifyAgent(agent: { last_active_at: string | null; total_commission: number }): StatusFilter {
  if (!agent.last_active_at) return 'pending';
  const days = (Date.now() - new Date(agent.last_active_at).getTime()) / 86400000;
  if (agent.total_commission > 200000) return 'top';
  if (days > 30) return 'at_risk';
  if (days > 7) return 'inactive';
  return 'active';
}

const SORT_MAP: Record<string, string> = {
  name: 'full_name',
  commission: 'total_commission',
  tenants: 'tenants_count',
};

export function COOAgentHub() {
  const isMobile = useIsMobile();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'commission' | 'tenants'>('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchAgents = useCallback(async (pageOffset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);

    const sortField = SORT_MAP[sortBy] || 'full_name';
    const sortDir = sortBy === 'name' ? 'asc' : 'desc';

    const { data, error } = await supabase.rpc('get_agents_hub', {
      search_query: debouncedSearch,
      sort_field: sortField,
      sort_dir: sortDir,
      page_limit: PAGE_SIZE,
      page_offset: pageOffset,
    });

    if (error) {
      console.error('get_agents_hub error:', error);
      if (!append) setLoading(false); else setLoadingMore(false);
      return;
    }

    const rows: AgentRow[] = (data || []).map((r: any) => {
      const row: AgentRow = {
        id: r.id,
        full_name: r.full_name || '—',
        phone: r.phone || '',
        territory: r.territory,
        last_active_at: r.last_active_at,
        tenants_count: Number(r.tenants_count) || 0,
        landlords_count: Number(r.landlords_count) || 0,
        total_commission: Number(r.total_commission) || 0,
        wallet_balance: Number(r.wallet_balance) || 0,
        status: 'active',
      };
      row.status = classifyAgent(row);
      return row;
    });

    if (data?.length) setTotalCount(Number(data[0].total_count));
    else if (!append) setTotalCount(0);

    setAgents(prev => append ? [...prev, ...rows] : rows);
    setOffset(pageOffset + PAGE_SIZE);
    if (!append) setLoading(false); else setLoadingMore(false);
  }, [debouncedSearch, sortBy]);

  // Re-fetch on search/sort change
  useEffect(() => {
    setOffset(0);
    fetchAgents(0, false);
  }, [fetchAgents]);

  // Counts per category (from loaded agents)
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: agents.length, active: 0, inactive: 0, pending: 0, top: 0, at_risk: 0 };
    agents.forEach(a => { if (a.status !== 'all') c[a.status]++; });
    return c;
  }, [agents]);

  // KPIs
  const totalCommission = useMemo(() => agents.reduce((s, a) => s + a.total_commission, 0), [agents]);
  const avgWallet = useMemo(() => agents.length ? Math.round(agents.reduce((s, a) => s + a.wallet_balance, 0) / agents.length) : 0, [agents]);

  // Client-side status filter only
  const visible = useMemo(() => {
    return filter === 'all' ? agents : agents.filter(a => a.status === filter);
  }, [agents, filter]);

  const hasMore = agents.length < totalCount;

  const categories: StatusFilter[] = ['all', 'active', 'inactive', 'pending', 'top', 'at_risk'];

  const NavPanel = () => (
    <div className="space-y-1">
      {categories.map(cat => {
        const meta = STATUS_META[cat];
        const Icon = meta.icon;
        const isActive = filter === cat;
        return (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all',
              isActive
                ? 'bg-white/15 text-white font-semibold'
                : 'text-white/60 hover:bg-white/8 hover:text-white/90'
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1 text-sm">{meta.label}</span>
            <Badge variant="outline" size="sm" className="border-white/20 text-white/80 bg-white/5">
              {counts[cat]}
            </Badge>
          </button>
        );
      })}

      <div className="mt-6 pt-4 border-t border-white/10 space-y-4 px-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">KPI Summary</p>
        <div>
          <p className="text-white/50 text-xs">Total Commission</p>
          <p className="text-white font-bold text-lg">UGX {totalCommission.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-white/50 text-xs">Avg Wallet Balance</p>
          <p className="text-white font-bold text-lg">UGX {avgWallet.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-white/50 text-xs">Total Agents</p>
          <p className="text-white font-bold text-lg">{totalCount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-0">
      {isMobile && (
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 no-scrollbar">
          {categories.map(cat => {
            const meta = STATUS_META[cat];
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-all shrink-0',
                  filter === cat
                    ? 'bg-[#1a1f3d] text-white border-[#1a1f3d]'
                    : 'bg-muted/50 text-muted-foreground border-border/50'
                )}
              >
                {meta.label}
                <span className="opacity-60">({counts[cat]})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-0 rounded-2xl overflow-hidden border border-border/60 bg-card min-h-[600px]">
        {!isMobile && (
          <div className="w-[260px] shrink-0 bg-[#1a1f3d] p-4 pt-5">
            <h2 className="text-white font-bold text-lg mb-5 px-2">Agents</h2>
            <NavPanel />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 p-4 border-b border-border/40 bg-muted/20">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
              <SelectTrigger className="w-[160px] h-10">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="commission">Commission</SelectItem>
                <SelectItem value="tenants">Tenants</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading agents…
              </div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No agents found.</div>
            ) : (
              <div className="divide-y divide-border/30">
                {visible.map(agent => {
                  const meta = STATUS_META[agent.status];
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedId(agent.id)}
                      className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors group"
                    >
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {agent.full_name.charAt(0).toUpperCase()}
                        </div>
                        {meta.dotClass && (
                          <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card', meta.dotClass)} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="font-semibold text-sm truncate">{agent.full_name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{agent.tenants_count} tenants</span>
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{agent.landlords_count} landlords</span>
                        </div>
                      </div>

                      {!isMobile && (
                        <div className="flex items-center gap-6 text-sm shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase">Commission</p>
                            <p className="font-bold">{agent.total_commission.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase">Wallet</p>
                            <p className="font-bold">{agent.wallet_balance.toLocaleString()}</p>
                          </div>
                          <Badge
                            variant={agent.status === 'active' || agent.status === 'top' ? 'success' : agent.status === 'at_risk' ? 'destructive' : 'muted'}
                            size="sm"
                          >
                            {meta.label}
                          </Badge>
                        </div>
                      )}

                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                    </button>
                  );
                })}

                {hasMore && (
                  <div className="p-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingMore}
                      onClick={() => fetchAgents(offset, true)}
                    >
                      {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Loading…</> : `Load more (${agents.length} of ${totalCount})`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      <AgentDetailDrawer agentId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
