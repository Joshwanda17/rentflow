import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { Search, Phone, ChevronDown, ChevronUp, CheckSquare, X, DollarSign, TrendingUp, Shield, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';

interface PartnerRow {
  id: string;
  investor_id: string;
  full_name: string;
  phone: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  territory: string | null;
  totalInvested: number;
  totalROI: number;
  portfolioCount: number;
  activePortfolios: number;
  status: string;
  tier: 'platinum' | 'gold' | 'silver' | 'starter';
  lastActiveAt: string | null;
}

function getPartnerTier(invested: number, activeCount: number): PartnerRow['tier'] {
  if (invested >= 10_000_000 && activeCount >= 3) return 'platinum';
  if (invested >= 2_000_000 && activeCount >= 1) return 'gold';
  if (invested >= 500_000) return 'silver';
  return 'starter';
}

const TIER_PILLS = [
  { key: 'all', label: '👥 All', color: '' },
  { key: 'platinum', label: '💎 Platinum', color: 'bg-purple-500/10 text-purple-700 border-purple-300 dark:text-purple-400' },
  { key: 'gold', label: '🥇 Gold', color: 'bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400' },
  { key: 'silver', label: '🥈 Silver', color: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400' },
  { key: 'starter', label: '🌱 Starter', color: 'bg-green-500/10 text-green-700 border-green-300 dark:text-green-400' },
];

const normalizeText = (v?: string | null) => (v || '').toLowerCase().trim();
const normalizePhone = (v?: string | null) => (v || '').replace(/\D/g, '');

function getSearchScore(partner: PartnerRow, rawQuery: string): number {
  const query = normalizeText(rawQuery);
  if (!query) return 1;

  const name = normalizeText(partner.full_name);
  const phone = normalizePhone(partner.phone);
  const queryDigits = rawQuery.replace(/\D/g, '');
  let score = 0;

  // Exact name
  if (name === query) return 300;
  if (name.startsWith(query)) score += 200;
  else if (name.includes(query)) score += 120;

  // Phone
  if (queryDigits.length >= 3) {
    if (phone === queryDigits) score += 260;
    else if (phone.endsWith(queryDigits)) score += 200;
    else if (phone.includes(queryDigits)) score += 140;
  }

  // ID prefix
  if (partner.investor_id?.startsWith(query)) score += 160;

  // Multi-term
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const all = tokens.every(t => name.includes(t) || (partner.territory || '').toLowerCase().includes(t));
    if (all) score += 100;
  }

  return score;
}

interface PartnerDirectoryProps {
  onSelectPartners?: (ids: string[]) => void;
}

export function PartnerDirectory({ onSelectPartners }: PartnerDirectoryProps) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [sortField, setSortField] = useState<'totalInvested' | 'full_name' | 'created_at'>('totalInvested');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  

  // Fetch all users with supporter role, then enrich with portfolio data
  const { data: partners, isLoading } = useQuery({
    queryKey: ['partner-directory-full'],
    queryFn: async () => {
      // Step 1: Get ALL user IDs with the 'supporter' role
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      const supporterUserIds: string[] = [];

      while (hasMore) {
        const { data } = await supabase.from('user_roles')
          .select('user_id')
          .eq('role', 'supporter')
          .range(offset, offset + PAGE_SIZE - 1);
        if (data && data.length > 0) {
          supporterUserIds.push(...data.map(r => r.user_id));
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      if (supporterUserIds.length === 0) return [];

      // Step 2: Fetch all portfolios for these users
      const allPortfolios: any[] = [];
      const BATCH = 50;
      for (let i = 0; i < supporterUserIds.length; i += BATCH) {
        const batch = supporterUserIds.slice(i, i + BATCH);
        const { data } = await supabase.from('investor_portfolios')
          .select('id, investor_id, agent_id, investment_amount, total_roi_earned, status, created_at')
          .or(`investor_id.in.(${batch.join(',')}),agent_id.in.(${batch.join(',')})`);
        if (data) allPortfolios.push(...data);
      }

      // Group portfolios by investor
      const investorMap = new Map<string, { totalInvested: number; totalROI: number; portfolioCount: number; activePortfolios: number; earliestDate: string; status: string }>();
      allPortfolios.forEach(p => {
        const investorId = p.investor_id || p.agent_id;
        if (!investorId) return;
        const existing = investorMap.get(investorId) || { totalInvested: 0, totalROI: 0, portfolioCount: 0, activePortfolios: 0, earliestDate: p.created_at, status: 'inactive' };
        existing.totalInvested += p.investment_amount || 0;
        existing.totalROI += p.total_roi_earned || 0;
        existing.portfolioCount++;
        if (p.status === 'active') { existing.activePortfolios++; existing.status = 'active'; }
        else if (p.status === 'pending_approval' && existing.status !== 'active') existing.status = 'pending';
        if (p.created_at < existing.earliestDate) existing.earliestDate = p.created_at;
        investorMap.set(investorId, existing);
      });

      // Step 3: Fetch profiles in batches
      const allProfiles: any[] = [];
      for (let i = 0; i < supporterUserIds.length; i += BATCH) {
        const { data } = await supabase.from('profiles')
          .select('id, full_name, phone, email, avatar_url, created_at, territory, last_active_at')
          .in('id', supporterUserIds.slice(i, i + BATCH));
        if (data) allProfiles.push(...data);
      }

      return allProfiles.map(p => {
        const inv = investorMap.get(p.id);
        return {
          id: p.id,
          investor_id: p.id,
          full_name: p.full_name || 'Unknown',
          phone: p.phone || '',
          email: p.email || '',
          avatar_url: p.avatar_url,
          created_at: inv?.earliestDate || p.created_at,
          territory: p.territory,
          totalInvested: inv?.totalInvested || 0,
          totalROI: inv?.totalROI || 0,
          portfolioCount: inv?.portfolioCount || 0,
          activePortfolios: inv?.activePortfolios || 0,
          status: inv?.status || 'new',
          tier: getPartnerTier(inv?.totalInvested || 0, inv?.activePortfolios || 0),
          lastActiveAt: (p as any).last_active_at || null,
        } as PartnerRow;
      });
    },
    staleTime: 600000,
  });

  const list = useMemo(() => {
    let arr = partners || [];
    if (tierFilter !== 'all') arr = arr.filter(p => p.tier === tierFilter);

    if (search.trim()) {
      return arr
        .map(p => ({ p, score: getSearchScore(p, search) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.p);
    }

    return [...arr].sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [partners, search, tierFilter, sortField, sortAsc]);

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { all: (partners || []).length };
    (partners || []).forEach(p => { counts[p.tier] = (counts[p.tier] || 0) + 1; });
    return counts;
  }, [partners]);

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();
  const viewLimit = search.trim() ? 100 : 50;

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getDashboardStatus = (lastActiveAt: string | null) => {
    if (!lastActiveAt) return { label: 'Never logged in', color: 'text-destructive', icon: EyeOff };
    const days = differenceInDays(new Date(), new Date(lastActiveAt));
    if (days <= 7) return { label: `Active ${formatDistanceToNow(new Date(lastActiveAt), { addSuffix: true })}`, color: 'text-green-600', icon: Eye };
    if (days <= 30) return { label: `${days}d ago`, color: 'text-amber-600', icon: Eye };
    return { label: `Inactive ${days}d`, color: 'text-destructive', icon: EyeOff };
  };

  const openProfile = (p: PartnerRow) => {
    setSelectedProfile({
      id: p.investor_id,
      name: p.full_name,
      avatarUrl: p.avatar_url,
      type: 'supporter' as const,
      createdAt: p.created_at,
      phone: p.phone,
      city: p.territory,
      lastActiveAt: p.lastActiveAt,
    });
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Partner Directory
            <Badge variant="outline" className="text-[10px]">{(partners || []).length.toLocaleString()}</Badge>
          </h3>
          <div className="flex items-center gap-1.5">
            {bulkMode && selectedIds.size > 0 && (
              <Badge variant="secondary" className="text-[10px]">{selectedIds.size} selected</Badge>
            )}
            <Button size="sm" variant={bulkMode ? "default" : "outline"} className="h-7 text-[10px] gap-1" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); if (onSelectPartners) onSelectPartners([]); }}>
              <CheckSquare className="h-3 w-3" /> {bulkMode ? 'Done' : 'Select'}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {search && <p className="text-[10px] text-muted-foreground mb-1.5">💡 Try name, last 4 digits of phone, or ID prefix</p>}

        {/* Tier pills */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TIER_PILLS.map(t => (
            <button
              key={t.key}
              onClick={() => setTierFilter(t.key)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                tierFilter === t.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : t.color || 'bg-muted/50 text-muted-foreground border-border'
              }`}
            >
              {t.label} {tierCounts[t.key] ? `(${tierCounts[t.key].toLocaleString()})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Sort bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] text-muted-foreground">
        <button className="flex items-center gap-0.5 font-medium hover:text-foreground" onClick={() => toggleSort('full_name')}>Name <SortIcon field="full_name" /></button>
        <button className="flex items-center gap-0.5 font-medium hover:text-foreground ml-auto" onClick={() => toggleSort('totalInvested')}>Principal <SortIcon field="totalInvested" /></button>
        <button className="flex items-center gap-0.5 font-medium hover:text-foreground" onClick={() => toggleSort('created_at')}>Joined <SortIcon field="created_at" /></button>
      </div>

      {/* List */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">Loading partners...</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No partners found</div>
        ) : (
          list.slice(0, viewLimit).map(p => (
            <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-colors">
              {bulkMode && (
                <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} className="shrink-0" />
              )}
              <button onClick={() => openProfile(p)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate text-primary hover:underline">{p.full_name}</span>
                  <Badge variant="outline" className={`text-[8px] shrink-0 ${
                    p.tier === 'platinum' ? 'bg-purple-500/10 text-purple-600 border-purple-300' :
                    p.tier === 'gold' ? 'bg-amber-500/10 text-amber-600 border-amber-300' :
                    p.tier === 'silver' ? 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400' :
                    'bg-green-500/10 text-green-600 border-green-300'
                  }`}>
                    {p.tier === 'platinum' ? '💎' : p.tier === 'gold' ? '🥇' : p.tier === 'silver' ? '🥈' : '🌱'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  {p.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{p.phone}</span>}
                  <span className="flex items-center gap-0.5"><DollarSign className="h-2.5 w-2.5" />{fmt(p.totalInvested)}</span>
                  <span className="flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />Returns: {fmt(p.totalROI)}</span>
                  <span>{p.portfolioCount} acct{p.portfolioCount !== 1 ? 's' : ''}</span>
                </div>
              </button>
              <div className="shrink-0 text-right space-y-0.5">
                <div className={`text-[10px] font-medium ${p.status === 'active' ? 'text-green-600' : p.status === 'pending' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {p.status === 'active' ? '● Active' : p.status === 'pending' ? '⏳ Pending' : '○ Inactive'}
                </div>
                {(() => {
                  const ds = getDashboardStatus(p.lastActiveAt);
                  const Icon = ds.icon;
                  return (
                    <div className={`text-[9px] flex items-center justify-end gap-0.5 ${ds.color}`}>
                      <Icon className="h-2.5 w-2.5" />
                      {ds.label}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))
        )}
        {list.length > viewLimit && (
          <div className="p-2 text-center text-[10px] text-muted-foreground">
            Showing {viewLimit} of {list.length.toLocaleString()} · Refine search to see more
          </div>
        )}
      </div>

      <UserProfileDialog
        open={!!selectedProfile}
        onOpenChange={(open) => !open && setSelectedProfile(null)}
        user={selectedProfile}
      />
    </div>
  );
}
