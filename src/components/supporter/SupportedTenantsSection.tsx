import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/UserAvatar';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { Search, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useSupportedTenants, type SupportedTenant } from '@/hooks/useSupportedTenants';
import { SupportedTenantDrawer } from '@/components/supporter/SupportedTenantDrawer';
import { ListSectionSkeleton } from '@/components/skeletons/SectionSkeletons';

const PAGE_SIZE = 10;

/** Pre-funding stages are all shown as "Pending approval" to partners. */
const PENDING_STATUSES = new Set([
  'coo_approved',
  'pending',
  'pending_approval',
  'submitted',
  'in_review',
  'under_review',
  'vetted',
  'approved',
  'ready_to_fund',
  'pending_cfo',
  'pending_partner_ops',
]);

function formatTenantStatus(status: string) {
  if (PENDING_STATUSES.has(status)) return 'Pending approval';
  return status.replace(/_/g, ' ');
}

interface SupportedTenantsSectionProps {
  /** When embedded inside another section, hide the standalone heading/anchor. */
  embedded?: boolean;
}

export function SupportedTenantsSection({ embedded = false }: SupportedTenantsSectionProps = {}) {
  const { tenants, isLoading, error } = useSupportedTenants();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SupportedTenant | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(t =>
      (t.tenant_name || '').toLowerCase().includes(q) ||
      (t.tenant_address || '').toLowerCase().includes(q) ||
      (t.city || '').toLowerCase().includes(q)
    );
  }, [tenants, search]);

  const showControls = tenants.length >= 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = showControls
    ? filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : filtered;

  if (isLoading) {
    return (
      <div id={embedded ? undefined : 'supported-tenants'} className="space-y-3 scroll-mt-4">
        <ListSectionSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div id={embedded ? undefined : 'supported-tenants'} className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-semibold text-destructive">Could not load your supported tenants</p>
        <p className="text-xs text-destructive/80 mt-1">{error.message}</p>
      </div>
    );
  }

  if (tenants.length === 0) {
    if (!embedded) return null;
    return (
      <div className="flex items-center gap-2 px-4 py-6 rounded-2xl border border-border/60 bg-card">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">You have no self-funded tenants yet.</p>
      </div>
    );
  }

  return (
    <div id={embedded ? undefined : 'supported-tenants'} className="space-y-3 scroll-mt-4">
      {!embedded && (
        <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h2 className="text-sm font-black text-foreground tracking-tight">Tenants you support</h2>
          <Badge variant="secondary" className="text-[10px] ml-auto">{tenants.length}</Badge>
        </div>
      )}

      {showControls && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or address"
            className="pl-9 h-11 rounded-xl"
          />
        </div>
      )}

      <div className="space-y-2">
        {visible.map(t => (
          <button
            key={t.rent_request_id}
            onClick={() => { hapticTap(); setSelected(t); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-card border border-border/60 shadow-sm text-left active:scale-[0.98] transition-transform"
          >
            <UserAvatar avatarUrl={t.tenant_avatar_url} fullName={t.tenant_name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{t.tenant_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {t.tenant_address || t.city || 'Address not provided'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black text-foreground font-mono tabular-nums">
                {formatUGX(Number(t.rent_amount || 0))}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{formatTenantStatus(t.status)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
        {visible.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-6 rounded-2xl border border-border/60 bg-card">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No tenants match "{search}".</p>
          </div>
        )}
      </div>

      {showControls && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline" size="sm" className="rounded-xl"
            disabled={safePage <= 1}
            onClick={() => { hapticTap(); setPage(p => Math.max(1, p - 1)); }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <Button
            variant="outline" size="sm" className="rounded-xl"
            disabled={safePage >= totalPages}
            onClick={() => { hapticTap(); setPage(p => Math.min(totalPages, p + 1)); }}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      <SupportedTenantDrawer
        tenant={selected}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </div>
  );
}
