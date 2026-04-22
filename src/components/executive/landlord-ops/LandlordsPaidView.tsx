import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Loader2, Banknote, Search, CheckCircle2, Clock, ChevronRight,
  Phone, Users, CalendarClock, User,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer';

type Period = 'all' | '30d' | '7d' | 'today';
type ConfFilter = 'all' | 'confirmed' | 'pending';
type Tab = 'paid' | 'due_today';

const PAID_STATUSES = ['funded', 'disbursed', 'repaying', 'completed'] as const;
const DUE_STATUSES = ['coo_approved'] as const;

interface DisbursementRow {
  id: string;
  amount: number;
  disbursed_at: string;
  payout_method: string;
  transaction_reference: string | null;
  agent_confirmed: boolean | null;
  landlord_id: string | null;
  landlord: { id: string; name: string; phone: string | null; mobile_money_number: string | null } | null;
  delivery: any | null;
  source: 'disbursement' | 'rent_request';
  status: string;
}

interface LandlordGroup {
  landlord_id: string;
  name: string;
  phone: string | null;
  mobile_money_number: string | null;
  total: number;
  count: number;
  confirmedCount: number;
  pendingCount: number;
  lastPaidAt: string;
  records: DisbursementRow[];
}

function periodCutoff(p: Period): Date | null {
  const now = new Date();
  if (p === 'all') return null;
  if (p === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
  if (p === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (p === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  return null;
}

export function LandlordsPaidView() {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [confFilter, setConfFilter] = useState<ConfFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>('paid');

  const { data, isLoading } = useQuery({
    queryKey: ['landlord-ops-paid-landlords-v2'],
    queryFn: async () => {
      // 1. Disbursement records (authoritative for landlords actually paid via CFO)
      const { data: disb, error: dErr } = await supabase
        .from('disbursement_records')
        .select('id, amount, disbursed_at, payout_method, transaction_reference, agent_confirmed, landlord_id, rent_request_id')
        .order('disbursed_at', { ascending: false });
      if (dErr) throw dErr;

      // 2. Rent requests (paid + due-today statuses) — paginated to bypass 1000-row limit
      const PAGE = 1000;
      const allRR: any[] = [];
      let offset = 0;
      let more = true;
      const allStatuses = [...PAID_STATUSES, ...DUE_STATUSES];
      while (more) {
        const { data: rrs, error } = await supabase
          .from('rent_requests')
          .select('id, landlord_id, rent_amount, status, funded_at, disbursed_at, updated_at, created_at')
          .in('status', allStatuses as any)
          .order('updated_at', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (rrs && rrs.length > 0) {
          allRR.push(...rrs);
          offset += PAGE;
          more = rrs.length === PAGE;
        } else {
          more = false;
        }
      }

      // 3. Lookup landlords for both sources
      const landlordIds = Array.from(new Set([
        ...((disb || []).map(d => d.landlord_id).filter(Boolean) as string[]),
        ...(allRR.map(r => r.landlord_id).filter(Boolean) as string[]),
      ]));
      const landlordMap = new Map<string, { id: string; name: string; phone: string | null; mobile_money_number: string | null }>();
      for (let i = 0; i < landlordIds.length; i += 200) {
        const { data: ll } = await supabase
          .from('landlords')
          .select('id, name, phone, mobile_money_number')
          .in('id', landlordIds.slice(i, i + 200));
        for (const l of ll || []) landlordMap.set(l.id, l);
      }

      // 4. Delivery confirmations for disbursement rows
      const ids = (disb || []).map(d => d.id);
      const confMap = new Map<string, any>();
      if (ids.length > 0) {
        for (let i = 0; i < ids.length; i += 200) {
          const { data: confs } = await supabase
            .from('agent_delivery_confirmations')
            .select('*')
            .in('disbursement_id', ids.slice(i, i + 200));
          for (const c of confs || []) confMap.set(c.disbursement_id, c);
        }
      }

      // 5. Merge — use disbursement_records when available, otherwise synthesize from rent_requests
      const disbursedRRIds = new Set((disb || []).map(d => d.rent_request_id).filter(Boolean));
      const merged: DisbursementRow[] = [];

      for (const d of disb || []) {
        merged.push({
          ...d,
          landlord: d.landlord_id ? (landlordMap.get(d.landlord_id) || null) : null,
          delivery: confMap.get(d.id) || null,
          source: 'disbursement',
          status: 'paid',
        });
      }

      // For rent_requests not yet in disbursement_records, synthesize a row
      for (const r of allRR) {
        if (disbursedRRIds.has(r.id)) continue; // already covered by disbursement_records
        const isPaid = (PAID_STATUSES as readonly string[]).includes(r.status);
        const paidAt = r.disbursed_at || r.funded_at || r.updated_at || r.created_at;
        merged.push({
          id: `rr-${r.id}`,
          amount: Number(r.rent_amount || 0),
          disbursed_at: paidAt,
          payout_method: 'rent_pipeline',
          transaction_reference: null,
          agent_confirmed: null,
          landlord_id: r.landlord_id,
          landlord: r.landlord_id ? (landlordMap.get(r.landlord_id) || null) : null,
          delivery: null,
          source: 'rent_request',
          status: isPaid ? 'paid' : 'due_today',
        });
      }

      return merged;
    },
    staleTime: 60_000,
  });

  const records = data || [];

  // Tab split: paid vs due_today
  const tabRecords = useMemo(
    () => records.filter(r => (tab === 'paid' ? r.status === 'paid' : r.status === 'due_today')),
    [records, tab]
  );

  // Apply period filter to underlying records
  const cutoff = periodCutoff(period);
  const periodRecords = useMemo(
    () => cutoff ? tabRecords.filter(r => new Date(r.disbursed_at) >= cutoff) : tabRecords,
    [tabRecords, cutoff]
  );

  // Group by landlord
  const groups: LandlordGroup[] = useMemo(() => {
    const map = new Map<string, LandlordGroup>();
    for (const r of periodRecords) {
      if (!r.landlord_id) continue;
      const key = r.landlord_id;
      let g = map.get(key);
      if (!g) {
        g = {
          landlord_id: r.landlord_id,
          name: r.landlord?.name || 'Unknown Landlord',
          phone: r.landlord?.phone || null,
          mobile_money_number: r.landlord?.mobile_money_number || null,
          total: 0,
          count: 0,
          confirmedCount: 0,
          pendingCount: 0,
          lastPaidAt: r.disbursed_at,
          records: [],
        };
        map.set(key, g);
      }
      g.total += Number(r.amount);
      g.count += 1;
      if (r.source === 'disbursement' && r.agent_confirmed) g.confirmedCount += 1;
      else g.pendingCount += 1;
      if (new Date(r.disbursed_at) > new Date(g.lastPaidAt)) g.lastPaidAt = r.disbursed_at;
      g.records.push(r);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.lastPaidAt).getTime() - new Date(a.lastPaidAt).getTime());
  }, [periodRecords]);

  // Filter by search + confirmation
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter(g => {
      if (confFilter === 'confirmed' && g.pendingCount > 0) return false;
      if (confFilter === 'pending' && g.pendingCount === 0) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        (g.phone || '').toLowerCase().includes(q) ||
        (g.mobile_money_number || '').toLowerCase().includes(q)
      );
    });
  }, [groups, search, confFilter]);

  // KPIs (over period-filtered, pre-search)
  const totalPaid = periodRecords.reduce((s, r) => s + Number(r.amount), 0);
  const landlordsPaidCount = groups.length;
  const last30 = useMemo(() => {
    const cut = periodCutoff('30d')!;
    const paidOnly = records.filter(r => r.status === 'paid');
    const arr = paidOnly.filter(r => new Date(r.disbursed_at) >= cut);
    return { total: arr.reduce((s, r) => s + Number(r.amount), 0), count: arr.length };
  }, [records]);

  const dueTodayCount = useMemo(
    () => new Set(records.filter(r => r.status === 'due_today').map(r => r.landlord_id)).size,
    [records]
  );
  const paidLandlordsTotal = useMemo(
    () => new Set(records.filter(r => r.status === 'paid').map(r => r.landlord_id)).size,
    [records]
  );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Banknote className="h-5 w-5 text-emerald-600" />
        Landlords {tab === 'paid' ? 'Paid' : 'Due Today'} ({landlordsPaidCount})
      </h2>

      {/* Tabs: Paid vs Due Today */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        <Button
          size="sm"
          variant={tab === 'paid' ? 'default' : 'ghost'}
          onClick={() => setTab('paid')}
          className="flex-1 text-xs h-9 gap-1.5"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Already Paid
          <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{paidLandlordsTotal}</Badge>
        </Button>
        <Button
          size="sm"
          variant={tab === 'due_today' ? 'default' : 'ghost'}
          onClick={() => setTab('due_today')}
          className="flex-1 text-xs h-9 gap-1.5"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Due Today
          <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{dueTodayCount}</Badge>
        </Button>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tab === 'paid' ? 'Total Paid Out' : 'Total Due Today'}</p>
            <p className="text-base font-bold font-mono mt-1">{formatUGX(totalPaid)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{periodRecords.length} {tab === 'paid' ? 'disbursements' : 'pending payouts'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tab === 'paid' ? 'Landlords Paid' : 'Landlords Awaiting'}</p>
            <p className="text-base font-bold mt-1 flex items-center gap-1"><Users className="h-3.5 w-3.5 text-sky-600" />{landlordsPaidCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{period === 'all' ? 'all time' : `last ${period}`}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid · Last 30 days</p>
            <p className="text-base font-bold font-mono mt-1">{formatUGX(last30.total)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{last30.count} disbursements</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(['all', '30d', '7d', 'today'] as Period[]).map(p => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'default' : 'outline'}
              onClick={() => setPeriod(p)}
              className="text-xs h-8 shrink-0"
            >
              {p === 'all' ? 'All time' : p === '30d' ? '30 days' : p === '7d' ? '7 days' : 'Today'}
            </Button>
          ))}
          <div className="w-px bg-border mx-1 shrink-0" />
          {(['all', 'confirmed', 'pending'] as ConfFilter[]).map(c => (
            <Button
              key={c}
              size="sm"
              variant={confFilter === c ? 'default' : 'outline'}
              onClick={() => setConfFilter(c)}
              className="text-xs h-8 shrink-0"
            >
              {c === 'all' ? 'All' : c === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No landlord payments found for these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(g => {
            const isOpen = !!expanded[g.landlord_id];
            return (
              <Card key={g.landlord_id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(s => ({ ...s, [g.landlord_id]: !s[g.landlord_id] }))}
                  className="w-full text-left p-3 active:bg-muted/50 transition-colors min-h-[64px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{g.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {g.phone && (
                          <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{g.phone}</span>
                        )}
                        <span>· {tab === 'paid' ? 'Last paid' : 'Due'} {format(new Date(g.lastPaidAt), 'dd MMM yyyy')}</span>
                        <span className="opacity-70">({formatDistanceToNow(new Date(g.lastPaidAt), { addSuffix: true })})</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold font-mono text-sm">{formatUGX(g.total)}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {g.confirmedCount > 0 && (
                          <Badge className="bg-success/10 text-success border-success/30 text-[10px] px-1.5 py-0 h-4">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{g.confirmedCount}
                          </Badge>
                        )}
                        {g.pendingCount > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />{g.pendingCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                    <span>{g.count} {tab === 'paid' ? 'disbursement' : 'pending payout'}{g.count === 1 ? '' : 's'}</span>
                    {isOpen
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-3 space-y-2">
                    {g.records.map(r => (
                      <div key={r.id} className="border rounded-lg p-2.5 bg-background space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold font-mono text-sm">{formatUGX(Number(r.amount))}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(r.disbursed_at), 'dd MMM yyyy · HH:mm')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">{r.payout_method}</Badge>
                            {r.agent_confirmed ? (
                              <Badge className="bg-success/10 text-success border-success/30 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" />Confirmed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                <Clock className="h-3 w-3 mr-0.5" />Pending
                              </Badge>
                            )}
                          </div>
                        </div>
                        {r.transaction_reference && (
                          <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                            <Receipt className="h-3 w-3" />Ref: {r.transaction_reference}
                          </p>
                        )}
                        {r.delivery && (
                          <div className="bg-success/5 rounded p-2 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-success">Agent Receipt Collected</p>
                            {r.delivery.latitude && (
                              <a
                                href={`https://www.google.com/maps?q=${r.delivery.latitude},${r.delivery.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-primary flex items-center gap-1 w-fit"
                              >
                                <MapPin className="h-3 w-3" />GPS Verified <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {r.delivery.photo_urls?.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Camera className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">{r.delivery.photo_urls.length} photo(s)</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}