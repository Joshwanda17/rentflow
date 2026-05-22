import { useState, useMemo, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Phone, ChevronRight, User, ChevronLeft, ChevronDown, Download, Loader2, Users, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { generateAndDownloadActiveTenantsPdf } from '@/lib/activeTenantsReportPdf';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TenantRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  status: string;
  rent_amount: number;
  amount_repaid: number;
  landlord_name: string;
  landlord_phone: string;
  created_at: string;
}

type Category = 'all' | 'pending' | 'in_pipeline' | 'active' | 'repaying' | 'fully_repaid' | 'defaulted';

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: 'bg-muted text-foreground' },
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  { value: 'in_pipeline', label: 'In Pipeline', color: 'bg-blue-100 text-blue-700' },
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'repaying', label: 'Repaying', color: 'bg-purple-100 text-purple-700' },
  { value: 'fully_repaid', label: 'Fully Repaid', color: 'bg-green-100 text-green-700' },
  { value: 'defaulted', label: 'Defaulted', color: 'bg-destructive/10 text-destructive' },
];

const STATUS_MAP: Record<Category, string[]> = {
  all: [],
  pending: ['pending'],
  in_pipeline: ['tenant_ops_approved', 'agent_verified', 'landlord_ops_approved', 'coo_approved'],
  active: ['funded', 'disbursed'],
  repaying: ['repaying'],
  fully_repaid: ['fully_repaid'],
  defaulted: ['defaulted'],
};

const statusBadgeColor = (status: string) => {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    tenant_ops_approved: 'bg-blue-100 text-blue-700',
    agent_verified: 'bg-purple-100 text-purple-700',
    landlord_ops_approved: 'bg-indigo-100 text-indigo-700',
    coo_approved: 'bg-emerald-100 text-emerald-700',
    funded: 'bg-green-100 text-green-700',
    disbursed: 'bg-teal-100 text-teal-700',
    repaying: 'bg-purple-100 text-purple-700',
    fully_repaid: 'bg-emerald-100 text-emerald-700',
    defaulted: 'bg-destructive/10 text-destructive',
  };
  return map[status] || 'bg-muted text-muted-foreground';
};

interface TenantOverviewListProps {
  data: TenantRow[];
  loading?: boolean;
  initialCategory?: string;
  onSelectTenant: (tenantId: string, tenantName: string) => void;
}

type GroupBy = 'none' | 'agent' | 'region' | 'village' | 'district' | 'city' | 'country';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'agent', label: 'Agent' },
  { value: 'region', label: 'Region' },
  { value: 'village', label: 'LC1 / Village' },
  { value: 'district', label: 'District' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
];

interface TenantEnrichment {
  agent_id: string | null;
  agent_name: string | null;
  region: string | null;
  village: string | null;
  district: string | null;
  city: string | null;
  country: string | null;
}

export function TenantOverviewList({ data, loading, initialCategory, onSelectTenant }: TenantOverviewListProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>((initialCategory as Category) || 'all');
  const [page, setPage] = useState(1);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [enrichment, setEnrichment] = useState<Map<string, TenantEnrichment>>(new Map());
  const [enriching, setEnriching] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 25;

  // Sync when parent changes the filter
  useEffect(() => {
    if (initialCategory) {
      setCategory(initialCategory as Category);
    }
  }, [initialCategory]);

  // Reset to first page when filters/search change
  useEffect(() => { setPage(1); }, [search, category]);

  // Deduplicate tenants - group by tenant_id, pick most recent request
  const tenants = useMemo(() => {
    const map = new Map<string, TenantRow & { requestCount: number }>();
    for (const row of data) {
      if (!row.tenant_id) continue;
      const existing = map.get(row.tenant_id);
      if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
        map.set(row.tenant_id, { ...row, requestCount: (existing?.requestCount || 0) + 1 });
      } else if (existing) {
        existing.requestCount += 1;
      }
    }
    return Array.from(map.values());
  }, [data]);

  // Fetch agent + location enrichment for the current tenant set.
  // We resolve the agent via the most recent rent_request assignment,
  // falling back to profiles.referrer_id when that referrer holds the
  // agent role. Location comes straight from the tenant profile.
  useEffect(() => {
    let cancelled = false;
    const tenantIds = tenants.map((t) => t.tenant_id).filter(Boolean);
    if (tenantIds.length === 0) {
      setEnrichment(new Map());
      return;
    }
    setEnriching(true);
    (async () => {
      try {
        const [{ data: profiles }, { data: rentReqs }] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, referrer_id, region, village, district, city, country')
            .in('id', tenantIds),
          supabase
            .from('rent_requests')
            .select('tenant_id, agent_id, created_at')
            .in('tenant_id', tenantIds)
            .not('agent_id', 'is', null)
            .order('created_at', { ascending: false }),
        ]);

        const assignedAgentByTenant = new Map<string, string>();
        for (const r of rentReqs || []) {
          if (r.agent_id && !assignedAgentByTenant.has(r.tenant_id)) {
            assignedAgentByTenant.set(r.tenant_id, r.agent_id);
          }
        }

        const referrerIds = Array.from(
          new Set((profiles || []).map((p: any) => p.referrer_id).filter(Boolean) as string[]),
        );
        const { data: agentRoleRows } = referrerIds.length
          ? await supabase
              .from('user_roles')
              .select('user_id')
              .in('user_id', referrerIds)
              .eq('role', 'agent')
          : { data: [] as any[] };
        const agentReferrerSet = new Set((agentRoleRows || []).map((r: any) => r.user_id));

        const allAgentIds = Array.from(
          new Set([
            ...Array.from(assignedAgentByTenant.values()),
            ...referrerIds.filter((id) => agentReferrerSet.has(id)),
          ]),
        );
        const { data: agentProfiles } = allAgentIds.length
          ? await supabase.from('profiles').select('id, full_name').in('id', allAgentIds)
          : { data: [] as any[] };
        const agentNameMap = new Map<string, string>(
          (agentProfiles || []).map((p: any) => [p.id, p.full_name || 'Unnamed agent']),
        );

        const next = new Map<string, TenantEnrichment>();
        for (const p of profiles || []) {
          const agentId =
            assignedAgentByTenant.get(p.id) ||
            (p.referrer_id && agentReferrerSet.has(p.referrer_id) ? p.referrer_id : null);
          next.set(p.id, {
            agent_id: agentId,
            agent_name: agentId ? agentNameMap.get(agentId) ?? null : null,
            region: p.region ?? null,
            village: p.village ?? null,
            district: p.district ?? null,
            city: p.city ?? null,
            country: p.country ?? null,
          });
        }
        if (!cancelled) setEnrichment(next);
      } catch (err) {
        console.warn('[TenantOverviewList] enrichment failed:', err);
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the set of tenant ids actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants.map((t) => t.tenant_id).join('|')]);

  const filtered = useMemo(() => {
    let result = tenants;

    // Category filter - check if tenant has ANY request in this category
    if (category !== 'all') {
      const statuses = STATUS_MAP[category];
      const tenantIdsInCategory = new Set(
        data.filter(r => statuses.includes(r.status)).map(r => r.tenant_id)
      );
      result = result.filter(t => tenantIdsInCategory.has(t.tenant_id));
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.tenant_name.toLowerCase().includes(q) ||
        t.tenant_phone.toLowerCase().includes(q) ||
        t.landlord_name.toLowerCase().includes(q)
      );
    }

    return result;
  }, [tenants, category, search, data]);

  // Resolve the group key (and display label) for a tenant given groupBy.
  const groupKeyFor = (tenant: TenantRow & { requestCount: number }): string => {
    const e = enrichment.get(tenant.tenant_id);
    switch (groupBy) {
      case 'agent':
        return e?.agent_name?.trim() || 'Unassigned';
      case 'region':
        return e?.region?.trim() || 'Unknown region';
      case 'village':
        return e?.village?.trim() || 'Unknown LC1 / village';
      case 'district':
        return e?.district?.trim() || 'Unknown district';
      case 'city':
        return e?.city?.trim() || 'Unknown city';
      case 'country':
        return e?.country?.trim() || 'Unknown country';
      default:
        return '';
    }
  };

  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, (TenantRow & { requestCount: number })[]>();
    for (const t of filtered) {
      const key = groupKeyFor(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => ({ key, rows }))
      .sort((a, b) => {
        // Unknown / Unassigned always last, otherwise by descending size.
        const aUnknown = /^Unknown |^Unassigned$/.test(a.key);
        const bUnknown = /^Unknown |^Unassigned$/.test(b.key);
        if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
        if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
        return a.key.localeCompare(b.key);
      });
  }, [filtered, groupBy, enrichment]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      all: tenants.length,
      pending: 0,
      in_pipeline: 0,
      active: 0,
      repaying: 0,
      fully_repaid: 0,
      defaulted: 0,
    };
    for (const row of data) {
      for (const [cat, statuses] of Object.entries(STATUS_MAP)) {
        if (cat === 'all') continue;
        if (statuses.includes(row.status)) {
          // Count unique tenants per category
          counts[cat as Category] = (counts[cat as Category] || 0);
        }
      }
    }
    // Recalculate properly with unique tenant counts
    for (const cat of Object.keys(STATUS_MAP) as Category[]) {
      if (cat === 'all') continue;
      const statuses = STATUS_MAP[cat];
      const uniqueTenants = new Set(
        data.filter(r => statuses.includes(r.status)).map(r => r.tenant_id)
      );
      counts[cat] = uniqueTenants.size;
    }
    return counts;
  }, [data, tenants]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">All Tenants</h3>
        <div className="flex items-center gap-2">
          <ExportActiveTenantsButton />
          <span className="text-xs text-muted-foreground">{filtered.length} tenants</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, phone, landlord..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Group-by selector */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0">Group by</span>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="h-8 text-xs flex-1 max-w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {enriching && groupBy !== 'none' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border',
              category === cat.value
                ? `${cat.color} border-current shadow-sm`
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            )}
          >
            {cat.label}
            <span className="ml-1 opacity-70">({categoryCounts[cat.value]})</span>
          </button>
        ))}
      </div>

      {/* Tenant list — flat (when grouping is off) or grouped sections */}
      {groupBy === 'none' ? (
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              No tenants found
            </CardContent>
          </Card>
        ) : (
          paginated.map((tenant) => (
            <TenantRowCard
              key={tenant.tenant_id}
              tenant={tenant}
              onSelect={() => onSelectTenant(tenant.tenant_id, tenant.tenant_name)}
            />
          ))
        )}
      </div>
      ) : (
        <div className="space-y-3">
          {!grouped || grouped.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No tenants found
              </CardContent>
            </Card>
          ) : (
            grouped.map(({ key, rows }) => {
              const collapsed = collapsedGroups.has(key);
              const Icon = groupBy === 'agent' ? Users : MapPin;
              return (
                <div key={key} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-semibold text-foreground truncate">{key}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{rows.length}</Badge>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform',
                        collapsed && '-rotate-90',
                      )}
                    />
                  </button>
                  {!collapsed && (
                    <div className="p-2 space-y-1.5">
                      {rows.map((tenant) => (
                        <TenantRowCard
                          key={tenant.tenant_id}
                          tenant={tenant}
                          onSelect={() => onSelectTenant(tenant.tenant_id, tenant.tenant_name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Pagination */}
      {groupBy === 'none' && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-[11px] text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] font-medium text-foreground tabular-nums px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TenantRowCard({
  tenant,
  onSelect,
}: {
  tenant: TenantRow & { requestCount: number };
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} className="w-full text-left">
      <Card className="border hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{tenant.tenant_name}</p>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', statusBadgeColor(tenant.status))}>
                {tenant.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />{tenant.tenant_phone}
              </span>
              <span className="text-[11px] text-muted-foreground">
                UGX {Number(tenant.rent_amount || 0).toLocaleString()}
              </span>
              {tenant.requestCount > 1 && (
                <span className="text-[10px] text-muted-foreground">
                  {tenant.requestCount} requests
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </CardContent>
      </Card>
    </button>
  );
}

function ExportActiveTenantsButton() {
  const [exporting, setExporting] = useState(false);
  const handle = async () => {
    if (exporting) return;
    setExporting(true);
    const t = toast.loading('Generating active tenants report...');
    try {
      await generateAndDownloadActiveTenantsPdf();
      toast.success('Report downloaded', { id: t });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate report', { id: t });
    } finally {
      setExporting(false);
    }
  };
  return (
    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={handle} disabled={exporting}>
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span className="ml-1">Tenants Report PDF</span>
    </Button>
  );
}
