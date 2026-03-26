import { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Phone, ChevronRight, User } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

export function TenantOverviewList({ data, loading, initialCategory, onSelectTenant }: TenantOverviewListProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>((initialCategory as Category) || 'all');

  // Sync when parent changes the filter
  useEffect(() => {
    if (initialCategory) {
      setCategory(initialCategory as Category);
    }
  }, [initialCategory]);

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
        <span className="text-xs text-muted-foreground">{filtered.length} tenants</span>
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

      {/* Tenant list */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              No tenants found
            </CardContent>
          </Card>
        ) : (
          filtered.map((tenant) => (
            <button
              key={tenant.tenant_id}
              onClick={() => onSelectTenant(tenant.tenant_id, tenant.tenant_name)}
              className="w-full text-left"
            >
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
          ))
        )}
      </div>
    </div>
  );
}
