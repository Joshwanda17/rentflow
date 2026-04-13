import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { Search, Users, Phone, MapPin, ChevronDown, ChevronUp, CheckSquare, Pause, MessageSquare, MapPinned, X, FileDown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchAgentWalletData } from '@/lib/fetchAgentWalletData';
import { generateAgentWalletReportPdf } from '@/lib/agentWalletReportPdf';

interface AgentRow {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  avatar_url: string | null;
  verified: boolean;
  created_at: string;
  territory: string | null;
  totalEarnings: number;
  rentRequests: number;
  houses: number;
  lastActive: string | null;
  tier: 'gold' | 'silver' | 'bronze' | 'inactive';
}

function getTier(earnings: number, collections: number): AgentRow['tier'] {
  const score = Math.min(earnings / 50000, 1) * 50 + Math.min(collections / 20, 1) * 50;
  if (score >= 70) return 'gold';
  if (score >= 40) return 'silver';
  if (score > 0) return 'bronze';
  return 'inactive';
}

const TIER_PILLS = [
  { key: 'all',      label: '👥 All',      color: '' },
  { key: 'gold',     label: '🥇 Gold',     color: 'bg-amber-500/10 text-amber-700 border-amber-300' },
  { key: 'silver',   label: '🥈 Silver',   color: 'bg-slate-100 text-slate-600 border-slate-300' },
  { key: 'bronze',   label: '🥉 Bronze',   color: 'bg-orange-500/10 text-orange-700 border-orange-300' },
  { key: 'inactive', label: '⚠️ Inactive', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { key: 'verified', label: '✅ Verified', color: 'bg-green-500/10 text-green-700 border-green-300' },
];

const normalizeText = (value?: string | null) => (value || '').toLowerCase().trim();
const normalizePhone = (value?: string | null) => (value || '').replace(/\D/g, '');

function getAgentSearchScore(agent: AgentRow, rawQuery: string): number {
  const query = normalizeText(rawQuery);
  if (!query) return 1;

  const digitsQuery = normalizePhone(rawQuery);
  const terms = query.split(/\s+/).filter(Boolean);

  const name = normalizeText(agent.full_name);
  const email = normalizeText(agent.email);
  const territory = normalizeText(agent.territory);
  const phoneDigits = normalizePhone(agent.phone);
  const shortId = agent.id.slice(0, 8).toLowerCase();

  let score = 0;

  if (name === query) score += 300;
  else if (name.startsWith(query)) score += 220;
  else if (name.includes(query)) score += 140;

  if (email.startsWith(query)) score += 120;
  else if (email.includes(query)) score += 80;

  if (territory.startsWith(query)) score += 100;
  else if (territory.includes(query)) score += 70;

  if (shortId === query) score += 160;
  else if (shortId.includes(query)) score += 90;

  if (digitsQuery) {
    if (phoneDigits === digitsQuery) score += 260;
    else if (phoneDigits.endsWith(digitsQuery)) score += 220;
    else if (phoneDigits.includes(digitsQuery)) score += 140;
  }

  for (const term of terms) {
    if (term.length < 2) continue;
    if (name.includes(term)) score += 35;
    if (territory.includes(term)) score += 20;
    if (email.includes(term)) score += 15;
  }

  return score;
}

const PAGE_SIZE = 50;

export function AgentDirectory() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [sortField, setSortField] = useState<'name' | 'earnings' | 'rentRequests' | 'lastActive'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const { toast } = useToast();

  // Debounce search for server queries
  const searchTimer = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
    if (searchTimer[0]) clearTimeout(searchTimer[0]);
    searchTimer[0] = setTimeout(() => setDebouncedSearch(value.trim()), 400);
  }, []);

  // Fetch agent IDs for the role
  const { data: allAgentIds } = useQuery({
    queryKey: ['agent-role-ids'],
    queryFn: async () => {
      const ids: string[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'agent')
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        ids.push(...data.map(r => r.user_id));
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return ids;
    },
    staleTime: 600_000,
  });

  const totalAgents = allAgentIds?.length || 0;

  // Server-side paginated query — fetch only current page of profiles
  const { data: pageData, isLoading } = useQuery({
    queryKey: ['agent-directory-page', page, debouncedSearch, sortField, sortAsc],
    queryFn: async () => {
      // If searching, do a server-side search on profiles with agent role filter
      let query = supabase
        .from('profiles')
        .select('id, full_name, phone, email, avatar_url, verified, created_at, territory, last_active_at');

      if (debouncedSearch) {
        // Search by name, phone, email, territory
        const s = `%${debouncedSearch}%`;
        query = query.or(`full_name.ilike.${s},phone.ilike.${s},email.ilike.${s},territory.ilike.${s}`);
      }

      // Sort
      const orderCol = sortField === 'name' ? 'full_name' : sortField === 'lastActive' ? 'last_active_at' : 'full_name';
      query = query.order(orderCol, { ascending: sortAsc, nullsFirst: false });

      // We need to filter to only agent IDs — use .in() with current page slice
      // For search mode, filter all agent IDs matching search; for browse mode, paginate
      if (!debouncedSearch && allAgentIds) {
        const pageIds = allAgentIds.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        if (pageIds.length === 0) return [];
        query = query.in('id', pageIds);
      } else if (allAgentIds) {
        // For search, we filter within all agent IDs but limit results
        // Use batched approach: search profiles, then filter by agent IDs client-side
        query = query.limit(200);
      }

      const { data: profiles, error } = await query;
      if (error) { console.error(error); return []; }

      // Filter to only agents
      const agentIdSet = new Set(allAgentIds || []);
      const agentProfiles = (profiles || []).filter(p => agentIdSet.has(p.id));

      if (agentProfiles.length === 0) return [];

      const ids = agentProfiles.map(p => p.id);

      // Fetch stats for just this page of agents
      const [earningsData, collectionsData, requestsData, housesData] = await Promise.all([
        supabase.from('agent_earnings').select('agent_id, amount').in('agent_id', ids),
        supabase.from('agent_collections').select('agent_id').in('agent_id', ids),
        supabase.from('rent_requests').select('agent_id').in('agent_id', ids),
        supabase.from('house_listings').select('agent_id').in('agent_id', ids),
      ]);

      const earningsMap: Record<string, number> = {};
      (earningsData.data || []).forEach((e: any) => { earningsMap[e.agent_id] = (earningsMap[e.agent_id] || 0) + e.amount; });

      const collectionsMap: Record<string, number> = {};
      (collectionsData.data || []).forEach((c: any) => { collectionsMap[c.agent_id] = (collectionsMap[c.agent_id] || 0) + 1; });

      const reqMap: Record<string, number> = {};
      (requestsData.data || []).forEach((r: any) => { if (r.agent_id) reqMap[r.agent_id] = (reqMap[r.agent_id] || 0) + 1; });

      const houseMap: Record<string, number> = {};
      (housesData.data || []).forEach((h: any) => { houseMap[h.agent_id] = (houseMap[h.agent_id] || 0) + 1; });

      return agentProfiles.map((p: any) => ({
        ...p,
        totalEarnings: earningsMap[p.id] || 0,
        rentRequests: reqMap[p.id] || 0,
        houses: houseMap[p.id] || 0,
        lastActive: p.last_active_at,
        tier: getTier(earningsMap[p.id] || 0, collectionsMap[p.id] || 0),
      })) as AgentRow[];
    },
    enabled: !!allAgentIds,
    staleTime: 60_000,
  });

  const agents = pageData || [];
  const displayed = agents;
  const totalPages = Math.ceil(totalAgents / PAGE_SIZE);
  const bulkMode = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === displayed.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayed.map(a => a.id)));
    }
  };

  const handleBulkAction = (action: string) => {
    toast({
      title: `${action} — ${selectedIds.size} agents`,
      description: `This feature will be fully wired in the next update.`,
    });
    setSelectedIds(new Set());
  };

  const openProfile = (a: AgentRow) => {
    setSelectedAgent({
      id: a.id,
      name: a.full_name || 'Unknown',
      avatarUrl: a.avatar_url,
      type: 'agent' as const,
      createdAt: a.created_at,
      phone: a.phone,
      verified: a.verified,
      city: a.territory,
    });
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(field === 'name'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  const tierEmoji: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', inactive: '⚠️' };

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { all: (agents || []).length, gold: 0, silver: 0, bronze: 0, inactive: 0, verified: 0 };
    (agents || []).forEach(a => {
      counts[a.tier]++;
      if (a.verified) counts.verified++;
    });
    return counts;
  }, [agents]);

  const handleDownloadReport = async (agentId: string, agentName: string) => {
    try {
      toast({ title: 'Generating report…' });
      const data = await fetchAgentWalletData(agentId);
      const blob = await generateAgentWalletReportPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Wallet_Report_${agentName.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Report downloaded!' });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Failed to generate report', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Agent Directory
          <Badge variant="secondary" className="text-xs">{debouncedSearch ? displayed.length : totalAgents}</Badge>
        </h3>
        {bulkMode && (
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3 w-3 mr-1" /> Clear ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Search — large, prominent */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="🔍 Find agent by name, phone, territory, email, or ID..."
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          className="pl-10 h-11 text-sm border-2 focus:border-primary"
          autoComplete="off"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground px-1">
        Tip: Search by name, any phone digits (e.g. last 4), territory, email, or first 8 chars of agent ID.
      </p>

      {/* Tier filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TIER_PILLS.map(pill => (
          <button
            key={pill.key}
            onClick={() => { setTierFilter(pill.key); setPage(0); }}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-all ${
              tierFilter === pill.key
                ? (pill.color || 'bg-primary/10 text-primary border-primary/30') + ' font-semibold ring-1 ring-primary/20'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {pill.label}
            <span className="text-[10px] opacity-70">({tierCounts[pill.key] || 0})</span>
          </button>
        ))}
      </div>

      {/* Sort buttons + bulk select */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex gap-1.5">
          {([['name', 'Name'], ['earnings', 'Earnings'], ['rentRequests', 'Requests'], ['lastActive', 'Activity']] as const).map(([field, label]) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`flex items-center gap-0.5 text-xs px-2 py-1 rounded-md transition-colors ${
                sortField === field ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {label} <SortIcon field={field} />
            </button>
          ))}
        </div>
        <button
          onClick={selectAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {selectedIds.size === displayed.length && displayed.length > 0 ? 'Deselect' : 'Select All'}
        </button>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
          <Badge variant="default" className="text-xs">{selectedIds.size} selected</Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleBulkAction('Pause')}>
            <Pause className="h-3 w-3 mr-1" /> Pause
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleBulkAction('Message')}>
            <MessageSquare className="h-3 w-3 mr-1" /> Message
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleBulkAction('Assign Territory')}>
            <MapPinned className="h-3 w-3 mr-1" /> Territory
          </Button>
        </div>
      )}

      {/* Agent list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading agents...</p>
      ) : displayed.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">{search ? 'No agents match your search' : 'No agents found'}</p>
          {search && <p className="text-xs mt-1">Try a different name, phone, or territory</p>}
        </div>
      ) : (
        <div className="space-y-1 max-h-[450px] overflow-y-auto">
          {displayed.map(a => {
            const isSelected = selectedIds.has(a.id);
            const daysAgo = a.lastActive
              ? Math.floor((Date.now() - new Date(a.lastActive).getTime()) / 86400000)
              : null;

            return (
              <div
                key={a.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors ${
                  isSelected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/60'
                }`}
              >
                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(a.id)}
                  className="shrink-0"
                />

                {/* Clickable agent row */}
                <button
                  onClick={() => openProfile(a)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 overflow-hidden relative">
                    {a.avatar_url ? (
                      <img src={a.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
                    ) : (
                      (a.full_name || '?')[0].toUpperCase()
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">{tierEmoji[a.tier]}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{a.full_name}</span>
                      {a.verified && <Badge variant="default" className="text-[10px] px-1 py-0 h-4">✓</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{a.phone}</span>
                      {a.territory && <span className="flex items-center gap-0.5 hidden sm:flex"><MapPin className="h-3 w-3" />{a.territory}</span>}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <div className="text-center min-w-[40px]">
                      <p className="font-semibold text-foreground">{a.rentRequests}</p>
                      <p>Reqs</p>
                    </div>
                    <div className="text-center min-w-[40px]">
                      <p className="font-semibold text-foreground">{a.houses}</p>
                      <p>Houses</p>
                    </div>
                    <div className="text-center min-w-[48px]">
                      <p className="font-semibold text-green-600">{fmt(a.totalEarnings)}</p>
                      <p>Earned</p>
                    </div>
                    {daysAgo !== null && (
                      <div className="text-center min-w-[40px]">
                        <p className={`font-semibold ${daysAgo > 7 ? 'text-destructive' : daysAgo > 3 ? 'text-amber-600' : 'text-green-600'}`}>
                          {daysAgo === 0 ? 'Today' : `${daysAgo}d`}
                        </p>
                        <p>Active</p>
                      </div>
                    )}
                  </div>
                </button>

                {/* Download wallet report */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  title="Download Wallet Report"
                  onClick={(e) => { e.stopPropagation(); handleDownloadReport(a.id, a.full_name); }}
                >
                  <FileDown className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!debouncedSearch && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            ← Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </Button>
        </div>
      )}

      <UserProfileDialog
        open={!!selectedAgent}
        onOpenChange={(open) => !open && setSelectedAgent(null)}
        user={selectedAgent}
      />
    </div>
  );
}
