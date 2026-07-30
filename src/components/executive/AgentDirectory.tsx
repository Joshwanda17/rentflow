import { useState, useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search, Users, Phone, X, Loader2, UserPlus, Activity,
  ChevronLeft, ChevronRight, LayoutList, Map, ChevronRight as Chevron,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentAvatar } from './AgentAvatar';
import { AgentRegionBreakdown } from './AgentRegionBreakdown';
import { AgentProfile360Sheet } from './AgentProfile360Sheet';

interface DirectoryRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  verified: boolean;
  territory: string | null;
  created_at: string | null;
  last_active_at: string | null;
  agent_kind: 'agent' | 'sub_agent';
  total_tenants: number;
  status: 'active' | 'inactive' | 'frozen';
}

interface DirectoryResponse {
  kpis: { total_agents: number; total_sub_agents: number; total_active: number; total_all: number };
  total_matched: number;
  rows: DirectoryRow[];
}

const PAGE_SIZE = 50;
const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'agent', label: 'Agents' },
  { value: 'sub_agent', label: 'Sub-Agents' },
] as const;
const STATUS_FILTERS = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'frozen', label: 'Frozen' },
] as const;

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString();

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-300',
  inactive: 'bg-muted text-muted-foreground border-border',
  frozen: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function AgentDirectory() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'agent' | 'sub_agent'>('all');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'frozen'>('all');
  const [page, setPage] = useState(0);
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'region'>('list');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [type, status]);

  const { data, isLoading, isFetching, error } = useQuery<DirectoryResponse>({
    queryKey: ['agent-directory-v2', search, type, status, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_directory_v2' as any, {
        p_search: search || null,
        p_type: type,
        p_status: status,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as DirectoryResponse;
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const kpis = data?.kpis;
  const totalMatched = data?.total_matched ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatched / PAGE_SIZE));
  const showingFrom = totalMatched === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, totalMatched);

  const kpiCards = useMemo(() => ([
    { label: 'Total Agents', value: kpis ? fmt(kpis.total_agents) : '—', icon: Users, color: 'text-primary' },
    { label: 'Total Sub-Agents', value: kpis ? fmt(kpis.total_sub_agents) : '—', icon: UserPlus, color: 'text-violet-600' },
    { label: 'Active (Agents + Sub-Agents)', value: kpis ? fmt(kpis.total_active) : '—', icon: Activity, color: 'text-emerald-600' },
  ]), [kpis]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      {openAgentId ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpenAgentId(null)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back to directory
            </Button>
            <h3 className="text-sm font-semibold">Agent profile</h3>
          </div>
          <AgentProfile360Sheet agentId={openAgentId} onOpenChange={(o) => !o && setOpenAgentId(null)} inline />
        </>
      ) : (
      <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Agent Directory
          {kpis && <Badge variant="secondary" className="text-xs">{fmt(kpis.total_all)}</Badge>}
        </h3>
        {isFetching && !isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {kpiCards.map(k => (
          <div key={k.label} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-1.5">
              <k.icon className={cn('h-3.5 w-3.5', k.color)} />
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">{k.label}</p>
            </div>
            <p className="font-bold text-lg mt-1 tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 rounded-full bg-muted/50 p-0.5 w-fit">
        <button
          onClick={() => setViewMode('list')}
          className={cn('flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors',
            viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}
        >
          <LayoutList className="h-3.5 w-3.5" /> List
        </button>
        <button
          onClick={() => setViewMode('region')}
          className={cn('flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors',
            viewMode === 'region' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}
        >
          <Map className="h-3.5 w-3.5" /> By Region
        </button>
      </div>

      {viewMode === 'region' ? (
        <AgentRegionBreakdown verifiedOnly={false} />
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email, territory, or ID…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-10 pr-10 h-10 text-sm"
              autoComplete="off"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {TYPE_FILTERS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={cn('text-xs px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-colors',
                    type === t.value ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              {STATUS_FILTERS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={cn('text-xs px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-colors',
                    status === s.value ? 'bg-secondary text-secondary-foreground border-border'
                      : 'border-border text-muted-foreground hover:bg-muted')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Showing {fmt(totalMatched)} agents &amp; sub-agents</span>
            {totalMatched > 0 && (
              <span>{showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {totalMatched.toLocaleString()}</span>
            )}
          </div>

          {error && (
            <div className="text-center py-6 text-sm text-destructive">
              Failed to load agents. {(error as any)?.message}
            </div>
          )}

          {isLoading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No agents match these filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
              {/* Column head (desktop) */}
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_110px_110px_110px_24px] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                <span>Agent</span><span>Type</span><span className="text-right">Tenants</span><span>Status</span><span />
              </div>
              {rows.map(a => (
                <button
                  key={a.id}
                  onClick={() => setOpenAgentId(a.id)}
                  className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_110px_110px_110px_24px] gap-2 items-center px-3 py-2.5 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AgentAvatar src={a.avatar_url} name={a.full_name} className="h-9 w-9" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{a.full_name || 'Unknown Agent'}</span>
                        {a.verified && <Badge variant="default" className="text-[10px] px-1 py-0 h-4 shrink-0">✓</Badge>}
                      </div>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <Phone className="h-3 w-3 shrink-0" />{a.phone || a.email || '—'}
                      </span>
                      <div className="flex sm:hidden items-center gap-2 mt-1">
                        <Badge variant={a.agent_kind === 'sub_agent' ? 'secondary' : 'outline'} className="text-[10px]">
                          {a.agent_kind === 'sub_agent' ? 'Sub-Agent' : 'Agent'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{a.total_tenants} tenants</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border capitalize', STATUS_STYLE[a.status])}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <Badge variant={a.agent_kind === 'sub_agent' ? 'secondary' : 'outline'} className="text-[10px]">
                      {a.agent_kind === 'sub_agent' ? 'Sub-Agent' : 'Agent'}
                    </Badge>
                  </div>
                  <span className="hidden sm:block text-sm text-right tabular-nums font-medium">{a.total_tenants}</span>
                  <span className={cn('hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full border capitalize w-fit', STATUS_STYLE[a.status])}>
                    {a.status}
                  </span>
                  <Chevron className="h-4 w-4 text-muted-foreground shrink-0 justify-self-end" />
                </button>
              ))}
            </div>
          )}

          {totalMatched > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" className="text-xs h-8"
                disabled={page === 0 || isFetching} onClick={() => setPage(p => Math.max(0, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages.toLocaleString()}</span>
              <Button variant="outline" size="sm" className="text-xs h-8"
                disabled={page >= totalPages - 1 || isFetching} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
