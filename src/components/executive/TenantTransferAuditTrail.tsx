import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ArrowRightLeft, Link2, MapPin, MapPinOff, Search, Shield,
  CheckCircle2, AlertCircle, Clock, ExternalLink, Filter, X, ChevronDown,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

type AuditEntryKind = 'transfer' | 'link';

interface AuditEntry {
  id: string;
  kind: AuditEntryKind;
  created_at: string;
  tenant_id: string | null;
  tenant_name: string;
  from_agent_id: string | null;
  from_agent_name: string;
  to_agent_id: string | null;
  to_agent_name: string;
  actor_id: string | null;
  actor_name: string;
  actor_latitude: number | null;
  actor_longitude: number | null;
  actor_accuracy: number | null;
  actor_location_status: string | null;
  reason: string | null;
  flag_type: string | null;
  rent_requests_updated: number | null;
  rent_request_id: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  captured:    { label: 'Captured',    cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30', icon: CheckCircle2 },
  denied:      { label: 'Denied',      cls: 'bg-destructive/10 text-destructive border-destructive/30', icon: MapPinOff },
  unavailable: { label: 'Unavailable', cls: 'bg-muted text-muted-foreground border-border',             icon: MapPinOff },
  timeout:     { label: 'Timeout',     cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30',       icon: Clock },
  unsupported: { label: 'Unsupported', cls: 'bg-muted text-muted-foreground border-border',             icon: AlertCircle },
};

function statusPill(status: string | null) {
  const meta = (status && STATUS_META[status]) || {
    label: 'Unknown',
    cls: 'bg-muted text-muted-foreground border-border',
    icon: AlertCircle,
  };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${meta.cls}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

export function TenantTransferAuditTrail() {
  const [search, setSearch] = useState('');

  const { data: entries, isLoading } = useQuery({
    queryKey: ['tenant-transfer-audit-trail'],
    queryFn: async (): Promise<AuditEntry[]> => {
      // Pull last 200 transfers and last 200 link audit_log rows in parallel.
      const [transfersRes, linksRes] = await Promise.all([
        supabase
          .from('tenant_transfers')
          .select(
            'id, tenant_id, from_agent_id, to_agent_id, transferred_by, reason, flag_type, rent_requests_updated, actor_latitude, actor_longitude, actor_accuracy, actor_location_status, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('audit_logs')
          .select('id, action_type, record_id, metadata, user_id, created_at')
          .eq('action_type', 'agent_linked')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const transfers = transfersRes.data || [];
      const links = (linksRes.data || []) as Array<{
        id: string;
        record_id: string | null;
        user_id: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
      }>;

      // Resolve all profile ids needed in a single round-trip.
      const ids = new Set<string>();
      transfers.forEach((t) => {
        if (t.tenant_id) ids.add(t.tenant_id);
        if (t.from_agent_id) ids.add(t.from_agent_id);
        if (t.to_agent_id) ids.add(t.to_agent_id);
        if (t.transferred_by) ids.add(t.transferred_by);
      });
      links.forEach((l) => {
        const m = l.metadata || {};
        const tenant_id = m.tenant_id as string | undefined;
        const agent_id = m.agent_id as string | undefined;
        if (tenant_id) ids.add(tenant_id);
        if (agent_id) ids.add(agent_id);
        if (l.user_id) ids.add(l.user_id);
      });

      const idArr = Array.from(ids);
      const profilesRes = idArr.length
        ? await supabase.from('profiles').select('id, full_name').in('id', idArr)
        : { data: [] as Array<{ id: string; full_name: string | null }> };
      const nameOf = new Map(
        (profilesRes.data || []).map((p) => [p.id, p.full_name || '—']),
      );

      const transferEntries: AuditEntry[] = transfers.map((t) => ({
        id: `t:${t.id}`,
        kind: 'transfer',
        created_at: t.created_at,
        tenant_id: t.tenant_id,
        tenant_name: nameOf.get(t.tenant_id || '') || '—',
        from_agent_id: t.from_agent_id,
        from_agent_name: nameOf.get(t.from_agent_id || '') || '—',
        to_agent_id: t.to_agent_id,
        to_agent_name: nameOf.get(t.to_agent_id || '') || '—',
        actor_id: t.transferred_by,
        actor_name: nameOf.get(t.transferred_by || '') || '—',
        actor_latitude: t.actor_latitude,
        actor_longitude: t.actor_longitude,
        actor_accuracy: t.actor_accuracy,
        actor_location_status: t.actor_location_status,
        reason: t.reason,
        flag_type: t.flag_type,
        rent_requests_updated: t.rent_requests_updated,
        rent_request_id: null,
      }));

      const linkEntries: AuditEntry[] = links.map((l) => {
        const m = (l.metadata || {}) as Record<string, unknown>;
        const tenant_id = (m.tenant_id as string | undefined) || null;
        const agent_id = (m.agent_id as string | undefined) || null;
        return {
          id: `l:${l.id}`,
          kind: 'link',
          created_at: l.created_at,
          tenant_id,
          tenant_name: nameOf.get(tenant_id || '') || '—',
          from_agent_id: null,
          from_agent_name: '—',
          to_agent_id: agent_id,
          to_agent_name: nameOf.get(agent_id || '') || '—',
          actor_id: l.user_id,
          actor_name: nameOf.get(l.user_id || '') || '—',
          actor_latitude: (m.actor_latitude as number | undefined) ?? null,
          actor_longitude: (m.actor_longitude as number | undefined) ?? null,
          actor_accuracy: (m.actor_accuracy as number | undefined) ?? null,
          actor_location_status: (m.actor_location_status as string | undefined) ?? null,
          reason: (m.reason as string | undefined) ?? null,
          flag_type: null,
          rent_requests_updated: null,
          rent_request_id: l.record_id,
        };
      });

      return [...transferEntries, ...linkEntries].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
  });

  const filtered = (entries || []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.tenant_name.toLowerCase().includes(q) ||
      e.from_agent_name.toLowerCase().includes(q) ||
      e.to_agent_name.toLowerCase().includes(q) ||
      e.actor_name.toLowerCase().includes(q) ||
      (e.reason || '').toLowerCase().includes(q)
    );
  });

  const captured = (entries || []).filter((e) => e.actor_location_status === 'captured').length;
  const missing = (entries || []).filter(
    (e) => !e.actor_location_status || e.actor_location_status !== 'captured',
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Tenant Assignment Audit Trail
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Geo-stamped record of every executive link &amp; transfer action. Used to
            verify field operations and feed the Trust Coverage Engine.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-card p-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">Total actions</div>
              <div className="text-lg font-bold">{entries?.length ?? 0}</div>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              <div className="text-[10px] uppercase text-emerald-700">Geo captured</div>
              <div className="text-lg font-bold text-emerald-700">{captured}</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
              <div className="text-[10px] uppercase text-amber-700">No geo</div>
              <div className="text-lg font-bold text-amber-700">{missing}</div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tenant, agent, executive, or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No audit entries match this search.
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="space-y-2 pr-2">
            {filtered.map((e) => (
              <Card key={e.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="outline"
                        className={
                          e.kind === 'transfer'
                            ? 'gap-1 text-[10px] bg-orange-500/10 text-orange-700 border-orange-500/30'
                            : 'gap-1 text-[10px] bg-primary/10 text-primary border-primary/30'
                        }
                      >
                        {e.kind === 'transfer' ? (
                          <ArrowRightLeft className="h-3 w-3" />
                        ) : (
                          <Link2 className="h-3 w-3" />
                        )}
                        {e.kind === 'transfer' ? 'Transfer' : 'Link'}
                      </Badge>
                      {statusPill(e.actor_location_status)}
                      {e.flag_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {e.flag_type.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                    <div
                      className="text-[10px] text-muted-foreground shrink-0"
                      title={format(new Date(e.created_at), 'PPpp')}
                    >
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Tenant: </span>
                      <span className="font-medium">{e.tenant_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground">Agent:</span>
                      {e.kind === 'transfer' ? (
                        <>
                          <span className="font-medium">{e.from_agent_name}</span>
                          <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{e.to_agent_name}</span>
                          {e.rent_requests_updated != null && (
                            <Badge variant="outline" className="text-[10px]">
                              {e.rent_requests_updated} request
                              {e.rent_requests_updated === 1 ? '' : 's'}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="font-medium">{e.to_agent_name}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Executed by: </span>
                      <span className="font-medium">{e.actor_name}</span>
                      <span className="text-muted-foreground"> · {format(new Date(e.created_at), 'PP p')}</span>
                    </div>
                    {e.reason && (
                      <div className="text-muted-foreground italic">
                        "{e.reason}"
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-muted/30 p-2 text-[11px] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {e.actor_latitude != null && e.actor_longitude != null ? (
                        <>
                          <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="font-mono truncate">
                            {Number(e.actor_latitude).toFixed(5)},{' '}
                            {Number(e.actor_longitude).toFixed(5)}
                          </span>
                          {e.actor_accuracy != null && (
                            <span className="text-muted-foreground shrink-0">
                              ±{Math.round(Number(e.actor_accuracy))} m
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <MapPinOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">
                            No coordinates recorded
                          </span>
                        </>
                      )}
                    </div>
                    {e.actor_latitude != null && e.actor_longitude != null && (
                      <a
                        href={`https://www.google.com/maps?q=${e.actor_latitude},${e.actor_longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 shrink-0"
                      >
                        Map <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
