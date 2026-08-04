import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Mail, Phone, ShieldOff, ArrowLeftRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { ServiceCenterSubAgent } from '@/hooks/useAgentServiceCenter';

function initials(name?: string | null) {
  if (!name) return 'SA';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'SA';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground break-words">{value}</div>
    </div>
  );
}

export function SubAgentRosterCard({
  subAgent,
  onSuspend,
  onTransfer,
}: {
  subAgent: ServiceCenterSubAgent;
  onSuspend: (s: ServiceCenterSubAgent) => void;
  onTransfer: (s: ServiceCenterSubAgent) => void;
}) {
  const suspended = !!subAgent.suspension;
  const until = subAgent.suspension?.blocked_until
    ? new Date(subAgent.suspension.blocked_until).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Kampala',
      })
    : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarImage src={subAgent.avatar_url ?? undefined} alt={subAgent.full_name ?? 'Sub-agent'} />
            <AvatarFallback>{initials(subAgent.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-foreground">{subAgent.full_name ?? 'Unnamed sub-agent'}</span>
              {subAgent.link_status !== 'verified' && (
                <Badge variant="outline" className="text-[10px]">Awaiting acceptance</Badge>
              )}
              {suspended && <Badge variant="destructive" className="text-[10px]">Suspended{until ? ` · to ${until}` : ''}</Badge>}
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {subAgent.phone && (
                <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{subAgent.phone}</div>
              )}
              {subAgent.email && (
                <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" />{subAgent.email}</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Commissions" value={formatUGX(subAgent.commission_total)} />
          <Stat label="Referral bonus" value={formatUGX(subAgent.referral_bonus)} />
          <Stat label="Active tenants" value={String(subAgent.active_tenants)} />
          <Stat label="Landlords" value={`${subAgent.landlords_verified}/${subAgent.landlords_registered}`} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Withdrawable" value={formatUGX(subAgent.wallet.withdrawable)} />
          <Stat label="Float" value={formatUGX(subAgent.wallet.float)} />
          <Stat label="Advance" value={formatUGX(subAgent.wallet.advance)} />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-full justify-between px-2 text-xs">
              <span>
                Tenants ({subAgent.tenant_list.length}) · Own sub-agents ({subAgent.nested_subagents})
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            {subAgent.tenant_list.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No active tenants yet.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {subAgent.tenant_list.map((t) => (
                  <li key={t.rent_request_id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="truncate">{t.tenant_name ?? 'Unnamed tenant'}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {t.monthly_rent ? formatUGX(t.monthly_rent) : '—'} · {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onTransfer(subAgent)}
            disabled={subAgent.tenant_list.length === 0}
          >
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            Transfer tenant
          </Button>
          <Button
            variant={suspended ? 'secondary' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => onSuspend(subAgent)}
          >
            <ShieldOff className="mr-1.5 h-4 w-4" />
            {suspended ? 'Restore access' : 'Suspend'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}