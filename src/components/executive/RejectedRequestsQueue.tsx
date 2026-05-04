import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, RotateCcw, ShieldCheck, XCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type RejectedStage =
  | 'pending'
  | 'agent_ops_approved'
  | 'tenant_ops_approved'
  | 'agent_verified'
  | 'landlord_ops_approved'
  | 'coo_approved';

const STAGE_LABEL: Record<string, string> = {
  pending: 'Agent Ops',
  agent_ops_approved: 'Tenant Ops',
  tenant_ops_approved: 'Landlord Ops',
  agent_verified: 'Landlord Ops (legacy)',
  landlord_ops_approved: 'COO',
  coo_approved: 'CFO',
};

const STAGE_NEXT: Record<string, string> = {
  pending: 'tenant_ops_approved',
  tenant_ops_approved: 'agent_verified',
  agent_verified: 'landlord_ops_approved',
  landlord_ops_approved: 'coo_approved',
  coo_approved: 'funded',
};

interface RejectedRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  landlord_id: string | null;
  rent_amount: number;
  status: string;
  rejected_reason: string | null;
  rejected_at: string | null;
  rejected_at_stage: string | null;
  reopen_count: number;
  reopened_at: string | null;
  reopen_reason: string | null;
  created_at: string;
  tenant_name?: string;
  tenant_phone?: string;
}

interface Props {
  /** When provided, only rows whose rejected_at_stage matches are shown. */
  stageFilter?: RejectedStage | RejectedStage[];
  /** Card title — defaults to "Rejected Rent Requests". */
  title?: string;
}

export function RejectedRequestsQueue({ stageFilter, title = 'Rejected Rent Requests' }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [active, setActive] = useState<RejectedRow | null>(null);
  const [mode, setMode] = useState<'reopen' | 'force'>('reopen');
  const [reason, setReason] = useState('');
  const [payoutRef, setPayoutRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Capability check — manager/CFO can force-approve
  const { data: caps } = useQuery({
    queryKey: ['rejected-queue-caps', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      const roles = new Set((data ?? []).map((r) => r.role));
      return {
        canForce: roles.has('manager') || roles.has('cfo'),
        isManager: roles.has('manager'),
      };
    },
  });

  const stages: RejectedStage[] | null = stageFilter
    ? Array.isArray(stageFilter) ? stageFilter : [stageFilter]
    : null;

  const { data: rows, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['rejected-rent-requests', stages?.join(',') ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('rent_requests')
        .select('id, tenant_id, agent_id, landlord_id, rent_amount, status, rejected_reason, rejected_at, rejected_at_stage, reopen_count, reopened_at, reopen_reason, created_at')
        .eq('status', 'rejected')
        .order('rejected_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (stages && stages.length > 0) q = q.in('rejected_at_stage', stages);
      const { data, error } = await q;
      if (error) throw error;
      const tenantIds = [...new Set((data ?? []).map((r) => r.tenant_id).filter(Boolean))];
      const profiles = tenantIds.length
        ? (await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds)).data ?? []
        : [];
      const pmap = new Map(profiles.map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({
        ...r,
        tenant_name: pmap.get(r.tenant_id)?.full_name ?? 'Unknown',
        tenant_phone: pmap.get(r.tenant_id)?.phone ?? '',
      })) as RejectedRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.tenant_name ?? '').toLowerCase().includes(s) ||
        (r.tenant_phone ?? '').toLowerCase().includes(s) ||
        (r.rejected_reason ?? '').toLowerCase().includes(s),
    );
  }, [rows, search]);

  const openDialog = (row: RejectedRow, m: 'reopen' | 'force') => {
    setActive(row);
    setMode(m);
    setReason('');
    setPayoutRef('');
  };

  const submit = async () => {
    if (!active || !user) return;
    if (reason.trim().length < 10) {
      toast({ title: 'Reason must be at least 10 characters', variant: 'destructive' });
      return;
    }
    const stage = active.rejected_at_stage ?? 'pending';
    if (mode === 'force' && STAGE_NEXT[stage] === 'funded' && !payoutRef.trim()) {
      toast({ title: 'Transaction reference (TID) is required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'reopen') {
        const { error } = await supabase.rpc('reopen_rent_request', {
          p_request_id: active.id,
          p_reason: reason.trim(),
        });
        if (error) throw error;
        toast({ title: '🔁 Reopened', description: `Returned to ${STAGE_LABEL[stage] ?? stage}` });
      } else {
        const { error } = await supabase.rpc('force_approve_rejected_rent_request', {
          p_request_id: active.id,
          p_reason: reason.trim(),
          p_payout_ref: payoutRef.trim() || null,
        });
        if (error) throw error;
        toast({ title: '⚡ Force-approved', description: `Advanced past ${STAGE_LABEL[stage] ?? stage}` });
      }
      setActive(null);
      qc.invalidateQueries({ queryKey: ['rejected-rent-requests'] });
      qc.invalidateQueries({ queryKey: ['rent-pipeline'] });
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-destructive" />
            {title}
            <Badge variant="outline" className="ml-1">{rows?.length ?? 0}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Reopen sends the request back to the stage that rejected it.
            {caps?.canForce && ' Force-approve advances it directly to the next stage.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tenant, phone, or rejection reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No rejected requests in this scope.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Tenant</th>
                  <th className="py-2 pr-3 text-right">Rent (UGX)</th>
                  <th className="py-2 pr-3">Rejected at</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Reopens</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const stage = r.rejected_at_stage ?? 'pending';
                  const locked = (r.reopen_count ?? 0) >= 3 && !caps?.isManager;
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.tenant_name}</div>
                        <div className="text-xs text-muted-foreground">{r.tenant_phone || r.id.slice(0, 8)}</div>
                      </td>
                      <td className="py-2 pr-3 text-right">{Number(r.rent_amount || 0).toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                          {STAGE_LABEL[stage] ?? stage}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 max-w-xs">
                        <div className="text-xs line-clamp-2" title={r.rejected_reason ?? ''}>
                          {r.rejected_reason ?? '—'}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.reopen_count ?? 0}
                        {locked && <span className="ml-1 text-destructive">(locked)</span>}
                      </td>
                      <td className="py-2 pr-3 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDialog(r, 'reopen')}
                          disabled={locked}
                          title={locked ? 'Reopen limit reached — manager only' : 'Send back to rejecting stage'}
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen
                        </Button>
                        {caps?.canForce && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openDialog(r, 'force')}
                            title="Skip the chain and advance to next stage"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Force-approve
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'reopen' ? 'Reopen rent request' : 'Force-approve rejected request'}
            </DialogTitle>
            <DialogDescription>
              {active && mode === 'reopen' && (
                <>Returns to <strong>{STAGE_LABEL[active.rejected_at_stage ?? 'pending']}</strong> for fresh review.</>
              )}
              {active && mode === 'force' && (
                <>Advances directly to <strong>{STAGE_LABEL[STAGE_NEXT[active.rejected_at_stage ?? 'pending']] ?? STAGE_NEXT[active.rejected_at_stage ?? 'pending']}</strong>, skipping re-review.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-muted p-3 space-y-1">
                <div><span className="text-muted-foreground">Tenant:</span> {active.tenant_name}</div>
                <div><span className="text-muted-foreground">Rent:</span> UGX {Number(active.rent_amount || 0).toLocaleString()}</div>
                <div className="line-clamp-3"><span className="text-muted-foreground">Original reason:</span> {active.rejected_reason ?? '—'}</div>
              </div>
              <div>
                <label className="text-xs font-medium">
                  {mode === 'reopen' ? 'Reopen reason' : 'Override justification'} (min 10 characters)
                </label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
              {mode === 'force' && STAGE_NEXT[active.rejected_at_stage ?? 'pending'] === 'funded' && (
                <div>
                  <label className="text-xs font-medium">Transaction Reference (TID)</label>
                  <Input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="MoMo / bank reference" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default RejectedRequestsQueue;