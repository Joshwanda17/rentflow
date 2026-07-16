import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Lock, MapPin, RefreshCw, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

interface LockedRow {
  rent_request_id: string;
  tenant_id: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_district: string | null;
  tenant_village: string | null;
  tenant_territory: string | null;
  agent_id: string;
  agent_name: string | null;
  collection_locked_at: string;
  collection_locked_reason: string | null;
}

interface CandidateAgent {
  id: string;
  full_name: string | null;
  phone: string | null;
  district: string | null;
  village: string | null;
  territory: string | null;
}

export function LockedTenantTransferPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<LockedRow | null>(null);
  const [targetId, setTargetId] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const { data: locked = [], isLoading, refetch } = useQuery({
    queryKey: ['locked-tenants-for-transfer'],
    queryFn: async (): Promise<LockedRow[]> => {
      const { data: rrs, error } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, agent_id, assigned_agent_id, collection_locked_at, collection_locked_reason')
        .not('collection_locked_at', 'is', null)
        .in('status', ['pending', 'approved', 'funded', 'active'])
        .order('collection_locked_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = rrs || [];
      const userIds = Array.from(new Set(rows.flatMap(r => [r.tenant_id, r.agent_id ?? r.assigned_agent_id]).filter(Boolean))) as string[];
      if (userIds.length === 0) return [];
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, phone, district, village, territory')
        .in('id', userIds);
      const pmap: Record<string, any> = {};
      (profs || []).forEach(p => { pmap[p.id] = p; });
      return rows.map(r => {
        const agentId = (r.agent_id ?? r.assigned_agent_id) as string;
        const t = pmap[r.tenant_id] || {};
        const a = pmap[agentId] || {};
        return {
          rent_request_id: r.id,
          tenant_id: r.tenant_id,
          tenant_name: t.full_name ?? null,
          tenant_phone: t.phone ?? null,
          tenant_district: t.district ?? null,
          tenant_village: t.village ?? null,
          tenant_territory: t.territory ?? null,
          agent_id: agentId,
          agent_name: a.full_name ?? null,
          collection_locked_at: r.collection_locked_at as string,
          collection_locked_reason: r.collection_locked_reason,
        } satisfies LockedRow;
      }).filter(r => r.agent_id);
    },
    staleTime: 60_000,
  });

  // Load agents in the same area as the selected tenant
  const { data: candidates = [], isLoading: candLoading } = useQuery({
    queryKey: ['locked-transfer-candidates', selected?.tenant_id, selected?.tenant_district, selected?.tenant_village, selected?.tenant_territory],
    enabled: !!selected,
    queryFn: async (): Promise<CandidateAgent[]> => {
      if (!selected) return [];
      // 1. Find agent user_ids
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');
      const agentIds = (roleRows || []).map((r: any) => r.user_id).filter((id: string) => id && id !== selected.agent_id);
      if (agentIds.length === 0) return [];

      // 2. Fetch profiles in batches, filtering by area
      const filters: string[] = [];
      if (selected.tenant_district) filters.push(`district.ilike.${selected.tenant_district}`);
      if (selected.tenant_village) filters.push(`village.ilike.${selected.tenant_village}`);
      if (selected.tenant_territory) filters.push(`territory.ilike.${selected.tenant_territory}`);

      const BATCH = 200;
      const results: CandidateAgent[] = [];
      for (let i = 0; i < agentIds.length; i += BATCH) {
        let q = supabase
          .from('profiles')
          .select('id, full_name, phone, district, village, territory')
          .in('id', agentIds.slice(i, i + BATCH));
        if (filters.length > 0) q = q.or(filters.join(','));
        const { data } = await q;
        (data || []).forEach(p => results.push(p as CandidateAgent));
      }
      // Prioritise village > district > territory match
      const score = (a: CandidateAgent) => {
        let s = 0;
        if (selected.tenant_village && a.village && a.village.toLowerCase() === selected.tenant_village.toLowerCase()) s += 4;
        if (selected.tenant_district && a.district && a.district.toLowerCase() === selected.tenant_district.toLowerCase()) s += 2;
        if (selected.tenant_territory && a.territory && a.territory.toLowerCase() === selected.tenant_territory.toLowerCase()) s += 1;
        return s;
      };
      return results.sort((a, b) => score(b) - score(a));
    },
    staleTime: 60_000,
  });

  const areaLabel = useMemo(() => {
    if (!selected) return '';
    return [selected.tenant_village, selected.tenant_district, selected.tenant_territory].filter(Boolean).join(' · ') || 'Unknown area';
  }, [selected]);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !targetId) throw new Error('Pick a target agent');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      const { data, error } = await invokeEdgeFunction('transfer-tenant', {
        body: {
          tenant_id: selected.tenant_id,
          from_agent_id: selected.agent_id,
          to_agent_id: targetId,
          reason,
          flag_type: 'collection_lock',
        },
        errorTitle: 'Transfer failed',
      });
      if (error) throw error;

      // Clear the collection lock on this rent_request so the new agent can collect
      const { error: unlockErr } = await supabase
        .from('rent_requests')
        .update({
          collection_locked_at: null,
          collection_locked_reason: null,
          collection_lock_days: null,
        })
        .eq('id', selected.rent_request_id);
      if (unlockErr) throw unlockErr;

      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Tenant transferred. ${data?.rent_requests_updated ?? 0} request(s) reassigned.`);
      setSelected(null);
      setTargetId('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['locked-tenants-for-transfer'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-destructive" />
          <h3 className="text-sm font-semibold">Locked Tenants — Area Transfer</h3>
          {locked.length > 0 && (
            <Badge variant="destructive" className="text-xs">{locked.length}</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tenants whose agent hasn't collected for 5+ days are locked. Transfer them to an active agent in the same area.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : locked.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No locked tenants right now.
        </div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto">
          {locked.map(row => (
            <button
              key={row.rent_request_id}
              onClick={() => { setSelected(row); setTargetId(''); setReason(`Reassign to an active agent in ${row.tenant_district || row.tenant_village || 'the same area'} — previous agent locked out after 5 days without collection.`); }}
              className="w-full text-left p-3 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{row.tenant_name || 'Unnamed tenant'}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.tenant_phone || '—'}</p>
                </div>
                <Badge variant="destructive" className="text-[10px] shrink-0">
                  <Lock className="h-3 w-3 mr-1" />
                  Locked {formatDistanceToNow(new Date(row.collection_locked_at), { addSuffix: true })}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>Agent: <span className="font-medium text-foreground">{row.agent_name || row.agent_id.slice(0, 8)}</span></span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[row.tenant_village, row.tenant_district].filter(Boolean).join(', ') || 'No area set'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Locked Tenant
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm font-medium">{selected.tenant_name || 'Unnamed'}</p>
                <p className="text-xs text-muted-foreground">{selected.tenant_phone || '—'}</p>
                <p className="text-xs mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {areaLabel}
                </p>
                <p className="text-xs mt-1">
                  Current agent: <span className="font-medium">{selected.agent_name || selected.agent_id.slice(0, 8)}</span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Pick agent in the same area</label>
                {candLoading ? (
                  <div className="h-24 bg-muted animate-pulse rounded-lg" />
                ) : candidates.length === 0 ? (
                  <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-3">
                    No agents found in this area. Use the general Transfers panel to pick manually.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {candidates.slice(0, 20).map(a => {
                      const active = targetId === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setTargetId(a.id)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${active ? 'bg-primary/10' : 'hover:bg-accent'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{a.full_name || 'Unnamed'}</span>
                            <span className="text-xs text-muted-foreground">{a.phone || ''}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[a.village, a.district, a.territory].filter(Boolean).join(' · ') || 'Area not set'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reason (min 10 chars)</label>
                <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={!targetId || reason.trim().length < 10 || transferMutation.isPending}
            >
              {transferMutation.isPending ? 'Transferring…' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}