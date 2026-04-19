import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import {
  Search, Users, Phone, MapPin, X, FileDown, Loader2,
  ShieldCheck, Sparkles, Activity, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchAgentWalletData } from '@/lib/fetchAgentWalletData';
import { generateAgentWalletReportPdf } from '@/lib/agentWalletReportPdf';
import { cn } from '@/lib/utils';

interface AgentRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  verified: boolean;
  created_at: string | null;
  territory: string | null;
  last_active_at: string | null;
}

interface DirectoryResponse {
  rows: AgentRow[];
  totals: {
    total: number;
    verified: number;
    withTerritory: number;
    active30d: number;
    new30d: number;
  };
  totalMatched: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;
const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'recent', label: 'Newest first' },
  { value: 'active', label: 'Recently active' },
  { value: 'territory', label: 'Territory' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['value'];

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

export function AgentDirectory() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  // Debounce search (300ms) and reset page when search/sort/filter changes
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [sort, verifiedOnly]);

  const { data, isLoading, isFetching, error } = useQuery<DirectoryResponse>({
    queryKey: ['agent-directory', search, sort, verifiedOnly, page],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('agent-directory', {
        body: {
          search,
          sort,
          verifiedOnly,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      if (error) throw error;
      return data as DirectoryResponse;
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const totalMatched = data?.totalMatched ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatched / PAGE_SIZE));

  const openProfile = useCallback((a: AgentRow) => {
    setSelectedAgent({
      id: a.id,
      name: a.full_name || 'Unknown Agent',
      avatarUrl: a.avatar_url,
      type: 'agent' as const,
      createdAt: a.created_at,
      phone: a.phone,
      verified: a.verified,
      city: a.territory,
    });
  }, []);

  const handleDownload = async (agentId: string, agentName: string) => {
    setDownloading(agentId);
    try {
      toast({ title: 'Generating wallet report…' });
      const reportData = await fetchAgentWalletData(agentId);
      const blob = await generateAgentWalletReportPdf(reportData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Wallet_Report_${(agentName || 'agent').replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Report downloaded' });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Failed to generate report', description: e?.message, variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  const showingFrom = totalMatched === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, totalMatched);

  const kpis = useMemo(() => ([
    { label: 'Total Agents', value: totals ? fmt(totals.total) : '—', icon: Users, color: 'text-primary' },
    { label: 'Verified', value: totals ? fmt(totals.verified) : '—', icon: ShieldCheck, color: 'text-emerald-600' },
    { label: 'Active (30d)', value: totals ? fmt(totals.active30d) : '—', icon: Activity, color: 'text-blue-600' },
    { label: 'New (30d)', value: totals ? fmt(totals.new30d) : '—', icon: Sparkles, color: 'text-violet-600' },
  ]), [totals]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Agent Directory
          {totals && <Badge variant="secondary" className="text-xs">{fmt(totals.total)}</Badge>}
        </h3>
        {isFetching && !isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {kpis.map(k => (
          <div key={k.label} className="rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-1.5">
              <k.icon className={cn('h-3.5 w-3.5', k.color)} />
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">{k.label}</p>
            </div>
            <p className="font-bold text-sm mt-1">{k.value}</p>
          </div>
        ))}
      </div>

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

      {/* Sort + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={cn(
                'text-xs px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-colors',
                sort === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setVerifiedOnly(v => !v)}
          className={cn(
            'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border ml-auto transition-colors',
            verifiedOnly
              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300'
              : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          <ShieldCheck className="h-3 w-3" />
          Verified only
        </button>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {search || verifiedOnly
            ? `${fmt(totalMatched)} match${totalMatched === 1 ? '' : 'es'}`
            : `Showing ${fmt(totalMatched)} agents`}
        </span>
        {totalMatched > 0 && (
          <span>
            {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {totalMatched.toLocaleString()}
          </span>
        )}
      </div>

      {/* List */}
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
          <p className="text-sm font-medium">{search ? 'No agents match your search' : 'No agents found'}</p>
          {search && <p className="text-xs mt-1">Try a different name, phone, or territory</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map(a => {
            const daysAgo = a.last_active_at
              ? Math.floor((Date.now() - new Date(a.last_active_at).getTime()) / 86400000)
              : null;
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-muted/60 transition-colors"
              >
                <button
                  onClick={() => openProfile(a)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 overflow-hidden">
                    {a.avatar_url ? (
                      <img src={a.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover rounded-full" />
                    ) : (
                      (a.full_name || '?')[0]?.toUpperCase() || '?'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{a.full_name || 'Unknown Agent'}</span>
                      {a.verified && (
                        <Badge variant="default" className="text-[10px] px-1 py-0 h-4 shrink-0">✓</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {a.phone && (
                        <span className="flex items-center gap-0.5 truncate">
                          <Phone className="h-3 w-3 shrink-0" />{a.phone}
                        </span>
                      )}
                      {a.territory && (
                        <span className="hidden sm:flex items-center gap-0.5 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />{a.territory}
                        </span>
                      )}
                    </div>
                  </div>
                  {daysAgo !== null && (
                    <div className="hidden sm:block text-right shrink-0 text-xs">
                      <p className={cn(
                        'font-semibold',
                        daysAgo > 30 ? 'text-destructive' : daysAgo > 7 ? 'text-amber-600' : 'text-emerald-600'
                      )}>
                        {daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1d' : `${daysAgo}d`}
                      </p>
                      <p className="text-muted-foreground text-[10px]">active</p>
                    </div>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  title="Download wallet report"
                  disabled={downloading === a.id}
                  onClick={(e) => { e.stopPropagation(); handleDownload(a.id, a.full_name || 'agent'); }}
                >
                  {downloading === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalMatched > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            disabled={page === 0 || isFetching}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            disabled={page >= totalPages - 1 || isFetching}
            onClick={() => setPage(p => p + 1)}
          >
            Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
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
