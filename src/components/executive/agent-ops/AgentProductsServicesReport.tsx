import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  ArrowDownRight, ArrowUpRight, CalendarIcon, FileText, Loader2, Minus, RefreshCw, Search,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  generateAgentProductsServicesPdf, apsPctChange, apsPctLabel, apsUgx, type ApsReport,
} from '@/lib/agentProductsServicesPdf';

const PAGE_SIZE = 15;
const num = (n: any) => Math.round(Number(n) || 0).toLocaleString();
const title = (s: any) => String(s ?? '—').replace(/_/g, ' ');
const toDateKey = (d: Date) => format(d, 'yyyy-MM-dd');

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TrendPill({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const v = apsPctChange(current, previous);
  const up = v !== null && v > 0;
  const flat = v === null || v === 0;
  const good = invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
      flat ? 'bg-muted text-muted-foreground' : good ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive',
    )}>
      <Icon className="h-3 w-3" />
      {apsPctLabel(current, previous)}
    </span>
  );
}

function Kpi({ label, value, hint, current, previous, invert }: {
  label: string; value: string; hint?: string;
  current?: number; previous?: number; invert?: boolean;
}) {
  return (
    <Card className="border">
      <CardContent className="p-3 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
        <p className="text-base sm:text-lg font-bold leading-tight break-words">{value}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {current !== undefined && previous !== undefined && (
            <TrendPill current={current} previous={previous} invert={invert} />
          )}
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Small client-side paginated table (data already fetched in one RPC round trip). */
function PagedTable<T extends Record<string, any>>({
  rows, columns, searchKeys, emptyLabel,
}: {
  rows: T[];
  columns: { key: string; label: string; align?: 'left' | 'right'; render?: (r: T) => any }[];
  searchKeys?: string[];
  emptyLabel: string;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { setPage(1); }, [debounced, rows]);

  const filtered = useMemo(() => {
    if (!debounced || !searchKeys?.length) return rows;
    return rows.filter(r => searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(debounced)));
  }, [rows, debounced, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-2">
      {searchKeys?.length ? (
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-7 text-xs" />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className={cn('px-2 py-2 font-semibold whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={columns.length} className="px-2 py-6 text-center text-muted-foreground">{emptyLabel}</td></tr>
            )}
            {slice.map((r, i) => (
              <tr key={r.id || r.agent_id || i} className="border-t">
                {columns.map(c => (
                  <td key={c.key} className={cn('px-2 py-1.5 whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${num(filtered.length)}` : '0 records'}
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-[10px] text-muted-foreground">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

export function AgentProductsServicesReport() {
  const { user } = useAuth();
  const [day, setDay] = useState<Date>(() => new Date());
  const [exporting, setExporting] = useState(false);
  const [actorName, setActorName] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      if (!cancelled) setActorName(data?.full_name || user.email || 'Agent Ops user');
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  const dayKey = toDateKey(day);

  const reportQuery = useQuery({
    queryKey: ['agent-products-services-report', dayKey],
    queryFn: async (): Promise<ApsReport> => {
      const { data, error } = await supabase.rpc('get_agent_products_services_report' as any, { p_date: dayKey });
      if (error) throw error;
      return data as unknown as ApsReport;
    },
    staleTime: 60_000,
  });

  const report = reportQuery.data;

  const trend = useMemo(
    () => [...(report?.trend || [])]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(t => ({ ...t, label: format(new Date(`${t.day}T00:00:00`), 'dd MMM'), collected: Number(t.collected) || 0 })),
    [report],
  );

  const handlePdf = () => {
    if (!report) return;
    setExporting(true);
    try {
      const blob = generateAgentProductsServicesPdf({ report, actor: actorName || 'Agent Ops user' });
      downloadBlob(blob, `agent-products-services-${dayKey}.pdf`);
      toast.success('Daily report downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'Could not generate the report');
    } finally {
      setExporting(false);
    }
  };

  const setPreset = (kind: 'today' | 'yesterday' | 'last7') => {
    const now = new Date();
    if (kind === 'today') setDay(now);
    if (kind === 'yesterday') setDay(subDays(now, 1));
    if (kind === 'last7') setDay(subDays(now, 6));
  };

  const bikes = report?.bikes;
  const phones = report?.phones;
  const scTarget = Number(report?.service_centres.monthly_target) || 0;

  return (
    <div className="space-y-3">
      {/* Header + date selector */}
      <Card className="border-purple-200">
        <CardHeader className="p-3 pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold">Agent Products &amp; Services — Daily Report</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {format(day, 'dd MMM yyyy')} · {report?.timezone || 'Africa/Kampala'} · compared with the previous day
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void reportQuery.refetch()}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1', reportQuery.isFetching && 'animate-spin')} />
                Refresh
              </Button>
              <Button size="sm" className="h-8 text-[11px]" disabled={!report || exporting} onClick={handlePdf}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
                Generate Daily Report (PDF)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {([['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', '7 days ago']] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setPreset(k)}>{l}</Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-[11px]">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />{format(day, 'dd MMM yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[200]" align="start">
                <Calendar mode="single" selected={day} onSelect={(d) => d && setDay(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {reportQuery.isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {reportQuery.error && (
        <Card><CardContent className="p-4 text-xs text-destructive">
          {(reportQuery.error as any)?.message || 'Could not load the report'}
        </CardContent></Card>
      )}

      {report && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <Kpi label="New agents added" value={num(report.agents.new_today)}
              current={report.agents.new_today} previous={report.agents.new_prev} hint="vs prev day" />
            <Kpi label="Total agents" value={num(report.agents.total)} hint={`${num(report.agents.active_today)} active today`} />
            <Kpi label="Rent collected" value={apsUgx(report.rent.collected_today)}
              current={report.rent.collected_today} previous={report.rent.collected_prev} hint="vs prev day" />
            <Kpi label="Expected daily receivable" value={apsUgx(report.rent.daily_receivable)}
              hint={`${num(report.rent.live_plans)} live plans`} />
            <Kpi label="Outstanding receivable" value={apsUgx(report.rent.outstanding)}
              hint={`avg ${num(report.rent.avg_days_outstanding)} days outstanding`} />
            <Kpi label="Advances issued today" value={apsUgx(report.advances.issued_today)}
              hint={`${num(report.advances.issued_count)} issued · ${num(report.advances.submitted)} requested`} />
            <Kpi label="Advance outstanding" value={apsUgx(report.advances.outstanding)}
              hint={`${num(report.advances.active_count)} active · ${apsUgx(report.advances.deducted_today)} recovered today`} />
            <Kpi label="Active service centres" value={num(report.service_centres.active_total)}
              current={report.service_centres.new_today} previous={report.service_centres.new_prev}
              hint={`${num(report.service_centres.new_this_month)} this month${scTarget > 0 ? ` / target ${num(scTarget)}` : ''}`} />
            <Kpi label="Bikes outstanding" value={apsUgx(bikes?.outstanding)}
              hint={`${num(bikes?.issued_total)} issued · ${apsUgx(bikes?.daily_receivable)} due daily`} />
            <Kpi label="Smartphones outstanding" value={apsUgx(phones?.outstanding)}
              hint={`${num(phones?.issued_total)} issued · ${apsUgx(phones?.daily_receivable)} due daily`} />
            <Kpi label="Requests approved / rejected" value={`${num(report.advances.approved)} / ${num(report.advances.rejected)}`} hint="advance decisions today" />
            <Kpi label="Pending service centres" value={num(report.service_centres.pending_total)} hint="awaiting verification" />
          </div>

          {/* Trend */}
          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-bold">Rent collected — last 14 days</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip formatter={(v: any) => apsUgx(v)} />
                  <Bar dataKey="collected" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detail tabs */}
          <Card>
            <CardContent className="p-3">
              <Tabs defaultValue="agents">
                <TabsList className="flex flex-wrap h-auto gap-1">
                  <TabsTrigger value="agents" className="text-[11px]">Agent performance</TabsTrigger>
                  <TabsTrigger value="rent" className="text-[11px]">Rent receivables</TabsTrigger>
                  <TabsTrigger value="advances" className="text-[11px]">Advances</TabsTrigger>
                  <TabsTrigger value="sc" className="text-[11px]">Service centres</TabsTrigger>
                  <TabsTrigger value="bikes" className="text-[11px]">Motor bikes</TabsTrigger>
                  <TabsTrigger value="phones" className="text-[11px]">Smartphones</TabsTrigger>
                </TabsList>

                <TabsContent value="agents" className="mt-3">
                  <PagedTable
                    rows={report.agent_float_rows}
                    searchKeys={['agent_name', 'phone', 'location']}
                    emptyLabel="No agent float or collection activity for this day"
                    columns={[
                      { key: 'agent_name', label: 'Agent' },
                      { key: 'phone', label: 'Phone' },
                      { key: 'location', label: 'Location' },
                      { key: 'float_received', label: 'Float received', align: 'right', render: r => apsUgx(r.float_received) },
                      { key: 'float_paid_out', label: 'Paid out', align: 'right', render: r => apsUgx(r.float_paid_out) },
                      { key: 'closing_float', label: 'Closing float', align: 'right', render: r => apsUgx(r.closing_float) },
                      { key: 'commission_balance', label: 'Commission', align: 'right', render: r => apsUgx(r.commission_balance) },
                      { key: 'collections_amount', label: 'Collected', align: 'right', render: r => apsUgx(r.collections_amount) },
                      { key: 'collections_count', label: 'Txns', align: 'right', render: r => num(r.collections_count) },
                    ]}
                  />
                </TabsContent>

                <TabsContent value="rent" className="mt-3">
                  <PagedTable
                    rows={report.rent_rows}
                    searchKeys={['agent_name', 'phone', 'location']}
                    emptyLabel="No live rent receivables"
                    columns={[
                      { key: 'agent_name', label: 'Agent' },
                      { key: 'phone', label: 'Phone' },
                      { key: 'live_plans', label: 'Plans', align: 'right', render: r => num(r.live_plans) },
                      { key: 'daily_receivable', label: 'Daily due', align: 'right', render: r => apsUgx(r.daily_receivable) },
                      { key: 'collected_today', label: 'Collected today', align: 'right', render: r => apsUgx(r.collected_today) },
                      { key: 'repaid_to_date', label: 'Repaid to date', align: 'right', render: r => apsUgx(r.repaid_to_date) },
                      { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => apsUgx(r.outstanding) },
                      { key: 'avg_days_outstanding', label: 'Avg days', align: 'right', render: r => num(r.avg_days_outstanding) },
                    ]}
                  />
                </TabsContent>

                <TabsContent value="advances" className="mt-3">
                  <PagedTable
                    rows={report.advance_rows}
                    searchKeys={['agent_name', 'phone', 'status']}
                    emptyLabel="No active or newly issued advances"
                    columns={[
                      { key: 'agent_name', label: 'Agent' },
                      { key: 'phone', label: 'Phone' },
                      { key: 'status', label: 'Status', render: r => <Badge variant="outline" className="text-[10px]">{title(r.status)}</Badge> },
                      { key: 'principal', label: 'Principal', align: 'right', render: r => apsUgx(r.principal) },
                      { key: 'recovered', label: 'Recovered', align: 'right', render: r => apsUgx(r.recovered) },
                      { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => apsUgx(r.outstanding) },
                      { key: 'installment', label: 'Installment', align: 'right', render: r => apsUgx(r.installment) },
                      { key: 'deducted_today', label: 'Deducted today', align: 'right', render: r => apsUgx(r.deducted_today) },
                    ]}
                  />
                </TabsContent>

                <TabsContent value="sc" className="mt-3">
                  <PagedTable
                    rows={report.service_centre_rows}
                    searchKeys={['agent_name', 'agent_phone', 'location_name', 'status']}
                    emptyLabel="No service centre records"
                    columns={[
                      { key: 'agent_name', label: 'Agent' },
                      { key: 'agent_phone', label: 'Phone' },
                      { key: 'location_name', label: 'Location' },
                      { key: 'status', label: 'Status', render: r => <Badge variant="outline" className="text-[10px]">{title(r.status)}</Badge> },
                      { key: 'created_at', label: 'Created', render: r => r.created_at ? format(new Date(r.created_at), 'dd MMM yy') : '—' },
                      { key: 'verified_at', label: 'Verified', render: r => r.verified_at ? format(new Date(r.verified_at), 'dd MMM yy') : '—' },
                      { key: 'approved_at', label: 'Approved', render: r => r.approved_at ? format(new Date(r.approved_at), 'dd MMM yy') : '—' },
                    ]}
                  />
                </TabsContent>

                {(['bike', 'smartphone'] as const).map(kind => (
                  <TabsContent key={kind} value={kind === 'bike' ? 'bikes' : 'phones'} className="mt-3">
                    <PagedTable
                      rows={report.product_rows.filter(r => r.product === kind)}
                      searchKeys={['client_name', 'client_phone', 'item_name', 'payment_status']}
                      emptyLabel={kind === 'bike' ? 'No motor bikes issued' : 'No smartphones issued'}
                      columns={[
                        { key: 'client_name', label: 'Holder' },
                        { key: 'client_phone', label: 'Phone' },
                        { key: 'item_name', label: 'Item' },
                        { key: 'sale_date', label: 'Issued', render: r => r.sale_date ? format(new Date(`${r.sale_date}T00:00:00`), 'dd MMM yy') : '—' },
                        { key: 'value', label: 'Value', align: 'right', render: r => apsUgx(r.value) },
                        { key: 'paid', label: 'Paid', align: 'right', render: r => apsUgx(r.paid) },
                        { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => apsUgx(r.outstanding) },
                        { key: 'daily_rate', label: 'Daily rate', align: 'right', render: r => apsUgx(r.daily_rate) },
                        { key: 'repayment_rate', label: '% repaid', align: 'right', render: r => `${num(r.repayment_rate)}%` },
                        { key: 'repayment_position', label: 'Position', render: r => (
                          <Badge variant="outline" className={cn('text-[10px]',
                            r.repayment_position === 'cleared' && 'border-emerald-500 text-emerald-600',
                            r.repayment_position === 'behind' && 'border-destructive text-destructive')}>
                            {title(r.repayment_position)}
                          </Badge>
                        ) },
                      ]}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
