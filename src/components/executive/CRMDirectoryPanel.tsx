import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPICard } from './KPICard';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import {
  Search, Users, X, ShieldCheck, Activity, Sparkles,
  ChevronLeft, ChevronRight, Phone, MapPin, Loader2,
  FileText, Clock3, BadgeCheck, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { AppRole } from '@/hooks/auth/types';

interface DirectoryRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  verified: boolean;
  created_at: string | null;
  last_active_at: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  territory: string | null;
  national_id: string | null;
  tenant_status: string | null;
  agent_type: string | null;
  monthly_rent: number | null;
  stage: string | null;
  total_matched: number;
}

interface Totals {
  total: number;
  verified: number;
  active30d: number;
  new30d: number;
  rent_request: number;
  processing: number;
  stage_verified: number;
  paid: number;
}

const PAGE_SIZE = 50;

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString();

type StageKey = 'rent_request' | 'processing' | 'verified' | 'paid';

const STAGES: {
  key: StageKey;
  label: string;
  icon: typeof FileText;
  badgeClass: string;
  countKey: keyof Totals;
}[] = [
  { key: 'rent_request', label: 'Rent Requests', icon: FileText, badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30', countKey: 'rent_request' },
  { key: 'processing', label: 'Processing', icon: Clock3, badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/30', countKey: 'processing' },
  { key: 'verified', label: 'Verified', icon: BadgeCheck, badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', countKey: 'stage_verified' },
  { key: 'paid', label: 'Paid', icon: Wallet, badgeClass: 'bg-violet-500/10 text-violet-600 border-violet-500/30', countKey: 'paid' },
];

const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, typeof STAGES[number]>;

interface CRMDirectoryPanelProps {
  role: Extract<AppRole, 'tenant' | 'agent'>;
  title: string;
  subtitle: string;
}

export function CRMDirectoryPanel({ role, title, subtitle }: CRMDirectoryPanelProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DirectoryRow | null>(null);
  const [stage, setStage] = useState<StageKey | null>(null);

  const showStages = role === 'tenant';

  // Debounce search & reset page
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page when changing stage
  useEffect(() => { setPage(0); }, [stage]);

  const { data: totals } = useQuery<Totals>({
    queryKey: ['crm-directory-totals', role],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_crm_directory_totals', { _role: role });
      if (error) throw error;
      const row = (data as any[])?.[0];
      return {
        total: Number(row?.total ?? 0),
        verified: Number(row?.verified ?? 0),
        active30d: Number(row?.active30d ?? 0),
        new30d: Number(row?.new30d ?? 0),
        rent_request: Number(row?.rent_request ?? 0),
        processing: Number(row?.processing ?? 0),
        stage_verified: Number(row?.stage_verified ?? 0),
        paid: Number(row?.paid ?? 0),
      };
    },
    staleTime: 120_000,
  });

  const { data: rows, isLoading, isFetching } = useQuery<DirectoryRow[]>({
    queryKey: ['crm-directory-rows', role, search, stage, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_crm_directory', {
        _role: role,
        _search: search || null,
        _stage: showStages ? stage : null,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data as DirectoryRow[]) || [];
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const list = rows ?? [];
  const totalMatched = list[0]?.total_matched ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(totalMatched) / PAGE_SIZE));

  const openProfile = useCallback((r: DirectoryRow) => setSelected(r), []);

  const profileUser = useMemo(() => {
    if (!selected) return null;
    return {
      id: selected.id,
      name: selected.full_name || (role === 'agent' ? 'Unknown Agent' : 'Unknown Tenant'),
      avatarUrl: selected.avatar_url ?? undefined,
      type: role,
      createdAt: selected.created_at ?? undefined,
      phone: selected.phone ?? undefined,
      verified: selected.verified,
      city: selected.city || selected.territory || undefined,
      lastActiveAt: selected.last_active_at,
      email: selected.email ?? undefined,
      nationalId: selected.national_id ?? undefined,
      district: selected.district ?? undefined,
      region: selected.region ?? undefined,
      territory: selected.territory ?? undefined,
      monthlyRent: selected.monthly_rent ?? undefined,
      stage: selected.stage ?? undefined,
      tenantStatus: selected.tenant_status ?? undefined,
      hasRentRequest: role === 'tenant' ? selected.stage === 'rent_request' : undefined,
    };
  }, [selected, role]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title={role === 'agent' ? 'Total Agents' : 'Total Tenants'} value={fmt(totals?.total ?? 0)} icon={Users} />
        <KPICard title="Verified" value={fmt(totals?.verified ?? 0)} icon={ShieldCheck} color="bg-emerald-500/10 text-emerald-600" />
        <KPICard title="Active (30d)" value={fmt(totals?.active30d ?? 0)} icon={Activity} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="New (30d)" value={fmt(totals?.new30d ?? 0)} icon={Sparkles} color="bg-purple-500/10 text-purple-600" />
      </div>

      {/* Lifecycle stage tabs (tenants only) */}
      {showStages && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStage(null)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              stage === null
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:bg-muted/50',
            )}
          >
            All
            <span className="opacity-70">{fmt(totals?.total ?? 0)}</span>
          </button>
          {STAGES.map((s) => {
            const Icon = s.icon;
            const active = stage === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? cn(s.badgeClass, 'ring-1 ring-inset ring-current/30')
                    : 'bg-background text-muted-foreground border-border hover:bg-muted/50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
                <span className="opacity-70">{fmt(Number(totals?.[s.countKey] ?? 0))}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name, phone, email, ID, or location…"
          className="pl-9 pr-9"
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

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-left">
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Name</th>
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Phone</th>
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Location</th>
                {role === 'agent' ? (
                  <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Territory</th>
                ) : (
                  <>
                    <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Stage</th>
                    <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                  </>
                )}
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">National ID</th>
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Verified</th>
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Last Active</th>
                <th className="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Joined</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: role === 'agent' ? 8 : 9 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 w-20 bg-muted animate-pulse rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={role === 'agent' ? 8 : 9} className="px-3 py-10 text-center text-muted-foreground">No records found</td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openProfile(r)}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.full_name || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.phone ? (
                        <span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{r.phone}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {(r.city || r.district || r.region) && <MapPin className="h-3 w-3" />}
                        {[r.city, r.district, r.region].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>
                    {role === 'agent' ? (
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.territory || '—'}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {r.stage && STAGE_BY_KEY[r.stage as StageKey] ? (
                            <Badge className={cn('text-xs border gap-1', STAGE_BY_KEY[r.stage as StageKey].badgeClass)}>
                              {(() => { const I = STAGE_BY_KEY[r.stage as StageKey].icon; return <I className="h-3 w-3" />; })()}
                              {STAGE_BY_KEY[r.stage as StageKey].label}
                            </Badge>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {r.tenant_status ? (
                            <Badge variant="secondary" className="text-xs">{r.tenant_status}</Badge>
                          ) : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.national_id || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.verified
                        ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">Verified</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {r.last_active_at ? format(new Date(r.last_active_at), 'dd MMM yy') : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {r.created_at ? format(new Date(r.created_at), 'dd MMM yy') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          {Number(totalMatched).toLocaleString()} {role === 'agent' ? 'agents' : 'tenants'}
          {totalMatched > 0 && ` · page ${page + 1} of ${totalPages}`}
        </p>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-8" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button variant="outline" size="sm" className="h-8" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <UserProfileDialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)} user={profileUser as any} />
    </div>
  );
}