import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  Loader2, Landmark, Search, CalendarIcon, ArrowRight, Banknote, HandCoins,
  Building2, Phone, Hash, Copy, CheckCircle2, X, Clock
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [
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
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [events, search]);

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