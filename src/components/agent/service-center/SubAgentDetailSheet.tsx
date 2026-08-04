import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useState } from 'react';
import {
  ArrowLeftRight, Home, Mail, Phone, ShieldCheck, ShieldOff, Unlink, Users, Wallet,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { ServiceCenterSubAgent } from '@/hooks/useAgentServiceCenter';
import { initialsOf, tintFor } from './subAgentVisuals';

function Metric({
  label, value, tone, icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'warning' | 'accent';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary border-primary/25',
    success: 'bg-success/10 text-success border-success/25',
    warning: 'bg-warning/10 text-warning border-warning/25',
    accent: 'bg-accent text-accent-foreground border-border',
  } as const;
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-bold">{value}</div>
    </div>
  );
}

export function SubAgentDetailSheet({
  subAgent,
  open,
  onOpenChange,
  onSuspend,
  onTransfer,
  onUnlink,
}: {
  subAgent: ServiceCenterSubAgent | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuspend: (s: ServiceCenterSubAgent) => void;
  onTransfer: (s: ServiceCenterSubAgent, rentRequestId: string) => void;
  onUnlink: (s: ServiceCenterSubAgent) => void;
}) {
  const [visibleTenants, setVisibleTenants] = useState(10);

  useEffect(() => {
    setVisibleTenants(10);
  }, [subAgent?.sub_agent_id, open]);

  if (!subAgent) return null;

  const suspended = !!subAgent.suspension;
  const tint = tintFor(subAgent.sub_agent_id);
  const until = subAgent.suspension?.blocked_until
    ? new Date(subAgent.suspension.blocked_until).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Kampala',
      })
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] rounded-t-3xl p-0">
        <ScrollArea className="h-full">
          <div className={`${tint.header} px-5 pb-6 pt-8`}>
            <div className="flex items-start gap-3">
              <Avatar className="h-14 w-14 shrink-0 ring-2 ring-background">
                <AvatarImage src={subAgent.avatar_url ?? undefined} alt={subAgent.full_name ?? 'Sub-agent'} />
                <AvatarFallback className={tint.fallback}>{initialsOf(subAgent.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-foreground">
                  {subAgent.full_name ?? 'Unnamed sub-agent'}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {suspended ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Suspended{until ? ` · to ${until}` : ''}
                    </Badge>
                  ) : (
                    <Badge className="bg-success/15 text-success hover:bg-success/15 text-[10px]">
                      <ShieldCheck className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  )}
                  {subAgent.link_status !== 'verified' && (
                    <Badge variant="outline" className="text-[10px]">Awaiting acceptance</Badge>
                  )}
                  {subAgent.agent_tier && (
                    <Badge variant="secondary" className="text-[10px] capitalize">{subAgent.agent_tier}</Badge>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {subAgent.phone && (
                    <a href={`tel:${subAgent.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" />{subAgent.phone}
                    </a>
                  )}
                  {subAgent.email && (
                    <a href={`mailto:${subAgent.email}`} className="flex items-center gap-1.5 truncate hover:text-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{subAgent.email}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</h3>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Commissions" value={formatUGX(subAgent.commission_total)} tone="success" icon={Wallet} />
                <Metric label="Referral bonus" value={formatUGX(subAgent.referral_bonus)} tone="primary" icon={Users} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portfolio</h3>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Tenants" value={String(subAgent.active_tenants)} tone="primary" icon={Users} />
                <Metric
                  label="Landlords"
                  value={`${subAgent.landlords_verified}/${subAgent.landlords_registered}`}
                  tone="accent"
                  icon={Home}
                />
                <Metric
                  label="Houses (verified/total)"
                  value={`${subAgent.houses_verified ?? 0}/${subAgent.houses_listed ?? 0}`}
                  tone="primary"
                  icon={Home}
                />
                <Metric label="Own subs" value={String(subAgent.nested_subagents)} tone="accent" icon={Users} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wallet</h3>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Withdrawable" value={formatUGX(subAgent.wallet.withdrawable)} tone="success" icon={Wallet} />
                <Metric label="Float" value={formatUGX(subAgent.wallet.float)} tone="primary" icon={Wallet} />
                <Metric label="Advance" value={formatUGX(subAgent.wallet.advance)} tone="warning" icon={Wallet} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tenants ({subAgent.tenant_list.length}
                {subAgent.active_tenants > 0 ? ` · ${subAgent.active_tenants} active` : ''})
              </h3>
              {subAgent.tenant_list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No tenants linked to this sub-agent yet.
                </p>
              ) : (
                <>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
                  {subAgent.tenant_list.slice(0, visibleTenants).map((t) => (
                    <li key={t.rent_request_id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {t.tenant_name ?? 'Unnamed tenant'}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs">
                          <span className="font-semibold text-foreground">
                            {t.monthly_rent ? formatUGX(t.monthly_rent) : '—'}
                          </span>
                          <Badge
                            variant={t.is_active ? 'default' : 'outline'}
                            className="text-[10px] capitalize"
                          >
                            {t.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      {t.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => onTransfer(subAgent, t.rent_request_id)}
                        >
                          <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> Transfer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {subAgent.tenant_list.length > visibleTenants && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setVisibleTenants((n) => n + 10)}
                  >
                    Load more ({subAgent.tenant_list.length - visibleTenants} left)
                  </Button>
                )}
                </>
              )}
            </section>

            {subAgent.suspension?.reason && (
              <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                Suspension reason: {subAgent.suspension.reason}
              </p>
            )}

            <div className="flex flex-col gap-2 pb-4 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onUnlink(subAgent)}
              >
                <Unlink className="mr-1.5 h-4 w-4" /> Unlink sub-agent
              </Button>
              <Button
                variant={suspended ? 'secondary' : 'destructive'}
                className="flex-1"
                onClick={() => onSuspend(subAgent)}
              >
                <ShieldOff className="mr-1.5 h-4 w-4" /> {suspended ? 'Restore access' : 'Suspend'}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
