import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/UserAvatar';
import { formatUGX } from '@/lib/rentCalculations';
import { MapPin, Phone, Home, CalendarDays, Landmark } from 'lucide-react';
import type { SupportedTenant } from '@/hooks/useSupportedTenants';

interface Props {
  tenant: SupportedTenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

export function SupportedTenantDrawer({ tenant, open, onOpenChange }: Props) {
  if (!tenant) return null;

  const fundedOn = tenant.funded_at || tenant.created_at;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-5 pb-4">
          <SheetTitle className="text-left text-base">Tenant details</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-3 px-4 pb-5">
          <UserAvatar avatarUrl={tenant.tenant_avatar_url} fullName={tenant.tenant_name} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-black text-foreground truncate">{tenant.tenant_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] capitalize">{tenant.status.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline" className="text-[10px]">
                {tenant.funding_mode === 'self_managed' ? 'Self managed' : 'Managed'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card mx-4 mb-6">
          <Row icon={<Landmark className="h-4 w-4" />} label="Amount funded" value={formatUGX(Number(tenant.rent_amount || 0))} />
          <Row icon={<MapPin className="h-4 w-4" />} label="Address" value={tenant.tenant_address || tenant.city || 'Not provided'} />
          <Row icon={<Phone className="h-4 w-4" />} label="Phone" value={tenant.tenant_phone || 'Not provided'} />
          <Row icon={<Home className="h-4 w-4" />} label="Property type" value={tenant.house_category ? tenant.house_category.replace(/_/g, ' ') : 'Not specified'} />
          <Row
            icon={<CalendarDays className="h-4 w-4" />}
            label="Supported since"
            value={fundedOn ? new Date(fundedOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
          />
          <Row
            icon={<CalendarDays className="h-4 w-4" />}
            label="Plan length"
            value={tenant.duration_days ? `${tenant.duration_days} days` : '—'}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
