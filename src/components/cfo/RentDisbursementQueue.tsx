import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle2, Banknote, Home, TrendingUp, Users, Wallet, AlertTriangle, XCircle, CalendarDays, Search, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TreasuryImpactBanner } from './TreasuryImpactBanner';
import { useAuth } from '@/hooks/useAuth';
import { UserDrilldownDrawer } from '@/components/ops/UserDrilldownDrawer';
import { PayByLocationRecipientPicker } from './PayByLocationRecipientPicker';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

interface ApprovedRentItem {
  id: string;
  rent_amount: number;
  tenant_id: string;
  landlord_id: string;
  agent_id: string | null;
  assigned_agent_id: string | null;
  access_fee: number;
  request_fee: number;
  total_repayment: number;
  created_at: string;
  tenant_name: string;
  landlord_name: string;
  agent_name: string;
  has_landlord_wallet: boolean;
  payout_target: 'landlord_wallet' | 'agent_float';
  request_country: string | null;
  request_city: string | null;
}

interface RentDisbursementQueueProps {
  /**
   * Optional: restrict the queue to these rent_request ids. Used by
   * "Pay by Location/Category", which only *selects* recipients — every
   * amount, validation, disbursement call and audit trail below stays
   * exactly the same as the normal General Payout queue.
   */
  restrictToIds?: string[];
  /** Optional: tick these rows on mount (same checkboxes as usual). */
  autoSelectIds?: string[];
}

export function RentDisbursementQueue({ restrictToIds, autoSelectIds }: RentDisbursementQueueProps = {}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [search, setSearch] = useState('');
  const [batchRef, setBatchRef] = useState('');
  const [rejectTarget, setRejectTarget] = useState<ApprovedRentItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [drilldownAgentId, setDrilldownAgentId] = useState<string | null>(null);
  /**
   * Pay by Location/Category scope, selected *inside this section*. It holds
   * rent_request ids only — a recipient filter. Every amount, validation,
   * approval requirement, disbursement call, wallet and ledger effect below
   * stays exactly the same as the normal queue.
   */
  const [locationScopeIds, setLocationScopeIds] = useState<string[] | null>(null);
  const [locationScopeLabel, setLocationScopeLabel] = useState<string | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['rent-disbursement-queue'],
    queryFn: async () => {
      // Get COO-approved rent requests
      const { data: requests, error } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, tenant_id, landlord_id, agent_id, assigned_agent_id, access_fee, request_fee, total_repayment, created_at, request_country, request_city')
        .eq('status', 'coo_approved')
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!requests?.length) return [];

      // Gather unique IDs
      const tenantIds = [...new Set(requests.map(r => r.tenant_id))];
      const landlordIds = [...new Set(requests.map(r => r.landlord_id).filter(Boolean))];
      const agentIds = [...new Set(requests.flatMap(r => [r.agent_id, r.assigned_agent_id].filter(Boolean) as string[]))];

      // Fetch profiles for tenants and agents
      const allUserIds = [...new Set([...tenantIds, ...agentIds])];
      const profileMap = new Map<string, string>();
      if (allUserIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', allUserIds);
        for (const p of profiles || []) profileMap.set(p.id, p.full_name || 'Unknown');
      }

      // Fetch landlord names
      const landlordMap = new Map<string, string>();
      if (landlordIds.length) {
        const { data: landlords } = await supabase.from('landlords').select('id, name').in('id', landlordIds);
        for (const l of landlords || []) landlordMap.set(l.id, l.name || 'Unknown');
      }

      // Check which landlords have wallets (via profiles matching landlord user references)
      // Landlords in our system may or may not have user accounts with wallets
      const walletSet = new Set<string>();
      if (landlordIds.length) {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('user_id')
          .in('user_id', landlordIds);
        for (const w of wallets || []) walletSet.add(w.user_id);
      }

      return requests.map(r => {
        const agentId = r.assigned_agent_id || r.agent_id;
        const hasWallet = walletSet.has(r.landlord_id);
        return {
          ...r,
          access_fee: r.access_fee ?? 0,
          request_fee: r.request_fee ?? 0,
          total_repayment: r.total_repayment ?? 0,
          tenant_name: profileMap.get(r.tenant_id) || 'Unknown Tenant',
          landlord_name: landlordMap.get(r.landlord_id) || 'Unknown Landlord',
          agent_name: agentId ? (profileMap.get(agentId) || 'Unknown Agent') : 'No Agent',
          has_landlord_wallet: hasWallet,
          payout_target: hasWallet ? 'landlord_wallet' as const : 'agent_float' as const,
          request_country: (r as any).request_country ?? null,
          request_city: (r as any).request_city ?? null,
        };
      });
    },
    staleTime: 15_000,
  });

  const selectedItems = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);

  // Pre-tick rows handed over by the location/category recipient picker.
  useEffect(() => {
    if (!autoSelectIds?.length) return;
    setSelected(new Set(autoSelectIds));
  }, [autoSelectIds?.join(',')]);

  // Caller-supplied restriction wins; otherwise the in-section
  // Location/Category selection scopes the very same queue.
  const effectiveRestrictIds = useMemo(
    () => (restrictToIds && restrictToIds.length ? restrictToIds : locationScopeIds),
    [restrictToIds?.join(','), locationScopeIds?.join(',')],
  );
  const restrictSet = useMemo(
    () => (effectiveRestrictIds && effectiveRestrictIds.length ? new Set(effectiveRestrictIds) : null),
    [effectiveRestrictIds?.join(',')],
  );
  const totalRent = useMemo(() => selectedItems.reduce((s, i) => s + i.rent_amount, 0), [selectedItems]);
  const totalRevenue = useMemo(() => selectedItems.reduce((s, i) => s + i.access_fee + i.request_fee, 0), [selectedItems]);
  const totalRepaymentExpected = useMemo(() => selectedItems.reduce((s, i) => s + i.total_repayment, 0), [selectedItems]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // Date-window + text-search filter: which requests are within the chosen
  // lookback and match the CFO's search (tenant, landlord, or agent name).
  const filteredItems = useMemo(() => {
    const cutoff = dateFilter === 'all'
      ? null
      : Date.now() - (dateFilter === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (restrictSet && !restrictSet.has(it.id)) return false;
      if (cutoff !== null && new Date(it.created_at).getTime() < cutoff) return false;
      if (q) {
        const haystack = `${it.tenant_name} ${it.landlord_name} ${it.agent_name}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, dateFilter, search, restrictSet]);

  // Group rows by agent so CFO can pick one tenant, a few, or all of an
  // agent's tenants at a glance.
  const grouped = useMemo(() => {
    const map = new Map<string, { agent_id: string; agent_name: string; rows: ApprovedRentItem[]; latest: number }>();
    for (const it of filteredItems) {
      const key = it.assigned_agent_id || it.agent_id || 'unassigned';
      const ts = new Date(it.created_at).getTime();
      const g = map.get(key) ?? { agent_id: key, agent_name: it.agent_name, rows: [], latest: 0 };
      g.rows.push(it);
      if (ts > g.latest) g.latest = ts;
      map.set(key, g);
    }
    // Newest request first, so an agent that just posted jumps to the top.
    // Within each agent, show their newest tenant request first too.
    for (const g of map.values()) {
      g.rows.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return [...map.values()].sort((a, b) => b.latest - a.latest);
  }, [filteredItems]);

  // Country breakdown — counts + total rent per country across the filtered queue.
  const countryStats = useMemo(() => {
    const map = new Map<string, { country: string; count: number; total: number }>();
    for (const it of filteredItems) {
      const key = (it.request_country || '').trim() || 'Unknown';
      const s = map.get(key) ?? { country: key, count: 0, total: 0 };
      s.count += 1;
      s.total += it.rent_amount;
      map.set(key, s);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  const countryFilteredGroups = useMemo(() => {
    if (countryFilter === 'all') return grouped;
    return grouped
      .map(g => ({
        ...g,
        rows: g.rows.filter(r => ((r.request_country || '').trim() || 'Unknown') === countryFilter),
      }))
      .filter(g => g.rows.length > 0);
  }, [grouped, countryFilter]);

  const visibleGroups = useMemo(
    () => (agentFilter === 'all' ? countryFilteredGroups : countryFilteredGroups.filter(g => g.agent_id === agentFilter)),
    [countryFilteredGroups, agentFilter],
  );
  const visibleItems = useMemo(() => visibleGroups.flatMap(g => g.rows), [visibleGroups]);
  const allSelected = visibleItems.length > 0 && visibleItems.every(i => selected.has(i.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) visibleItems.forEach(i => next.delete(i.id));
    else visibleItems.forEach(i => next.add(i.id));
    setSelected(next);
  };

  const toggleAgentGroup = (rows: ApprovedRentItem[]) => {
    const ids = rows.map(r => r.id);
    const allOn = ids.every(id => selected.has(id));
    const next = new Set(selected);
    if (allOn) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelected(next);
  };

  const batchDisburse = useMutation({
    mutationFn: async () => {
      if (!batchRef.trim()) throw new Error('Enter a batch reference');
      const errors: string[] = [];
      for (const id of selected) {
        const { error } = await supabase.functions.invoke('fund-agent-landlord-float', {
          body: { rent_request_id: id, notes: `Batch: ${batchRef}` },
        });
        if (error) errors.push(`${id.slice(0, 8)}: ${error.message}`);
      }
      if (errors.length) throw new Error(`${errors.length} failed: ${errors[0]}`);
    },
    onSuccess: () => {
      toast.success(`Funded ${selected.size} agent float${selected.size === 1 ? '' : 's'} — agents will complete the MoMo payouts.`);
      setSelected(new Set());
      setBatchRef('');
      qc.invalidateQueries({ queryKey: ['rent-disbursement-queue'] });
      qc.invalidateQueries({ queryKey: ['batch-payout-pending'] });
      qc.invalidateQueries({ queryKey: ['treasury-cash-snapshot'] });
      qc.invalidateQueries({ queryKey: ['cfo-overview'] });
    },
    onError: (e: any) => toast.error(e.message || 'Batch disbursement failed'),
  });

  const singleDisburse = useMutation({
    mutationFn: async (id: string) => {
      const { error, data } = await supabase.functions.invoke('fund-agent-landlord-float', {
        body: { rent_request_id: id, notes: 'Single CFO disbursement' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Funded agent float — agent will complete the MoMo payout.');
      qc.invalidateQueries({ queryKey: ['rent-disbursement-queue'] });
      qc.invalidateQueries({ queryKey: ['treasury-cash-snapshot'] });
      qc.invalidateQueries({ queryKey: ['cfo-overview'] });
    },
    onError: (e: any) => toast.error(e.message || 'Disbursement failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!user) throw new Error('Not authenticated');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      const { error } = await supabase.rpc('return_rent_request_for_correction', {
        p_request_id: id,
        p_stage: 'coo_approved',
        p_reason: reason.trim(),
      });
      if (error) throw error;

      // Stamp CFO reviewer + comment for audit trail (mirrors RentPipelineQueue)
      await supabase
        .from('rent_requests')
        .update({
          cfo_reviewed_by: user.id,
          cfo_reviewed_at: new Date().toISOString(),
          approval_comment: reason.trim(),
        })
        .eq('id', id);
    },
    onSuccess: () => {
      toast.success('Rent request returned to agent with your comment.');
      setRejectTarget(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['rent-disbursement-queue'] });
      qc.invalidateQueries({ queryKey: ['rent-pipeline'] });
      qc.invalidateQueries({ queryKey: ['agent-rejected-rent-requests'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to reject'),
  });

  // Summary totals for the currently filtered queue.
  const queueTotalRent = useMemo(() => filteredItems.reduce((s, i) => s + i.rent_amount, 0), [filteredItems]);
  const queueTotalRevenue = useMemo(() => filteredItems.reduce((s, i) => s + i.access_fee + i.request_fee, 0), [filteredItems]);

  const dateFilterLabel: Record<string, string> = { all: 'All time', '7d': 'Last 7 days', '30d': 'Last 30 days' };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            Fund Agent Landlord Payout Float
            {filteredItems.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1 bg-primary/10 text-primary border-primary/30">
                {filteredItems.length} approved{dateFilter !== 'all' ? ` · ${dateFilterLabel[dateFilter]}` : ''} · {fmt(queueTotalRent)}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-[230px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
                placeholder="Search tenant, landlord, agent…"
                className="h-7 text-xs pl-8"
              />
            </div>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-7 text-xs w-[220px]">
                <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Filter by agent" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">All agents ({grouped.length})</SelectItem>
                {grouped.map(g => {
                  const gTotal = g.rows.reduce((s, r) => s + r.rent_amount, 0);
                  return (
                    <SelectItem key={g.agent_id} value={g.agent_id}>
                      <span className="truncate">
                        {g.agent_name} · {g.rows.length} · {fmt(gTotal)}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v as any); setSelected(new Set()); }}>
              <SelectTrigger className="h-7 text-xs w-[150px]">
                <CalendarDays className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            {agentFilter !== 'all' && (
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() => setAgentFilter('all')}
              >
                Clear agent
              </button>
            )}
          </div>
        </div>
        {filteredItems.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            COO-approved rent. Funding lands in the assigned agent's <b>Landlord Payout Float</b> — the agent then pays the landlord via MoMo + OTP. Revenue earned: <span className="font-bold text-emerald-600">{fmt(queueTotalRevenue)}</span>
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/*
          Pay by Location/Category — part of Fund Agent Landlord Payout Float.
          Recipient selection only: it ticks rows in the queue below, which then
          runs the identical existing funding logic.
        */}
        <div className="mb-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-2">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5 px-1">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Step 1 (optional) · Choose recipients by location / category
            </p>
            {locationScopeIds?.length ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                  {locationScopeLabel ? `${locationScopeLabel} · ` : ''}{locationScopeIds.length} in scope
                </Badge>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => {
                    setLocationScopeIds(null);
                    setLocationScopeLabel(null);
                    setSelected(new Set());
                  }}
                >
                  Show whole queue
                </button>
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground px-1 mb-2">
            This only narrows <b>who</b> appears in the float funding list below. Amounts, fees,
            validations, approvals, wallet and ledger records are unchanged — the same
            Fund Agent Landlord Payout Float process runs on whoever you tick in Step 2.
          </p>
          <PayByLocationRecipientPicker
            mode="rent_queue"
            queuedCount={locationScopeIds?.length ?? 0}
            onUseRecipients={(recipients) => {
              const ids = recipients
                .map(r => r.rent_request_id)
                .filter((v): v is string => Boolean(v));
              if (!ids.length) {
                toast.error('No eligible approved rent requests in that selection.');
                return;
              }
              // Reset the other filters so the scoped rows are all visible,
              // then pre-tick them in the existing checkboxes.
              setSearch('');
              setAgentFilter('all');
              setCountryFilter('all');
              setDateFilter('all');
              setLocationScopeIds(ids);
              setLocationScopeLabel(`${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`);
              setSelected(new Set(ids));
            }}
          />
        </div>

        {locationScopeIds?.length ? (
          <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-2 px-1">
            Step 2 · Fund the selected float payouts (unchanged process)
          </p>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
            <p className="font-medium">No Pending Rent Payouts</p>
            <p className="text-xs">
              {dateFilter !== 'all'
                ? `No requests match ${dateFilterLabel[dateFilter]}. `
                : 'All approved rent requests have been disbursed'}
              {dateFilter !== 'all' && (
                <button type="button" className="text-primary hover:underline" onClick={() => setDateFilter('all')}>
                  Show all
                </button>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Country breakdown — click a chip to filter the queue by country */}
            {countryStats.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Requests by country
                  </p>
                  {countryFilter !== 'all' && (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => setCountryFilter('all')}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCountryFilter('all')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs border transition-colors',
                      countryFilter === 'all'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border',
                    )}
                  >
                    🌍 All · {filteredItems.length} · {fmt(queueTotalRent)}
                  </button>
                  {countryStats.map(c => (
                    <button
                      key={c.country}
                      type="button"
                      onClick={() => setCountryFilter(c.country)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs border transition-colors',
                        countryFilter === c.country
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-border',
                      )}
                    >
                      <span className="font-semibold">{c.country}</span>
                      <span className="opacity-80"> · {c.count} · {fmt(c.total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Select all + agent filter */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                Select all ({visibleItems.length}
                {agentFilter !== 'all' && items.length !== visibleItems.length
                  ? ` of ${items.length}`
                  : ''}
                )
              </label>
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <Badge className="bg-primary/10 text-primary border-primary/30">
                    {selected.size} selected · {fmt(totalRent)}
                  </Badge>
                )}
              </div>
            </div>

            {/* Revenue summary for selection */}
            {selected.size > 0 && (
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
                <p className="text-xs font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Revenue from this disbursement
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Rent Out</p>
                    <p className="font-bold text-sm text-orange-600">{fmt(totalRent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">We Earn (Fees)</p>
                    <p className="font-bold text-sm text-emerald-600">{fmt(totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total Repayment</p>
                    <p className="font-bold text-sm text-primary">{fmt(totalRepaymentExpected)}</p>
                  </div>
                </div>
                <TreasuryImpactBanner payoutAmount={totalRent} />
              </div>
            )}

            {/* Helper hint */}
            <p className="text-[11px] text-muted-foreground">
              Tip: tick one tenant, a few, or use an agent's group toggle to fund a subset. The batch button funds only what's ticked.
            </p>

            {/* Grouped list (by agent) */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {visibleGroups.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No tenants match the current filters.{' '}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => { setAgentFilter('all'); setCountryFilter('all'); setDateFilter('all'); }}
                  >
                    Clear all filters
                  </button>
                </div>
              )}
              {visibleGroups.map(group => {
                const groupIds = group.rows.map(r => r.id);
                const groupSelectedCount = groupIds.filter(id => selected.has(id)).length;
                const allGroupOn = groupSelectedCount === groupIds.length;
                const someGroupOn = groupSelectedCount > 0 && !allGroupOn;
                const groupTotal = group.rows.reduce((s, r) => s + r.rent_amount, 0);
                const isNew = Date.now() - group.latest < 24 * 60 * 60 * 1000;
                const isRealAgent = group.agent_id && group.agent_id !== 'unassigned';
                return (
                  <div key={group.agent_id} className="rounded-lg border">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 rounded-t-lg">
                      <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
                        <Checkbox
                          checked={allGroupOn ? true : someGroupOn ? 'indeterminate' : false}
                          onCheckedChange={() => toggleAgentGroup(group.rows)}
                        />
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {isRealAgent ? (
                          <button
                            type="button"
                            onClick={() => setDrilldownAgentId(group.agent_id)}
                            className="font-semibold truncate text-left hover:text-primary hover:underline focus:outline-none focus-visible:underline"
                            title="Open agent profile"
                          >
                            {group.agent_name}
                          </button>
                        ) : (
                          <span className="font-semibold truncate">{group.agent_name}</span>
                        )}
                        {isNew && (
                          <Badge className="text-[9px] px-1.5 py-0 shrink-0 bg-emerald-500 text-white border-0 animate-pulse">
                            NEW
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                          {groupSelectedCount}/{group.rows.length}
                        </Badge>
                      </div>
                      <span className="text-xs font-bold text-orange-600 shrink-0">{fmt(groupTotal)}</span>
                    </div>
                    <div className="divide-y">
                      {group.rows.map(item => (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-start gap-3 p-2.5 text-sm transition-colors',
                            selected.has(item.id) && 'bg-primary/5'
                          )}
                        >
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={() => toggle(item.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{item.tenant_name}</p>
                              <span className="text-[10px] text-muted-foreground">→</span>
                              <p className="font-medium truncate text-primary">{item.landlord_name}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.payout_target === 'landlord_wallet' ? (
                                <Badge className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">
                                  <Wallet className="h-2.5 w-2.5 mr-0.5" />
                                  Landlord Wallet
                                </Badge>
                              ) : (
                                <Badge className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                  Agent Float
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(item.created_at), 'dd MMM')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px]">
                              <span>Rent: <b className="text-orange-600">{fmt(item.rent_amount)}</b></span>
                              <span>Fees: <b className="text-emerald-600">{fmt(item.access_fee + item.request_fee)}</b></span>
                              <span>Repay: <b>{fmt(item.total_repayment)}</b></span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-xs h-7"
                            onClick={() => singleDisburse.mutate(item.id)}
                            disabled={singleDisburse.isPending}
                            title={`Fund only this tenant on ${item.agent_name}'s float`}
                          >
                            {singleDisburse.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3 mr-1" />}
                            Fund 1
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => { setRejectTarget(item); setRejectReason(''); }}
                            title="Reject and return to agent with a comment"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Input
                  placeholder="Batch ref (e.g. MoMo-2024-01)"
                  value={batchRef}
                  onChange={e => setBatchRef(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => batchDisburse.mutate()}
                  disabled={batchDisburse.isPending || !batchRef.trim()}
                >
                  {batchDisburse.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Banknote className="h-3 w-3 mr-1" />}
                  Fund {selected.size} Agent Float{selected.size === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(''); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject rent request</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Returning <b>{fmt(rejectTarget.rent_amount)}</b> for{' '}
                  <b>{rejectTarget.tenant_name}</b> → <b>{rejectTarget.landlord_name}</b> back to{' '}
                  <b>{rejectTarget.agent_name}</b>. Your comment will appear in the agent's
                  Rejected submissions.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Reason / comment (min 10 characters)</label>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Landlord MoMo number doesn't match name on record — please re-verify and resubmit."
            />
            {rejectReason.trim().length > 0 && rejectReason.trim().length < 10 && (
              <p className="text-[11px] text-destructive">
                {10 - rejectReason.trim().length} more character{10 - rejectReason.trim().length === 1 ? '' : 's'} required
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setRejectTarget(null); setRejectReason(''); }}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })}
              disabled={rejectMutation.isPending || rejectReason.trim().length < 10}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <XCircle className="h-3.5 w-3.5 mr-1" />
              )}
              Reject & return to agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UserDrilldownDrawer
        open={!!drilldownAgentId}
        onOpenChange={(v) => { if (!v) setDrilldownAgentId(null); }}
        agentId={drilldownAgentId}
        defaultTab="agent"
      />
    </Card>
  );
}
