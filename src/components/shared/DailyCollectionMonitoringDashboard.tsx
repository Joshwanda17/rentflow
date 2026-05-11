import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatUGX } from '@/lib/rentCalculations';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Users, CheckCircle2, Banknote, CalendarDays, Building, Trophy, AlertTriangle,
  TrendingUp, TrendingDown, Loader2, Wallet, Filter, CalendarIcon, X,
} from 'lucide-react';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  subDays, format, eachDayOfInterval, isSameDay,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

type Mode = 'editable' | 'readonly';
type Range = 'today' | 'week' | 'month';

interface Props {
  mode: Mode;
  title?: string;
}

interface RentRequestRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  landlord_id: string | null;
  daily_repayment: number;
  rent_amount: number;
  total_repayment: number;
  amount_repaid: number;
  status: string;
  house_category: string | null;
}

interface CollectionRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

interface TenantTrackerRow {
  rentRequestId: string;
  date: string;
  tenantId: string;
  tenantName: string;
  agentId: string | null;
  agentName: string;
  property: string;
  expected: number;
  collected: number;
  balance: number;
  status: 'paid' | 'partial' | 'missed';
  paymentMethod: string;
  remarks: string;
}

const DONUT_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))'];

function statusBadge(status: 'paid' | 'partial' | 'missed') {
  if (status === 'paid') return <Badge className="bg-success text-success-foreground hover:bg-success/90">Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">Partial</Badge>;
  return <Badge variant="destructive">Missed</Badge>;
}

function methodLabel(m: string) {
  const map: Record<string, string> = {
    cash: 'Cash',
    mobile_money: 'MoMo',
    mobile_money_mtn: 'MTN MoMo',
    mobile_money_airtel: 'Airtel Money',
    bank: 'Bank',
    wallet: 'Wallet',
  };
  return map[m] || (m ? m.replace(/_/g, ' ') : '—');
}

export default function DailyCollectionMonitoringDashboard({ mode, title }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [day, setDay] = useState<Date>(new Date());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordRow, setRecordRow] = useState<TenantTrackerRow | null>(null);
  const [recordAmount, setRecordAmount] = useState('');
  const [recordMethod, setRecordMethod] = useState<string>('cash');
  const [recordRemarks, setRecordRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Range -> [from, to]
  const [rangeFrom, rangeTo] = useMemo(() => {
    if (range === 'today') return [startOfDay(day), endOfDay(day)];
    if (range === 'week') return [startOfWeek(day, { weekStartsOn: 1 }), endOfWeek(day, { weekStartsOn: 1 })];
    return [startOfMonth(day), endOfMonth(day)];
  }, [range, day]);

  const monthFrom = startOfMonth(day);
  const monthTo = endOfMonth(day);
  const prevDay = subDays(day, 1);
  const [prevFrom, prevTo] = [startOfDay(prevDay), endOfDay(prevDay)];

  // ---- Active rent_requests (the universe of "expected daily payment")
  const { data: rentReqs, isLoading: loadingReqs } = useQuery({
    queryKey: ['daily-collection-rent-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, agent_id, landlord_id, daily_repayment, rent_amount, total_repayment, amount_repaid, status, house_category, created_at')
        .in('status', ['funded', 'disbursed', 'repaying'])
        .limit(1000);
      if (error) throw error;
      return (data || []) as RentRequestRow[];
    },
    staleTime: 60_000,
  });

  // ---- Collections in selected range
  const { data: collections, isLoading: loadingCollections, refetch: refetchCollections } = useQuery({
    queryKey: ['daily-collection-collections', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_collections')
        .select('id, tenant_id, agent_id, amount, payment_method, notes, created_at')
        .gte('created_at', rangeFrom.toISOString())
        .lte('created_at', rangeTo.toISOString())
        .limit(1000);
      if (error) throw error;
      return (data || []) as CollectionRow[];
    },
    staleTime: 30_000,
  });

  // ---- Comparison: yesterday collections sum (for today card delta)
  const { data: prevCollections } = useQuery({
    queryKey: ['daily-collection-prev', prevFrom.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_collections')
        .select('amount, tenant_id')
        .gte('created_at', prevFrom.toISOString())
        .lte('created_at', prevTo.toISOString())
        .limit(1000);
      return (data || []) as { amount: number; tenant_id: string }[];
    },
    staleTime: 60_000,
  });

  // ---- Month collections (for month KPI + trend)
  const { data: monthCollections } = useQuery({
    queryKey: ['daily-collection-month', monthFrom.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_collections')
        .select('amount, created_at')
        .gte('created_at', monthFrom.toISOString())
        .lte('created_at', monthTo.toISOString())
        .limit(2000);
      return (data || []) as { amount: number; created_at: string }[];
    },
    staleTime: 60_000,
  });

  // ---- All-time totals (cheap aggregate: amount_repaid sum across active+repaid requests)
  const { data: allTimeStats } = useQuery({
    queryKey: ['daily-collection-alltime'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rent_requests')
        .select('amount_repaid')
        .in('status', ['funded', 'disbursed', 'repaying', 'fully_repaid'])
        .limit(5000);
      const totalPaid = (data || []).reduce((s, r: any) => s + Number(r.amount_repaid || 0), 0);
      return { totalPaid };
    },
    staleTime: 5 * 60_000,
  });

  // ---- Tenants onboarded today (referrals created within range)
  const { data: onboardedToday } = useQuery({
    queryKey: ['daily-collection-onboarded', rangeFrom.toISOString()],
    queryFn: async () => {
      const { count: today } = await supabase
        .from('rent_requests')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', rangeFrom.toISOString())
        .lte('created_at', rangeTo.toISOString());
      const { count: yest } = await supabase
        .from('rent_requests')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevFrom.toISOString())
        .lte('created_at', prevTo.toISOString());
      return { today: today || 0, yest: yest || 0 };
    },
    staleTime: 60_000,
  });

  // Resolve agent + tenant + landlord names
  const ids = useMemo(() => {
    const set = new Set<string>();
    (rentReqs || []).forEach(r => {
      set.add(r.tenant_id);
      if (r.agent_id) set.add(r.agent_id);
      if (r.landlord_id) set.add(r.landlord_id);
    });
    (collections || []).forEach(c => {
      if (c.agent_id) set.add(c.agent_id);
      set.add(c.tenant_id);
    });
    return Array.from(set);
  }, [rentReqs, collections]);

  const { data: profiles } = useQuery({
    queryKey: ['daily-collection-profiles', ids.length],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids);
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    staleTime: 5 * 60_000,
  });

  // Build the tracker rows: one row per active rent_request for the selected day
  const trackerRows: TenantTrackerRow[] = useMemo(() => {
    if (!rentReqs) return [];
    // For "today" range, treat date as `day`. For week/month, expected is per-day * days_in_range — but we
    // keep the tracker focused on a single day to match the user's mock; range affects KPIs/charts.
    const target = day;
    const collectionsByTenant = new Map<string, CollectionRow[]>();
    (collections || []).forEach(c => {
      // count only collections on the target day for the row's "Collected" column
      if (!isSameDay(new Date(c.created_at), target)) return;
      const arr = collectionsByTenant.get(c.tenant_id) || [];
      arr.push(c);
      collectionsByTenant.set(c.tenant_id, arr);
    });

    const targetEnd = endOfDay(target);
    const activeForDay = (rentReqs || []).filter((r: any) => {
      // Only include rent requests that already existed on/before the selected day.
      if (!r.created_at) return true;
      return new Date(r.created_at) <= targetEnd;
    });
    const rows: TenantTrackerRow[] = activeForDay.map(r => {
      const tenantName = profiles?.get(r.tenant_id)?.full_name || 'Unknown';
      const agentName = r.agent_id ? (profiles?.get(r.agent_id)?.full_name || '—') : '—';
      const landlordName = r.landlord_id ? (profiles?.get(r.landlord_id)?.full_name || '') : '';
      const property = [r.house_category, landlordName].filter(Boolean).join(' / ') || '—';
      const expected = Number(r.daily_repayment || 0);
      const tenantCollections = collectionsByTenant.get(r.tenant_id) || [];
      const collected = tenantCollections.reduce((s, c) => s + Number(c.amount || 0), 0);
      const balance = Math.max(0, expected - collected);
      const status: TenantTrackerRow['status'] =
        collected <= 0 ? 'missed' : balance <= 0 ? 'paid' : 'partial';
      const last = tenantCollections[tenantCollections.length - 1];
      return {
        rentRequestId: r.id,
        date: format(target, 'dd MMM yyyy'),
        tenantId: r.tenant_id,
        tenantName,
        agentId: r.agent_id,
        agentName,
        property,
        expected,
        collected,
        balance,
        status,
        paymentMethod: last ? methodLabel(last.payment_method) : '—',
        remarks: last?.notes || (status === 'paid' ? 'Paid in full' : status === 'partial' ? 'Part payment' : 'Not paid'),
      };
    });
    return rows;
  }, [rentReqs, collections, profiles, day]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return trackerRows.filter(r => {
      if (agentFilter !== 'all' && r.agentId !== agentFilter) return false;
      if (propertyFilter !== 'all' && r.property !== propertyFilter) return false;
      return true;
    });
  }, [trackerRows, agentFilter, propertyFilter]);

  // Daily totals
  const totals = useMemo(() => {
    const expected = filteredRows.reduce((s, r) => s + r.expected, 0);
    const collected = filteredRows.reduce((s, r) => s + r.collected, 0);
    const outstanding = Math.max(0, expected - collected);
    return { expected, collected, outstanding };
  }, [filteredRows]);

  // KPIs
  const collectionToday = (collections || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const collectionPrev = (prevCollections || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const collectionMonth = (monthCollections || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const tenantsPaid = new Set(
    (collections || []).filter(c => isSameDay(new Date(c.created_at), day)).map(c => c.tenant_id)
  ).size;
  const tenantsPaidPrev = new Set((prevCollections || []).map(c => c.tenant_id)).size;

  // Agent summary
  const agentSummary = useMemo(() => {
    const byAgent = new Map<string, {
      agentId: string; name: string; tenants: Set<string>; tenantsPaid: Set<string>;
      expected: number; collected: number;
    }>();
    for (const r of filteredRows) {
      const key = r.agentId || 'unassigned';
      const existing = byAgent.get(key) || {
        agentId: key, name: r.agentName === '—' ? 'Unassigned' : r.agentName,
        tenants: new Set<string>(), tenantsPaid: new Set<string>(),
        expected: 0, collected: 0,
      };
      existing.tenants.add(r.tenantId);
      if (r.collected > 0) existing.tenantsPaid.add(r.tenantId);
      existing.expected += r.expected;
      existing.collected += r.collected;
      byAgent.set(key, existing);
    }
    return Array.from(byAgent.values()).map(a => {
      const rate = a.expected > 0 ? Math.round((a.collected / a.expected) * 100) : 0;
      return {
        ...a,
        tenantCount: a.tenants.size,
        paidCount: a.tenantsPaid.size,
        balance: Math.max(0, a.expected - a.collected),
        rate,
        status: rate >= 70 ? 'good' as const : 'at_risk' as const,
      };
    }).sort((a, b) => b.collected - a.collected);
  }, [filteredRows]);

  const topAgent = agentSummary[0];
  const bottomAgent = agentSummary.length > 1 ? agentSummary[agentSummary.length - 1] : undefined;

  // Donut data
  const donutData = [
    { name: 'Collected', value: totals.collected },
    { name: 'Outstanding', value: totals.outstanding },
  ];
  const collectedPct = totals.expected > 0 ? Math.round((totals.collected / totals.expected) * 100) : 0;

  // Monthly trend (cumulative)
  const monthTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: monthFrom, end: monthTo });
    let cum = 0;
    return days.map(d => {
      const sumDay = (monthCollections || []).filter(c => isSameDay(new Date(c.created_at), d))
        .reduce((s, c) => s + Number(c.amount || 0), 0);
      cum += sumDay;
      return { date: format(d, 'dd MMM'), value: cum };
    });
  }, [monthCollections, monthFrom, monthTo]);

  // Unique values for filters
  const agentOptions = useMemo(() => {
    const m = new Map<string, string>();
    trackerRows.forEach(r => { if (r.agentId) m.set(r.agentId, r.agentName); });
    return Array.from(m.entries());
  }, [trackerRows]);

  const propertyOptions = useMemo(() => {
    const set = new Set<string>();
    trackerRows.forEach(r => { if (r.property && r.property !== '—') set.add(r.property); });
    return Array.from(set);
  }, [trackerRows]);

  const isLoading = loadingReqs || loadingCollections;

  // Record payment (Tenant Ops only)
  const openRecord = (row: TenantTrackerRow) => {
    setRecordRow(row);
    setRecordAmount(String(Math.max(0, row.balance || row.expected)));
    setRecordMethod('cash');
    setRecordRemarks('');
    setRecordOpen(true);
  };

  const submitRecord = async () => {
    if (!recordRow) return;
    const amt = Number(recordAmount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!user?.id) {
      toast.error('Not authenticated');
      return;
    }
    setSubmitting(true);
    try {
      // Tenant Ops staff records on behalf — agent_id = the tenant's assigned agent if known,
      // otherwise the staff user's id (so the row stays valid). We log a remark to make it auditable.
      const agentId = recordRow.agentId || user.id;
      const { error } = await supabase.from('agent_collections').insert({
        agent_id: agentId,
        tenant_id: recordRow.tenantId,
        amount: amt,
        payment_method: recordMethod,
        notes: `[Tenant Ops entry by ${user.email || user.id}] ${recordRemarks}`.trim(),
        float_before: 0,
        float_after: 0,
      } as any);
      if (error) throw error;
      toast.success('Payment recorded');
      setRecordOpen(false);
      await refetchCollections();
      queryClient.invalidateQueries({ queryKey: ['daily-collection-prev'] });
      queryClient.invalidateQueries({ queryKey: ['daily-collection-month'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const delta = (cur: number, prev: number) => {
    const diff = cur - prev;
    const sign = diff > 0 ? '+' : '';
    return { text: `${sign}${formatUGX(diff)} vs yesterday`, positive: diff >= 0 };
  };
  const deltaCount = (cur: number, prev: number) => {
    const diff = cur - prev;
    const sign = diff > 0 ? '+' : '';
    return { text: `${sign}${diff} vs yesterday`, positive: diff >= 0 };
  };

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground">Track daily collections from tenants — UGX</p>
          </div>
        </div>
      )}

      {/* Range + day controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList className="h-8">
            <TabsTrigger value="today" className="text-xs px-2.5">Today</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-2.5">Weekly</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-2.5">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(day, 'dd MMM yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={day} onSelect={(d) => d && setDay(d)} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <KpiCard
          label="Tenants Onboarded (Today)"
          value={String(onboardedToday?.today ?? 0)}
          delta={deltaCount(onboardedToday?.today || 0, onboardedToday?.yest || 0)}
          icon={Users}
          color="text-primary bg-primary/10"
        />
        <KpiCard
          label="Tenants Paid For (Today)"
          value={String(tenantsPaid)}
          delta={deltaCount(tenantsPaid, tenantsPaidPrev)}
          icon={CheckCircle2}
          color="text-success bg-success/10"
        />
        <KpiCard
          label="Collection Today (UGX)"
          value={formatUGX(collectionToday)}
          delta={delta(collectionToday, collectionPrev)}
          icon={Banknote}
          color="text-primary bg-primary/10"
        />
        <KpiCard
          label="Collection This Month"
          value={formatUGX(collectionMonth)}
          icon={CalendarDays}
          color="text-warning bg-warning/10"
          subtitle="MTD Collection"
        />
        <KpiCard
          label="Total Rent Paid (All Time)"
          value={formatUGX(allTimeStats?.totalPaid || 0)}
          icon={Building}
          color="text-primary bg-primary/10"
          subtitle="Total to date"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filters:
          </div>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agentOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Property / Landlord" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {propertyOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(agentFilter !== 'all' || propertyFilter !== 'all') && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAgentFilter('all'); setPropertyFilter('all'); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
          <div className="ml-auto text-[11px] text-muted-foreground">
            {filteredRows.length} active rent plans
          </div>
        </CardContent>
      </Card>

      {/* Tracker Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Tenant Daily Collection Tracker — {format(day, 'dd MMM yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filteredRows.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted-foreground">No active rent plans match the filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Agent</TableHead>
                    <TableHead className="text-xs">Tenant</TableHead>
                    <TableHead className="text-xs">Property / Landlord</TableHead>
                    <TableHead className="text-xs text-right">Expected</TableHead>
                    <TableHead className="text-xs text-right">Collected</TableHead>
                    <TableHead className="text-xs text-right">Balance</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Method</TableHead>
                    <TableHead className="text-xs">Remarks</TableHead>
                    {mode === 'editable' && <TableHead className="text-xs">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r, i) => (
                    <TableRow key={r.rentRequestId}>
                      <TableCell className="text-xs">{i + 1}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.date}</TableCell>
                      <TableCell className="text-xs">{r.agentName}</TableCell>
                      <TableCell className="text-xs font-medium">{r.tenantName}</TableCell>
                      <TableCell className="text-xs">{r.property}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{formatUGX(r.expected)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{formatUGX(r.collected)}</TableCell>
                      <TableCell className={cn('text-xs text-right tabular-nums', r.balance > 0 && 'text-destructive font-semibold')}>{formatUGX(r.balance)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs">{r.paymentMethod}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={r.remarks}>{r.remarks}</TableCell>
                      {mode === 'editable' && (
                        <TableCell>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openRecord(r)}>
                            <Wallet className="h-3 w-3 mr-1" /> Record
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {/* Daily totals row */}
                  <TableRow className="bg-muted/40 font-bold">
                    <TableCell colSpan={5} className="text-xs uppercase text-primary">Daily Totals</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{formatUGX(totals.expected)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{formatUGX(totals.collected)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-destructive">{formatUGX(totals.outstanding)}</TableCell>
                    <TableCell colSpan={mode === 'editable' ? 4 : 3}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent summary + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Agent Daily Collection Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {agentSummary.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">No agent data.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs text-right">Onb.</TableHead>
                      <TableHead className="text-xs text-right">Paid</TableHead>
                      <TableHead className="text-xs text-right">Expected</TableHead>
                      <TableHead className="text-xs text-right">Collected</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                      <TableHead className="text-xs text-right">Rate</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentSummary.map(a => (
                      <TableRow key={a.agentId}>
                        <TableCell className="text-xs font-medium">{a.name}</TableCell>
                        <TableCell className="text-xs text-right">{a.tenantCount}</TableCell>
                        <TableCell className="text-xs text-right">{a.paidCount}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatUGX(a.expected)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatUGX(a.collected)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-destructive">{formatUGX(a.balance)}</TableCell>
                        <TableCell className="text-xs text-right font-bold">{a.rate}%</TableCell>
                        <TableCell>
                          {a.status === 'good'
                            ? <Badge className="bg-success text-success-foreground hover:bg-success/90">Good</Badge>
                            : <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">At Risk</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Collection Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totals.expected === 0 ? (
              <p className="text-center py-10 text-sm text-muted-foreground">No expectations for this day.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatUGX(v)} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span className="text-xs">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 shrink-0">
                  <div className="text-3xl font-extrabold text-primary">{collectedPct}%</div>
                  <div className="text-[11px] text-muted-foreground">Collection Rate</div>
                  <div className="pt-2 space-y-1">
                    <div className="text-xs"><span className="inline-block w-2 h-2 rounded-full bg-primary mr-1.5" />Collected: <span className="font-semibold">{formatUGX(totals.collected)}</span></div>
                    <div className="text-xs"><span className="inline-block w-2 h-2 rounded-full bg-destructive mr-1.5" />Outstanding: <span className="font-semibold">{formatUGX(totals.outstanding)}</span></div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend + Top/Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Monthly Collection Trend ({format(day, 'MMM yyyy')})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip formatter={(v: number) => formatUGX(v)} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-warning" /> Top & Bottom Agents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topAgent ? (
              <div className="p-3 rounded-xl border border-success/30 bg-success/5">
                <div className="flex items-center gap-2 text-xs font-semibold text-success mb-1">
                  <Trophy className="h-3.5 w-3.5" /> TOP PERFORMER
                </div>
                <p className="text-base font-bold">{topAgent.name}</p>
                <p className="text-2xl font-extrabold text-success">{topAgent.rate}%</p>
                <p className="text-[11px] text-muted-foreground">Collection Rate</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No agents yet.</p>
            )}
            {bottomAgent && bottomAgent.agentId !== topAgent?.agentId ? (
              <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5">
                <div className="flex items-center gap-2 text-xs font-semibold text-destructive mb-1">
                  <TrendingDown className="h-3.5 w-3.5" /> NEEDS IMPROVEMENT
                </div>
                <p className="text-base font-bold">{bottomAgent.name}</p>
                <p className="text-2xl font-extrabold text-destructive">{bottomAgent.rate}%</p>
                <p className="text-[11px] text-muted-foreground">Collection Rate</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {mode === 'readonly' && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground p-2 rounded-lg bg-muted/30 border">
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          You are viewing in read-only mode. Only Tenant Ops staff can record payments here.
        </div>
      )}

      {/* Record payment dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment — {recordRow?.tenantName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Expected</p>
                <p className="font-bold">{formatUGX(recordRow?.expected || 0)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Outstanding</p>
                <p className="font-bold text-destructive">{formatUGX(recordRow?.balance || 0)}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (UGX)</Label>
              <Input type="number" inputMode="numeric" value={recordAmount} onChange={(e) => setRecordAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select value={recordMethod} onValueChange={setRecordMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money_mtn">MTN MoMo</SelectItem>
                  <SelectItem value="mobile_money_airtel">Airtel Money</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Remarks</Label>
              <Input value={recordRemarks} onChange={(e) => setRecordRemarks(e.target.value)} placeholder="e.g. Part payment, follow up tomorrow" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitRecord} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, delta, icon: Icon, color, subtitle }: {
  label: string; value: string; delta?: { text: string; positive: boolean };
  icon: any; color: string; subtitle?: string;
}) {
  return (
    <Card className="border min-w-0">
      <CardContent className="p-3">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center mb-1.5', color)}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-base sm:text-lg font-bold leading-tight truncate">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
        {delta && (
          <p className={cn('text-[10px] mt-0.5 font-medium', delta.positive ? 'text-success' : 'text-destructive')}>
            {delta.text}
          </p>
        )}
        {subtitle && !delta && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}