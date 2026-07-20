import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { ACTIVE_RENT_STATUSES } from '@/hooks/useAgentCapacityMap';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowUp, ArrowDown, ArrowUpDown, Loader2, Scale, AlertCircle, Plus, Download, ArrowLeft, ChevronRight, Search, X } from 'lucide-react';

type ActiveRent = {
  id: string;
  tenant_id: string | null;
  agent_id: string | null;
  daily_repayment: number | null;
  total_repayment: number | null;
  amount_repaid: number | null;
  status: string | null;
};

type BucketCollection = {
  id: string;
  amount: number;
  created_at: string;
  agent_id: string | null;
  tenant_id: string | null;
  payment_method: string | null;
  rent_request_id: string | null;
};

async function fetchActiveRents(agentId?: string | null): Promise<ActiveRent[]> {
  const all: ActiveRent[] = [];
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase
      .from('rent_requests')
      .select('id, tenant_id, agent_id, daily_repayment, total_repayment, amount_repaid, status')
      .in('status', ACTIVE_RENT_STATUSES)
      .not('agent_id', 'is', null)
      .gt('daily_repayment', 0)
      .range(from, from + PAGE - 1);
    if (agentId) q = q.eq('agent_id', agentId);
    const { data, error } = await q;
    if (error) { console.error('[Reconcile] rents page failed', error); break; }
    const rows = (data || []) as ActiveRent[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchBucketCollections(opts: { start: Date; end: Date; agentId?: string | null }): Promise<BucketCollection[]> {
  const all: BucketCollection[] = [];
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase
      .from('agent_collections')
      .select('id, amount, created_at, agent_id, tenant_id, payment_method, rent_request_id')
      .gte('created_at', opts.start.toISOString())
      .lt('created_at', opts.end.toISOString())
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (opts.agentId) q = q.eq('agent_id', opts.agentId);
    const { data, error } = await q;
    if (error) { console.error('[Reconcile] collections page failed', error); break; }
    const rows = (data || []) as BucketCollection[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const BATCH = 100;
  for (let i = 0; i < unique.length; i += BATCH) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', unique.slice(i, i + BATCH));
    (data || []).forEach((p: { id: string; full_name?: string | null; phone?: string | null }) => {
      map.set(p.id, p.full_name || p.phone || p.id.slice(0, 8));
    });
  }
  return map;
}

type MissingRow = {
  rent_id: string;
  tenant_id: string | null;
  agent_id: string | null;
  daily: number;
  collected: number;
  variance: number;
  remaining_before: number;
};

type ExtraRow = {
  collection_id: string;
  when_ms: number;
  amount: number;
  extra_amount: number;
  agent_id: string | null;
  tenant_id: string | null;
  rent_request_id: string | null;
  method: string | null;
  reason: 'no_plan_link' | 'inactive_plan' | 'over_daily' | 'over_remaining';
  reason_label: string;
};

type MSort = 'variance' | 'daily' | 'collected' | 'tenant' | 'agent' | 'remaining';
type ESort = 'when' | 'amount' | 'extra' | 'tenant' | 'agent' | 'reason';

const REASON_LABELS: Record<ExtraRow['reason'], string> = {
  no_plan_link: 'Not linked to any rent plan',
  inactive_plan: 'Linked plan is closed / inactive',
  over_daily: 'Exceeds plan daily repayment',
  over_remaining: 'Exceeds plan remaining balance',
};

const fmtWhen = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

export function BucketReconciliationPanel({
  open,
  onOpenChange,
  start,
  end,
  agentId,
  agentName,
  bucketLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  start: Date;
  end: Date;
  agentId?: string | null;
  agentName?: string | null;
  bucketLabel?: string | null;
}) {
  const rangeKey = `${start.toISOString()}:${end.toISOString()}:${agentId || 'all'}`;

  const { data: rents = [], isLoading: rLoading } = useQuery({
    queryKey: ['recon-rents', agentId || 'all'],
    queryFn: () => fetchActiveRents(agentId),
    enabled: open,
    staleTime: 30_000,
  });
  const { data: collections = [], isLoading: cLoading } = useQuery({
    queryKey: ['recon-collections', rangeKey],
    queryFn: () => fetchBucketCollections({ start, end, agentId }),
    enabled: open,
    staleTime: 30_000,
  });

  const rentById = useMemo(() => {
    const m = new Map<string, ActiveRent>();
    for (const r of rents) m.set(r.id, r);
    return m;
  }, [rents]);

  // Bucket duration in days (min 1/24 for hour buckets, 1 for day buckets).
  const bucketDays = useMemo(() => {
    const ms = end.getTime() - start.getTime();
    return Math.max(1 / 48, ms / 86_400_000);
  }, [start, end]);

  // Sum collections per plan (for planned matches).
  const collectedByPlan = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collections) {
      if (!c.rent_request_id) continue;
      m.set(c.rent_request_id, (m.get(c.rent_request_id) || 0) + (Number(c.amount) || 0));
    }
    return m;
  }, [collections]);

  const nameIds = useMemo(() => {
    const s = new Set<string>();
    rents.forEach((r) => { if (r.tenant_id) s.add(r.tenant_id); if (r.agent_id) s.add(r.agent_id); });
    collections.forEach((c) => { if (c.tenant_id) s.add(c.tenant_id); if (c.agent_id) s.add(c.agent_id); });
    return Array.from(s);
  }, [rents, collections]);
  const { data: names } = useQuery({
    queryKey: ['recon-names', rangeKey, nameIds.length],
    queryFn: () => fetchNames(nameIds),
    enabled: open && nameIds.length > 0,
    staleTime: 5 * 60_000,
  });
  const nameById = names || new Map<string, string>();

  // MISSING rows: active rents where collected in bucket < expected for bucket.
  const missingAll = useMemo<MissingRow[]>(() => {
    const out: MissingRow[] = [];
    for (const r of rents) {
      const daily = Number(r.daily_repayment) || 0;
      if (daily <= 0) continue;
      const totalDue = Number(r.total_repayment) || 0;
      const paidBefore = Number(r.amount_repaid) || 0;
      const remaining = Math.max(0, totalDue - paidBefore);
      if (remaining <= 0) continue;
      const expected = Math.min(remaining, daily * bucketDays);
      const collected = collectedByPlan.get(r.id) || 0;
      if (collected + 1 >= expected) continue; // fully covered (1 UGX rounding buffer)
      out.push({
        rent_id: r.id,
        tenant_id: r.tenant_id,
        agent_id: r.agent_id,
        daily: expected,
        collected,
        variance: expected - collected,
        remaining_before: remaining,
      });
    }
    return out;
  }, [rents, collectedByPlan, bucketDays]);

  // EXTRA rows: collections that don't map cleanly to an expected daily obligation.
  const extraAll = useMemo<ExtraRow[]>(() => {
    const out: ExtraRow[] = [];
    // Track cumulative collected per plan across the bucket (chronological).
    const cumByPlan = new Map<string, number>();
    // Iterate oldest first so cumulative math is right.
    const chrono = [...collections].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const c of chrono) {
      const amt = Number(c.amount) || 0;
      const whenMs = new Date(c.created_at).getTime();
      const base = {
        collection_id: c.id,
        when_ms: whenMs,
        amount: amt,
        agent_id: c.agent_id,
        tenant_id: c.tenant_id,
        rent_request_id: c.rent_request_id,
        method: c.payment_method,
      };
      if (!c.rent_request_id) {
        out.push({ ...base, extra_amount: amt, reason: 'no_plan_link', reason_label: REASON_LABELS.no_plan_link });
        continue;
      }
      const plan = rentById.get(c.rent_request_id);
      if (!plan) {
        out.push({ ...base, extra_amount: amt, reason: 'inactive_plan', reason_label: REASON_LABELS.inactive_plan });
        continue;
      }
      const daily = Number(plan.daily_repayment) || 0;
      const remaining = Math.max(0, (Number(plan.total_repayment) || 0) - (Number(plan.amount_repaid) || 0));
      const expected = Math.min(remaining, daily * bucketDays);
      const already = cumByPlan.get(c.rent_request_id) || 0;
      const overDaily = Math.max(0, (already + amt) - expected);
      const overRemaining = Math.max(0, (already + amt) - remaining);
      cumByPlan.set(c.rent_request_id, already + amt);
      if (overRemaining > 0) {
        out.push({ ...base, extra_amount: overRemaining, reason: 'over_remaining', reason_label: REASON_LABELS.over_remaining });
      } else if (overDaily > 0) {
        out.push({ ...base, extra_amount: overDaily, reason: 'over_daily', reason_label: REASON_LABELS.over_daily });
      }
    }
    return out;
  }, [collections, rentById, bucketDays]);

  const totalExpected = useMemo(() => {
    let sum = 0;
    for (const r of rents) {
      const daily = Number(r.daily_repayment) || 0;
      if (daily <= 0) continue;
      const remaining = Math.max(0, (Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0));
      if (remaining <= 0) continue;
      sum += Math.min(remaining, daily * bucketDays);
    }
    return sum;
  }, [rents, bucketDays]);
  const totalCollected = useMemo(() => collections.reduce((s, c) => s + (Number(c.amount) || 0), 0), [collections]);
  const missingTotal = missingAll.reduce((s, r) => s + r.variance, 0);
  const extraTotal = extraAll.reduce((s, r) => s + r.extra_amount, 0);
  const rate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  // Sort state.
  const [tab, setTab] = useState<'missing' | 'extra'>('missing');
  const [selection, setSelection] = useState<{ kind: 'missing'; rentId: string } | { kind: 'extra'; collectionId: string } | null>(null);

  // Close selection when switching tabs / bucket.
  const switchTab = (t: 'missing' | 'extra') => { setTab(t); setSelection(null); };

  // Chronological collections (used for detail views).
  const chrono = useMemo(
    () => [...collections].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [collections],
  );

  // Build the detail payload for the currently selected row.
  const detail = useMemo(() => {
    if (!selection) return null;
    const nameOf = (id: string | null) => (id && nameById.get(id)) || '';
    if (selection.kind === 'missing') {
      const m = missingAll.find((r) => r.rent_id === selection.rentId);
      if (!m) return null;
      const plan = rentById.get(m.rent_id);
      const dailyPlan = Number(plan?.daily_repayment) || 0;
      const totalDue = Number(plan?.total_repayment) || 0;
      const paidBefore = Number(plan?.amount_repaid) || 0;
      const remaining = Math.max(0, totalDue - paidBefore);
      const planCollections = chrono.filter((c) => c.rent_request_id === m.rent_id);
      const tenantOtherCollections = chrono.filter((c) => c.tenant_id && plan?.tenant_id && c.tenant_id === plan.tenant_id && c.rent_request_id !== m.rent_id);
      return { kind: 'missing' as const, m, plan, dailyPlan, totalDue, paidBefore, remaining, planCollections, tenantOtherCollections, nameOf };
    }
    const c = extraAll.find((r) => r.collection_id === selection.collectionId);
    if (!c) return null;
    const plan = c.rent_request_id ? rentById.get(c.rent_request_id) : undefined;
    const dailyPlan = Number(plan?.daily_repayment) || 0;
    const totalDue = Number(plan?.total_repayment) || 0;
    const paidBefore = Number(plan?.amount_repaid) || 0;
    const remaining = Math.max(0, totalDue - paidBefore);
    const expected = plan ? Math.min(remaining, dailyPlan * bucketDays) : 0;
    const timeline = plan
      ? chrono
          .filter((x) => x.rent_request_id === c.rent_request_id)
          .reduce<{ id: string; when: number; amount: number; cumulative: number; over_daily: number; over_remaining: number; isThis: boolean }[]>((acc, x) => {
            const prev = acc.length ? acc[acc.length - 1].cumulative : 0;
            const cumulative = prev + (Number(x.amount) || 0);
            acc.push({
              id: x.id,
              when: new Date(x.created_at).getTime(),
              amount: Number(x.amount) || 0,
              cumulative,
              over_daily: Math.max(0, cumulative - expected),
              over_remaining: Math.max(0, cumulative - remaining),
              isThis: x.id === c.collection_id,
            });
            return acc;
          }, [])
      : [];
    return { kind: 'extra' as const, c, plan, dailyPlan, totalDue, paidBefore, remaining, expected, timeline, nameOf };
  }, [selection, missingAll, extraAll, rentById, chrono, bucketDays, nameById]);
  const [mSort, setMSort] = useState<{ k: MSort; dir: 'asc' | 'desc' }>({ k: 'variance', dir: 'desc' });
  const [eSort, setESort] = useState<{ k: ESort; dir: 'asc' | 'desc' }>({ k: 'extra', dir: 'desc' });

  const missing = useMemo(() => {
    const dir = mSort.dir === 'asc' ? 1 : -1;
    const nameOf = (id: string | null) => (id && nameById.get(id)) || '';
    return [...missingAll].sort((a, b) => {
      let av: string | number = 0; let bv: string | number = 0;
      switch (mSort.k) {
        case 'variance': av = a.variance; bv = b.variance; break;
        case 'daily': av = a.daily; bv = b.daily; break;
        case 'collected': av = a.collected; bv = b.collected; break;
        case 'remaining': av = a.remaining_before; bv = b.remaining_before; break;
        case 'tenant': av = nameOf(a.tenant_id).toLowerCase(); bv = nameOf(b.tenant_id).toLowerCase(); break;
        case 'agent': av = nameOf(a.agent_id).toLowerCase(); bv = nameOf(b.agent_id).toLowerCase(); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [missingAll, mSort, nameById]);

  const extras = useMemo(() => {
    const dir = eSort.dir === 'asc' ? 1 : -1;
    const nameOf = (id: string | null) => (id && nameById.get(id)) || '';
    return [...extraAll].sort((a, b) => {
      let av: string | number = 0; let bv: string | number = 0;
      switch (eSort.k) {
        case 'when': av = a.when_ms; bv = b.when_ms; break;
        case 'amount': av = a.amount; bv = b.amount; break;
        case 'extra': av = a.extra_amount; bv = b.extra_amount; break;
        case 'reason': av = a.reason; bv = b.reason; break;
        case 'tenant': av = nameOf(a.tenant_id).toLowerCase(); bv = nameOf(b.tenant_id).toLowerCase(); break;
        case 'agent': av = nameOf(a.agent_id).toLowerCase(); bv = nameOf(b.agent_id).toLowerCase(); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [extraAll, eSort, nameById]);

  const toggleM = (k: MSort) => setMSort((s) => (s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'desc' }));
  const toggleE = (k: ESort) => setESort((s) => (s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: k === 'when' || k === 'amount' || k === 'extra' ? 'desc' : 'asc' }));
  const MI = ({ k }: { k: MSort }) => (mSort.k !== k ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : mSort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />);
  const EI = ({ k }: { k: ESort }) => (eSort.k !== k ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : eSort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />);

  const csvEscape = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const downloadCsv = () => {
    const nameOf = (id: string | null) => (id && nameById.get(id)) || '';
    const rows: (string | number)[][] = [];
    rows.push(['section', 'when_eat', 'tenant', 'tenant_id', 'agent', 'agent_id', 'rent_request_id', 'expected_ugx', 'collected_ugx', 'variance_ugx', 'method', 'reason']);
    for (const r of missing) rows.push(['missing', '', nameOf(r.tenant_id), r.tenant_id || '', nameOf(r.agent_id), r.agent_id || '', r.rent_id, Math.round(r.daily), Math.round(r.collected), Math.round(r.variance), '', 'underpaid_or_no_payment']);
    for (const r of extras) rows.push(['extra', fmtWhen(r.when_ms), nameOf(r.tenant_id), r.tenant_id || '', nameOf(r.agent_id), r.agent_id || '', r.rent_request_id || '', 0, Math.round(r.amount), Math.round(r.extra_amount), r.method || '', r.reason]);
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation_${start.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = rLoading || cLoading;
  const bucketWhen = `${fmtWhen(start.getTime())} → ${fmtWhen(end.getTime())} EAT`;
  const scopeLabel = agentId ? `${agentName || 'Agent'} · ${bucketLabel || bucketWhen}` : (bucketLabel || bucketWhen);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="text-base inline-flex items-center gap-2">
            <Scale className="h-4 w-4" /> Bucket reconciliation
          </DialogTitle>
          <DialogDescription className="text-[11px]">{scopeLabel}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 pb-2 border-b border-border">
              <SummaryCard label="Expected" value={formatUGX(totalExpected)} accent="violet" />
              <SummaryCard label="Collected" value={formatUGX(totalCollected)} accent="primary" />
              <SummaryCard label="Missing" value={formatUGX(missingTotal)} sub={`${missingAll.length} plan${missingAll.length === 1 ? '' : 's'}`} accent="rose" />
              <SummaryCard label="Extra" value={formatUGX(extraTotal)} sub={`${extraAll.length} row${extraAll.length === 1 ? '' : 's'}`} accent="amber" />
            </div>

            <div className="px-4 py-2 border-b border-border flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Fulfilment rate</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${rate >= 0.9 ? 'bg-emerald-500' : rate >= 0.6 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, rate * 100)}%` }} />
              </div>
              <span className="text-[11px] font-bold tabular-nums">{(rate * 100).toFixed(1)}%</span>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={missingAll.length === 0 && extraAll.length === 0}
                className="h-6 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-background border border-border hover:bg-muted disabled:opacity-40"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            </div>

            <div className="px-4 pt-2 border-b border-border flex items-center gap-1.5">
              <TabBtn active={tab === 'missing'} onClick={() => switchTab('missing')} icon={<AlertCircle className="h-3 w-3" />} label={`Missing (${missingAll.length})`} tone="rose" />
              <TabBtn active={tab === 'extra'} onClick={() => switchTab('extra')} icon={<Plus className="h-3 w-3" />} label={`Extra (${extraAll.length})`} tone="amber" />
              {selection && (
                <button
                  type="button"
                  onClick={() => setSelection(null)}
                  className="ml-auto h-6 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-background border border-border hover:bg-muted"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to list
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {selection && detail ? (
                <ReconDetailView detail={detail} bucketDays={bucketDays} onOpenAnother={(sel) => setSelection(sel)} />
              ) : tab === 'missing' ? (
                missing.length === 0 ? (
                  <p className="p-6 text-center text-[11px] text-muted-foreground">No underpayments — every active plan met its expected obligation in this bucket. 🎯</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted text-muted-foreground z-10">
                      <tr>
                        <TH onClick={() => toggleM('tenant')} align="left"><span className="inline-flex items-center gap-1">Tenant <MI k="tenant" /></span></TH>
                        <TH onClick={() => toggleM('agent')} align="left" hideMd><span className="inline-flex items-center gap-1">Agent <MI k="agent" /></span></TH>
                        <TH onClick={() => toggleM('daily')} align="right"><span className="inline-flex items-center gap-1 justify-end w-full">Expected <MI k="daily" /></span></TH>
                        <TH onClick={() => toggleM('collected')} align="right"><span className="inline-flex items-center gap-1 justify-end w-full">Collected <MI k="collected" /></span></TH>
                        <TH onClick={() => toggleM('variance')} align="right"><span className="inline-flex items-center gap-1 justify-end w-full">Variance <MI k="variance" /></span></TH>
                        <TH onClick={() => toggleM('remaining')} align="right" hideMd><span className="inline-flex items-center gap-1 justify-end w-full">Remaining <MI k="remaining" /></span></TH>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {missing.map((r) => (
                        <tr key={r.rent_id} className="hover:bg-rose-500/5 cursor-pointer" onClick={() => setSelection({ kind: 'missing', rentId: r.rent_id })} title="Open variance breakdown">
                          <td className="px-2 py-1.5">
                            <div className="font-semibold text-foreground truncate max-w-[14rem] inline-flex items-center gap-1">
                              {(r.tenant_id && nameById.get(r.tenant_id)) || '(no tenant)'}
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                            {r.tenant_id && <div className="text-[9px] font-mono text-muted-foreground">{r.tenant_id.slice(0, 8)} · plan {r.rent_id.slice(0, 8)}</div>}
                          </td>
                          <td className="px-2 py-1.5 hidden md:table-cell truncate max-w-[10rem]">{(r.agent_id && nameById.get(r.agent_id)) || '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatUGX(Math.round(r.daily))}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatUGX(Math.round(r.collected))}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-bold text-rose-700">−{formatUGX(Math.round(r.variance))}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">{formatUGX(Math.round(r.remaining_before))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur border-t border-border">
                      <tr>
                        <td className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide" colSpan={2}>Missing total</td>
                        <td />
                        <td />
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-rose-700">−{formatUGX(Math.round(missingTotal))}</td>
                        <td className="hidden md:table-cell" />
                      </tr>
                    </tfoot>
                  </table>
                )
              ) : (
                extras.length === 0 ? (
                  <p className="p-6 text-center text-[11px] text-muted-foreground">No extras — every collection in this bucket maps cleanly to an active plan's expected daily amount. ✅</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted text-muted-foreground z-10">
                      <tr>
                        <TH onClick={() => toggleE('when')} align="left"><span className="inline-flex items-center gap-1">When <EI k="when" /></span></TH>
                        <TH onClick={() => toggleE('tenant')} align="left"><span className="inline-flex items-center gap-1">Tenant <EI k="tenant" /></span></TH>
                        <TH onClick={() => toggleE('agent')} align="left" hideMd><span className="inline-flex items-center gap-1">Agent <EI k="agent" /></span></TH>
                        <TH onClick={() => toggleE('amount')} align="right"><span className="inline-flex items-center gap-1 justify-end w-full">Amount <EI k="amount" /></span></TH>
                        <TH onClick={() => toggleE('extra')} align="right"><span className="inline-flex items-center gap-1 justify-end w-full">Extra <EI k="extra" /></span></TH>
                        <TH onClick={() => toggleE('reason')} align="left"><span className="inline-flex items-center gap-1">Reason <EI k="reason" /></span></TH>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {extras.map((r) => (
                        <tr key={r.collection_id} className="hover:bg-amber-500/5 cursor-pointer" onClick={() => setSelection({ kind: 'extra', collectionId: r.collection_id })} title="Open extra-collection breakdown">
                          <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">{fmtWhen(r.when_ms)}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-semibold text-foreground truncate max-w-[12rem] inline-flex items-center gap-1">
                              {(r.tenant_id && nameById.get(r.tenant_id)) || '(no tenant)'}
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                            {r.rent_request_id && <div className="text-[9px] font-mono text-muted-foreground">plan {r.rent_request_id.slice(0, 8)}</div>}
                          </td>
                          <td className="px-2 py-1.5 hidden md:table-cell truncate max-w-[10rem]">{(r.agent_id && nameById.get(r.agent_id)) || '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatUGX(r.amount)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-bold text-amber-700">+{formatUGX(Math.round(r.extra_amount))}</td>
                          <td className="px-2 py-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 text-[9px] font-semibold">{r.reason_label}</span>
                            {r.method && <span className="ml-1 text-[9px] text-muted-foreground">· {r.method.replace(/_/g, ' ')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur border-t border-border">
                      <tr>
                        <td className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide" colSpan={3}>Extra total</td>
                        <td />
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-amber-700">+{formatUGX(Math.round(extraTotal))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: 'violet' | 'primary' | 'rose' | 'amber' }) {
  const color = accent === 'violet' ? 'text-violet-700' : accent === 'primary' ? 'text-primary' : accent === 'rose' ? 'text-rose-700' : 'text-amber-700';
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TH({ children, onClick, align, hideMd }: { children: React.ReactNode; onClick: () => void; align: 'left' | 'right'; hideMd?: boolean }) {
  return (
    <th
      className={`${align === 'right' ? 'text-right' : 'text-left'} font-bold uppercase tracking-wide px-2 py-1.5 text-[9px] ${hideMd ? 'hidden md:table-cell' : ''}`}
    >
      <button type="button" onClick={onClick} className="hover:text-foreground transition-colors">{children}</button>
    </th>
  );
}

function TabBtn({ active, onClick, icon, label, tone }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone: 'rose' | 'amber' }) {
  const activeClass = tone === 'rose' ? 'bg-rose-500/10 text-rose-800 border-rose-500/40' : 'bg-amber-500/10 text-amber-800 border-amber-500/40';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-2 rounded-t-md text-[10px] font-semibold inline-flex items-center gap-1 border-b-0 border ${active ? activeClass : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'}`}
    >
      {icon}{label}
    </button>
  );
}

type DetailPayload =
  | {
      kind: 'missing';
      m: MissingRow;
      plan: ActiveRent | undefined;
      dailyPlan: number;
      totalDue: number;
      paidBefore: number;
      remaining: number;
      planCollections: BucketCollection[];
      tenantOtherCollections: BucketCollection[];
      nameOf: (id: string | null) => string;
    }
  | {
      kind: 'extra';
      c: ExtraRow;
      plan: ActiveRent | undefined;
      dailyPlan: number;
      totalDue: number;
      paidBefore: number;
      remaining: number;
      expected: number;
      timeline: { id: string; when: number; amount: number; cumulative: number; over_daily: number; over_remaining: number; isThis: boolean }[];
      nameOf: (id: string | null) => string;
    };

function ReconDetailView({
  detail,
  bucketDays,
  onOpenAnother,
}: {
  detail: DetailPayload;
  bucketDays: number;
  onOpenAnother: (sel: { kind: 'missing'; rentId: string } | { kind: 'extra'; collectionId: string }) => void;
}) {
  const csvEscape = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const triggerDownload = (rows: (string | number)[][], filename: string) => {
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadDetailCsv = () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    if (detail.kind === 'missing') {
      const { m, plan, dailyPlan, totalDue, paidBefore, remaining, planCollections, tenantOtherCollections, nameOf } = detail;
      const rows: (string | number)[][] = [];
      rows.push(['section', 'field', 'value']);
      rows.push(['header', 'tenant', nameOf(m.tenant_id)]);
      rows.push(['header', 'tenant_id', m.tenant_id || '']);
      rows.push(['header', 'agent', nameOf(m.agent_id)]);
      rows.push(['header', 'agent_id', m.agent_id || '']);
      rows.push(['header', 'rent_request_id', m.rent_id]);
      rows.push(['header', 'plan_status', plan?.status || '']);
      rows.push([]);
      rows.push(['math', 'label', 'value_ugx']);
      rows.push(['math', 'plan_daily_repayment', Math.round(dailyPlan)]);
      rows.push(['math', 'bucket_days', bucketDays.toFixed(6)]);
      rows.push(['math', 'daily_times_bucket', Math.round(dailyPlan * bucketDays)]);
      rows.push(['math', 'total_due', Math.round(totalDue)]);
      rows.push(['math', 'already_repaid_before_bucket', Math.round(paidBefore)]);
      rows.push(['math', 'remaining_balance', Math.round(remaining)]);
      rows.push(['math', 'expected_in_bucket', Math.round(m.daily)]);
      rows.push(['math', 'collected_in_bucket', Math.round(m.collected)]);
      rows.push(['math', 'variance', -Math.round(m.variance)]);
      rows.push([]);
      rows.push(['plan_collections', 'when_eat', 'agent', 'agent_id', 'method', 'amount_ugx', 'rent_request_id', 'collection_id']);
      for (const r of planCollections) {
        rows.push(['plan_collections', fmtWhen(new Date(r.created_at).getTime()), nameOf(r.agent_id), r.agent_id || '', r.payment_method || '', Math.round(Number(r.amount) || 0), r.rent_request_id || '', r.id]);
      }
      if (tenantOtherCollections.length) {
        rows.push([]);
        rows.push(['tenant_other_plans', 'when_eat', 'agent', 'agent_id', 'method', 'amount_ugx', 'rent_request_id', 'collection_id']);
        for (const r of tenantOtherCollections) {
          rows.push(['tenant_other_plans', fmtWhen(new Date(r.created_at).getTime()), nameOf(r.agent_id), r.agent_id || '', r.payment_method || '', Math.round(Number(r.amount) || 0), r.rent_request_id || '', r.id]);
        }
      }
      triggerDownload(rows, `recon_missing_${m.rent_id.slice(0, 8)}_${stamp}.csv`);
      return;
    }
    const { c, plan, dailyPlan, totalDue, paidBefore, remaining, expected, timeline, nameOf } = detail;
    const rows: (string | number)[][] = [];
    rows.push(['section', 'field', 'value']);
    rows.push(['header', 'collection_id', c.collection_id]);
    rows.push(['header', 'when_eat', fmtWhen(c.when_ms)]);
    rows.push(['header', 'amount_ugx', Math.round(c.amount)]);
    rows.push(['header', 'extra_amount_ugx', Math.round(c.extra_amount)]);
    rows.push(['header', 'reason', c.reason]);
    rows.push(['header', 'reason_label', c.reason_label]);
    rows.push(['header', 'tenant', nameOf(c.tenant_id)]);
    rows.push(['header', 'tenant_id', c.tenant_id || '']);
    rows.push(['header', 'agent', nameOf(c.agent_id)]);
    rows.push(['header', 'agent_id', c.agent_id || '']);
    rows.push(['header', 'method', c.method || '']);
    rows.push(['header', 'rent_request_id', c.rent_request_id || '']);
    if (plan) {
      rows.push([]);
      rows.push(['math', 'label', 'value_ugx']);
      rows.push(['math', 'plan_status', plan.status || '']);
      rows.push(['math', 'plan_daily_repayment', Math.round(dailyPlan)]);
      rows.push(['math', 'bucket_days', bucketDays.toFixed(6)]);
      rows.push(['math', 'total_due', Math.round(totalDue)]);
      rows.push(['math', 'already_repaid_before_bucket', Math.round(paidBefore)]);
      rows.push(['math', 'remaining_balance', Math.round(remaining)]);
      rows.push(['math', 'expected_in_bucket', Math.round(expected)]);
      rows.push([]);
      rows.push(['timeline', 'when_eat', 'amount_ugx', 'cumulative_ugx', 'over_daily_ugx', 'over_remaining_ugx', 'is_this_row', 'collection_id']);
      for (const t of timeline) {
        rows.push(['timeline', fmtWhen(t.when), Math.round(t.amount), Math.round(t.cumulative), Math.round(t.over_daily), Math.round(t.over_remaining), t.isThis ? 'yes' : 'no', t.id]);
      }
    }
    triggerDownload(rows, `recon_extra_${c.collection_id.slice(0, 8)}_${stamp}.csv`);
  };

  if (detail.kind === 'missing') {
    const { m, plan, dailyPlan, totalDue, paidBefore, remaining, planCollections, tenantOtherCollections, nameOf } = detail;
    const proration = bucketDays >= 0.999 ? '1 full day' : `${(bucketDays * 24).toFixed(2)} hours (${(bucketDays * 100 / 1).toFixed(1)}% of a day)`;
    return (
      <div className="p-4 space-y-4">
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-rose-800">Missing collection · variance breakdown</div>
            <button
              type="button"
              onClick={downloadDetailCsv}
              className="h-6 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-background border border-border hover:bg-muted"
              title="Download this variance breakdown as CSV"
            >
              <Download className="h-3 w-3" /> CSV
            </button>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-base font-bold text-foreground truncate">{nameOf(m.tenant_id) || '(no tenant)'}</div>
            <div className="text-[10px] font-mono text-muted-foreground">{m.tenant_id?.slice(0, 8) || '—'}</div>
          </div>
          <div className="text-[10px] text-muted-foreground">Agent: <span className="text-foreground font-semibold">{nameOf(m.agent_id) || '—'}</span> · Plan <span className="font-mono">{m.rent_id.slice(0, 8)}</span> · Status <span className="font-semibold">{plan?.status || '—'}</span></div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Prorated obligation for this bucket</div>
          <table className="w-full text-[11px] border border-border rounded-md overflow-hidden">
            <tbody className="divide-y divide-border">
              <MathRow label="Plan daily repayment" value={formatUGX(dailyPlan)} />
              <MathRow label="Bucket length" value={proration} />
              <MathRow label="Daily × bucket length" value={formatUGX(Math.round(dailyPlan * bucketDays))} />
              <MathRow label="Total due on plan" value={formatUGX(totalDue)} />
              <MathRow label="Already repaid (before bucket)" value={formatUGX(paidBefore)} />
              <MathRow label="Remaining balance" value={formatUGX(remaining)} />
              <MathRow label="Expected in bucket = min(remaining, daily × bucket)" value={formatUGX(Math.round(m.daily))} accent="violet" bold />
              <MathRow label="Collected in bucket" value={formatUGX(Math.round(m.collected))} accent="primary" bold />
              <MathRow label="Variance = expected − collected" value={`−${formatUGX(Math.round(m.variance))}`} accent="rose" bold />
            </tbody>
          </table>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Collections linked to this plan in this bucket ({planCollections.length})</div>
          {planCollections.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic border border-dashed border-border rounded-md p-3">Zero collections — the plan received nothing in this window.</p>
          ) : (
            <MiniCollectionTable rows={planCollections} nameOf={nameOf} />
          )}
        </div>

        {tenantOtherCollections.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
              Same tenant paid on {tenantOtherCollections.length} other plan{tenantOtherCollections.length === 1 ? '' : 's'} in this bucket
            </div>
            <p className="text-[10px] text-muted-foreground mb-1 italic">Collections booked to a different `rent_request_id` for the same tenant — often the source of misattribution.</p>
            <MiniCollectionTable rows={tenantOtherCollections} nameOf={nameOf} />
          </div>
        )}
      </div>
    );
  }

  const { c, plan, dailyPlan, totalDue, paidBefore, remaining, expected, timeline, nameOf } = detail;
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Extra collection · why flagged</div>
          <button
            type="button"
            onClick={downloadDetailCsv}
            className="h-6 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-background border border-border hover:bg-muted"
            title="Download this extra-collection breakdown as CSV"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-base font-bold text-foreground">{formatUGX(c.amount)}</div>
          <div className="text-[10px] text-muted-foreground">at {fmtWhen(c.when_ms)}</div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Tenant: <span className="text-foreground font-semibold">{nameOf(c.tenant_id) || '—'}</span> · Agent: <span className="text-foreground font-semibold">{nameOf(c.agent_id) || '—'}</span>
          {c.method && <> · Method: <span className="text-foreground font-semibold">{c.method.replace(/_/g, ' ')}</span></>}
        </div>
        <div className="mt-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-900 text-[10px] font-semibold">{c.reason_label}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">Extra amount: <span className="font-bold text-amber-800">+{formatUGX(Math.round(c.extra_amount))}</span></span>
        </div>
      </div>

      {plan ? (
        <>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Linked plan obligation</div>
            <table className="w-full text-[11px] border border-border rounded-md overflow-hidden">
              <tbody className="divide-y divide-border">
                <MathRow label="Plan" value={`${plan.id.slice(0, 8)} · ${plan.status || '—'}`} />
                <MathRow label="Plan daily repayment" value={formatUGX(dailyPlan)} />
                <MathRow label="Total due" value={formatUGX(totalDue)} />
                <MathRow label="Already repaid (before bucket)" value={formatUGX(paidBefore)} />
                <MathRow label="Remaining balance" value={formatUGX(remaining)} />
                <MathRow label="Expected in bucket" value={formatUGX(Math.round(expected))} accent="violet" bold />
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Cumulative timeline for this plan in the bucket</div>
            <table className="w-full text-[11px] border border-border rounded-md overflow-hidden">
              <thead className="bg-muted text-muted-foreground text-[9px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2 py-1.5">When (EAT)</th>
                  <th className="text-right px-2 py-1.5">Amount</th>
                  <th className="text-right px-2 py-1.5">Cumulative</th>
                  <th className="text-right px-2 py-1.5">Over daily</th>
                  <th className="text-right px-2 py-1.5">Over remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {timeline.map((t) => (
                  <tr key={t.id} className={t.isThis ? 'bg-amber-500/10 font-semibold' : ''}>
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                      {fmtWhen(t.when)}{t.isThis && <span className="ml-1 text-[9px] text-amber-700">← this row</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatUGX(t.amount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatUGX(t.cumulative)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${t.over_daily > 0 ? 'text-amber-700 font-bold' : 'text-muted-foreground'}`}>{t.over_daily > 0 ? `+${formatUGX(Math.round(t.over_daily))}` : '—'}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${t.over_remaining > 0 ? 'text-rose-700 font-bold' : 'text-muted-foreground'}`}>{t.over_remaining > 0 ? `+${formatUGX(Math.round(t.over_remaining))}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-muted-foreground italic">
              The row is flagged as extra because its cumulative pushes the plan over the {c.reason === 'over_remaining' ? 'remaining balance' : c.reason === 'over_daily' ? 'daily expected amount' : 'link/status check'} by <span className="font-bold text-amber-800">+{formatUGX(Math.round(c.extra_amount))}</span>.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
          {c.reason === 'no_plan_link'
            ? 'This collection was recorded without any `rent_request_id`, so it cannot be attributed to a plan obligation. Investigate whether it should be re-linked or refunded.'
            : 'The linked plan is not currently active (closed / cancelled / paid off), so no daily obligation exists for it in this bucket.'}
        </div>
      )}

      {/* Suggest jumping to the missing plan for the same tenant if any. */}
      {plan && (
        <button
          type="button"
          onClick={() => onOpenAnother({ kind: 'missing', rentId: plan.id })}
          className="text-[10px] font-semibold text-primary hover:underline"
        >
          → View this plan's variance in the Missing tab
        </button>
      )}
    </div>
  );
}

function MathRow({ label, value, accent, bold }: { label: string; value: string; accent?: 'violet' | 'primary' | 'rose'; bold?: boolean }) {
  const color = accent === 'violet' ? 'text-violet-700' : accent === 'primary' ? 'text-primary' : accent === 'rose' ? 'text-rose-700' : 'text-foreground';
  return (
    <tr>
      <td className="px-2 py-1.5 text-muted-foreground">{label}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${bold ? 'font-bold' : ''} ${color}`}>{value}</td>
    </tr>
  );
}

function MiniCollectionTable({ rows, nameOf }: { rows: BucketCollection[]; nameOf: (id: string | null) => string }) {
  return (
    <table className="w-full text-[11px] border border-border rounded-md overflow-hidden">
      <thead className="bg-muted text-muted-foreground text-[9px] uppercase tracking-wide">
        <tr>
          <th className="text-left px-2 py-1.5">When (EAT)</th>
          <th className="text-left px-2 py-1.5">Agent</th>
          <th className="text-left px-2 py-1.5">Method</th>
          <th className="text-right px-2 py-1.5">Amount</th>
          <th className="text-left px-2 py-1.5">Plan</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">{fmtWhen(new Date(r.created_at).getTime())}</td>
            <td className="px-2 py-1.5 truncate max-w-[10rem]">{nameOf(r.agent_id) || '—'}</td>
            <td className="px-2 py-1.5">{(r.payment_method || '—').replace(/_/g, ' ')}</td>
            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatUGX(Number(r.amount) || 0)}</td>
            <td className="px-2 py-1.5 font-mono text-[9px] text-muted-foreground">{r.rent_request_id?.slice(0, 8) || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}