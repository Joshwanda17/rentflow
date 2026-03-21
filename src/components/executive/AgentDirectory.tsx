import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { Search, Users, Phone, MapPin, ChevronDown, ChevronUp, CheckSquare, Pause, MessageSquare, MapPinned, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Batch size to avoid URL length overflow on IN queries
const BATCH_SIZE = 50;

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

export function AgentDirectory() {
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [sortField, setSortField] = useState<'name' | 'earnings' | 'rentRequests' | 'lastActive'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['exec-agent-directory-v2'],
    queryFn: async () => {
      const { data: agentRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');

      const agentIds = (agentRoles || []).map(r => r.user_id);
      if (agentIds.length === 0) return [];

      // Batch all IN queries to avoid URL length overflow (PostgREST 400)
      const batchFetch = async <T,>(
        fn: (batch: string[]) => Promise<{ data: T[] | null }>
      ): Promise<T[]> => {
        const results: T[] = [];
        for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
          const batch = agentIds.slice(i, i + BATCH_SIZE);
          const { data } = await fn(batch);
          if (data) results.push(...data);
        }
        return results;
      };

      const [profilesData, earningsData, collectionsData, requestsData, housesData] = await Promise.all([
        batchFetch<any>(async b => supabase.from('profiles').select('id, full_name, phone, email, avatar_url, verified, created_at, territory, last_active_at').in('id', b)),
        batchFetch<any>(async b => supabase.from('agent_earnings').select('agent_id, amount').in('agent_id', b)),
        batchFetch<any>(async b => supabase.from('agent_collections').select('agent_id').in('agent_id', b)),
        batchFetch<any>(async b => supabase.from('rent_requests').select('agent_id').in('agent_id', b)),
        batchFetch<any>(async b => supabase.from('house_listings').select('agent_id').in('agent_id', b)),
      ]);

      const earningsMap: Record<string, number> = {};
      earningsData.forEach((e: any) => { earningsMap[e.agent_id] = (earningsMap[e.agent_id] || 0) + e.amount; });

      const collectionsMap: Record<string, number> = {};
      collectionsData.forEach((c: any) => { collectionsMap[c.agent_id] = (collectionsMap[c.agent_id] || 0) + 1; });

      const reqMap: Record<string, number> = {};
      requestsData.forEach((r: any) => { if (r.agent_id) reqMap[r.agent_id] = (reqMap[r.agent_id] || 0) + 1; });

      const houseMap: Record<string, number> = {};
      housesData.forEach((h: any) => { houseMap[h.agent_id] = (houseMap[h.agent_id] || 0) + 1; });

      return profilesData.map((p: any) => ({
        ...p,
        totalEarnings: earningsMap[p.id] || 0,
        rentRequests: reqMap[p.id] || 0,
        houses: houseMap[p.id] || 0,
        lastActive: p.last_active_at,
        tier: getTier(earningsMap[p.id] || 0, collectionsMap[p.id] || 0),
      })) as AgentRow[];
    },
    staleTime: 300000,
  });

  const filtered = useMemo(() => {
    let list = agents || [];

    // Tier filter
    if (tierFilter === 'verified') {
      list = list.filter(a => a.verified);
    } else if (tierFilter !== 'all') {
      list = list.filter(a => a.tier === tierFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.full_name?.toLowerCase().includes(q) ||
        a.phone?.includes(q) ||
        a.territory?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = (a.full_name || '').localeCompare(b.full_name || '');
      else if (sortField === 'earnings') cmp = a.totalEarnings - b.totalEarnings;
      else if (sortField === 'lastActive') {
        const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
        const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
        cmp = aTime - bTime;
      }
      else cmp = a.rentRequests - b.rentRequests;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [agents, search, sortField, sortAsc, tierFilter]);

  const displayed = showAll ? filtered : filtered.slice(0, 30);
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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Agent Directory
          <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
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
          placeholder="🔍 Find agent by name, phone, territory, or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setShowAll(false); }}
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

      {/* Tier filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TIER_PILLS.map(pill => (
          <button
            key={pill.key}
            onClick={() => { setTierFilter(pill.key); setShowAll(false); }}
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
              </div>
            );
          })}
        </div>
      )}

      {!showAll && filtered.length > 30 && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAll(true)}>
          Show all {filtered.length} agents
        </Button>
      )}

      <UserProfileDialog
        open={!!selectedAgent}
        onOpenChange={(open) => !open && setSelectedAgent(null)}
        user={selectedAgent}
      />
    </div>
  );
}
