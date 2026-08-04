import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface OpsTransferRow {
  id: string;
  rent_request_id: string;
  parent_name: string | null;
  tenant_name: string | null;
  from_name: string | null;
  to_name: string | null;
  reason: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decision_reason: string | null;
}

export default function SubAgentTenantTransfersQueue() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data = [], isLoading } = useQuery<OpsTransferRow[]>({
    queryKey: ['ops-subagent-transfers', status],
    queryFn: async () => {
      const { data, error } = await db.rpc('ops_list_subagent_tenant_transfers', {
        p_status: status,
        p_limit: 100,
      });
      if (error) throw error;
      return (data as OpsTransferRow[]) ?? [];
    },
    staleTime: 30_000,
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; approve: boolean; reason: string }) => {
      const { error } = await db.rpc('ops_decide_subagent_tenant_transfer', {
        p_transfer_id: vars.id,
        p_approve: vars.approve,
        p_reason: vars.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Decision recorded');
      qc.invalidateQueries({ queryKey: ['ops-subagent-transfers'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Decision failed'),
  });

  const submit = (row: OpsTransferRow, approve: boolean) => {
    const reason = (notes[row.id] ?? '').trim();
    if (reason.length < 10) {
      toast.error('Give a decision reason of at least 10 characters');
      return;
    }
    decide.mutate({ id: row.id, approve, reason });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sub-Agent Tenant Transfers</CardTitle>
        <Tabs value={status} onValueChange={setStatus} className="pt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
        ) : data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No {status} transfers.</p>
        ) : (
          data.map((row) => (
            <div key={row.id} className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{row.tenant_name ?? 'Tenant'}</span>
                <Badge variant="outline" className="text-[10px] capitalize">{row.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {row.from_name ?? '—'} → {row.to_name ?? '—'} · requested by {row.parent_name ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">Reason: {row.reason}</p>
              {row.status === 'pending' ? (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Decision reason (min 10 characters)"
                    value={notes[row.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button size="sm" className="flex-1" disabled={decide.isPending} onClick={() => submit(row, true)}>
                      Approve transfer
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1" disabled={decide.isPending} onClick={() => submit(row, false)}>
                      Reject
                    </Button>
                  </div>
                </div>
              ) : row.decision_reason ? (
                <p className="text-xs text-muted-foreground">Ops note: {row.decision_reason}</p>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}