import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, User, Home, ChevronRight, Phone, Image as ImageIcon } from 'lucide-react';
import { TenantLocationBreadcrumbs } from './TenantLocationBreadcrumbs';
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
        <LocationBreadcrumbs path={path as any} onJump={(p) => setPath(p as TenantBreadcrumbPath)} />
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
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="h-[110px] animate-pulse bg-muted/30" />
        ))}
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {rows.map(r => {
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
  );
}

function TenantLeafList({ path }: { path: TenantBreadcrumbPath }) {
  const { data, isLoading } = useTenantsAtLeaf(path);
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!data || data.length === 0) {
    return <Card className="py-10 text-center text-sm text-muted-foreground">No tenants in this scope yet.</Card>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{data.length} tenant{data.length === 1 ? '' : 's'}</p>
      {data.map(t => (
        <TenantCard key={t.tenant_id} t={t} expanded={openId === t.tenant_id} onToggle={() => setOpenId(openId === t.tenant_id ? null : t.tenant_id)} />
      ))}
    </div>
  );
}

function TenantCard({ t, expanded, onToggle }: { t: TenantLeaf; expanded: boolean; onToggle: () => void }) {
  const initials = (t.tenant_name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const tenantImg = t.tenant_photo_url || t.tenant_avatar_url || undefined;
  const houseImgs = (t.house_image_urls ?? []).filter(Boolean);

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
            <div className="grid grid-cols-3 gap-1.5">
              {houseImgs.slice(0, 6).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded overflow-hidden bg-muted">
                  <img src={url} alt={`House photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> No house photos uploaded yet.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}