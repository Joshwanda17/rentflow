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
import { Landmark, Loader2, Send, X, Phone, FileDown, History, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import {
  generateMerchantFloatAllocationsPdf,
  type MerchantFloatAllocationRow,
  type MerchantFloatAgentBreakdown,
  generateMerchantFloatStatementPdf,
  type MerchantFloatStatementEntry,
  type MerchantFloatTransaction,
} from '@/lib/merchantFloatAllocationsPdf';
import { getTelecomSendingCharge } from '@/lib/cashoutCharges';

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
  const [downloadingStmt, setDownloadingStmt] = useState(false);
  const [downloadingAgent, setDownloadingAgent] = useState<string | null>(null);
  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');
  const [allocSort, setAllocSort] = useState<'newest' | 'oldest'>('newest');

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
    const map = new Map<string, MerchantFloatAgentBreakdown & { agent_id: string }>();
    for (const a of allocations) {
      const key = a.agent_id;
      const name = a.agent?.full_name || 'Merchant agent';
      const cur = map.get(key) || { agent_id: key, agent: name, phone: a.agent?.phone || undefined, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(a.requested_amount) || 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((x, y) => y.total - x.total);
  })();

  const grandTotal = allocations.reduce((s, a) => s + (Number(a.requested_amount) || 0), 0);

  // ── KPI matrices for the Allocated tab ──
  const allocCount = allocations.length;
  const avgAllocation = allocCount ? grandTotal / allocCount : 0;
  const largestAllocation = allocations.reduce((m, a) => Math.max(m, Number(a.requested_amount) || 0), 0);
  const last7Total = (() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return allocations.reduce((s, a) => {
      const t = new Date(a.approved_at || a.created_at).getTime();
      return t >= cutoff ? s + (Number(a.requested_amount) || 0) : s;
    }, 0);
  })();

  // Allocation records sorted by date (toggle newest/oldest).
  const sortedAllocations = [...allocations].sort((x, y) => {
    const tx = new Date(x.approved_at || x.created_at).getTime();
    const ty = new Date(y.approved_at || y.created_at).getTime();
    return allocSort === 'newest' ? ty - tx : tx - ty;
  });

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

  // Combined statement: per merchant agent, the float allocated AND the
  // transactions they settled from that float. Fetched on demand at click time
  // so we never load the (potentially large) payout history until asked.
  const downloadStatementPdf = async (onlyAgentId?: string) => {
    if (allocations.length === 0) { toast.info('No allocations to export yet.'); return; }
    if (onlyAgentId) setDownloadingAgent(onlyAgentId); else setDownloadingStmt(true);
    try {
      // Resolve the selected period. Both bounds are optional; when set they
      // clamp both the float allocations AND the transactions in the statement.
      const fromDate = stmtFrom ? new Date(`${stmtFrom}T00:00:00`) : null;
      const toDate = stmtTo ? new Date(`${stmtTo}T23:59:59.999`) : null;
      if (fromDate && toDate && fromDate > toDate) {
        throw new Error('The "from" date must be on or before the "to" date.');
      }
      const fromIso = fromDate ? fromDate.toISOString() : null;
      const toIso = toDate ? toDate.toISOString() : null;

      // Allocations that fall inside the chosen period (and, if a single agent
      // was selected, only that agent's records for a clean per-agent report).
      const periodAllocations = allocations.filter((a) => {
        if (onlyAgentId && a.agent_id !== onlyAgentId) return false;
        const t = new Date(a.approved_at || a.created_at).getTime();
        if (fromDate && t < fromDate.getTime()) return false;
        if (toDate && t > toDate.getTime()) return false;
        return true;
      });
      if (periodAllocations.length === 0) {
        toast.info(onlyAgentId ? 'No float allocations for this agent in the selected period.' : 'No float allocations in the selected period.');
        return;
      }

      const agentIds = Array.from(new Set(periodAllocations.map((a) => a.agent_id)));

      // All completed cash-outs settled by these merchant agents (float spent).
      let wq = supabase
        .from('withdrawal_requests')
        .select('id, amount, payout_method, mobile_money_provider, mobile_money_name, processed_at, processed_by')
        .in('processed_by', agentIds)
        .eq('status', 'completed')
        .not('processed_at', 'is', null);
      if (fromIso) wq = wq.gte('processed_at', fromIso);
      if (toIso) wq = wq.lte('processed_at', toIso);
      const { data: wrs, error: wrErr } = await wq
        .order('processed_at', { ascending: false })
        .limit(5000);
      if (wrErr) throw wrErr;
      const txns = (wrs ?? []) as any[];

      // Commission legs earned on those payouts, keyed by withdrawal id.
      const commByWr = new Map<string, number>();
      const wrIds = txns.map((t) => String(t.id));
      for (let i = 0; i < wrIds.length; i += 400) {
        const chunk = wrIds.slice(i, i + 400);
        const { data: legs } = await supabase
          .from('general_ledger')
          .select('amount, reference_id')
          .eq('ledger_scope', 'wallet')
          .eq('direction', 'cash_in')
          .in('reference_id', chunk.map((id) => `${id}-cashout-commission`));
        for (const l of (legs ?? []) as any[]) {
          const ref = String(l.reference_id || '').replace('-cashout-commission', '');
          commByWr.set(ref, Number(l.amount || 0));
        }
      }

      const txByAgent = new Map<string, MerchantFloatTransaction[]>();
      for (const t of txns) {
        const list = txByAgent.get(t.processed_by) || [];
        list.push({
          date: t.processed_at,
          amount: Number(t.amount) || 0,
          method: t.mobile_money_provider || t.payout_method || 'Wallet',
          recipient: t.mobile_money_name || undefined,
          commission: commByWr.get(String(t.id)) || 0,
          telecomCharge: getTelecomSendingCharge(Number(t.amount) || 0),
          reference: String(t.id),
        });
        txByAgent.set(t.processed_by, list);
      }

      const allocByAgent = new Map<string, MerchantFloatAllocationRow[]>();
      const nameByAgent = new Map<string, { name: string; phone?: string }>();
      for (const a of periodAllocations) {
        const list = allocByAgent.get(a.agent_id) || [];
        list.push({
          date: a.approved_at || a.created_at,
          agent: a.agent?.full_name || 'Merchant agent',
          phone: a.agent?.phone || undefined,
          amount: Number(a.requested_amount) || 0,
          reason: a.reason || undefined,
          approvedBy: a.approver?.full_name || undefined,
        });
        allocByAgent.set(a.agent_id, list);
        if (!nameByAgent.has(a.agent_id)) {
          nameByAgent.set(a.agent_id, { name: a.agent?.full_name || 'Merchant agent', phone: a.agent?.phone || undefined });
        }
      }

      const entries: MerchantFloatStatementEntry[] = agentIds
        .map((id) => ({
          agent: nameByAgent.get(id)?.name || 'Merchant agent',
          phone: nameByAgent.get(id)?.phone,
          allocations: allocByAgent.get(id) || [],
          transactions: txByAgent.get(id) || [],
        }))
        .sort((x, y) =>
          y.allocations.reduce((s, r) => s + r.amount, 0) - x.allocations.reduce((s, r) => s + r.amount, 0));

      const dateRange = fromDate && toDate ? { startDate: fromDate, endDate: toDate } : undefined;
      const blob = await generateMerchantFloatStatementPdf(entries, new Date(), dateRange);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const agentSlug = onlyAgentId
        ? '-' + (nameByAgent.get(onlyAgentId)?.name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
        : '';
      link.download = `merchant-float-statement${agentSlug}${stmtFrom ? `-${stmtFrom}` : ''}${stmtTo ? `-to-${stmtTo}` : ''}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success('Statement PDF downloaded');
    } catch (e: any) {
      toast.error(e.message || 'Could not generate statement PDF');
    } finally {
      setDownloadingStmt(false);
      setDownloadingAgent(null);
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

  // Float snapshot for the agent being funded — shows how much float they still
  // hold and how the previously allocated float was spent, BEFORE we issue more.
  const { data: floatStatus, isLoading: floatStatusLoading } = useQuery({
    queryKey: ['cfo-agent-float-status', active?.agent_id],
    enabled: !!active && mode === 'fund',
    queryFn: async () => {
      const agentId = active!.agent_id;
      const [walletRes, allocRes, usedRes] = await Promise.all([
        supabase.from('wallets').select('float_balance').eq('user_id', agentId).maybeSingle(),
        supabase.from('float_requests').select('requested_amount').eq('agent_id', agentId).eq('status', 'approved'),
        supabase
          .from('withdrawal_requests')
          .select('id, amount, payout_method, mobile_money_provider, mobile_money_name, processed_at')
          .eq('processed_by', agentId)
          .eq('status', 'completed')
          .not('processed_at', 'is', null)
          .order('processed_at', { ascending: false })
          .limit(200),
      ]);
      const floatBalance = Number(walletRes.data?.float_balance) || 0;
      const totalAllocated = (allocRes.data ?? []).reduce((s: number, a: any) => s + (Number(a.requested_amount) || 0), 0);
      const used = (usedRes.data ?? []) as any[];
      const totalUsed = used.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return {
        floatBalance,
        totalAllocated,
        totalUsed,
        usedCount: used.length,
        recent: used.slice(0, 6).map((t) => ({
          id: String(t.id),
          amount: Number(t.amount) || 0,
          method: t.mobile_money_provider || t.payout_method || 'Wallet',
          recipient: t.mobile_money_name || null,
          at: t.processed_at as string,
        })),
      };
    },
  });

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
        {/* Tabs: pending queue vs allocated audit trail */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setTab('pending')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${tab === 'pending' ? 'bg-sky-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Pending {requests.length > 0 && `(${requests.length})`}
            </button>
            <button
              type="button"
              onClick={() => setTab('allocated')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${tab === 'allocated' ? 'bg-sky-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <History className="h-3.5 w-3.5" /> Allocated
            </button>
          </div>
          {tab === 'allocated' && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="Statement from date"
                  value={stmtFrom}
                  max={stmtTo || undefined}
                  onChange={(e) => setStmtFrom(e.target.value)}
                  className="h-8 w-[9.5rem] text-xs"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <Input
                  type="date"
                  aria-label="Statement to date"
                  value={stmtTo}
                  min={stmtFrom || undefined}
                  onChange={(e) => setStmtTo(e.target.value)}
                  className="h-8 w-[9.5rem] text-xs"
                />
                {(stmtFrom || stmtTo) && (
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setStmtFrom(''); setStmtTo(''); }}>
                    Clear
                  </Button>
                )}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadPdf} disabled={downloading || allocations.length === 0}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Allocations PDF
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => downloadStatementPdf()} disabled={downloadingStmt || allocations.length === 0}>
                {downloadingStmt ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} All agents PDF
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {tab === 'pending' ? (
          isLoading ? (
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
          )
        ) : (
          <>
            {/* KPI matrices */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total float allocated</p>
                <p className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-400">{formatUGX(grandTotal)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allocations</p>
                <p className="text-lg font-bold tabular-nums">{allocCount}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Merchant agents</p>
                <p className="text-lg font-bold tabular-nums">{agentTotals.length}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Avg / allocation</p>
                <p className="text-lg font-bold tabular-nums">{formatUGX(avgAllocation)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Largest allocation</p>
                <p className="text-lg font-bold tabular-nums">{formatUGX(largestAllocation)}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Last 7 days</p>
                <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatUGX(last7Total)}</p>
              </div>
            </div>

            {allocLoading ? (
              <p className="text-sm text-muted-foreground">Loading allocations…</p>
            ) : allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No float has been allocated yet.</p>
            ) : (
              <>
                <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Allocated per merchant agent</p>
                <p className="-mt-1 text-[10px] text-muted-foreground">Select an agent to download their own float + transactions statement{(stmtFrom || stmtTo) ? ' for the chosen dates' : ''}.</p>
                {agentTotals.map((b) => (
                  <div key={b.agent_id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{b.agent}</p>
                      {b.phone && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" /> {b.phone}</p>}
                      <p className="text-[10px] text-muted-foreground">{b.count} allocation{b.count === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-base font-bold tabular-nums text-sky-700 dark:text-sky-400">{formatUGX(b.total)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={() => downloadStatementPdf(b.agent_id)}
                        disabled={downloadingAgent === b.agent_id}
                      >
                        {downloadingAgent === b.agent_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                        <span className="hidden sm:inline">Download</span>
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-2 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Allocation records</p>
                  <button
                    type="button"
                    onClick={() => setAllocSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    <ArrowUpDown className="h-3 w-3" />
                    {allocSort === 'newest' ? 'Newest first' : 'Oldest first'}
                  </button>
                </div>
                {sortedAllocations.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border/50 bg-card/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{a.agent?.full_name || 'Merchant agent'}</p>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-sky-700 dark:text-sky-400">{formatUGX(Number(a.requested_amount))}</span>
                    </div>
                    {a.reason && <p className="truncate text-xs text-muted-foreground">{a.reason}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(a.approved_at || a.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {a.approver?.full_name ? ` · by ${a.approver.full_name}` : ''}
                    </p>
                  </div>
                ))}
              </>
            )}
          </>
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