import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Lock, MapPin, RefreshCw, ArrowRightLeft, AlertTriangle, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { DrilldownTable, type DrilldownColumn } from '@/components/executive/DrilldownTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

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
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);

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

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return locked;
    return locked.filter(r =>
      [r.tenant_name, r.tenant_phone, r.agent_name, r.tenant_district, r.tenant_village, r.tenant_territory]
        .some(v => v && v.toLowerCase().includes(q))
    );
  }, [locked, debouncedSearch]);

  const columns: DrilldownColumn<LockedRow>[] = [
    {
      key: 'tenant_name',
      label: 'Tenant',
      render: r => (
        <div className="min-w-0">
          <p className="font-medium truncate">{r.tenant_name || 'Unnamed tenant'}</p>
          <p className="text-[11px] text-muted-foreground truncate">{r.tenant_phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'agent_name',
      label: 'Current agent',
      render: r => <span className="truncate">{r.agent_name || r.agent_id.slice(0, 8)}</span>,
    },
    {
      key: 'area',
      label: 'Area',
      sortValue: r => [r.tenant_district, r.tenant_village].filter(Boolean).join(', '),
      render: r => (
        <span className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {[r.tenant_village, r.tenant_district].filter(Boolean).join(', ') || 'No area set'}
        </span>
      ),
    },
    {
      key: 'collection_locked_at',
      label: 'Locked',
      align: 'right',
      sortValue: r => new Date(r.collection_locked_at).getTime(),
      render: r => (
        <Badge variant="destructive" className="text-[10px]">
          <Lock className="h-3 w-3 mr-1" />
          {formatDistanceToNow(new Date(r.collection_locked_at), { addSuffix: true })}
        </Badge>
      ),
    },
  ];

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by tenant, phone, agent, or area…"
          className="pl-9 pr-9 h-10"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

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
        <DrilldownTable
          columns={columns}
          data={filtered}
          pageSize={15}
          rowKey={r => r.rent_request_id}
          emptyMessage={debouncedSearch ? 'No matches for your search.' : 'No locked tenants.'}
          onRowClick={row => {
            setSelected(row);
            setTargetId('');
            setReason(`Reassign to an active agent in ${row.tenant_district || row.tenant_village || 'the same area'} — previous agent locked out after 5 days without collection.`);
          }}
        />
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