import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Loader2, Landmark, Search, CalendarIcon, ArrowRight, Banknote, HandCoins,
  Building2, Phone, Hash, Copy, CheckCircle2, X, Clock, Bookmark, Save, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n || 0);

type EventKind = 'funding' | 'allocation' | 'payout';

interface TimelineEvent {
  id: string;
  kind: EventKind;
  at: string;                 // ISO date
  amount: number;
  agent_id: string;
  agent_name: string;
  tenant_id?: string | null;
  tenant_name?: string | null;
  landlord_name?: string | null;
  landlord_phone?: string | null;
  status: string;
  reference: string | null;   // bank TID / MoMo TID / allocation id
  reference_label: string;    // "Bank TID" / "MoMo TID" / "Allocation ID"
  source_table: string;
  notes?: string | null;
}

/**
 * Tenant Ops timeline of landlord-payout float movements.
 * Merges 3 event streams (READ-ONLY):
 *   1. CFO → agent fundings     (`agent_float_funding`, ref = bank TID)
 *   2. Per-tenant earmarks      (`agent_landlord_float_allocations`, ref = allocation UUID)
 *   3. Agent → landlord payouts (`agent_float_withdrawals`, ref = MoMo TID)
 * Filterable by date range + free-text search across reference IDs and party names.
 */
export function TenantOpsLandlordFloatTimeline() {
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [landlordFilter, setLandlordFilter] = useState<string>('all');

  // ───────────────────── Presets (localStorage) ─────────────────────
  interface Preset {
    id: string;
    name: string;
    from: string | null;   // ISO
    to: string | null;     // ISO
    search: string;
    agentFilter: string;
    tenantFilter: string;
    landlordFilter: string;
  }
  const PRESETS_KEY = 'tenant-ops-float-timeline-presets-v1';
  const ACTIVE_KEY = 'tenant-ops-float-timeline-active-preset-v1';
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [presetName, setPresetName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) setPresets(JSON.parse(raw));
      const active = localStorage.getItem(ACTIVE_KEY);
      if (active) setActivePresetId(active);
    } catch { /* ignore corrupt storage */ }
  }, []);

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch { /* quota */ }
  };

  const applyPreset = (p: Preset) => {
    setFrom(p.from ? new Date(p.from) : undefined);
    setTo(p.to ? new Date(p.to) : undefined);
    setSearch(p.search || '');
    setAgentFilter(p.agentFilter || 'all');
    setTenantFilter(p.tenantFilter || 'all');
    setLandlordFilter(p.landlordFilter || 'all');
    setActivePresetId(p.id);
    try { localStorage.setItem(ACTIVE_KEY, p.id); } catch { /* ignore */ }
    toast.success(`Loaded preset: ${p.name}`);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) { toast.error('Name required'); return; }
    const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id || `pst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const snap: Preset = {
      id,
      name,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      search,
      agentFilter,
      tenantFilter,
      landlordFilter,
    };
    const next = existing
      ? presets.map((p) => (p.id === id ? snap : p))
      : [...presets, snap];
    persistPresets(next);
    setActivePresetId(id);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
    setPresetName('');
    setSaveOpen(false);
    toast.success(existing ? `Updated preset: ${name}` : `Saved preset: ${name}`);
  };

  const deletePreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    persistPresets(presets.filter((x) => x.id !== id));
    if (activePresetId === id) {
      setActivePresetId('');
      try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
    }
    if (p) toast.success(`Deleted preset: ${p.name}`);
  };

  const hasAnyFilter =
    !!from || !!to || !!search.trim() ||
    agentFilter !== 'all' || tenantFilter !== 'all' || landlordFilter !== 'all';

  const fromIso = from ? new Date(new Date(from).setHours(0, 0, 0, 0)).toISOString() : null;
  const toIso = to ? new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString() : null;

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['tenant-ops-landlord-float-timeline', fromIso, toIso],
    queryFn: async (): Promise<TimelineEvent[]> => {
      const applyRange = (q: any, col: string) => {
        if (fromIso) q = q.gte(col, fromIso);
        if (toIso) q = q.lte(col, toIso);
        return q;
      };

      const [fundRes, allocRes, payRes] = await Promise.all([
        applyRange(
          supabase
            .from('agent_float_funding' as any)
            .select('id, agent_id, amount, created_at, bank_reference, bank_name, notes, status')
            .order('created_at', { ascending: false })
            .limit(500),
          'created_at',
        ),
        applyRange(
          supabase
            .from('agent_landlord_float_allocations' as any)
            .select('id, agent_id, tenant_id, landlord_name, landlord_phone, allocated_amount, status, created_at, notes')
            .order('created_at', { ascending: false })
            .limit(500),
          'created_at',
        ),
        applyRange(
          supabase
            .from('agent_float_withdrawals' as any)
            .select('id, agent_id, tenant_id, landlord_name, landlord_phone, amount, transaction_id, status, created_at, notes')
            .order('created_at', { ascending: false })
            .limit(500),
          'created_at',
        ),
      ]);
      if (fundRes.error) throw fundRes.error;
      if (allocRes.error) throw allocRes.error;
      if (payRes.error) throw payRes.error;

      const fundings = (fundRes.data ?? []) as any[];
      const allocs = (allocRes.data ?? []) as any[];
      const pays = (payRes.data ?? []) as any[];

      // Resolve names once
      const ids = new Set<string>();
      for (const r of fundings) if (r.agent_id) ids.add(r.agent_id);
      for (const r of allocs) {
        if (r.agent_id) ids.add(r.agent_id);
        if (r.tenant_id) ids.add(r.tenant_id);
      }
      for (const r of pays) {
        if (r.agent_id) ids.add(r.agent_id);
        if (r.tenant_id) ids.add(r.tenant_id);
      }
      const nameMap = new Map<string, string>();
      if (ids.size) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', [...ids]);
        for (const p of profs || []) nameMap.set(p.id, p.full_name || 'Unknown');
      }

      const fundingEvents: TimelineEvent[] = fundings.map((r) => ({
        id: `fund:${r.id}`,
        kind: 'funding',
        at: r.created_at,
        amount: Number(r.amount) || 0,
        agent_id: r.agent_id,
        agent_name: nameMap.get(r.agent_id) || 'Unknown Agent',
        status: r.status || 'completed',
        reference: r.bank_reference || null,
        reference_label: `Bank TID${r.bank_name ? ` · ${r.bank_name}` : ''}`,
        source_table: 'agent_float_funding',
        notes: r.notes,
      }));

      const allocationEvents: TimelineEvent[] = allocs.map((r) => ({
        id: `alloc:${r.id}`,
        kind: 'allocation',
        at: r.created_at,
        amount: Number(r.allocated_amount) || 0,
        agent_id: r.agent_id,
        agent_name: nameMap.get(r.agent_id) || 'Unknown Agent',
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_id ? nameMap.get(r.tenant_id) || 'Unknown Tenant' : null,
        landlord_name: r.landlord_name,
        landlord_phone: r.landlord_phone,
        status: r.status || 'open',
        reference: r.id,
        reference_label: 'Allocation ID',
        source_table: 'agent_landlord_float_allocations',
        notes: r.notes,
      }));

      const payoutEvents: TimelineEvent[] = pays.map((r) => ({
        id: `pay:${r.id}`,
        kind: 'payout',
        at: r.created_at,
        amount: Number(r.amount) || 0,
        agent_id: r.agent_id,
        agent_name: nameMap.get(r.agent_id) || 'Unknown Agent',
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_id ? nameMap.get(r.tenant_id) || 'Unknown Tenant' : null,
        landlord_name: r.landlord_name,
        landlord_phone: r.landlord_phone,
        status: r.status || 'pending',
        reference: r.transaction_id || null,
        reference_label: 'MoMo TID',
        source_table: 'agent_float_withdrawals',
        notes: r.notes,
      }));

      return [...fundingEvents, ...allocationEvents, ...payoutEvents].sort(
        (a, b) => +new Date(b.at) - +new Date(a.at),
      );
    },
    staleTime: 30_000,
  });

  // Build distinct option lists from the loaded events
  const { agentOptions, tenantOptions, landlordOptions } = useMemo(() => {
    const agents = new Map<string, string>();
    const tenants = new Map<string, string>();
    const landlords = new Map<string, string>(); // key = name|phone
    for (const e of events) {
      if (e.agent_id) agents.set(e.agent_id, e.agent_name || 'Unknown Agent');
      if (e.tenant_id) tenants.set(e.tenant_id, e.tenant_name || 'Unknown Tenant');
      if (e.landlord_name || e.landlord_phone) {
        const key = `${e.landlord_name || ''}|${e.landlord_phone || ''}`;
        const label = e.landlord_name
          ? `${e.landlord_name}${e.landlord_phone ? ` · ${e.landlord_phone}` : ''}`
          : (e.landlord_phone as string);
        landlords.set(key, label);
      }
    }
    const sortByLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
    return {
      agentOptions: [...agents.entries()].sort(sortByLabel),
      tenantOptions: [...tenants.entries()].sort(sortByLabel),
      landlordOptions: [...landlords.entries()].sort(sortByLabel),
    };
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (agentFilter !== 'all' && e.agent_id !== agentFilter) return false;
      if (tenantFilter !== 'all' && e.tenant_id !== tenantFilter) return false;
      if (landlordFilter !== 'all') {
        const key = `${e.landlord_name || ''}|${e.landlord_phone || ''}`;
        if (key !== landlordFilter) return false;
      }
      if (!q) return true;
      return [
        e.reference,
        e.agent_name,
        e.tenant_name,
        e.landlord_name,
        e.landlord_phone,
        e.status,
        e.kind,
        e.notes,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [events, search, agentFilter, tenantFilter, landlordFilter]);

  // Group by calendar day
  const grouped = useMemo(() => {
    const m = new Map<string, TimelineEvent[]>();
    for (const e of filtered) {
      const day = format(new Date(e.at), 'yyyy-MM-dd');
      const arr = m.get(day) || [];
      arr.push(e);
      m.set(day, arr);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const totals = useMemo(() => {
    let funded = 0, allocated = 0, paid = 0;
    for (const e of filtered) {
      if (e.kind === 'funding') funded += e.amount;
      else if (e.kind === 'allocation') allocated += e.amount;
      else if (e.kind === 'payout') paid += e.amount;
    }
    return { funded, allocated, paid, count: filtered.length };
  }, [filtered]);

  const copyRef = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      toast.success('Reference copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const kindMeta: Record<EventKind, { label: string; icon: React.ElementType; color: string; dot: string }> = {
    funding:    { label: 'CFO Funding',          icon: Banknote,  color: 'bg-blue-100 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
    allocation: { label: 'Tenant Earmark',       icon: Building2, color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200', dot: 'bg-fuchsia-500' },
    payout:     { label: 'Landlord Payout',      icon: HandCoins, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[#9234EA]" />
          Landlord Float Allocation Timeline
          {filtered.length > 0 && (
            <Badge variant="outline" className="text-[10px] ml-1 bg-[#9234EA]/10 text-[#9234EA] border-[#9234EA]/30">
              {totals.count} events
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Full audit trail: CFO fundings → per-tenant earmarks → agent MoMo payouts. Filter by date and search by reference ID (Bank TID, MoMo TID, allocation UUID) or party name.
        </p>
      </CardHeader>
      <CardContent>
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by TID, allocation ID, agent, tenant, landlord…"
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 gap-2', !from && 'text-muted-foreground')}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {from ? format(from, 'dd MMM yy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 gap-2', !to && 'text-muted-foreground')}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {to ? format(to, 'dd MMM yy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={to} onSelect={setTo} initialFocus />
            </PopoverContent>
          </Popover>
          {(from || to) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFrom(undefined); setTo(undefined); }}>
              Clear dates
            </Button>
          )}
        </div>

        {/* Presets bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border border-dashed border-[#9234EA]/30 bg-[#9234EA]/5 p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9234EA] uppercase tracking-wider px-1">
            <Bookmark className="h-3.5 w-3.5" />
            Presets
          </div>
          {presets.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic">No presets yet — set some filters and save.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    'group inline-flex items-center gap-1 rounded-full border bg-background text-xs pl-2.5 pr-1 py-0.5 transition',
                    activePresetId === p.id
                      ? 'border-[#9234EA] ring-1 ring-[#9234EA]/40 text-[#9234EA] font-semibold'
                      : 'border-border hover:border-[#9234EA]/50',
                  )}
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => applyPreset(p)}
                    title="Apply preset"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(p.id)}
                    className="ml-1 rounded-full p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Delete preset ${p.name}`}
                    title="Delete preset"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Popover open={saveOpen} onOpenChange={setSaveOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={!hasAnyFilter}
                  title={hasAnyFilter ? 'Save current filters as preset' : 'Set at least one filter first'}
                >
                  <Save className="h-3 w-3" /> Save current
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <p className="text-xs font-semibold mb-1.5">Save filter preset</p>
                <Input
                  autoFocus
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); }}
                  placeholder="e.g. Kampala overdue"
                  className="h-8 text-xs"
                />
                <div className="flex justify-end gap-1.5 mt-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSaveOpen(false); setPresetName(''); }}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={savePreset}>
                    Save
                  </Button>
                </div>
                {presets.some((p) => p.name.toLowerCase() === presetName.trim().toLowerCase()) && presetName.trim() && (
                  <p className="text-[10px] text-amber-600 mt-1.5">Existing preset with this name will be overwritten.</p>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Party filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">All agents ({agentOptions.length})</SelectItem>
              {agentOptions.map(([id, label]) => (
                <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs">
              <SelectValue placeholder="Tenant" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">All tenants ({tenantOptions.length})</SelectItem>
              {tenantOptions.map(([id, label]) => (
                <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={landlordFilter} onValueChange={setLandlordFilter}>
            <SelectTrigger className="h-9 w-[220px] text-xs">
              <SelectValue placeholder="Landlord" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">All landlords ({landlordOptions.length})</SelectItem>
              {landlordOptions.map(([key, label]) => (
                <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(agentFilter !== 'all' || tenantFilter !== 'all' || landlordFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => { setAgentFilter('all'); setTenantFilter('all'); setLandlordFilter('all'); }}
            >
              Clear party filters
            </Button>
          )}
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border-2 border-[#9234EA]/20 bg-[#9234EA]/5 p-3 text-center mb-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CFO Funded</p>
            <p className="font-bold text-sm text-blue-600">{fmt(totals.funded)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Earmarked</p>
            <p className="font-bold text-sm text-fuchsia-600">{fmt(totals.allocated)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paid to Landlords</p>
            <p className="font-bold text-sm text-emerald-600">{fmt(totals.paid)}</p>
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
            <p className="font-medium">No movements match your filters</p>
            <p className="text-xs">Adjust the date range or clear the search.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
            {grouped.map(([day, dayEvents]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-1 mb-2 border-b">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
                    <CalendarIcon className="h-3 w-3" />
                    {format(new Date(day), 'EEEE, dd MMM yyyy')}
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{dayEvents.length}</Badge>
                  </p>
                </div>
                <ol className="relative border-l border-dashed border-muted ml-2 space-y-3">
                  {dayEvents.map((e) => {
                    const meta = kindMeta[e.kind];
                    const Icon = meta.icon;
                    return (
                      <li key={e.id} className="ml-4">
                        <span className={cn('absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-4 ring-background', meta.dot)} />
                        <div className="rounded-lg border p-2.5 bg-card">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className={cn('p-1.5 rounded-md border', meta.color)}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', meta.color)}>{meta.label}</Badge>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                    <Clock className="h-2.5 w-2.5 mr-1" />
                                    {format(new Date(e.at), 'HH:mm')}
                                  </Badge>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">{e.status}</Badge>
                                </div>
                                <p className="text-sm font-medium mt-1 truncate">
                                  {e.kind === 'funding'
                                    ? <>CFO funded <span className="text-[#9234EA]">{e.agent_name}</span></>
                                    : e.kind === 'allocation'
                                    ? <><span className="text-[#9234EA]">{e.agent_name}</span> earmarked for {e.tenant_name || 'tenant'} → <span className="text-fuchsia-600">{e.landlord_name || 'landlord'}</span></>
                                    : <><span className="text-[#9234EA]">{e.agent_name}</span> paid {e.tenant_name || 'tenant'}'s landlord <span className="text-emerald-600">{e.landlord_name || ''}</span></>}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap mt-1 text-[10px] text-muted-foreground">
                                  {e.landlord_phone && (
                                    <span className="inline-flex items-center gap-1">
                                      <Phone className="h-2.5 w-2.5" />{e.landlord_phone}
                                    </span>
                                  )}
                                  {e.reference && (
                                    <span className="inline-flex items-center gap-1">
                                      <Hash className="h-2.5 w-2.5" />
                                      <span className="font-mono">{e.reference_label}: {e.reference.length > 24 ? e.reference.slice(0, 8) + '…' + e.reference.slice(-6) : e.reference}</span>
                                      <button
                                        onClick={() => copyRef(e.reference as string)}
                                        className="hover:text-foreground"
                                        aria-label="Copy reference"
                                      >
                                        <Copy className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  )}
                                  <span className="text-muted-foreground/70">{e.source_table}</span>
                                </div>
                                {e.notes && (
                                  <p className="text-[10px] text-muted-foreground italic mt-1 line-clamp-2">{e.notes}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-sm">{fmt(e.amount)}</p>
                              {e.kind !== 'funding' && (
                                <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-end">
                                  <ArrowRight className="h-2.5 w-2.5" />
                                  {e.kind === 'allocation' ? 'earmarked' : 'disbursed'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}