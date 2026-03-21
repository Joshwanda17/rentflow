import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { Search, Users, Phone, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

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
}

export function AgentDirectory() {
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [sortField, setSortField] = useState<'name' | 'earnings' | 'rentRequests'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Fetch all agents (users with agent role)
  const { data: agents, isLoading } = useQuery({
    queryKey: ['exec-agent-directory'],
    queryFn: async () => {
      const { data: agentRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');
      
      const agentIds = (agentRoles || []).map(r => r.user_id);
      if (agentIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, avatar_url, verified, created_at, territory')
        .in('id', agentIds);

      // Get earnings totals
      const { data: earnings } = await supabase
        .from('agent_earnings')
        .select('agent_id, amount')
        .in('agent_id', agentIds);

      const earningsMap: Record<string, number> = {};
      (earnings || []).forEach(e => {
        earningsMap[e.agent_id] = (earningsMap[e.agent_id] || 0) + e.amount;
      });

      // Get rent request counts
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('agent_id')
        .in('agent_id', agentIds);

      const reqMap: Record<string, number> = {};
      (requests || []).forEach(r => {
        if (r.agent_id) reqMap[r.agent_id] = (reqMap[r.agent_id] || 0) + 1;
      });

      // Get house listing counts
      const { data: houses } = await supabase
        .from('house_listings')
        .select('agent_id')
        .in('agent_id', agentIds);

      const houseMap: Record<string, number> = {};
      (houses || []).forEach(h => {
        houseMap[h.agent_id] = (houseMap[h.agent_id] || 0) + 1;
      });

      return (profiles || []).map(p => ({
        ...p,
        totalEarnings: earningsMap[p.id] || 0,
        rentRequests: reqMap[p.id] || 0,
        houses: houseMap[p.id] || 0,
      })) as AgentRow[];
    },
    staleTime: 300000,
  });

  const filtered = useMemo(() => {
    let list = agents || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.full_name?.toLowerCase().includes(q) ||
        a.phone?.includes(q) ||
        a.territory?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = (a.full_name || '').localeCompare(b.full_name || '');
      else if (sortField === 'earnings') cmp = a.totalEarnings - b.totalEarnings;
      else cmp = a.rentRequests - b.rentRequests;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [agents, search, sortField, sortAsc]);

  const displayed = showAll ? filtered : filtered.slice(0, 20);

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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Agent Directory
          <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
        </h3>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, territory..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Sort buttons */}
      <div className="flex gap-2">
        {([['name', 'Name'], ['earnings', 'Earnings'], ['rentRequests', 'Requests']] as const).map(([field, label]) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
              sortField === field ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {label} <SortIcon field={field} />
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading agents...</p>
      ) : displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {search ? 'No agents match your search' : 'No agents found'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {displayed.map(a => (
            <button
              key={a.id}
              onClick={() => openProfile(a)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left group"
            >
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 overflow-hidden">
                {a.avatar_url ? (
                  <img src={a.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
                ) : (
                  (a.full_name || '?')[0].toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">{a.full_name}</span>
                  {a.verified && <Badge variant="default" className="text-[10px] px-1 py-0 h-4">✓</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{a.phone}</span>
                  {a.territory && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{a.territory}</span>}
                </div>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <div className="text-center">
                  <p className="font-semibold text-foreground">{a.rentRequests}</p>
                  <p>Requests</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">{a.houses}</p>
                  <p>Houses</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-green-600">{fmt(a.totalEarnings)}</p>
                  <p>Earned</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!showAll && filtered.length > 20 && (
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
