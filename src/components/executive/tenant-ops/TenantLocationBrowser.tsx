import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, User, Home, ChevronRight, Phone, Image as ImageIcon, Search, X, Maximize2 } from 'lucide-react';
import { TenantLocationBreadcrumbs } from './TenantLocationBreadcrumbs';
import { ImageZoomLightbox } from '@/components/executive/landlord-ops/ImageZoomLightbox';
import { formatUGX } from '@/lib/rentCalculations';
import {
  useTenantLocationBreakdown,
  useTenantsAtLeaf,
  tenantNextLevel,
  type TenantBreadcrumbPath,
  type TenantBreakdownRow,
  type TenantLeaf,
} from '@/hooks/useTenantLocationBreakdown';

const LEVEL_ICON: Record<string, any> = {
  country: MapPin, region: MapPin, district: MapPin, ward: MapPin,
  agent: User, landlord: Home,
};

type QuickFilter = 'all' | 'linked' | 'pending' | 'revenue';

const LEVEL_PLACEHOLDER: Record<string, string> = {
  country: 'Search countries…',
  region: 'Search regions…',
  district: 'Search districts…',
  ward: 'Search wards…',
  agent: 'Search agents…',
  landlord: 'Search landlords…',
};

export function TenantLocationBrowser() {
  const [path, setPath] = useState<TenantBreadcrumbPath>({});
  const level = tenantNextLevel(path);
  const { data: rows, isLoading } = useTenantLocationBreakdown(path);

  const pick = (row: TenantBreakdownRow) => {
    const p: TenantBreadcrumbPath = { ...path };
    switch (level) {
      case 'country':  p.country  = row.label; break;
      case 'region':   p.region   = row.label; break;
      case 'district': p.district = row.label; break;
      case 'ward':     p.ward     = row.label; break;
      case 'agent':    p.agentId  = row.agent_id ?? null; p.agentName = row.label; break;
      case 'landlord': p.landlordId = row.landlord_id ?? null; p.landlordName = row.label; break;
    }
    setPath(p);
  };

  return (
    <div className="space-y-3">
      <Card className="p-2.5 bg-muted/30">
        <TenantLocationBreadcrumbs path={path} onJump={(p) => setPath(p)} />
      </Card>

      {level === 'tenants' ? (
        <TenantLeafList path={path} />
      ) : (
        <TenantTileGrid rows={rows ?? []} level={level} loading={isLoading} onPick={pick} />
      )}
    </div>
  );
}

function TenantTileGrid({
  rows, level, loading, onPick,
}: { rows: TenantBreakdownRow[]; level: string; loading: boolean; onPick: (r: TenantBreakdownRow) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (filter === 'linked' && r.occupied === 0) return false;
      if (filter === 'pending' && r.vacant === 0) return false;
      if (filter === 'revenue' && r.revenue_ugx <= 0) return false;
      return true;
    });
  }, [rows, search, filter]);

  const Toolbar = (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={LEVEL_PLACEHOLDER[level] ?? 'Search…'}
          className="pl-8 pr-8 h-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'linked', 'pending', 'revenue'] as QuickFilter[]).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'linked' ? 'Has linked' : f === 'pending' ? 'Has pending' : 'Has revenue'}
          </Button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Toolbar}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-[110px] animate-pulse bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <Card className="py-10 text-center text-sm text-muted-foreground">
        No {level === 'country' ? 'countries' : `${level}s`} with tenants yet.
      </Card>
    );
  }
  const Icon = LEVEL_ICON[level] ?? MapPin;
  return (
    <div className="space-y-2">
      {Toolbar}
      {filtered.length === 0 ? (
        <Card className="py-8 text-center text-sm text-muted-foreground">
          No matches. Try a different search or filter.
        </Card>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {filtered.map(r => {
        const linkedPct = r.total ? Math.round((r.occupied / r.total) * 100) : 0;
        return (
          <button key={r.key} onClick={() => onPick(r)} className="group text-left">
            <Card className="p-3 h-full hover:border-primary hover:shadow-md transition active:scale-[0.98]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <p className="font-semibold text-sm truncate">{r.label}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </div>
              <p className="mt-1 text-xl font-bold">{r.total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">tenants</p>
              <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">{r.occupied} linked</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-medium">{r.vacant} pending</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{linkedPct}% have landlord</span>
                {r.revenue_ugx > 0 && <span className="font-medium">{formatUGX(r.revenue_ugx)}</span>}
              </div>
            </Card>
          </button>
        );
      })}
      </div>
      )}
    </div>
  );
}

function TenantLeafList({ path }: { path: TenantBreadcrumbPath }) {
  const { data, isLoading } = useTenantsAtLeaf(path);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'linked' | 'pending' | 'photos'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(t => {
      if (q) {
        const hay = [t.tenant_name, t.tenant_phone, t.landlord_name, t.agent_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'linked' && !t.landlord_id) return false;
      if (filter === 'pending' && t.landlord_id) return false;
      if (filter === 'photos' && !(t.house_image_urls ?? []).some(Boolean)) return false;
      return true;
    });
  }, [data, search, filter]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!data || data.length === 0) {
    return <Card className="py-10 text-center text-sm text-muted-foreground">No tenants in this scope yet.</Card>;
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenant, phone, landlord or agent…"
          className="pl-8 pr-8 h-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'linked', 'pending', 'photos'] as const).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'linked' ? 'Linked' : f === 'pending' ? 'Pending' : 'Has photos'}
          </Button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted-foreground">
          {filtered.length} of {data.length} tenant{data.length === 1 ? '' : 's'}
        </span>
      </div>
      {filtered.length === 0 ? (
        <Card className="py-8 text-center text-sm text-muted-foreground">No tenants match.</Card>
      ) : (
        filtered.map(t => (
          <TenantCard key={t.tenant_id} t={t} expanded={openId === t.tenant_id} onToggle={() => setOpenId(openId === t.tenant_id ? null : t.tenant_id)} />
        ))
      )}
    </div>
  );
}

function TenantCard({ t, expanded, onToggle }: { t: TenantLeaf; expanded: boolean; onToggle: () => void }) {
  const initials = (t.tenant_name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const tenantImg = t.tenant_photo_url || t.tenant_avatar_url || undefined;
  const houseImgs = (t.house_image_urls ?? []).filter(Boolean);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const galleryImgs = tenantImg ? [tenantImg, ...houseImgs] : houseImgs;
  const openAt = (i: number) => (e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx(i); };

  return (
    <Card className="p-3 cursor-pointer hover:border-primary transition" onClick={onToggle}>
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={tenantImg} alt={t.tenant_name} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm truncate">{t.tenant_name}</p>
            <Badge variant={t.landlord_id ? 'default' : 'secondary'} className="text-[10px] shrink-0">
              {t.landlord_id ? 'Linked' : 'Pending'}
            </Badge>
          </div>
          {t.tenant_phone && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {t.tenant_phone}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {t.landlord_name && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{t.landlord_name}</span>}
            {t.agent_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.agent_name}</span>}
            {t.rent_amount && t.rent_amount > 0 && <span className="font-medium text-foreground">{formatUGX(t.rent_amount)}/mo</span>}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {t.country} · {t.region} · {t.district} · {t.ward}
          </div>
          {t.house_category && (
            <div className="text-xs">
              <span className="text-muted-foreground">House: </span>
              <span className="font-medium">{t.house_category}</span>
            </div>
          )}
          {houseImgs.length > 0 ? (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={openAt(tenantImg ? 1 : 0)}
                className="relative block w-full aspect-[16/10] rounded-lg overflow-hidden bg-muted group"
              >
                <img
                  src={houseImgs[0]}
                  alt={`House photo 1`}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                  loading="lazy"
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                  <Maximize2 className="h-3 w-3" />
                  {houseImgs.length} photo{houseImgs.length === 1 ? '' : 's'} · tap to zoom
                </div>
              </button>
              {houseImgs.length > 1 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {houseImgs.slice(1, 5).map((url, i) => {
                    const realIdx = (tenantImg ? 1 : 0) + (i + 1);
                    const isOverflow = i === 3 && houseImgs.length > 5;
                    return (
                      <button
                        key={realIdx}
                        type="button"
                        onClick={openAt(realIdx)}
                        className="relative block aspect-square rounded overflow-hidden bg-muted"
                      >
                        <img src={url} alt={`House photo ${i + 2}`} className="w-full h-full object-cover" loading="lazy" />
                        {isOverflow && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-xs font-semibold">
                            +{houseImgs.length - 5}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> No house photos uploaded yet.
            </p>
          )}

          <ImageZoomLightbox
            images={galleryImgs}
            startIndex={lightboxIdx}
            open={lightboxIdx !== null}
            onClose={() => setLightboxIdx(null)}
            altPrefix={t.tenant_name || 'Tenant'}
          />
        </div>
      )}
    </Card>
  );
}