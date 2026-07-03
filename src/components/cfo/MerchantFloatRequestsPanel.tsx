import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Landmark, Loader2, Send, X, Phone, FileDown, History } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import {
  generateMerchantFloatAllocationsPdf,
  type MerchantFloatAllocationRow,
  type MerchantFloatAgentBreakdown,
} from '@/lib/merchantFloatAllocationsPdf';

interface FloatRequestRow {
  id: string;
  agent_id: string;
  requested_amount: number;
  reason: string | null;
  status: string;
  created_at: string;
  agent?: { id: string; full_name: string | null; phone: string | null } | null;
}

interface AllocationRow {
  id: string;
  agent_id: string;
  requested_amount: number;
  reason: string | null;
  approved_at: string | null;
  created_at: string;
  approver?: { full_name: string | null } | null;
  agent?: { id: string; full_name: string | null; phone: string | null } | null;
}

/**
 * CFO queue of merchant-agent float requisitions. Fulfilling a request routes
 * funds via the "Agent Float Allocation" category (recipient_type =
 * operational_wallet) so the money lands in the agent's Float bucket.
 */
export function MerchantFloatRequestsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState<FloatRequestRow | null>(null);
  const [mode, setMode] = useState<'fund' | 'reject' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'pending' | 'allocated'>('pending');
  const [downloading, setDownloading] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['cfo-float-requests'],
    queryFn: async (): Promise<FloatRequestRow[]> => {
      const { data, error } = await supabase
        .from('float_requests')
        .select('id, agent_id, requested_amount, reason, status, created_at, agent:profiles!float_requests_agent_id_fkey(id, full_name, phone)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as FloatRequestRow[];
    },
    refetchInterval: 30_000,
  });

  // Approved allocations — the audit trail of what the CFO has sent each merchant.
  const { data: allocations = [], isLoading: allocLoading } = useQuery({
    queryKey: ['cfo-float-allocations'],
    queryFn: async (): Promise<AllocationRow[]> => {
      const { data, error } = await supabase
        .from('float_requests')
        .select('id, agent_id, requested_amount, reason, approved_at, created_at, agent:profiles!float_requests_agent_id_fkey(id, full_name, phone), approver:profiles!float_requests_approved_by_fkey(full_name)')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any as AllocationRow[];
    },
    refetchInterval: 60_000,
  });

  // Per-agent totals for the audit summary.
  const agentTotals = (() => {
    const map = new Map<string, MerchantFloatAgentBreakdown>();
    for (const a of allocations) {
      const key = a.agent_id;
      const name = a.agent?.full_name || 'Merchant agent';
      const cur = map.get(key) || { agent: name, phone: a.agent?.phone || undefined, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(a.requested_amount) || 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((x, y) => y.total - x.total);
  })();

  const grandTotal = allocations.reduce((s, a) => s + (Number(a.requested_amount) || 0), 0);

  const downloadPdf = async () => {
    if (allocations.length === 0) { toast.info('No allocations to export yet.'); return; }
    setDownloading(true);
    try {
      const rows: MerchantFloatAllocationRow[] = allocations.map((a) => ({
        date: a.approved_at || a.created_at,
        agent: a.agent?.full_name || 'Merchant agent',
        phone: a.agent?.phone || undefined,
        amount: Number(a.requested_amount) || 0,
        reason: a.reason || undefined,
        approvedBy: a.approver?.full_name || undefined,
      }));
      const blob = await generateMerchantFloatAllocationsPdf(rows, agentTotals);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `merchant-float-allocations-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error(e.message || 'Could not generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  const openFund = (r: FloatRequestRow) => {
    setActive(r);
    setMode('fund');
    setAmount(String(Number(r.requested_amount)));
    setNote(`Agent Float Allocation — requisition ${r.id.slice(0, 8)}`);
  };
  const openReject = (r: FloatRequestRow) => {
    setActive(r);
    setMode('reject');
    setNote('');
  };
  const close = () => { setActive(null); setMode(null); setAmount(''); setNote(''); };

  const fund = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 1) throw new Error('Enter a valid amount.');
      if (note.trim().length < 10) throw new Error('Reason must be at least 10 characters.');

      const res = await supabase.functions.invoke('cfo-direct-credit', {
        body: {
          target_user_id: active.agent_id,
          amount: amt,
          reason: note.trim(),
          operation: 'credit',
          wallet_category: 'agent_float_deposit',
          platform_category: 'agent_float_deposit',
          financial_impact: 'neutral',
          category_label: 'Agent Float Allocation',
          recipient_type: 'operational_wallet',
          manual_credit: true,
        },
      });
      if (res.error || res.data?.error) {
        throw new Error(await extractEdgeFunctionError(res, 'Could not send float'));
      }

      const { error: updErr } = await supabase
        .from('float_requests')
        .update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() })
        .eq('id', active.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success('Float sent to agent wallet');
      qc.invalidateQueries({ queryKey: ['cfo-float-requests'] });
      qc.invalidateQueries({ queryKey: ['cfo-float-allocations'] });
      close();
    },
    onError: (e: any) => toast.error(e.message || 'Failed to send float'),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!active) return;
      if (note.trim().length < 5) throw new Error('Add a rejection reason.');
      const { error } = await supabase
        .from('float_requests')
        .update({ status: 'rejected', rejection_reason: note.trim(), approved_by: user?.id, approved_at: new Date().toISOString() })
        .eq('id', active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: ['cfo-float-requests'] });
      close();
    },
    onError: (e: any) => toast.error(e.message || 'Failed to reject'),
  });

  return (
    <Card className="rounded-xl border-2 border-sky-500/30 bg-sky-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Landmark className="h-5 w-5 text-sky-600" />
          Merchant Float Requisitions
          {requests.length > 0 && (
            <Badge className="ml-1 bg-sky-600 text-white hover:bg-sky-600">{requests.length}</Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Merchant agents request more operational float here. Fund a request to send it straight to their Float bucket under <span className="font-semibold text-foreground">Agent Float Allocation</span>.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending float requests.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{r.agent?.full_name || 'Merchant agent'}</p>
                  <span className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-400">{formatUGX(Number(r.requested_amount))}</span>
                </div>
                {r.agent?.phone && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" /> {r.agent.phone}</p>
                )}
                {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:text-red-700" onClick={() => openReject(r)}>
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button size="sm" className="gap-1" onClick={() => openFund(r)}>
                  <Send className="h-4 w-4" /> Fund float
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={!!active} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-sky-600" />
              {mode === 'fund' ? 'Fund agent float' : 'Reject float request'}
            </DialogTitle>
          </DialogHeader>
          {active && mode === 'fund' && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs">
                <p className="font-semibold">{active.agent?.full_name || 'Merchant agent'}</p>
                <p className="text-muted-foreground">Requested {formatUGX(Number(active.requested_amount))} · routes to Float (operational_wallet)</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Amount to send (UGX)</label>
                <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Reason (ledger note)</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          {active && mode === 'reject' && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Rejection reason</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Explain why this request is declined" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            {mode === 'fund' ? (
              <Button onClick={() => fund.mutate()} disabled={fund.isPending} className="gap-1.5">
                {fund.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Send float
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending} className="gap-1.5">
                {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default MerchantFloatRequestsPanel;